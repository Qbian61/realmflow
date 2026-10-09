import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import type {
  LegacyOfficeConversionInput,
  LegacyOfficeConversionResult,
  LegacyOfficeFormat,
  ModernOfficeFormat
} from '../../sidecar/client'
import type {
  LocalPresentationSessionService,
  PresentationSessionSummary
} from './local-presentation-session-service'
import type {
  LocalSpreadsheetSessionService,
  SpreadsheetSessionSummary
} from './local-spreadsheet-session-service'
import type {
  LocalWordSessionService,
  WordSessionSummary
} from './local-word-session-service'

export type LegacyOfficeImportStorage = {
  read(canonicalPath: string): Promise<Uint8Array>
  checksum(canonicalPath: string): Promise<string>
  exists(canonicalPath: string): Promise<boolean>
  commitNew(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void>
  remove(canonicalPath: string): Promise<void>
}

type SessionSummary =
  | WordSessionSummary
  | SpreadsheetSessionSummary
  | PresentationSessionSummary

export type LegacyOfficeImportResult = {
  sourcePath: string
  sourceFormat: LegacyOfficeFormat
  sourceChecksum: string
  outputPath: string
  outputFormat: ModernOfficeFormat
  outputChecksum: string
  converter: 'LibreOffice'
  converted: true
  session: SessionSummary
}

export class LegacyOfficeImportError extends Error {
  readonly name = 'LegacyOfficeImportError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class LegacyOfficeImportService {
  constructor(
    private readonly dependencies: {
      convert(
        input: LegacyOfficeConversionInput,
        signal: AbortSignal
      ): Promise<LegacyOfficeConversionResult>
      storage: LegacyOfficeImportStorage
      sessions: {
        word: Pick<LocalWordSessionService, 'open' | 'close'>
        spreadsheet: Pick<LocalSpreadsheetSessionService, 'open' | 'close'>
        presentation: Pick<
          LocalPresentationSessionService,
          'open' | 'close'
        >
      }
    }
  ) {}

  async import(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    expectedSourceChecksum: string
    outputCanonicalPath: string
    outputRelativePath: string
    sourceFormat: LegacyOfficeFormat
    signal: AbortSignal
  }): Promise<LegacyOfficeImportResult> {
    assertNotAborted(input.signal)
    const expectedOutputFormat = targetFormat(input.sourceFormat)
    assertOutputExtension(input.outputCanonicalPath, expectedOutputFormat)
    if (await this.dependencies.storage.exists(input.outputCanonicalPath)) {
      throw outputConflict()
    }
    const source = Buffer.from(
      await this.dependencies.storage.read(input.sourceCanonicalPath)
    )
    const sourceChecksum = digest(source)
    if (sourceChecksum !== input.expectedSourceChecksum) {
      throw sourceConflict()
    }
    await assertSourceChecksum(
      this.dependencies.storage,
      input.sourceCanonicalPath,
      input.expectedSourceChecksum
    )
    const converted = await this.dependencies.convert(
      {
        sourceFormat: input.sourceFormat,
        documentBase64: source.toString('base64')
      },
      input.signal
    )
    if (converted.outputFormat !== expectedOutputFormat) {
      throw new LegacyOfficeImportError(
        'legacy_office_output_invalid',
        'Legacy Office converter returned the wrong output format'
      )
    }
    const candidate = Buffer.from(converted.documentBase64, 'base64')
    if (candidate.byteLength === 0) {
      throw new LegacyOfficeImportError(
        'legacy_office_output_invalid',
        'Legacy Office converter returned an empty document'
      )
    }
    if (
      sourceChecksum !==
      (await this.dependencies.storage.checksum(input.sourceCanonicalPath))
    ) {
      throw sourceConflict()
    }

    try {
      await this.dependencies.storage.commitNew({
        canonicalPath: input.outputCanonicalPath,
        content: candidate
      })
    } catch (error) {
      if (isAlreadyExists(error)) throw outputConflict()
      throw error
    }
    const destination = {
      canonicalPath: input.outputCanonicalPath,
      relativePath: input.outputRelativePath
    }
    let session: SessionSummary | undefined
    try {
      session = await this.openSession({
        canonicalPath: destination.canonicalPath,
        relativePath: destination.relativePath,
        outputFormat: converted.outputFormat,
        signal: input.signal
      })
      if (
        sourceChecksum !==
        (await this.dependencies.storage.checksum(input.sourceCanonicalPath))
      ) {
        throw sourceConflict()
      }
      return {
        sourcePath: input.sourceRelativePath,
        sourceFormat: input.sourceFormat,
        sourceChecksum,
        outputPath: destination.relativePath,
        outputFormat: converted.outputFormat,
        outputChecksum: digest(candidate),
        converter: converted.converter,
        converted: true,
        session
      }
    } catch (error) {
      if (session) this.closeSession(converted.outputFormat, session.sessionId)
      await this.dependencies.storage.remove(destination.canonicalPath)
      throw error
    }
  }

  private openSession(input: {
    canonicalPath: string
    relativePath: string
    outputFormat: ModernOfficeFormat
    signal: AbortSignal
  }): Promise<SessionSummary> {
    const common = {
      canonicalPath: input.canonicalPath,
      relativePath: input.relativePath,
      mode: 'edit' as const,
      signal: input.signal
    }
    if (input.outputFormat === 'docx') {
      return this.dependencies.sessions.word.open(common)
    }
    if (input.outputFormat === 'xlsx') {
      return this.dependencies.sessions.spreadsheet.open({
        ...common,
        format: 'xlsx'
      })
    }
    return this.dependencies.sessions.presentation.open(common)
  }

  private closeSession(
    format: ModernOfficeFormat,
    sessionId: string
  ): void {
    if (format === 'docx') {
      this.dependencies.sessions.word.close(sessionId)
    } else if (format === 'xlsx') {
      this.dependencies.sessions.spreadsheet.close(sessionId)
    } else {
      this.dependencies.sessions.presentation.close(sessionId)
    }
  }
}

function targetFormat(format: LegacyOfficeFormat): ModernOfficeFormat {
  if (
    format === 'doc' ||
    format === 'dot' ||
    format === 'wps' ||
    format === 'wpt'
  ) {
    return 'docx'
  }
  if (format === 'xls' || format === 'xlt') return 'xlsx'
  return 'pptx'
}

function assertOutputExtension(
  path: string,
  format: ModernOfficeFormat
): void {
  if (extname(path).toLowerCase() !== `.${format}`) {
    throw new LegacyOfficeImportError(
      'legacy_office_output_invalid',
      `Legacy Office output must use .${format}`
    )
  }
}

function sourceConflict(): LegacyOfficeImportError {
  return new LegacyOfficeImportError(
    'legacy_office_source_conflict',
    'Legacy Office source changed during import'
  )
}

function outputConflict(): LegacyOfficeImportError {
  return new LegacyOfficeImportError(
    'legacy_office_output_conflict',
    'Legacy Office output already exists'
  )
}

async function assertSourceChecksum(
  storage: LegacyOfficeImportStorage,
  path: string,
  expectedChecksum: string
): Promise<void> {
  if ((await storage.checksum(path)) !== expectedChecksum) {
    throw sourceConflict()
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Legacy Office import was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
