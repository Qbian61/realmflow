import type {
  KnowledgeSource,
  KnowledgeSourceErrorCode
} from '../../../../domain/knowledge-source'
import type {
  RepositorySnapshot,
  RepositorySource
} from '../../../../domain/repository-source'

export type RepositorySyncResult = {
  source: KnowledgeSource
  snapshot?: RepositorySnapshot
}

export type RepositoryBeginResult =
  | {
      status: 'started'
      source: KnowledgeSource
      repository: RepositorySource
      nextVersion: number
    }
  | { status: 'replayed'; result: RepositorySyncResult }
  | { status: 'idempotency_conflict' }
  | { status: 'revision_conflict'; current: KnowledgeSource }
  | { status: 'not_found' }

export type RepositoryCompletionResult =
  | { status: 'applied' | 'replayed'; result: RepositorySyncResult }
  | { status: 'idempotency_conflict' }
  | { status: 'revision_conflict'; current: KnowledgeSource }
  | { status: 'not_found' }

export type BeginRepositoryCreateInput = {
  source: KnowledgeSource
  repository: RepositorySource
  registerEventId: string
  startEventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type BeginRepositorySyncInput = {
  sourceId: string
  expectedRevision: number
  eventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type CompleteRepositorySyncInput = {
  sourceId: string
  expectedRevision: number
  snapshot: RepositorySnapshot
  eventId: string
  idempotencyKey: string
  at: number
}

export type FailRepositorySyncInput = {
  sourceId: string
  expectedRevision: number
  errorCode: Extract<
    KnowledgeSourceErrorCode,
    | 'source_unavailable'
    | 'permission_denied'
    | 'unsupported_format'
    | 'connector_unavailable'
    | 'indexing_failed'
  >
  eventId: string
  idempotencyKey: string
  at: number
}

export interface RepositoryIngestionStore {
  beginRepositoryCreate(
    input: BeginRepositoryCreateInput
  ): Promise<RepositoryBeginResult>
  beginRepositorySync(
    input: BeginRepositorySyncInput
  ): Promise<RepositoryBeginResult>
  completeRepositorySync(
    input: CompleteRepositorySyncInput
  ): Promise<RepositoryCompletionResult>
  failRepositorySync(
    input: FailRepositorySyncInput
  ): Promise<RepositoryCompletionResult>
  getRepositorySource(sourceId: string): Promise<RepositorySource | undefined>
  listRepositorySources(): Promise<RepositorySource[]>
  getCurrentRepositorySnapshot(
    sourceId: string
  ): Promise<RepositorySnapshot | undefined>
}
