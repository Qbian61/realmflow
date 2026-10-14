import { createHash } from 'node:crypto'
import type {
  ContentExtractionPolicy,
  ContentExtractionStrategy,
  ExtractedContentBundle,
  ExtractedContentUnit
} from '../../../../domain/content-extraction'
import {
  CONTENT_EXTRACTION_LIMITS,
  ContentExtractionError,
  classifyExtractableContent
} from '../../../../domain/content-extraction'

export type ContentExtractionInput = {
  bytes: Uint8Array
  fileName: string
  mimeType?: string
  sourceChecksum: string
  policy: ContentExtractionPolicy
  signal: AbortSignal
  depth: number
}

export type LocalContentExtractor = {
  strategy: ContentExtractionStrategy
  version: string
  formats?: readonly string[]
  extract(input: ContentExtractionInput): Promise<ExtractedContentBundle>
}

export type ContentExtractionCache = {
  get(key: string): Promise<ExtractedContentBundle | undefined>
  put(key: string, bundle: ExtractedContentBundle): Promise<void>
}

export class MemoryContentExtractionCache implements ContentExtractionCache {
  readonly entries = new Map<string, ExtractedContentBundle>()

  get size(): number {
    return this.entries.size
  }

  async get(key: string): Promise<ExtractedContentBundle | undefined> {
    const bundle = this.entries.get(key)
    return bundle ? cloneBundle(bundle) : undefined
  }

  async put(key: string, bundle: ExtractedContentBundle): Promise<void> {
    this.entries.set(key, cloneBundle(bundle))
  }
}

export class LocalContentExtractionService {
  private readonly active = new Map<string, Promise<ExtractedContentBundle>>()
  private readonly policyVersion: string

  constructor(
    private readonly dependencies: {
      extractors: readonly LocalContentExtractor[]
      cache: ContentExtractionCache
      policyVersion?: string
    }
  ) {
    this.policyVersion = dependencies.policyVersion ?? 'content-policy-v1'
  }

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    const { extractor, key } = this.resolveExtractor(input)
    const cached = await this.dependencies.cache.get(key)
    if (cached) return validateBundle(cached, input)
    const running = this.active.get(key)
    if (running) return cloneBundle(await running)
    const promise = this.runExtractor(extractor, input, key)
    this.active.set(key, promise)
    try {
      return cloneBundle(await promise)
    } finally {
      if (this.active.get(key) === promise) this.active.delete(key)
    }
  }

  async getCached(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle | undefined> {
    const { key } = this.resolveExtractor(input)
    const cached = await this.dependencies.cache.get(key)
    return cached ? validateBundle(cached, input) : undefined
  }

  private resolveExtractor(input: ContentExtractionInput): {
    extractor: LocalContentExtractor
    key: string
  } {
    assertNotAborted(input.signal)
    if (input.bytes.byteLength > CONTENT_EXTRACTION_LIMITS.maxSourceBytes) {
      throw extractionError(
        'extraction_limit_exceeded',
        'Source file exceeds the extraction limit'
      )
    }
    if (
      !Number.isSafeInteger(input.depth) ||
      input.depth < 0 ||
      input.depth > CONTENT_EXTRACTION_LIMITS.maxArchiveDepth
    ) {
      throw extractionError(
        'extraction_archive_unsafe',
        'Archive nesting exceeds the extraction limit'
      )
    }
    const actualChecksum = digest(input.bytes)
    if (actualChecksum !== input.sourceChecksum) {
      throw extractionError(
        'source_changed_during_extraction',
        'Source content changed before extraction'
      )
    }
    const format = classifyExtractableContent({
      fileName: input.fileName,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      head: input.bytes.subarray(0, Math.min(input.bytes.byteLength, 512))
    })
    const extractor = this.dependencies.extractors.find(
      ({ strategy, formats }) =>
        strategy === format.strategy &&
        (!formats || formats.includes(format.format))
    )
    if (!extractor) {
      throw extractionError(
        format.support === 'capability_gated'
          ? 'extraction_converter_unavailable'
          : 'extraction_unsupported',
        'File format is not available for local extraction'
      )
    }
    return {
      extractor,
      key: cacheKey({
        sourceChecksum: input.sourceChecksum,
        format: format.format,
        extractorVersion: extractor.version,
        ocrLanguage: input.policy.ocrLanguage ?? '',
        policyVersion: this.policyVersion
      })
    }
  }

  private async runExtractor(
    extractor: LocalContentExtractor,
    input: ContentExtractionInput,
    key: string
  ): Promise<ExtractedContentBundle> {
    const controller = new AbortController()
    const abort = (): void => controller.abort(input.signal.reason)
    input.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(
      () => controller.abort(new Error('Content extraction timed out')),
      CONTENT_EXTRACTION_LIMITS.timeoutMs
    )
    try {
      const bundle = validateBundle(
        await extractor.extract({ ...input, signal: controller.signal }),
        input
      )
      await this.dependencies.cache.put(key, bundle)
      return bundle
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw extractionError(
          'extraction_interrupted',
          'Content extraction was interrupted'
        )
      }
      if (error instanceof ContentExtractionError) throw error
      throw extractionError('extraction_invalid', 'Content extraction failed')
    } finally {
      clearTimeout(timer)
      input.signal.removeEventListener('abort', abort)
    }
  }
}

