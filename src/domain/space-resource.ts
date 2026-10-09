import type {
  KnowledgeSourceErrorCode,
  KnowledgeSourceStatus
} from '../../domain/knowledge-source'
import type { KnowledgeRefreshPreset } from '../../domain/knowledge-refresh'
import { isRecord } from './workspace'

export type SpaceResourceType = 'file' | 'document' | 'repository'

export type SpaceResource = {
  id: string
  name: string
  type: SpaceResourceType
  locator: string
  detail: string
  status?: KnowledgeSourceStatus
  errorCode?: KnowledgeSourceErrorCode
  errorMessage?: string
  sortOrder?: number
  revision?: number
  createdAt?: number
  updatedAt: number
  refresh?: {
    enabled: boolean
    preset: KnowledgeRefreshPreset
    revision: number
    nextDueAt: number
    lastCheckedAt: number | null
    lastChangedAt: number | null
  }
  index?: {
    health: 'missing' | 'building' | 'ready' | 'failed'
    profileId: string
    generationId?: string
    sourceVersion?: string
    indexedAt?: number
  }
}

export type SpaceResourceStore = {
  resourcesBySpace: Record<string, SpaceResource[]>
}

export function createEmptySpaceResourceStore(): SpaceResourceStore {
  return { resourcesBySpace: {} }
}

export function isSpaceResource(value: unknown): value is SpaceResource {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.type === 'file' ||
      value.type === 'document' ||
      value.type === 'repository') &&
    typeof value.locator === 'string' &&
    typeof value.detail === 'string' &&
    typeof value.updatedAt === 'number'
  )
}
