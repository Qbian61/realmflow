import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { DocumentExtractionError } from '../../../../domain/document-text-extraction'
import {
  joinPdfTextItems,
  LocalDocumentTextExtractor
} from './local-document-text-extractor'

describe('LocalDocumentTextExtractor', () => {
  it('returns DOCX headings, paragraphs, lists, and tables in source order', async () => {
    const parseDocx = vi.fn().mockResolvedValue({
      text: 'Profile\nSenior backend engineer\nTypeScript\nSkill | Years',
      blocks: [
        { id: 'block-1', type: 'heading', level: 1, text: 'Profile' },
        {
          id: 'block-2',
          type: 'paragraph',
          text: 'Senior backend engineer'
        },
        { id: 'block-3', type: 'list_item', text: 'TypeScript' },
        {
          id: 'block-4',
          type: 'table',
          text: 'Skill | Years',
          rows: [['Skill', 'Years']]
        }
      ]
    })
    const extractor = new LocalDocumentTextExtractor({
      parseDocx,
      parsePdf: vi.fn()
    })

    await expect(
      extractor.extract({
        bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
        fileName: 'resume.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        maxCharacters: 1000
      })
    ).resolves.toEqual({
      text: 'Profile\nSenior backend engineer\nTypeScript\nSkill | Years',
      extraction: 'docx',
      characterCount: 56,
      truncated: false,
      blocks: [
        { id: 'block-1', type: 'heading', level: 1, text: 'Profile' },
        {
          id: 'block-2',
          type: 'paragraph',
          text: 'Senior backend engineer'
        },
        { id: 'block-3', type: 'list_item', text: 'TypeScript' },
        {
          id: 'block-4',
          type: 'table',
          text: 'Skill | Years',
          rows: [['Skill', 'Years']]
        }
      ]
    })
    expect(parseDocx).toHaveBeenCalledOnce()
  })

  it('returns PDF text grouped by source page', async () => {
    const extractor = new LocalDocumentTextExtractor({
      parseDocx: vi.fn(),
      parsePdf: vi.fn().mockResolvedValue({
        text: 'First page\fSecond page',
        pages: [
          { pageNumber: 1, text: 'First page' },
          { pageNumber: 2, text: 'Second page' }
        ]
      })
    })

    await expect(
      extractor.extract({
        bytes: Uint8Array.from(Buffer.from('%PDF-1.7')),
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
        maxCharacters: 1000
      })
    ).resolves.toMatchObject({
      text: 'First page\n\nSecond page',
      extraction: 'pdf',
      characterCount: 23,
      truncated: false,
      pages: [
        { pageNumber: 1, text: 'First page' },
        { pageNumber: 2, text: 'Second page' }
      ]
    })
  })

  it('requires OCR when a valid PDF contains no extractable text', async () => {
    const extractor = new LocalDocumentTextExtractor({
      parseDocx: vi.fn(),
      parsePdf: vi.fn().mockResolvedValue({
        text: '',
        pages: [{ pageNumber: 1, text: '' }]
      })
    })

    await expect(
      extractor.extract({
        bytes: Uint8Array.from(Buffer.from('%PDF-1.7')),
        fileName: 'scan.pdf',
        mimeType: 'application/pdf',
        maxCharacters: 1000
      })
    ).rejects.toMatchObject({
      code: 'tool_document_ocr_required',
      message: 'PDF requires OCR'
    })
  })

  it('returns stable continuation identifiers for long documents', async () => {
    const bytes = Uint8Array.from(Buffer.from('%PDF-1.7'))
    const extractor = new LocalDocumentTextExtractor({
      parseDocx: vi.fn(),
      parsePdf: vi.fn().mockResolvedValue('A'.repeat(1200))
    })

    const first = await extractor.extract({
      bytes,
      fileName: 'long.pdf',
      maxCharacters: 1000
    })

    expect(first).toMatchObject({
      text: 'A'.repeat(1000),
      characterCount: 1200,
      truncated: true,
      chunk: {
        index: 1,
        count: 2,
        startCharacter: 0,
        endCharacter: 1000
      },
      nextChunkId: expect.stringMatching(/^[a-f0-9]{64}:chunk:2$/)
    })
    if (typeof first.nextChunkId !== 'string') {
      throw new Error('Expected a continuation chunk')
    }

    const second = await extractor.extract({
      bytes,
      fileName: 'long.pdf',
      maxCharacters: 1000,
      chunkId: first.nextChunkId
    })
    expect(second).toMatchObject({
      text: 'A'.repeat(200),
      characterCount: 1200,
      truncated: false,
      chunk: {
        index: 2,
        count: 2,
        startCharacter: 1000,
        endCharacter: 1200
      },
      nextChunkId: null
    })
  })

  it('rejects a media signature that does not match its extension', async () => {
    const extractor = new LocalDocumentTextExtractor({
      parseDocx: vi.fn(),
      parsePdf: vi.fn()
    })

    await expect(
      extractor.extract({
        bytes: Uint8Array.from(Buffer.from('plain text')),
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
        maxCharacters: 1000
      })
    ).rejects.toMatchObject({
      code: 'tool_document_invalid',
      message: 'Document signature does not match its format'
    })
  })

  it('preserves stable extraction errors and hides parser details', async () => {
    const extractor = new LocalDocumentTextExtractor({
      parseDocx: vi.fn(),
      parsePdf: vi.fn().mockRejectedValue(
        new Error('/private/folder/resume.pdf is password protected')
      )
    })

    await expect(
      extractor.extract({
        bytes: Uint8Array.from(Buffer.from('%PDF-1.7')),
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
        maxCharacters: 1000
      })
    ).rejects.toEqual(
      new DocumentExtractionError(
        'tool_document_encrypted',
        'Document is encrypted'
      )
    )
  })

  it('rejects unsupported documents before invoking a parser', async () => {
    const parseDocx = vi.fn()
    const parsePdf = vi.fn()
    const extractor = new LocalDocumentTextExtractor({
      parseDocx,
      parsePdf
    })

    await expect(
      extractor.extract({
        bytes: Uint8Array.from([1, 2, 3]),
        fileName: 'archive.zip',
        maxCharacters: 1000
      })
    ).rejects.toMatchObject({
      code: 'tool_document_unsupported'
    })
    expect(parseDocx).not.toHaveBeenCalled()
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('extracts text from a real DOCX container locally', async () => {
    const extractor = new LocalDocumentTextExtractor()

    await expect(
      extractor.extract({
        bytes: await createDocx('RealmFlow senior backend engineer'),
        fileName: 'resume.docx',
        maxCharacters: 10_000
      })
    ).resolves.toMatchObject({
      text: 'RealmFlow senior backend engineer',
      extraction: 'docx',
      truncated: false
    })
  })

  it('extracts ordered structural blocks from a real DOCX container', async () => {
    const extractor = new LocalDocumentTextExtractor()

    await expect(
      extractor.extract({
        bytes: await createStructuredDocx(),
        fileName: 'structured.docx',
        maxCharacters: 10_000
      })
    ).resolves.toMatchObject({
      blocks: [
        { id: 'block-1', type: 'heading', level: 1, text: 'Profile' },
        { id: 'block-2', type: 'paragraph', text: 'Backend engineer' },
        { id: 'block-3', type: 'list_item', text: 'TypeScript' },
        {
          id: 'block-4',
          type: 'table',
          rows: [
            ['Skill', 'Years'],
            ['TypeScript', '8']
          ]
        }
      ]
    })
  })

  it('extracts text from a real PDF container locally', async () => {
    const extractor = new LocalDocumentTextExtractor()

    await expect(
      extractor.extract({
        bytes: createPdf('RealmFlow senior backend engineer'),
        fileName: 'resume.pdf',
        maxCharacters: 10_000
      })
    ).resolves.toMatchObject({
      text: expect.stringContaining('RealmFlow senior backend engineer'),
      extraction: 'pdf',
      truncated: false,
      pages: [
        {
          pageNumber: 1,
          text: expect.stringContaining('RealmFlow senior backend engineer'),
          items: [
            expect.objectContaining({
              text: 'RealmFlow senior backend engineer',
              x: expect.any(Number),
              y: expect.any(Number),
              width: expect.any(Number),
              height: expect.any(Number)
            })
          ]
        }
      ]
    })
  })

  it('joins adjacent PDF glyph runs without inserting artificial spaces', () => {
    expect(
      joinPdfTextItems([
        textItem('J', 10, 700, 6),
        textItem('ava', 16, 700, 18),
        textItem('后端', 40, 700, 20, true),
        textItem('字节', 10, 680, 20),
        textItem('跳动', 30, 680, 20)
      ])
    ).toBe('Java 后端\n字节跳动')
  })
})

function textItem(
  str: string,
  x: number,
  y: number,
  width: number,
  hasEOL = false
) {
  return {
    str,
    width,
    height: 10,
    transform: [10, 0, 0, 10, x, y],
    hasEOL
  }
}

async function createDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  )
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>` +
      '</w:document>'
  )
  return zip.generateAsync({ type: 'uint8array' })
}

async function createStructuredDocx(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '</Types>'
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '</Relationships>'
  )
  zip.file(
    'word/numbering.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
      '</w:numbering>'
  )
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Profile</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Backend engineer</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>TypeScript</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Skill</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Years</w:t></w:r></w:p></w:tc></w:tr>' +
      '<w:tr><w:tc><w:p><w:r><w:t>TypeScript</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>8</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>'
  )
  return zip.generateAsync({ type: 'uint8array' })
}

function createPdf(text: string): Uint8Array {
  const content = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source))
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(source)
  source += `xref\n0 ${objects.length + 1}\n`
  source += '0000000000 65535 f \n'
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  source +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`
  return Uint8Array.from(Buffer.from(source))
}
