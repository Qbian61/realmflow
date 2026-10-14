import type { KnowledgeRefreshPreset } from '../../../../domain/knowledge-refresh'
import type { KnowledgeSource } from '../../../../domain/knowledge-source'
import type { RepositorySource } from '../../../../domain/repository-source'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../../domain/vector-index-profile'

export type KnowledgeSourceRowView = KnowledgeSource & {
  refresh?: {
    enabled: boolean
    preset: KnowledgeRefreshPreset
    revision: number
    nextDueAt: number
    lastCheckedAt: number | null
    lastChangedAt: number | null
  }
  index: {
    health: 'missing' | 'building' | 'ready' | 'failed'
    profileId: string
    generationId?: string
    sourceVersion?: string
    indexedAt?: number
    errorCode?: string
  }
  repository?: RepositorySourceSummaryView
}

type RepositorySourceSummaryView = {
  sourceId: string
  workspaceId: string
  mode: 'local' | 'remote'
  locator: string
  selectedBranch?: string
  currentVersion: number
  revisionLabel?: string
  fileCount: number
  totalBytes: number
  lastScannedAt?: number
  createdAt: number
  updatedAt: number
}

export class KnowledgeSourceQueryService {
  constructor(
    private readonly dependencies: {
      sources: {
        list(query: { workspaceId: string }): Promise<KnowledgeSource[]>
      }
      refresh: {
        getPolicy(sourceId: string): Promise<
          | {
              enabled: boolean
              preset: KnowledgeRefreshPreset
              revision: number
              nextDueAt: number
              lastCheckedAt: number | null
              lastChangedAt: number | null
            }
          | undefined
        >
      }
      indexes: {
        get(sourceId: string): Promise<{
          health: 'missing' | 'building' | 'ready' | 'failed'
          index?: {
            id: string
            sourceVersion: string
            committedAt: number | null
          }
          job?: {
            status: string
            errorCode?: string | null
          }
        }>
      }
      repositories?: {
        getRepositorySource(
          sourceId: string
        ): Promise<RepositorySource | undefined>
      }
    }
  ) {}

  async list(query: { workspaceId: string }): Promise<KnowledgeSourceRowView[]> {
    const sources = await this.dependencies.sources.list(query)
    return Promise.all(
      sources.map(async (source) => {
        const [refresh, index, repository] = await Promise.all([
          this.dependencies.refresh.getPolicy(source.id),
          this.dependencies.indexes.get(source.id),
          source.type === 'repository'
            ? (this.dependencies.repositories?.getRepositorySource(
                source.id
              ) ?? Promise.resolve(undefined))
            : Promise.resolve(undefined)
        ])
        return {
          ...source,
          ...(refresh
            ? {
                refresh: {
                  enabled: refresh.enabled,
                  preset: refresh.preset,
                  revision: refresh.revision,
                  nextDueAt: refresh.nextDueAt,
                  lastCheckedAt: refresh.lastCheckedAt,
                  lastChangedAt: refresh.lastChangedAt
                }
              }
            : {}),
          index: {
            health: index.health,
            profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
            ...(index.index
              ? {
                  generationId: index.index.id,
                  sourceVersion: index.index.sourceVersion,
                  ...(index.index.committedAt === null
                    ? {}
                    : { indexedAt: index.index.committedAt })
                }
              : {}),
            ...(index.health === 'failed' && index.job?.errorCode
              ? { errorCode: index.job.errorCode }
              : {})
          },
          ...(repository
            ? { repository: mapRepositorySourceSummary(repository) }
            : {})
        }
      })
    )
  }
}

function mapRepositorySourceSummary(
  repository: RepositorySource
): RepositorySourceSummaryView {
  return {
    sourceId: repository.sourceId,
    workspaceId: repository.workspaceId,
    mode: repository.mode,
    locator: repository.locator,
    ...(repository.selectedBranch
      ? { selectedBranch: repository.selectedBranch }
      : {}),
    currentVersion: repository.currentVersion,
    ...(repository.revisionLabel
      ? { revisionLabel: repository.revisionLabel }
      : {}),
    fileCount: repository.fileCount,
    totalBytes: repository.totalBytes,
    ...(repository.lastScannedAt
      ? { lastScannedAt: repository.lastScannedAt }
      : {}),
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt
  }
}
