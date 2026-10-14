import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import {
  CONTENT_EXTRACTION_LIMITS,
  ContentExtractionError,
  classifyExtractableContent,
  createArchiveEntryUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import type {
  ArchiveByteEntry,
  ArchiveFormat,
  ArchiveSafetyLimits
} from '../../files/archive-adapter'
import type {
  ContentExtractionInput,
  LocalContentExtractionService,
  LocalContentExtractor
} from '../local-content-extraction-service'

export type ArchiveEntryReader = {
  readEntries(input: {
    format: ArchiveFormat
    archiveName: string
    content: Uint8Array
    limits: Partial<ArchiveSafetyLimits>
    signal: AbortSignal
  }): Promise<ArchiveByteEntry[]>
}

export class ArchiveContentExtractor implements LocalContentExtractor {
  readonly strategy = 'archive' as const
  readonly formats = ['zip', 'tar', 'tgz', 'gz'] as const
  readonly version = 'archive-content-v1'

  constructor(
    private readonly reader: ArchiveEntryReader,
    private readonly content: Pick<LocalContentExtractionService, 'extract'>
  ) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    const format = archiveFormat(input.fileName)
    let entries: ArchiveByteEntry[]
    try {
      entries = await this.reader.readEntries({
        format,
        archiveName: input.fileName,
        content: input.bytes,
        signal: input.signal,
        limits: {
          maxSourceBytes: CONTENT_EXTRACTION_LIMITS.maxSourceBytes,
          maxEntries: CONTENT_EXTRACTION_LIMITS.maxArchiveEntries,
          maxExpandedBytes:
            CONTENT_EXTRACTION_LIMITS.maxArchiveExpandedBytes,
          maxEntryBytes: CONTENT_EXTRACTION_LIMITS.maxSourceBytes,
          maxCompressionRatio:
            CONTENT_EXTRACTION_LIMITS.maxArchiveCompressionRatio
        }
      })
    } catch (error) {
      throw mapArchiveError(error, input.signal)
    }
    const units: ExtractedContentUnit[] = []
    for (const entry of entries) {
      const capability = classifyExtractableContent({
        fileName: entry.path,
        head: entry.bytes.subarray(0, Math.min(entry.bytes.byteLength, 512))
      })
      if (capability.support === 'unsupported') continue
      const checksum = digest(entry.bytes)
      let bundle: ExtractedContentBundle
      try {
        bundle = await this.content.extract({
          ...input,
          bytes: entry.bytes,
          fileName: entry.path,
          sourceChecksum: checksum,
          depth: input.depth + 1
        })
      } catch (error) {
        if (
          error instanceof ContentExtractionError &&
          error.code === 'extraction_unsupported'
        ) {
          continue
        }
        throw error
      }
      for (const unit of bundle.units) {
        units.push({
          ...unit,
          key: createArchiveEntryUnitKey(entry.path, unit.key),
          title: `${entry.path} / ${unit.title}`,
          metadata: {
            format: bundle.format,
            extraction:
              unit.metadata?.extraction ?? bundle.extractorVersion,
            ...(unit.metadata?.page ? { page: unit.metadata.page } : {}),
            ...(unit.metadata?.sheet ? { sheet: unit.metadata.sheet } : {}),
            ...(unit.metadata?.slide ? { slide: unit.metadata.slide } : {}),
            archiveEntry: entry.path
          }
        })
      }
    }
    if (units.length === 0) {
      throw new ContentExtractionError(
        'extraction_empty',
        'Archive contains no supported readable content'
      )
    }
    return {
      sourceChecksum: input.sourceChecksum,
      format,
      extractorVersion: this.version,
      units
    }
  }
}

function mapArchiveError(
  error: unknown,
  signal: AbortSignal
): ContentExtractionError {
  if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return new ContentExtractionError(
      'extraction_interrupted',
      'Archive extraction was interrupted'
    )
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''
  if (
    code === 'archive_entry_limit_exceeded' ||
    code === 'archive_expanded_size_exceeded' ||
    code === 'file_too_large'
  ) {
    return new ContentExtractionError(
      'extraction_limit_exceeded',
      'Archive exceeds local extraction limits'
    )
  }
  if (code.startsWith('archive_')) {
    return new ContentExtractionError(
      'extraction_archive_unsafe',
      'Archive contains unsafe content'
    )
  }
  return new ContentExtractionError(
    'extraction_invalid',
    'Archive could not be extracted'
  )
}

function archiveFormat(fileName: string): ArchiveFormat {
  const format = extname(fileName).slice(1).toLowerCase()
  if (
    format === 'zip' ||
    format === 'tar' ||
    format === 'tgz' ||
    format === 'gz'
  ) {
    return format
  }
  throw new ContentExtractionError(
    'extraction_unsupported',
    'Archive format is unsupported'
  )
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
