import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import {
  ContentExtractionError,
  createPageUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import {
  DocumentExtractionError,
  type DocumentExtractionErrorCode
} from '../../../../../domain/document-text-extraction'
import type { DocumentTextExtractor } from '../../documents/local-document-text-extractor'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

export class TextContentExtractor implements LocalContentExtractor {
  readonly strategy = 'text' as const
  readonly version = 'text-content-v1'

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes)
      return bundle(input, this.version, [
        unit({
          key: 'content',
          title: basename(input.fileName),
          text,
          format: format(input.fileName),
          extraction: 'text'
        })
      ])
    } catch (error) {
      if (error instanceof ContentExtractionError) throw error
      throw new ContentExtractionError(
        'extraction_invalid',
        'Text file is not valid UTF-8'
      )
    }
  }
}

export class DocumentContentExtractor implements LocalContentExtractor {
  readonly strategy = 'document' as const
  readonly version = 'document-content-v1'
  readonly formats = ['docx'] as const

  constructor(private readonly parser: DocumentTextExtractor) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    const fileFormat = format(input.fileName)
    try {
      const extracted = await this.parser.extract({
        bytes: input.bytes,
        fileName: input.fileName,
        maxCharacters: input.policy.maxCharacters
      })
      if (extracted.truncated) {
        throw new ContentExtractionError(
          'extraction_limit_exceeded',
          'Document exceeds the extraction character limit'
        )
      }
      const units =
        extracted.extraction === 'pdf' && extracted.pages
          ? extracted.pages
              .filter(({ text }) => Boolean(text.trim()))
              .map((page) =>
                unit({
                  key: createPageUnitKey(page.pageNumber),
                  title: `${basename(input.fileName)} - Page ${page.pageNumber}`,
                  text: page.text,
                  format: fileFormat,
                  extraction: 'pdf',
                  page: page.pageNumber
                })
              )
          : [
              unit({
                key: 'content',
                title: basename(input.fileName),
                text: extracted.text,
                format: fileFormat,
                extraction: extracted.extraction
              })
            ]
      if (units.length === 0) {
        throw new ContentExtractionError(
          'extraction_ocr_required',
          'PDF requires OCR'
        )
      }
      return bundle(input, this.version, units)
    } catch (error) {
      if (error instanceof ContentExtractionError) throw error
      if (error instanceof DocumentExtractionError) {
        throw new ContentExtractionError(
          mapDocumentError(error.code),
          error.message
        )
      }
      throw new ContentExtractionError(
        'extraction_invalid',
        'Document extraction failed'
      )
    }
  }
}

function bundle(
  input: ContentExtractionInput,
  extractorVersion: string,
  units: ExtractedContentUnit[]
): ExtractedContentBundle {
  return {
    sourceChecksum: input.sourceChecksum,
    format: format(input.fileName),
    extractorVersion,
    units
  }
}

function unit(input: {
  key: string
  title: string
  text: string
  format: string
  extraction: string
  page?: number
}): ExtractedContentUnit {
  const bytes = new TextEncoder().encode(input.text)
  return {
    key: input.key,
    title: input.title,
    text: input.text,
    checksum: digest(bytes),
    byteSize: bytes.byteLength,
    metadata: {
      format: input.format,
      extraction: input.extraction,
      ...(input.page ? { page: input.page } : {})
    }
  }
}

function format(fileName: string): string {
  return extname(fileName).slice(1).toLowerCase() || 'text'
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function mapDocumentError(
  code: DocumentExtractionErrorCode
): ContentExtractionError['code'] {
  switch (code) {
    case 'tool_document_unsupported':
      return 'extraction_unsupported'
    case 'tool_document_encrypted':
      return 'extraction_encrypted'
    case 'tool_document_ocr_required':
      return 'extraction_ocr_required'
    case 'tool_document_too_large':
      return 'extraction_limit_exceeded'
    case 'tool_document_empty':
      return 'extraction_empty'
    default:
      return 'extraction_invalid'
  }
}
