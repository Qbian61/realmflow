import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import type { ExtractedContentBundle } from '../../../../../domain/content-extraction'
import {
  EcosystemContentExtractor
} from './ecosystem-content-extractor'
import { CapabilityProbeContentExtractor } from './capability-probe-content-extractor'

describe('EcosystemContentExtractor', () => {
  it.each([
    ['odt', 'content', 'Native ODT paragraph'],
    ['ods', 'sheet/summary', 'Metric\tValue'],
    ['odp', 'slide/000001', 'Launch plan'],
    ['rtf', 'content', 'Native RTF text']
  ] as const)('extracts %s natively before LibreOffice fallback', async (
    sourceFormat,
    expectedKey,
    expectedText
  ) => {
    const converter = {
      convertBytes: vi.fn().mockResolvedValue({
        outputFormat: sourceFormat === 'ods' ? 'xlsx' : sourceFormat === 'odp' ? 'pptx' : 'docx',
        bytes: MODERN_BYTES
      })
    }
    const modern = modernExtractor()
    const bytes = await nativeEcosystemBytes(sourceFormat)

    const result = await new EcosystemContentExtractor({
      converter,
      modern,
      children: { extract: vi.fn() }
    }).extract(input(`document.${sourceFormat}`, bytes))

    expect(converter.convertBytes).not.toHaveBeenCalled()
    expect(modern.extract).not.toHaveBeenCalled()
    expect(result.units[0]).toMatchObject({
      key: expectedKey,
      text: expect.stringContaining(expectedText),
      metadata: {
        format: sourceFormat,
        extraction:
          sourceFormat === 'rtf' ? 'rtf_native' : 'opendocument_native'
      }
    })
  })

  it('falls back to LibreOffice when native ODF extraction is empty', async () => {
    const converter = {
      convertBytes: vi.fn().mockResolvedValue({
        outputFormat: 'docx',
        bytes: MODERN_BYTES
      })
    }
    const modern = modernExtractor()

    const result = await new EcosystemContentExtractor({
      converter,
      modern,
      children: { extract: vi.fn() }
    }).extract(input('document.odt', SOURCE_BYTES))

    expect(converter.convertBytes).toHaveBeenCalledWith({
      bytes: SOURCE_BYTES,
      sourceFormat: 'odt',
      signal: expect.any(AbortSignal)
    })
    expect(modern.extract).toHaveBeenCalledWith(
      'docx',
      expect.objectContaining({ bytes: MODERN_BYTES })
    )
    expect(result.units[0]?.metadata?.extraction).toContain(
      'ecosystem_convert'
    )
  })

  it('sanitizes EML HTML and recursively extracts supported attachments', async () => {
    const children = {
      extract: vi.fn().mockResolvedValue(childBundle('Attachment text'))
    }
    const bytes = Buffer.from([
      'From: Alice <alice@example.com>',
      'To: Bob <bob@example.com>',
      'Subject: Local report',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="realmflow"',
      '',
      '--realmflow',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<h1>Quarterly report</h1><script>steal()</script><img src="https://remote.example/a.png">',
      '--realmflow',
      'Content-Type: text/plain; name="note.txt"',
      'Content-Disposition: attachment; filename="note.txt"',
      '',
      'Attachment text',
      '--realmflow--'
    ].join('\r\n'))

    const result = await new EcosystemContentExtractor({
      converter: unavailableConverter(),
      modern: modernExtractor(),
      children
    }).extract(input('message.eml', bytes))

    expect(result.units[0]?.text).toContain('Quarterly report')
    expect(result.units[0]?.text).not.toContain('steal')
    expect(result.units[0]?.text).not.toContain('remote.example')
    expect(result.units.map(({ key }) => key)).toContain(
      'message/000001/attachment/000001/note.txt/content'
    )
    expect(children.extract).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'note.txt' })
    )
  })

  it('keeps MBOX message ordering and parses MSG locally', async () => {
    const mbox = Buffer.from(
      [
        'From sender@example.com Sat Jan 01 00:00:00 2026',
        'Subject: First',
        '',
        'First body',
        'From sender@example.com Sat Jan 02 00:00:00 2026',
        'Subject: Second',
        '',
        'Second body'
      ].join('\n')
    )
    const parseMsg = vi.fn().mockResolvedValue({
      subject: 'MSG subject',
      from: 'Alice',
      to: 'Bob',
      text: 'MSG body',
      attachments: []
    })
    const extractor = new EcosystemContentExtractor({
      converter: unavailableConverter(),
      modern: modernExtractor(),
      children: { extract: vi.fn() },
      parseMsg
    })

    await expect(
      extractor.extract(input('mailbox.mbox', mbox))
    ).resolves.toMatchObject({
      units: [
        { key: 'message/000001/body', text: expect.stringContaining('First body') },
        { key: 'message/000002/body', text: expect.stringContaining('Second body') }
      ]
    })
    await expect(
      extractor.extract(input('message.msg', Buffer.from('msg')))
    ).resolves.toMatchObject({
      units: [
        { key: 'message/000001/body', text: expect.stringContaining('MSG body') }
      ]
    })
    expect(parseMsg).toHaveBeenCalledOnce()
  })

  it('extracts MHTML without external fetches and follows EPUB spine order', async () => {
    const mhtml = Buffer.from([
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="page"',
      '',
      '--page',
      'Content-Type: text/html',
      '',
      '<p>Saved locally</p><img src="https://remote.example/image.png">',
      '--page--'
    ].join('\r\n'))
    const extractor = new EcosystemContentExtractor({
      converter: unavailableConverter(),
      modern: modernExtractor(),
      children: { extract: vi.fn() }
    })

    const mhtmlResult = await extractor.extract(input('page.mhtml', mhtml))
    expect(mhtmlResult.units[0]?.text).toContain('Saved locally')
    expect(mhtmlResult.units[0]?.text).not.toContain('remote.example')

    const epubResult = await extractor.extract(
      input('book.epub', await epub())
    )
    expect(epubResult.units.map(({ key }) => key)).toEqual([
      'spine/000001/text-chapter-1.xhtml',
      'spine/000002/text-chapter-2.xhtml'
    ])
    expect(epubResult.units.map(({ text }) => text)).toEqual([
      'First chapter',
      'Second chapter'
    ])
  })
})

