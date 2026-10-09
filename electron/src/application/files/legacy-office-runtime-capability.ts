import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

const LIBREOFFICE_TOOL_IDS = [
  'builtin.office.import_legacy'
] as const
const DEFAULT_CACHE_TTL_MS = 30_000

export type RuntimeToolAvailabilityProvider = {
  getUnavailableToolIds(): Promise<Set<string>>
}

export class LegacyOfficeRuntimeCapabilityProvider
  implements RuntimeToolAvailabilityProvider
{
  private cached: Promise<Set<string>> | undefined
  private cachedAt = 0

  constructor(
    private readonly dependencies: {
      platform: NodeJS.Platform
      environment: NodeJS.ProcessEnv
      isExecutable?: (path: string) => Promise<boolean>
      now?: () => number
      cacheTtlMs?: number
    }
  ) {}

  getUnavailableToolIds(): Promise<Set<string>> {
    const now = (this.dependencies.now ?? Date.now)()
    const cacheTtlMs =
      this.dependencies.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    if (!this.cached || now - this.cachedAt > cacheTtlMs) {
      this.cachedAt = now
      this.cached = this.detect()
    }
    return this.cached.then((ids) => new Set(ids))
  }

  invalidate(): void {
    this.cached = undefined
    this.cachedAt = 0
  }

  private async detect(): Promise<Set<string>> {
    const isExecutable =
      this.dependencies.isExecutable ?? defaultIsExecutable
    for (const candidate of executableCandidates(
      this.dependencies.platform,
      this.dependencies.environment
    )) {
      if (await isExecutable(candidate)) return new Set()
    }
    return new Set(LIBREOFFICE_TOOL_IDS)
  }
}

function executableCandidates(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv
): string[] {
  const executableNames =
    platform === 'win32'
      ? ['soffice.exe', 'libreoffice.exe']
      : ['libreoffice', 'soffice']
  const pathCandidates = (environment.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) =>
      executableNames.map((name) => join(directory, name))
    )
  const platformCandidates =
    platform === 'darwin'
      ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
      : platform === 'win32'
        ? [
            ...(environment.ProgramFiles
              ? [
                  join(
                    environment.ProgramFiles,
                    'LibreOffice',
                    'program',
                    'soffice.exe'
                  )
                ]
              : []),
            ...(environment['ProgramFiles(x86)']
              ? [
                  join(
                    environment['ProgramFiles(x86)'],
                    'LibreOffice',
                    'program',
                    'soffice.exe'
                  )
                ]
              : [])
          ]
        : []
  return [...new Set([...pathCandidates, ...platformCandidates])]
}

async function defaultIsExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}