function validateBundle(
  bundle: ExtractedContentBundle,
  input: ContentExtractionInput
): ExtractedContentBundle {
  if (!Array.isArray(bundle.units) || bundle.units.length === 0) {
    throw extractionError('extraction_empty', 'Extracted content is empty')
  }
  if (
    bundle.units.length > input.policy.maxUnits ||
    bundle.units.length > CONTENT_EXTRACTION_LIMITS.maxArchiveEntries
  ) {
    throw extractionError(
      'extraction_limit_exceeded',
      'Extracted content contains too many units'
    )
  }
  const keys = new Set<string>()
  let characters = 0
  for (const unit of bundle.units) {
    validateUnit(unit)
    if (keys.has(unit.key)) {
      throw extractionError(
        'extraction_invalid',
        'Extracted content unit keys are not unique'
      )
    }
    keys.add(unit.key)
    characters += unit.text.length
  }
  if (
    characters > input.policy.maxCharacters ||
    characters > CONTENT_EXTRACTION_LIMITS.maxExtractedCharacters
  ) {
    throw extractionError(
      'extraction_limit_exceeded',
      'Extracted content exceeds the character limit'
    )
  }
  if (
    bundle.sourceChecksum !== input.sourceChecksum ||
    !bundle.extractorVersion.trim() ||
    !bundle.format.trim()
  ) {
    throw extractionError(
      'extraction_invalid',
      'Extracted content metadata is invalid'
    )
  }
  return cloneBundle(bundle)
}

function validateUnit(unit: ExtractedContentUnit): void {
  if (
    !unit.key.trim() ||
    !unit.title.trim() ||
    !unit.text.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(unit.checksum) ||
    !Number.isSafeInteger(unit.byteSize) ||
    unit.byteSize < 0
  ) {
    throw extractionError(
      'extraction_invalid',
      'Extracted content unit is invalid'
    )
  }
}

function cloneBundle(bundle: ExtractedContentBundle): ExtractedContentBundle {
  return {
    ...bundle,
    units: bundle.units.map((unit) => ({
      ...unit,
      ...(unit.metadata ? { metadata: { ...unit.metadata } } : {})
    }))
  }
}

function cacheKey(input: {
  sourceChecksum: string
  format: string
  extractorVersion: string
  ocrLanguage: string
  policyVersion: string
}): string {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw extractionError(
      'extraction_interrupted',
      'Content extraction was interrupted'
    )
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function extractionError(
  code: ConstructorParameters<typeof ContentExtractionError>[0],
  message: string
): ContentExtractionError {
  return new ContentExtractionError(code, message)
}
