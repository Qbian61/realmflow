import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import {
  CONTENT_EXTRACTION_LIMITS,
  ContentExtractionError,
  createPageUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import type {
  ImageOcrResult
} from '../../files/local-image-session-service'
import type { PdfInspection } from '../../files/pdf-adapter'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

export type PdfBytesExtractionPort = {
  inspectBytes(
    bytes: Uint8Array,
    signal: AbortSignal
  ): Promise<PdfInspection>
  ocrPageBytes(
    bytes: Uint8Array,
    pageNumber: number,
    signal: AbortSignal,
    options?: { language?: string; maxDimension?: number }
  ): Promise<ImageOcrResult>
}

export class PdfContentExtractor implements LocalContentExtractor {
  readonly strategy = 'document' as const
  readonly formats = ['pdf'] as const
  readonly version = 'pdf-content-v1'

  constructor(private readonly pdf: PdfBytesExtractionPort) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    assertActive(input.signal)
    let inspection: PdfInspection
    try {
      inspection = await this.pdf.inspectBytes(input.bytes, input.signal)
    } catch (error) {
      if (isAbort(error) || input.signal.aborted) throw interrupted()
      throw new ContentExtractionError(
        'extraction_invalid',
        'PDF could not be inspected'
      )
    }
    if (inspection.encrypted) {
      throw new ContentExtractionError(
        'extraction_encrypted',
        'PDF is encrypted'
      )
    }
    if (
      inspection.pageCount > CONTENT_EXTRACTION_LIMITS.maxPages ||
      inspection.pages.length > CONTENT_EXTRACTION_LIMITS.maxPages
    ) {
      throw new ContentExtractionError(
        'extraction_limit_exceeded',
        'PDF exceeds the page limit'
      )
    }

    const units: ExtractedContentUnit[] = []
    for (const page of [...inspection.pages].sort(
      (left, right) => left.pageNumber - right.pageNumber
    )) {
      assertActive(input.signal)
      const nativeText = page.text.trim()
      let text = nativeText
      let extraction = 'pdf_native'
      if (!nativeText || page.ocrRequired) {
        if (!input.policy.allowLocalOcr) {
          throw new ContentExtractionError(
            'extraction_ocr_required',
            'PDF requires local OCR'
          )
        }
        try {
          const result = await this.pdf.ocrPageBytes(
            input.bytes,
            page.pageNumber,
            input.signal,
            { language: input.policy.ocrLanguage }
          )
          text = ocrText(result)
        } catch (error) {
          if (isAbort(error) || input.signal.aborted) throw interrupted()
          throw new ContentExtractionError(
            'extraction_ocr_failed',
            'PDF OCR failed'
          )
        }
        if (!text) {
          throw new ContentExtractionError(
            'extraction_ocr_failed',
            'PDF OCR produced no readable text'
          )
        }
        extraction = 'pdf_ocr'
      }
      units.push(
        contentUnit({
          fileName: input.fileName,
          pageNumber: page.pageNumber,
          text,
          extraction
        })
      )
    }
    if (units.length === 0) {
      throw new ContentExtractionError(
        'extraction_empty',
        'PDF contains no readable pages'
      )
    }
    return {
      sourceChecksum: input.sourceChecksum,
      format: 'pdf',
      extractorVersion: this.version,
      units
    }
  }
}

function contentUnit(input: {
  fileName: string
  pageNumber: number
  text: string
  extraction: string
}): ExtractedContentUnit {
  const bytes = new TextEncoder().encode(input.text)
  return {
    key: createPageUnitKey(input.pageNumber),
    title: `${basename(input.fileName)} - Page ${input.pageNumber}`,
    text: input.text,
    checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteSize: bytes.byteLength,
    metadata: {
      format: 'pdf',
      extraction: input.extraction,
      page: input.pageNumber
    }
  }
}

function ocrText(result: ImageOcrResult): string {
  return [...result.blocks]
    .filter((block) => block.text.trim())
    .sort(
      (left, right) =>
        left.bounds.y - right.bounds.y ||
        left.bounds.x - right.bounds.x ||
        left.text.localeCompare(right.text)
    )
    .map((block) => block.text.trim())
    .join(' ')
    .trim()
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw interrupted()
}

function interrupted(): ContentExtractionError {
  return new ContentExtractionError(
    'extraction_interrupted',
    'PDF extraction was interrupted'
  )
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
