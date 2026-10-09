import type { OfficeSafeCopyFormat } from '../../sidecar/client'
import type { LocalPresentationSessionService } from './local-presentation-session-service'
import type { LocalSpreadsheetSessionService } from './local-spreadsheet-session-service'
import type { LocalWordSessionService } from './local-word-session-service'

export type OfficeOriginalFormat = OfficeSafeCopyFormat

export class OfficeReadOnlySessionError extends Error {
  readonly name = 'OfficeReadOnlySessionError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class OfficeReadOnlySessionService {
  constructor(
    private readonly sessions: {
      word: Pick<LocalWordSessionService, 'open'>
      spreadsheet: Pick<LocalSpreadsheetSessionService, 'open'>
      presentation: Pick<LocalPresentationSessionService, 'open'>
    }
  ) {}

  async open(input: {
    canonicalPath: string
    relativePath: string
    sourceFormat: OfficeOriginalFormat
    signal: AbortSignal
  }): Promise<Record<string, unknown>> {
    const common = {
      canonicalPath: input.canonicalPath,
      relativePath: input.relativePath,
      mode: 'read' as const,
      signal: input.signal
    }
    const session = isWordFormat(input.sourceFormat)
      ? await this.sessions.word.open(common)
      : isSpreadsheetFormat(input.sourceFormat)
        ? await this.sessions.spreadsheet.open({
            ...common,
            format: 'xlsx'
          })
        : isPresentationFormat(input.sourceFormat)
          ? await this.sessions.presentation.open(common)
          : undefined
    if (!session) {
      throw new OfficeReadOnlySessionError(
        'office_original_format_unsupported',
        'Office original format is unsupported'
      )
    }
    return {
      ...session,
      path: input.relativePath,
      format: input.sourceFormat,
      mode: 'read'
    }
  }
}

function isWordFormat(format: string): boolean {
  return format === 'dotx' || format === 'docm' || format === 'dotm'
}

function isSpreadsheetFormat(format: string): boolean {
  return format === 'xltx' || format === 'xlsm' || format === 'xltm'
}

function isPresentationFormat(format: string): boolean {
  return (
    format === 'potx' ||
    format === 'pptm' ||
    format === 'ppsm' ||
    format === 'potm'
  )
}
