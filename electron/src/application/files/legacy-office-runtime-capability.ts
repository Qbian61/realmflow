import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { PdfGenerationReadinessSnapshot } from '../../../../domain/pdf-generation'
import {
  nonReadyToolIds,
  type RuntimeToolAvailabilityProvider,
  type RuntimeToolEligibilitySnapshot
} from '../tools/runtime-tool-availability'

const LIBREOFFICE_TOOL_IDS = [
  'builtin.office.import_legacy'
] as const
const DEFAULT_CACHE_TTL_MS = 30_000

export class LegacyOfficeRuntimeCapabilityProvider
  implements RuntimeToolAvailabilityProvider
{
  private cached: Promise<RuntimeToolEligibilitySnapshot> | undefined
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

  async getEligibilitySnapshot(): Promise<RuntimeToolEligibilitySnapshot> {
    const now = (this.dependencies.now ?? Date.now)()
    const cacheTtlMs =
      this.dependencies.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    if (!this.cached || now - this.cachedAt > cacheTtlMs) {
      this.cachedAt = now
      this.cached = this.detect(now, cacheTtlMs)
    }
    return new Map(await this.cached)
  }

  async getUnavailableToolIds(): Promise<Set<string>> {
    return nonReadyToolIds(await this.getEligibilitySnapshot())
  }

  async getPdfGenerationLibreOfficeReadiness(
    options: { legacyPdfEnabled?: boolean } = {}
  ): Promise<
    Pick<
      PdfGenerationReadinessSnapshot['backends'],
      'libreoffice_docx_pdf' | 'libreoffice_legacy_pdf'
    >
  > {
    const snapshot = await this.getEligibilitySnapshot()
    const office = snapshot.get('builtin.office.import_legacy')
    const libreOffice = {
      status: office?.status ?? 'unavailable',
      reasonCode: office?.reasonCode ?? 'local_dependency_unavailable',
      quality: 'print' as const
    }
    return {
      libreoffice_docx_pdf: libreOffice,
      libreoffice_legacy_pdf: options.legacyPdfEnabled
        ? libreOffice
        : {
            status: 'unavailable',
            reasonCode: 'legacy_pdf_disabled',
            quality: 'print'
          }
    }
  }

  invalidate(): void {
    this.cached = undefined
    this.cachedAt = 0
  }

  private async detect(
    checkedAt: number,
    ttl: number
  ): Promise<RuntimeToolEligibilitySnapshot> {
    const isExecutable =
      this.dependencies.isExecutable ?? defaultIsExecutable
    for (const candidate of executableCandidates(
      this.dependencies.platform,
      this.dependencies.environment
    )) {
      if (await isExecutable(candidate)) {
        return new Map(
          LIBREOFFICE_TOOL_IDS.map((toolId) => [
            toolId,
            {
              status: 'ready',
              reasonCode: 'runtime_ready',
              checkedAt,
              expiresAt: checkedAt + ttl,
              dependencyRevision: 'libreoffice:available'
            }
          ])
        )
      }
    }
    return new Map(
      LIBREOFFICE_TOOL_IDS.map((toolId) => [
        toolId,
        {
          status: 'unavailable',
          reasonCode: 'local_dependency_unavailable',
          checkedAt,
          expiresAt: checkedAt + ttl,
          dependencyRevision: 'libreoffice:missing'
        }
      ])
    )
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
