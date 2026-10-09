import type { LocalFileSource } from '../../../../domain/local-file-source'
import type { KnowledgeSource } from '../../../../domain/knowledge-source'

export type RegisterLocalFileBatchInput = {
  items: Array<{
    source: KnowledgeSource
    localFile: LocalFileSource
    eventId: string
  }>
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type LocalFileBatchWriteResult =
  | { status: 'applied' | 'replayed'; sources: KnowledgeSource[] }
  | { status: 'idempotency_conflict' }

export type RefreshLocalFileInput = {
  sourceId: string
  expectedRevision: number
  localFile: LocalFileSource
  eventId: string
  idempotencyKey: string
  at: number
}

export type LocalFileRefreshResult =
  | {
      status: 'applied' | 'replayed'
      source: KnowledgeSource
      contentChanged: boolean
    }
  | { status: 'idempotency_conflict' }
  | { status: 'revision_conflict'; current: KnowledgeSource }
  | { status: 'not_found' }

export interface LocalFileIngestionStore {
  registerLocalFileBatch(
    input: RegisterLocalFileBatchInput
  ): Promise<LocalFileBatchWriteResult>
  getLocalFileSource(sourceId: string): Promise<LocalFileSource | undefined>
  listLocalFileSources(): Promise<LocalFileSource[]>
  refreshLocalFile(
    input: RefreshLocalFileInput
  ): Promise<LocalFileRefreshResult>
}
