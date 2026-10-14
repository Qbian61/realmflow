import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import {
  CONTENT_EXTRACTION_LIMITS,
  ContentExtractionError,
  createSheetUnitKey,
  type ExtractedContentBundle,
  type ExtractedContentUnit
} from '../../../../../domain/content-extraction'
import type {
  ContentExtractionInput,
  LocalContentExtractor
} from '../local-content-extraction-service'

type ExtractedSheet = {
  name: string
  rows: string[][]
  nonEmptyCellCount: number
}

export type SpreadsheetTextExtractionPort = {
  extractText(input: {
    bytes: Uint8Array
    format: 'csv' | 'tsv' | 'xlsx'
    signal: AbortSignal
  }): Promise<{ sheets: ExtractedSheet[] }>
}

export class SpreadsheetContentExtractor implements LocalContentExtractor {
  readonly strategy = 'spreadsheet' as const
  readonly formats = ['csv', 'tsv', 'xlsx'] as const
  readonly version = 'spreadsheet-content-v1'

  constructor(private readonly spreadsheet: SpreadsheetTextExtractionPort) {}

  async extract(
    input: ContentExtractionInput
  ): Promise<ExtractedContentBundle> {
    const format = spreadsheetFormat(input.fileName)
    let extracted: { sheets: ExtractedSheet[] }
    try {
      extracted = await this.spreadsheet.extractText({
        bytes: input.bytes,
        format,
        signal: input.signal
      })
    } catch (error) {
      if (isAbort(error) || input.signal.aborted) {
        throw new ContentExtractionError(
          'extraction_interrupted',
          'Spreadsheet extraction was interrupted'
        )
      }
      if (hasCode(error, 'spreadsheet_limit_exceeded')) {
        throw new ContentExtractionError(
          'extraction_limit_exceeded',
          'Spreadsheet exceeds local extraction limits'
        )
      }
      throw new ContentExtractionError(
        'extraction_invalid',
        'Spreadsheet could not be extracted'
      )
    }
    validateSheets(extracted.sheets)
    const usedKeys = new Set<string>()
    const units = extracted.sheets
      .map((sheet, index) =>
        sheetUnit(sheet, format, index, usedKeys)
      )
      .filter((unit): unit is ExtractedContentUnit => unit !== undefined)
    if (units.length === 0) {
      throw new ContentExtractionError(
        'extraction_empty',
        'Spreadsheet contains no readable cells'
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

function validateSheets(sheets: ExtractedSheet[]): void {
  if (
    !Array.isArray(sheets) ||
    sheets.length > CONTENT_EXTRACTION_LIMITS.maxSheets
  ) {
    throw new ContentExtractionError(
      'extraction_limit_exceeded',
      'Spreadsheet contains too many sheets'
    )
  }
  let nonEmptyCells = 0
  for (const sheet of sheets) {
    if (
      !sheet ||
      typeof sheet.name !== 'string' ||
      !sheet.name.trim() ||
      !Array.isArray(sheet.rows) ||
      !Number.isSafeInteger(sheet.nonEmptyCellCount) ||
      sheet.nonEmptyCellCount < 0 ||
      !sheet.rows.every(
        (row) =>
          Array.isArray(row) &&
          row.every((value) => typeof value === 'string')
      )
    ) {
      throw new ContentExtractionError(
        'extraction_invalid',
        'Spreadsheet extraction result is invalid'
      )
    }
    nonEmptyCells += sheet.nonEmptyCellCount
  }
  if (nonEmptyCells > CONTENT_EXTRACTION_LIMITS.maxNonEmptyCells) {
    throw new ContentExtractionError(
      'extraction_limit_exceeded',
      'Spreadsheet contains too many non-empty cells'
    )
  }
}

function sheetUnit(
  sheet: ExtractedSheet,
  format: 'csv' | 'tsv' | 'xlsx',
  index: number,
  usedKeys: Set<string>
): ExtractedContentUnit | undefined {
  const text = sheet.rows
    .map((row) => row.map(escapeCell).join('\t').replace(/\t+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '')
  if (!text.trim()) return undefined
  let key = createSheetUnitKey(sheet.name)
  if (usedKeys.has(key)) key = `${key}-${index + 1}`
  usedKeys.add(key)
  const bytes = new TextEncoder().encode(text)
  return {
    key,
    title: sheet.name,
    text,
    checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteSize: bytes.byteLength,
    metadata: {
      format,
      extraction: 'spreadsheet',
      sheet: sheet.name
    }
  }
}

function escapeCell(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

function spreadsheetFormat(fileName: string): 'csv' | 'tsv' | 'xlsx' {
  const format = extname(fileName).slice(1).toLowerCase()
  if (format === 'csv' || format === 'tsv' || format === 'xlsx') {
    return format
  }
  throw new ContentExtractionError(
    'extraction_unsupported',
    'Spreadsheet format is unsupported'
  )
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