describe('CapabilityProbeContentExtractor', () => {
  it.each(['pages', 'numbers', 'key', 'vsd', 'vsdx', 'pub', 'mpp'])(
    'returns deterministic unavailable for unprobed %s capability',
    async (format) => {
      const convert = vi.fn()
      const extractor = new CapabilityProbeContentExtractor({
        capabilities: vi.fn().mockResolvedValue({}),
        convert,
        modern: {
          extract: vi.fn()
        }
      })

      await expect(
        extractor.extract(input(`document.${format}`, SOURCE_BYTES))
      ).rejects.toMatchObject({
        code: 'extraction_converter_unavailable'
      })
      expect(convert).not.toHaveBeenCalled()
    }
  )

  it('converts a probed VSDX capability to PDF and caches the report', async () => {
    const capabilities = vi.fn().mockResolvedValue({ vsdx: 'pdf' })
    const convert = vi.fn().mockResolvedValue({
      outputFormat: 'pdf',
      bytes: MODERN_BYTES
    })
    const modern = {
      extract: vi.fn().mockResolvedValue(childBundle('Diagram text'))
    }
    const extractor = new CapabilityProbeContentExtractor({
      capabilities,
      convert,
      modern
    })

    await extractor.extract(input('diagram.vsdx', SOURCE_BYTES))
    await extractor.extract(input('second.vsdx', SOURCE_BYTES))

    expect(capabilities).toHaveBeenCalledOnce()
    expect(convert).toHaveBeenCalledWith({
      bytes: SOURCE_BYTES,
      sourceFormat: 'vsdx',
      outputFormat: 'pdf',
      signal: expect.any(AbortSignal)
    })
    expect(modern.extract).toHaveBeenCalledWith(
      'pdf',
      expect.objectContaining({ bytes: MODERN_BYTES })
    )
  })
})

