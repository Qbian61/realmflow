import { createHash } from 'node:crypto'
import {
  CONTENT_EXTRACTION_LIMITS,
  ContentExtractionError,
  createSlideUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

type ExtractedSlide = {
  number: number
  title: string
  text: string[]
  tables: string[][]
  chartLabels: string[]
  notes: string
}

export type PresentationTextExtractionPort = {
  extractText(input: {
    bytes: Uint8Array
    signal: AbortSignal
  }): Promise<{ slides: ExtractedSlide[] }>
}

export class PresentationContentExtractor implements LocalContentExtractor {
  readonly strategy = 'presentation' as const
  readonly formats = ['pptx'] as const
  readonly version = 'presentation-content-v1'

  constructor(private readonly presentation: PresentationTextExtractionPort) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    let result: { slides: ExtractedSlide[] }
    try {
      result = await this.presentation.extractText({
        bytes: input.bytes,
        signal: input.signal
      })
    } catch (error) {
      if (isAbort(error) || input.signal.aborted) {
        throw new ContentExtractionError(
          'extraction_interrupted',
          'Presentation extraction was interrupted'
        )
      }
      throw new ContentExtractionError(
        'extraction_invalid',
        'Presentation could not be extracted'
      )
    }
    validateSlides(result.slides)
    return {
      sourceChecksum: input.sourceChecksum,
      format: 'pptx',
      extractorVersion: this.version,
      units: result.slides
        .slice()
        .sort((left, right) => left.number - right.number)
        .map(slideUnit)
    }
  }
}

function validateSlides(slides: ExtractedSlide[]): void {
  if (!Array.isArray(slides)) {
    throw new ContentExtractionError(
      'extraction_invalid',
      'Presentation extraction result is invalid'
    )
  }
  if (slides.length > CONTENT_EXTRACTION_LIMITS.maxSlides) {
    throw new ContentExtractionError(
      'extraction_limit_exceeded',
      'Presentation contains too many slides'
    )
  }
  if (slides.length === 0) {
    throw new ContentExtractionError(
      'extraction_empty',
      'Presentation contains no slides'
    )
  }
  const numbers = new Set<number>()
  for (const slide of slides) {
    if (
      !slide ||
      !Number.isSafeInteger(slide.number) ||
      slide.number < 1 ||
      numbers.has(slide.number) ||
      typeof slide.title !== 'string' ||
      typeof slide.notes !== 'string' ||
      !stringArray(slide.text) ||
      !stringArray(slide.chartLabels) ||
      !Array.isArray(slide.tables) ||
      !slide.tables.every(stringArray)
    ) {
      throw new ContentExtractionError(
        'extraction_invalid',
        'Presentation extraction result is invalid'
      )
    }
    numbers.add(slide.number)
  }
}

function slideUnit(slide: ExtractedSlide): ExtractedContentUnit {
  const title = slide.title.trim() || `Slide ${slide.number}`
  const sections = [
    `Title: ${title}`,
    section('Text', slide.text),
    section(
      'Tables',
      slide.tables.map((row) => row.map(escapeValue).join('\t'))
    ),
    section('Chart labels', slide.chartLabels),
    slide.notes.trim() ? `Notes:\n${slide.notes.trim()}` : ''
  ].filter(Boolean)
  const text = sections.join('\n\n')
  const bytes = new TextEncoder().encode(text)
  return {
    key: createSlideUnitKey(slide.number),
    title,
    text,
    checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteSize: bytes.byteLength,
    metadata: {
      format: 'pptx',
      extraction: 'presentation',
      slide: slide.number
    }
  }
}

function section(title: string, values: string[]): string {
  const content = values.map((value) => value.trim()).filter(Boolean)
  return content.length > 0 ? `${title}:\n${content.join('\n')}` : ''
}

function escapeValue(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
