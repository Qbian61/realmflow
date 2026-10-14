import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  DocumentExtractionError,
  type ExtractedDocumentText
} from '../../../../../domain/document-text-extraction'
import type { DocumentTextExtractor } from '../../documents/local-document-text-extractor'
import {
  DocumentContentExtractor,
  TextContentExtractor
} from './text-document-extractor'

describe('TextContentExtractor', () => {
  it('extracts strict UTF-8 text into one stable unit', async () => {
    const bytes = Buffer.from('alpha\nbeta')

    await expect(
      new TextContentExtractor().extract(input(bytes, 'notes.md'))
    ).resolves.toEqual({
      sourceChecksum: digest(bytes),
      format: 'md',
      extractorVersion: 'text-content-v1',
      units: [
        {
          key: 'content',
          title: 'notes.md',
          text: 'alpha\nbeta',
          checksum: digest(Buffer.from('alpha\nbeta')),
          byteSize: 10,
          metadata: {
            format: 'md',
            extraction: 'text'
          }
        }
      ]
    })
  })

  it('rejects invalid UTF-8 as an unsupported extraction', async () => {
    await expect(
      new TextContentExtractor().extract(
        input(Uint8Array.from([0xc3, 0x28]), 'broken.txt')
      )
    ).rejects.toMatchObject({ code: 'extraction_invalid' })
  })
})

describe('DocumentContentExtractor', () => {
  it('maps DOCX output into one content unit', async () => {
    const parser = documentParser({
      text: 'Heading\nParagraph',
      extraction: 'docx',
      characterCount: 17,
      truncated: false
    })
    const bytes = Buffer.from('PK-docx')

    await expect(
      new DocumentContentExtractor(parser).extract(
        input(bytes, 'report.docx')
      )
    ).resolves.toMatchObject({
      format: 'docx',
      extractorVersion: 'document-content-v1',
      units: [
        {
          key: 'content',
          title: 'report.docx',
          text: 'Heading\nParagraph',
          metadata: { format: 'docx', extraction: 'docx' }
        }
      ]
    })
  })

  it('maps each native PDF page to a stable page unit', async () => {
    const parser = documentParser({
      text: 'First\fSecond',
      extraction: 'pdf',
      characterCount: 11,
      truncated: false,
      pages: [
        { pageNumber: 1, text: 'First' },
        { pageNumber: 2, text: 'Second' }
      ]
    })
    const bytes = Buffer.from('%PDF-1.7')

    await expect(
      new DocumentContentExtractor(parser).extract(
        input(bytes, 'invoice.pdf')
      )
    ).resolves.toMatchObject({
      units: [
        {
          key: 'page/000001',
          title: 'invoice.pdf - Page 1',
          text: 'First',
          metadata: { page: 1, extraction: 'pdf' }
        },
        {
          key: 'page/000002',
          title: 'invoice.pdf - Page 2',
          text: 'Second',
          metadata: { page: 2, extraction: 'pdf' }
        }
      ]
    })
  })

  it('maps document parser errors to public extraction errors', async () => {
    const parser: DocumentTextExtractor = {
      extract: vi.fn().mockRejectedValue(
        new DocumentExtractionError(
          'tool_document_encrypted',
          'Document is encrypted'
        )
      )
    }

    await expect(
      new DocumentContentExtractor(parser).extract(
        input(Buffer.from('%PDF-1.7'), 'secret.pdf')
      )
    ).rejects.toMatchObject({ code: 'extraction_encrypted' })
  })
})

function input(bytes: Uint8Array, fileName: string) {
  return {
    bytes,
    fileName,
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: true,
      allowLocalConversion: true,
      maxCharacters: 100_000,
      maxUnits: 100
    },
    signal: new AbortController().signal,
    depth: 0
  }
}

function documentParser(result: ExtractedDocumentText): DocumentTextExtractor {
  return {
    extract: vi.fn().mockResolvedValue(result)
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
