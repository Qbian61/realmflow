import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import {
  ContentExtractionError,
  createSheetUnitKey,
  createSlideUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import type {
  LegacyOfficeFormat,
  ModernOfficeFormat,
  OfficeSafeCopyFormat
} from '../../files/private-python-worker-client'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

type ConvertedBytes = {
  bytes: Uint8Array
  outputFormat: ModernOfficeFormat
}

type NativeLegacyOfficeFormat =
  | 'doc'
  | 'dot'
  | 'xls'
  | 'xlt'
  | 'ppt'
  | 'pps'
  | 'pot'

export type ModernOfficeContentPort = {
  extract(
    format: ModernOfficeFormat,
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle>
}

export class LegacyOfficeContentExtractor implements LocalContentExtractor {
  readonly strategy = 'legacy_office' as const
  readonly formats = [
    'doc', 'dot', 'xls', 'xlt', 'ppt', 'pps', 'pot'
  ] as const
  readonly version = 'legacy-office-content-v1'

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
    const sourceFormat = extension(input.fileName) as NativeLegacyOfficeFormat
    const native = extractNativeLegacyOffice(input, sourceFormat, this.version)
    if (native) return native

    requireConversion(input)
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

export class OfficeConversionContentExtractor
  implements LocalContentExtractor
{
  readonly strategy = 'office_convert' as const
  readonly formats = ['wps', 'wpt'] as const
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

function extractNativeLegacyOffice(
  input: ContentExtractionInput,
  format: NativeLegacyOfficeFormat,
  extractorVersion: string
): ExtractedContentBundle | undefined {
  const text = extractLegacyBinaryText(input.bytes)
  if (!text.trim()) return undefined
  const units = [legacyOfficeUnit(format, input.fileName, text)]
  return {
    sourceChecksum: input.sourceChecksum,
    format,
    extractorVersion,
    units
  }
}

function legacyOfficeUnit(
  format: NativeLegacyOfficeFormat,
  fileName: string,
  text: string
): ExtractedContentUnit {
  const bytes = new TextEncoder().encode(text)
  if (format === 'xls' || format === 'xlt') {
    return {
      key: createSheetUnitKey('Workbook'),
      title: 'Workbook',
      text,
      checksum: digest(bytes),
      byteSize: bytes.byteLength,
      metadata: {
        format,
        extraction: 'legacy_office_native',
        sheet: 'Workbook'
      }
    }
  }
  if (format === 'ppt' || format === 'pps' || format === 'pot') {
    return {
      key: createSlideUnitKey(1),
      title: 'Slide 1',
      text,
      checksum: digest(bytes),
      byteSize: bytes.byteLength,
      metadata: {
        format,
        extraction: 'legacy_office_native',
        slide: 1
      }
    }
  }
  return {
    key: 'content',
    title: basename(fileName),
    text,
    checksum: digest(bytes),
    byteSize: bytes.byteLength,
    metadata: {
      format,
      extraction: 'legacy_office_native'
    }
  }
}

function extractLegacyBinaryText(bytes: Uint8Array): string {
  return normalizeTextRuns([
    ...readUtf16LeRuns(bytes),
    ...readAsciiRuns(bytes)
  ])
}

function readUtf16LeRuns(bytes: Uint8Array): string[] {
  const runs: string[] = []
  let current = ''
  for (let index = 0; index + 1 < bytes.byteLength; index += 2) {
    const code = bytes[index]! | (bytes[index + 1]! << 8)
    if (isReadableCodePoint(code)) {
      current += String.fromCharCode(code)
    } else {
      pushTextRun(runs, current)
      current = ''
    }
  }
  pushTextRun(runs, current)
  return runs
}

function readAsciiRuns(bytes: Uint8Array): string[] {
  const runs: string[] = []
  let current = ''
  for (const byte of bytes) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e)) {
      current += String.fromCharCode(byte)
    } else {
      pushTextRun(runs, current)
      current = ''
    }
  }
  pushTextRun(runs, current)
  return runs
}

function pushTextRun(runs: string[], value: string): void {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  if (normalized.length >= 6 && /[\p{L}\p{N}]/u.test(normalized)) {
    runs.push(normalized)
  }
}

function normalizeTextRuns(runs: string[]): string {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const run of runs) {
    const key = run.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(run)
  }
  return unique
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isReadableCodePoint(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0d ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd)
  )
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
