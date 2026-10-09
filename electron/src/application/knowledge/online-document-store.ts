import type {
  OnlineDocumentSnapshot,
  OnlineDocumentSource
} from '../../../../domain/online-document'
import type {
  KnowledgeSource,
  KnowledgeSourceErrorCode
} from '../../../../domain/knowledge-source'

export type OnlineDocumentSyncResult = {
  source: KnowledgeSource
  snapshot?: OnlineDocumentSnapshot
}

export type OnlineDocumentBeginResult =
  | {
      status: 'started'
      source: KnowledgeSource
      document: OnlineDocumentSource
      nextVersion: number
    }
  | { status: 'replayed'; result: OnlineDocumentSyncResult }
  | { status: 'idempotency_conflict' }
  | { status: 'revision_conflict'; current: KnowledgeSource }
  | { status: 'not_found' }

export type OnlineDocumentCompletionResult =
  | { status: 'applied' | 'replayed'; result: OnlineDocumentSyncResult }
  | { status: 'idempotency_conflict' }
  | { status: 'revision_conflict'; current: KnowledgeSource }
  | { status: 'not_found' }

export type BeginOnlineDocumentCreateInput = {
  source: KnowledgeSource
  document: OnlineDocumentSource
  registerEventId: string
  startEventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type BeginOnlineDocumentSyncInput = {
  sourceId: string
  expectedRevision: number
  eventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type CompleteOnlineDocumentSyncInput = {
  sourceId: string
  expectedRevision: number
  snapshot: OnlineDocumentSnapshot
  eventId: string
  idempotencyKey: string
  at: number
}

export type FailOnlineDocumentSyncInput = {
  sourceId: string
  expectedRevision: number
  errorCode: Extract<
    KnowledgeSourceErrorCode,
    'connector_unavailable' | 'unsupported_format'
  >
  eventId: string
  idempotencyKey: string
  at: number
}

export interface OnlineDocumentStore {
  beginOnlineDocumentCreate(
    input: BeginOnlineDocumentCreateInput
  ): Promise<OnlineDocumentBeginResult>
  beginOnlineDocumentSync(
    input: BeginOnlineDocumentSyncInput
  ): Promise<OnlineDocumentBeginResult>
  completeOnlineDocumentSync(
    input: CompleteOnlineDocumentSyncInput
  ): Promise<OnlineDocumentCompletionResult>
  failOnlineDocumentSync(
    input: FailOnlineDocumentSyncInput
  ): Promise<OnlineDocumentCompletionResult>
  getOnlineDocumentSource(
    sourceId: string
  ): Promise<OnlineDocumentSource | undefined>
  getCurrentOnlineDocumentSnapshot(
    sourceId: string
  ): Promise<OnlineDocumentSnapshot | undefined>
}
