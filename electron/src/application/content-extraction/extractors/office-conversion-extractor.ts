import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import {
  ContentExtractionError,
  type ExtractedContentBundle
} from '../../../../../domain/content-extraction'
import type {
  LegacyOfficeFormat,
  ModernOfficeFormat,
  OfficeSafeCopyFormat
} from '../../../sidecar/client'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

type ConvertedBytes = {
  bytes: Uint8Array
  outputFormat: ModernOfficeFormat
}

export type ModernOfficeContentPort = {
  extract(
    format: ModernOfficeFormat,
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle>
}

export class OfficeConversionContentExtractor
  implements LocalContentExtractor
{
  readonly strategy = 'office_convert' as const
  readonly formats = [
    'doc', 'dot', 'wps', 'wpt', 'xls', 'xlt', 'ppt', 'pps', 'pot'
  ] as const
  readonly version = 'office-conversion-content-v1'

  constructor(
    private readonly converter: {
      convertBytes(input: {
        bytes: Uint8Array
        sourceFormat: LegacyOfficeFormat
        signal: AbortSignal
      }): Promise<ConvertedBytes>
    },
    private readonly modern: ModernOfficeContentPort
  ) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    requireConversion(input)
    const sourceFormat = extension(input.fileName) as LegacyOfficeFormat
    let converted: ConvertedBytes
    try {
      converted = await this.converter.convertBytes({
        bytes: input.bytes,
        sourceFormat,
        signal: input.signal
      })
    } catch (error) {
      throw mapConversionError(error, input.signal)
    }
    return this.extractModern(input, sourceFormat, converted)
  }

  private async extractModern(
    input: ContentExtractionInput,
    sourceFormat: string,
    converted: ConvertedBytes
  ): Promise<ExtractedContentBundle> {
    const modern = await this.modern.extract(
      converted.outputFormat,
      modernInput(input, converted)
    )
    return remapBundle(
      input,
      modern,
      sourceFormat,
      'office_convert',
      this.version
    )
  }
}

export class OfficeSanitizedContentExtractor
  implements LocalContentExtractor
{
  readonly strategy = 'office_sanitize' as const
  readonly formats = [
    'docm', 'dotm', 'dotx', 'xlsm', 'xltm', 'xltx', 'pptm', 'ppsm', 'potm',
    'potx'
  ] as const
  readonly version = 'office-sanitized-content-v1'

  constructor(
    private readonly sanitizer: {
      sanitizeBytes(input: {
        bytes: Uint8Array
        sourceFormat: OfficeSafeCopyFormat
        signal: AbortSignal
      }): Promise<
        ConvertedBytes & {
          macrosRemoved: boolean
          templateMaterialized: boolean
          removedParts: string[]
        }
      >
    },
    private readonly modern: ModernOfficeContentPort
  ) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    requireConversion(input)
    const sourceFormat = extension(input.fileName) as OfficeSafeCopyFormat
    let converted: ConvertedBytes
    try {
      converted = await this.sanitizer.sanitizeBytes({
        bytes: input.bytes,
        sourceFormat,
        signal: input.signal
      })
    } catch (error) {
      throw mapConversionError(error, input.signal)
    }
    const modern = await this.modern.extract(
      converted.outputFormat,
      modernInput(input, converted)
    )
    return remapBundle(
      input,
      modern,
      sourceFormat,
      'office_sanitize',
      this.version
    )
  }
}

function modernInput(
  input: ContentExtractionInput,
  converted: ConvertedBytes
): ContentExtractionInput {
  return {
    ...input,
    bytes: converted.bytes,
    fileName: `${baseNameWithoutExtension(input.fileName)}.${converted.outputFormat}`,
    sourceChecksum: digest(converted.bytes)
  }
}

function remapBundle(
  input: ContentExtractionInput,
  modern: ExtractedContentBundle,
  sourceFormat: string,
  extraction: string,
  extractorVersion: string
): ExtractedContentBundle {
  return {
    sourceChecksum: input.sourceChecksum,
    format: sourceFormat,
    extractorVersion: `${extractorVersion}+${modern.extractorVersion}`,
    units: modern.units.map((unit) => ({
      ...unit,
      metadata: {
        format: sourceFormat,
        extraction: `${extraction}:${unit.metadata?.extraction ?? modern.format}`,
        ...(unit.metadata?.page ? { page: unit.metadata.page } : {}),
        ...(unit.metadata?.sheet ? { sheet: unit.metadata.sheet } : {}),
        ...(unit.metadata?.slide ? { slide: unit.metadata.slide } : {})
      }
    }))
  }
}

function requireConversion(input: ContentExtractionInput): void {
  if (!input.policy.allowLocalConversion) {
    throw new ContentExtractionError(
      'extraction_converter_unavailable',
      'Local Office conversion is disabled'
    )
  }
}

function mapConversionError(
  error: unknown,
  signal: AbortSignal
): ContentExtractionError {
  if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return new ContentExtractionError(
      'extraction_interrupted',
      'Office conversion was interrupted'
    )
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'converter_unavailable'
  ) {
    return new ContentExtractionError(
      'extraction_converter_unavailable',
      'LibreOffice is unavailable'
    )
  }
  return new ContentExtractionError(
    'extraction_invalid',
    'Office conversion failed'
  )
}

function extension(fileName: string): string {
  return extname(fileName).slice(1).toLowerCase()
}

function baseNameWithoutExtension(fileName: string): string {
  const name = basename(fileName)
  return name.slice(0, name.length - extname(name).length)
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
