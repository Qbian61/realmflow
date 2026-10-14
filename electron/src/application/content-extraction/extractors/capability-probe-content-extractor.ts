import { createHash } from 'node:crypto'
import {
  ContentExtractionError,
  type ExtractedContentBundle
} from '../../../../../domain/content-extraction'
import type {
  OptionalOfficeFormat,
  OptionalOfficeOutputFormat
} from '../../../sidecar/client'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

type CapabilityMap = Partial<
  Record<OptionalOfficeFormat, OptionalOfficeOutputFormat>
>

export class CapabilityProbeContentExtractor
  implements LocalContentExtractor
{
  readonly strategy = 'capability_probe' as const
  readonly formats = [
    'pages', 'numbers', 'key', 'vsd', 'vsdx', 'pub', 'mpp'
  ] as const
  readonly version = 'capability-probe-content-v1'
  private capabilityReport:
    | Promise<CapabilityMap>
    | undefined

  constructor(
    private readonly dependencies: {
      capabilities(): Promise<CapabilityMap>
      convert(input: {
        bytes: Uint8Array
        sourceFormat: OptionalOfficeFormat
        outputFormat: OptionalOfficeOutputFormat
        signal: AbortSignal
      }): Promise<{
        bytes: Uint8Array
        outputFormat: OptionalOfficeOutputFormat
      }>
      modern: {
        extract(
          format: OptionalOfficeOutputFormat,
          input: ContentExtractionInput
        ): Promise<ExtractedContentBundle>
      }
    }
  ) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    if (!input.policy.allowLocalConversion) throw unavailable()
    const sourceFormat = extension(input.fileName) as OptionalOfficeFormat
    const capabilities = await this.capabilities()
    const outputFormat = capabilities[sourceFormat]
    if (!outputFormat) throw unavailable()
    let converted
    try {
      converted = await this.dependencies.convert({
        bytes: input.bytes,
        sourceFormat,
        outputFormat,
        signal: input.signal
      })
    } catch (error) {
      if (
        input.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        throw new ContentExtractionError(
          'extraction_interrupted',
          'Optional Office conversion was interrupted'
        )
      }
      throw unavailable()
    }
    if (converted.outputFormat !== outputFormat) {
      throw new ContentExtractionError(
        'extraction_invalid',
        'Optional Office converter returned the wrong format'
      )
    }
    const modern = await this.dependencies.modern.extract(outputFormat, {
      ...input,
      bytes: converted.bytes,
      fileName: `converted.${outputFormat}`,
      sourceChecksum: digest(converted.bytes)
    })
    return {
      sourceChecksum: input.sourceChecksum,
      format: sourceFormat,
      extractorVersion: `${this.version}+${modern.extractorVersion}`,
      units: modern.units.map((unit) => ({
        ...unit,
        metadata: {
          format: sourceFormat,
          extraction:
            `capability_convert:${unit.metadata?.extraction ?? modern.format}`,
          ...(unit.metadata?.page ? { page: unit.metadata.page } : {}),
          ...(unit.metadata?.sheet ? { sheet: unit.metadata.sheet } : {}),
          ...(unit.metadata?.slide ? { slide: unit.metadata.slide } : {})
        }
      }))
    }
  }

  private capabilities(): Promise<CapabilityMap> {
    this.capabilityReport ??= this.dependencies.capabilities().then(
      (report) => ({ ...report })
    )
    return this.capabilityReport
  }
}

function extension(fileName: string): string {
  return fileName.toLowerCase().split('.').at(-1) ?? ''
}

function unavailable(): ContentExtractionError {
  return new ContentExtractionError(
    'extraction_converter_unavailable',
    'No deterministic local converter is available for this format'
  )
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
