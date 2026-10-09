import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import type {
  ModernOfficeFormat,
  OfficeSafeCopyFormat,
  OfficeSafeCopyInput,
  OfficeSafeCopyResult as SidecarOfficeSafeCopyResult
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

export type OfficeSafeCopyStorage = {
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

export type OfficeSafeCopyResult = {
  sourcePath: string
  sourceFormat: OfficeSafeCopyFormat
  sourceChecksum: string
  outputPath: string
  outputFormat: ModernOfficeFormat
  outputChecksum: string
  macrosRemoved: boolean
  templateMaterialized: boolean
  removedParts: string[]
  session: SessionSummary
}

export class OfficeSafeCopyError extends Error {
  readonly name = 'OfficeSafeCopyError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class OfficeSafeCopyService {
  constructor(
    private readonly dependencies: {
      sanitize(
        input: OfficeSafeCopyInput,
        signal: AbortSignal
      ): Promise<SidecarOfficeSafeCopyResult>
      storage: OfficeSafeCopyStorage
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

  async create(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    expectedSourceChecksum: string
    outputCanonicalPath: string
    outputRelativePath: string
    sourceFormat: OfficeSafeCopyFormat
    confirmMacroRemoval: boolean
    signal: AbortSignal
  }): Promise<OfficeSafeCopyResult> {
    assertNotAborted(input.signal)
    const policy = safeCopyPolicy(input.sourceFormat)
    if (policy.macrosRemoved && !input.confirmMacroRemoval) {
      throw new OfficeSafeCopyError(
        'macro_removal_confirmation_required',
        'Macro removal must be explicitly confirmed'
      )
    }
    assertOutputExtension(input.outputCanonicalPath, policy.outputFormat)
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
    const sanitized = await this.dependencies.sanitize(
      {
        sourceFormat: input.sourceFormat,
        documentBase64: source.toString('base64')
      },
      input.signal
    )
    assertSanitizerResult(sanitized, policy)
    const candidate = Buffer.from(sanitized.documentBase64, 'base64')
    if (candidate.byteLength === 0) {
      throw new OfficeSafeCopyError(
        'office_safe_copy_output_invalid',
        'Office sanitizer returned an empty document'
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
        outputFormat: sanitized.outputFormat,
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
        outputFormat: sanitized.outputFormat,
        outputChecksum: digest(candidate),
        macrosRemoved: sanitized.macrosRemoved,
        templateMaterialized: sanitized.templateMaterialized,
        removedParts: [...sanitized.removedParts],
        session
      }
    } catch (error) {
      if (session) {
        this.closeSession(sanitized.outputFormat, session.sessionId)
      }
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

function safeCopyPolicy(format: OfficeSafeCopyFormat): {
  outputFormat: ModernOfficeFormat
  macrosRemoved: boolean
  templateMaterialized: boolean
} {
  return {
    outputFormat:
      format === 'dotx' || format === 'docm' || format === 'dotm'
        ? 'docx'
        : format === 'xltx' || format === 'xlsm' || format === 'xltm'
          ? 'xlsx'
          : 'pptx',
    macrosRemoved: !format.endsWith('x'),
    templateMaterialized:
      format === 'dotx' ||
      format === 'xltx' ||
      format === 'potx' ||
      format === 'dotm' ||
      format === 'xltm' ||
      format === 'potm'
  }
}

function assertSanitizerResult(
  result: SidecarOfficeSafeCopyResult,
  policy: ReturnType<typeof safeCopyPolicy>
): void {
  if (
    result.outputFormat !== policy.outputFormat ||
    result.macrosRemoved !== policy.macrosRemoved ||
    result.templateMaterialized !== policy.templateMaterialized
  ) {
    throw new OfficeSafeCopyError(
      'office_safe_copy_output_invalid',
      'Office sanitizer returned contradictory safety facts'
    )
  }
}

function assertOutputExtension(
  path: string,
  format: ModernOfficeFormat
): void {
  if (extname(path).toLowerCase() !== `.${format}`) {
    throw new OfficeSafeCopyError(
      'office_safe_copy_output_invalid',
      `Office safe-copy output must use .${format}`
    )
  }
}

function sourceConflict(): OfficeSafeCopyError {
  return new OfficeSafeCopyError(
    'office_safe_copy_source_conflict',
    'Office source changed during safe-copy creation'
  )
}

function outputConflict(): OfficeSafeCopyError {
  return new OfficeSafeCopyError(
    'office_safe_copy_output_conflict',
    'Office safe-copy output already exists'
  )
}

async function assertSourceChecksum(
  storage: OfficeSafeCopyStorage,
  path: string,
  expectedChecksum: string
): Promise<void> {
  if ((await storage.checksum(path)) !== expectedChecksum) {
    throw sourceConflict()
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Office safe-copy creation was cancelled')
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
