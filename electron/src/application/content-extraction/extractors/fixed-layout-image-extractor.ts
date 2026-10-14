import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import {
  CONTENT_EXTRACTION_LIMITS,
  ContentExtractionError,
  createPageUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import type { FixedLayoutInspection } from '../../files/fixed-layout-adapter'
import type {
  ImageFormat,
} from '../../files/image-adapter'
import type { ImageOcrResult } from '../../files/local-image-session-service'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

export type FixedLayoutBytesExtractionPort = {
  inspectBytes(
    bytes: Uint8Array,
    signal: AbortSignal
  ): Promise<FixedLayoutInspection>
  ocrPageBytes(
    bytes: Uint8Array,
    pageNumber: number,
    signal: AbortSignal,
    options?: { language?: string; maxDimension?: number }
  ): Promise<ImageOcrResult>
}

export type ImageBytesOcrPort = {
  ocrBytes(
    bytes: Uint8Array,
    fileName: string,
    format: ImageFormat,
    signal: AbortSignal,
    options?: { language?: string; maxDimension?: number }
  ): Promise<ImageOcrResult>
}

export class FixedLayoutContentExtractor implements LocalContentExtractor {
  readonly strategy = 'fixed_layout' as const
  readonly formats = ['ofd'] as const
  readonly version = 'fixed-layout-content-v1'

  constructor(private readonly fixedLayout: FixedLayoutBytesExtractionPort) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    let inspection: FixedLayoutInspection
    try {
      inspection = await this.fixedLayout.inspectBytes(
        input.bytes,
        input.signal
      )
    } catch (error) {
      throw mappedFailure(error, input.signal, 'OFD could not be inspected')
    }
    if (
      inspection.pageCount > CONTENT_EXTRACTION_LIMITS.maxPages ||
      inspection.pages.length > CONTENT_EXTRACTION_LIMITS.maxPages
    ) {
      throw new ContentExtractionError(
        'extraction_limit_exceeded',
        'OFD exceeds the page limit'
      )
    }
    const units: ExtractedContentUnit[] = []
    for (const page of inspection.pages) {
      let text = page.text.trim()
      let extraction = 'ofd_native'
      if (!text || page.ocrRequired) {
        requireOcr(input)
        try {
          text = ocrText(
            await this.fixedLayout.ocrPageBytes(
              input.bytes,
              page.pageNumber,
              input.signal,
              { language: input.policy.ocrLanguage }
            )
          )
        } catch (error) {
          throw mappedOcrFailure(error, input.signal, 'OFD OCR failed')
        }
        extraction = 'ofd_ocr'
      }
      if (!text) {
        throw new ContentExtractionError(
          'extraction_ocr_failed',
          'OFD OCR produced no readable text'
        )
      }
      units.push(
        unit({
          key: createPageUnitKey(page.pageNumber),
          title: `${basename(input.fileName)} - Page ${page.pageNumber}`,
          text,
          format: 'ofd',
          extraction,
          page: page.pageNumber
        })
      )
    }
    if (units.length === 0) throw empty()
    return {
      sourceChecksum: input.sourceChecksum,
      format: 'ofd',
      extractorVersion: this.version,
      units
    }
  }
}

export class ImageOcrContentExtractor implements LocalContentExtractor {
  readonly strategy = 'image_ocr' as const
  readonly formats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] as const
  readonly version = 'image-ocr-content-v1'

  constructor(private readonly images: ImageBytesOcrPort) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    requireOcr(input)
    const format = imageFormat(input.fileName)
    let result: ImageOcrResult
    try {
      result = await this.images.ocrBytes(
        input.bytes,
        input.fileName,
        format,
        input.signal,
        { language: input.policy.ocrLanguage }
      )
    } catch (error) {
      throw mappedOcrFailure(error, input.signal, 'Image OCR failed')
    }
    const text = ocrText(result)
    if (!text) {
      throw new ContentExtractionError(
        'extraction_ocr_failed',
        'Image OCR produced no readable text'
      )
    }
    return {
      sourceChecksum: input.sourceChecksum,
      format: extname(input.fileName).slice(1).toLowerCase(),
      extractorVersion: this.version,
      units: [
        unit({
          key: 'content',
          title: basename(input.fileName),
          text,
          format,
          extraction: 'image_ocr'
        })
      ]
    }
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
    checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteSize: bytes.byteLength,
    metadata: {
      format: input.format,
      extraction: input.extraction,
      ...(input.page ? { page: input.page } : {})
    }
  }
}

function ocrText(result: ImageOcrResult): string {
  return result.blocks
    .filter((block) => block.text.trim())
    .slice()
    .sort(
      (left, right) =>
        left.bounds.y - right.bounds.y ||
        left.bounds.x - right.bounds.x ||
        left.text.localeCompare(right.text)
    )
    .map((block) => block.text.trim())
    .join(' ')
}

function requireOcr(input: ContentExtractionInput): void {
  if (!input.policy.allowLocalOcr) {
    throw new ContentExtractionError(
      'extraction_ocr_required',
      'Local OCR is required'
    )
  }
}

function imageFormat(fileName: string): ImageFormat {
  const extension = extname(fileName).slice(1).toLowerCase()
  if (extension === 'jpg') return 'jpeg'
  if (
    extension === 'png' ||
    extension === 'jpeg' ||
    extension === 'webp' ||
    extension === 'gif' ||
    extension === 'svg'
  ) {
    return extension
  }
  throw new ContentExtractionError(
    'extraction_unsupported',
    'Image format is unsupported'
  )
}

function mappedFailure(
  error: unknown,
  signal: AbortSignal,
  message: string
): ContentExtractionError {
  if (signal.aborted || isAbort(error)) {
    return new ContentExtractionError(
      'extraction_interrupted',
      'Content extraction was interrupted'
    )
  }
  return new ContentExtractionError('extraction_invalid', message)
}

function mappedOcrFailure(
  error: unknown,
  signal: AbortSignal,
  message: string
): ContentExtractionError {
  if (signal.aborted || isAbort(error)) {
    return new ContentExtractionError(
      'extraction_interrupted',
      'Content extraction was interrupted'
    )
  }
  return new ContentExtractionError('extraction_ocr_failed', message)
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function empty(): ContentExtractionError {
  return new ContentExtractionError(
    'extraction_empty',
    'Content contains no readable text'
  )
}