const SOURCE_BYTES = Uint8Array.from(Buffer.from('source'))
const MODERN_BYTES = Uint8Array.from(Buffer.from('PK\u0003\u0004modern'))

function input(fileName: string, bytes: Uint8Array) {
  return {
    bytes,
    fileName,
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: true,
      allowLocalConversion: true,
      maxCharacters: 1_000_000,
      maxUnits: 1_000
    },
    signal: new AbortController().signal,
    depth: 0
  }
}

function modernExtractor() {
  return {
    extract: vi.fn(
      async (format: string): Promise<ExtractedContentBundle> => ({
        sourceChecksum: digest(MODERN_BYTES),
        format,
        extractorVersion: `${format}-v1`,
        units: [
          {
            key: 'content',
            title: `document.${format}`,
            text: 'Converted content',
            checksum: digest(Buffer.from('Converted content')),
            byteSize: 17,
            metadata: { format, extraction: format }
          }
        ]
      })
    )
  }
}

function unavailableConverter() {
  return {
    convertBytes: vi.fn().mockRejectedValue(
      Object.assign(new Error('unavailable'), {
        code: 'converter_unavailable'
      })
    )
  }
}

function childBundle(text: string): ExtractedContentBundle {
  return {
    sourceChecksum: digest(Buffer.from(text)),
    format: 'txt',
    extractorVersion: 'text-v1',
    units: [
      {
        key: 'content',
        title: 'note.txt',
        text,
        checksum: digest(Buffer.from(text)),
        byteSize: text.length
      }
    ]
  }
}

async function epub(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>'
  )
  zip.file(
    'OPS/content.opf',
    '<?xml version="1.0"?><package><manifest>' +
      '<item id="c1" href="Text/Chapter 1.xhtml" media-type="application/xhtml+xml"/>' +
      '<item id="c2" href="Text/Chapter 2.xhtml" media-type="application/xhtml+xml"/>' +
      '</manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'
  )
  zip.file('OPS/Text/Chapter 1.xhtml', '<html><body><p>First chapter</p></body></html>')
  zip.file('OPS/Text/Chapter 2.xhtml', '<html><body><p>Second chapter</p></body></html>')
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

async function nativeEcosystemBytes(
  format: 'odt' | 'ods' | 'odp' | 'rtf'
): Promise<Uint8Array> {
  if (format === 'rtf') {
    return Uint8Array.from(
      Buffer.from('{\\rtf1\\ansi Native RTF text\\par Second line}')
    )
  }
  const zip = new JSZip()
  const namespaces =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
  if (format === 'odt') {
    zip.file(
      'content.xml',
      `<office:document-content ${namespaces}><office:body><office:text>` +
        '<text:h>Native ODT Title</text:h>' +
        '<text:p>Native ODT paragraph</text:p>' +
        '</office:text></office:body></office:document-content>'
    )
  } else if (format === 'ods') {
    zip.file(
      'content.xml',
      `<office:document-content ${namespaces}><office:body><office:spreadsheet>` +
        '<table:table table:name="Summary">' +
        '<table:table-row>' +
        '<table:table-cell><text:p>Metric</text:p></table:table-cell>' +
        '<table:table-cell><text:p>Value</text:p></table:table-cell>' +
        '</table:table-row>' +
        '</table:table>' +
        '</office:spreadsheet></office:body></office:document-content>'
    )
  } else {
    zip.file(
      'content.xml',
      `<office:document-content ${namespaces}><office:body><office:presentation>` +
        '<draw:page draw:name="Slide 1">' +
        '<draw:frame><draw:text-box><text:p>Launch plan</text:p></draw:text-box></draw:frame>' +
        '</draw:page>' +
        '</office:presentation></office:body></office:document-content>'
    )
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
