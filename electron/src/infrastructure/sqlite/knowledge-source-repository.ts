import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  LocalFileSource,
  LocalFileStorageMode
} from '../../../../domain/local-file-source'
import type {
  OnlineDocumentSnapshot,
  OnlineDocumentSource
} from '../../../../domain/online-document'
import {
  transitionKnowledgeSource,
  type KnowledgeSource,
  type KnowledgeSourceStatus
} from '../../../../domain/knowledge-source'
import type {
  KnowledgeSourceEvent,
  KnowledgeSourceRepository,
  KnowledgeSourceTransitionInput,
  KnowledgeSourceTrigger,
  KnowledgeSourceWriteResult
} from '../../application/knowledge/knowledge-source-service'
import type {
  LocalFileBatchWriteResult,
  LocalFileIngestionStore,
  LocalFileRefreshResult,
  RefreshLocalFileInput,
  RegisterLocalFileBatchInput
} from '../../application/knowledge/local-file-ingestion-store'
import type {
  BeginOnlineDocumentCreateInput,
  BeginOnlineDocumentSyncInput,
  CompleteOnlineDocumentSyncInput,
  FailOnlineDocumentSyncInput,
  OnlineDocumentBeginResult,
  OnlineDocumentCompletionResult,
  OnlineDocumentStore
} from '../../application/knowledge/online-document-store'
import type { KnowledgeSourceErrorCode } from '../../../../domain/knowledge-source'
import { SqliteOnlineDocumentStore } from './online-document-store'

type SourceRow = {
  id: string
  workspace_id: string
  name: string
  type: KnowledgeSource['type']
  locator: string
  detail: string
  sort_order: number
  status: KnowledgeSourceStatus
  sync_started_at: number | null
  indexed_at: number | null
  error_code: KnowledgeSourceErrorCode | null
  error_message: string | null
  revision: number
  created_at: number
  updated_at: number
}

type EventRow = {
  id: string
  source_id: string
  operation: KnowledgeSourceEvent['operation']
  from_status: KnowledgeSourceStatus | null
  to_status: KnowledgeSourceStatus
  trigger_source: KnowledgeSourceTrigger
  idempotency_key: string
  source_revision: number
  error_code: KnowledgeSourceErrorCode | null
  error_message: string | null
  occurred_at: number
}

type CommandRow = {
  source_id: string
  command_fingerprint: string
}

type LocalFileRow = {
  source_id: string
  workspace_id: string
  storage_mode: LocalFileStorageMode
  original_path: string
  managed_relative_path: string | null
  content_checksum: string
  byte_size: number
  modified_at: number
  checked_at: number
}

type LocalFileCommandRow = {
  command_fingerprint: string
  result_json: string
}

export class SqliteKnowledgeSourceRepository
  implements
    KnowledgeSourceRepository,
    LocalFileIngestionStore,
    OnlineDocumentStore
{
  private readonly onlineDocuments: SqliteOnlineDocumentStore

  constructor(private readonly database: Database.Database) {
    this.onlineDocuments = new SqliteOnlineDocumentStore(database)
  }

  beginOnlineDocumentCreate(
    input: BeginOnlineDocumentCreateInput
  ): Promise<OnlineDocumentBeginResult> {
    return this.onlineDocuments.beginOnlineDocumentCreate(input)
  }

  beginOnlineDocumentSync(
    input: BeginOnlineDocumentSyncInput
  ): Promise<OnlineDocumentBeginResult> {
    return this.onlineDocuments.beginOnlineDocumentSync(input)
  }

  completeOnlineDocumentSync(
    input: CompleteOnlineDocumentSyncInput
  ): Promise<OnlineDocumentCompletionResult> {
    return this.onlineDocuments.completeOnlineDocumentSync(input)
  }

  failOnlineDocumentSync(
    input: FailOnlineDocumentSyncInput
  ): Promise<OnlineDocumentCompletionResult> {
    return this.onlineDocuments.failOnlineDocumentSync(input)
  }

  getOnlineDocumentSource(
    sourceId: string
  ): Promise<OnlineDocumentSource | undefined> {
    return this.onlineDocuments.getOnlineDocumentSource(sourceId)
  }

  getCurrentOnlineDocumentSnapshot(
    sourceId: string
  ): Promise<OnlineDocumentSnapshot | undefined> {
    return this.onlineDocuments.getCurrentOnlineDocumentSnapshot(sourceId)
  }

  async get(id: string): Promise<KnowledgeSource | undefined> {
    return mapSourceOptional(
      this.database
        .prepare('SELECT * FROM knowledge_sources WHERE id = ?')
        .get(id) as SourceRow | undefined
    )
  }

  async listByWorkspace(workspaceId: string): Promise<KnowledgeSource[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM knowledge_sources
           WHERE workspace_id = ? AND status <> 'removed'
           ORDER BY sort_order, id`
        )
        .all(workspaceId) as SourceRow[]
    ).map(mapSource)
  }

  async listEvents(sourceId: string): Promise<KnowledgeSourceEvent[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM knowledge_source_events
           WHERE source_id = ? ORDER BY occurred_at, id`
        )
        .all(sourceId) as EventRow[]
    ).map(mapEvent)
  }

  async registerLocalFileBatch(
    input: RegisterLocalFileBatchInput
  ): Promise<LocalFileBatchWriteResult> {
    return this.database.transaction(() => {
      const replay = this.replayLocalFileCommand<{
        sources: KnowledgeSource[]
      }>(
        input.idempotencyKey,
        input.fingerprint
      )
      if (replay) {
        return replay.status === 'idempotency_conflict'
          ? replay
          : { ...replay, sources: replay.result.sources }
      }

      for (const item of input.items) {
        this.database
          .prepare(
            `INSERT INTO knowledge_sources (
              id, workspace_id, name, type, locator, detail, sort_order, status,
              sync_started_at, indexed_at, error_code, error_message, revision,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...sourceValues(item.source))
        const commandKey = `${input.idempotencyKey}:${item.source.id}`
        this.insertEvent({
          id: item.eventId,
          sourceId: item.source.id,
          operation: 'register',
          toStatus: 'registered',
          triggerSource: 'ingestion',
          idempotencyKey: commandKey,
          sourceRevision: item.source.revision,
          occurredAt: input.at
        })
        this.insertCommand(
          commandKey,
          item.source.id,
          commandFingerprint({
            kind: 'local_file_register',
            source: item.source,
            localFile: item.localFile
          }),
          item.source.revision,
          input.at
        )
        this.insertLocalFile(item.localFile)
      }

      const result = { sources: input.items.map(({ source }) => source) }
      this.insertLocalFileCommand(
        input.idempotencyKey,
        input.fingerprint,
        result,
        input.at
      )
      return { status: 'applied' as const, ...result }
    })()
  }

  async getLocalFileSource(
    sourceId: string
  ): Promise<LocalFileSource | undefined> {
    return mapLocalFileOptional(
      this.database
        .prepare('SELECT * FROM local_file_sources WHERE source_id = ?')
        .get(sourceId) as LocalFileRow | undefined
    )
  }

  async listLocalFileSources(): Promise<LocalFileSource[]> {
    return (
      this.database
        .prepare(
          `SELECT local_file_sources.*
           FROM local_file_sources
           JOIN knowledge_sources
             ON knowledge_sources.id = local_file_sources.source_id
           WHERE knowledge_sources.status <> 'removed'
           ORDER BY local_file_sources.source_id`
        )
        .all() as LocalFileRow[]
    ).map(mapLocalFile)
  }

  async refreshLocalFile(
    input: RefreshLocalFileInput
  ): Promise<LocalFileRefreshResult> {
    return this.database.transaction(() => {
      const fingerprint = commandFingerprint({
        kind: 'local_file_refresh',
        sourceId: input.sourceId,
        expectedRevision: input.expectedRevision,
        localFile: input.localFile
      })
      const replay = this.replayLocalFileCommand<{
        source: KnowledgeSource
        contentChanged: boolean
      }>(
        input.idempotencyKey,
        fingerprint
      )
      if (replay) {
        return replay.status === 'idempotency_conflict'
          ? replay
          : { status: 'replayed' as const, ...replay.result }
      }

      const current = this.getSource(input.sourceId)
      const currentFile = this.getLocalFileSync(input.sourceId)
      if (!current || !currentFile) return { status: 'not_found' as const }
      if (current.revision !== input.expectedRevision) {
        return { status: 'revision_conflict' as const, current }
      }
      const contentChanged =
        currentFile.contentChecksum !== input.localFile.contentChecksum
      this.updateLocalFile(input.localFile)

      let source = current
      if (contentChanged && current.status === 'indexed') {
        const transitioned = transitionKnowledgeSource(current, {
          operation: 'mark_stale',
          at: input.at
        })
        source = { ...transitioned, revision: current.revision + 1 }
        this.database
          .prepare(
            `UPDATE knowledge_sources
             SET status = ?, sync_started_at = ?, indexed_at = ?,
               error_code = ?, error_message = ?, revision = ?, updated_at = ?
             WHERE id = ? AND revision = ?`
          )
          .run(
            source.status,
            source.syncStartedAt ?? null,
            source.indexedAt ?? null,
            source.errorCode ?? null,
            source.errorMessage ?? null,
            source.revision,
            source.updatedAt,
            source.id,
            current.revision
          )
        const commandKey = `${input.idempotencyKey}:stale`
        this.insertEvent({
          id: input.eventId,
          sourceId: source.id,
          operation: 'mark_stale',
          fromStatus: current.status,
          toStatus: source.status,
          triggerSource: 'ingestion',
          idempotencyKey: commandKey,
          sourceRevision: source.revision,
          occurredAt: input.at
        })
        this.insertCommand(
          commandKey,
          source.id,
          fingerprint,
          source.revision,
          input.at
        )
      }

      const result = { source, contentChanged }
      this.insertLocalFileCommand(
        input.idempotencyKey,
        fingerprint,
        result,
        input.at
      )
      return { status: 'applied' as const, ...result }
    })()
  }

  async register(
    input: Parameters<KnowledgeSourceRepository['register']>[0]
  ): Promise<KnowledgeSourceWriteResult> {
    return this.database.transaction(() => {
      const fingerprint = commandFingerprint({
        kind: 'register',
        source: input.source
      })
      const replay = this.replay(input.idempotencyKey, fingerprint)
      if (replay) return replay
      if (this.getSource(input.source.id)) {
        return { status: 'idempotency_conflict' as const }
      }

      this.database
        .prepare(
          `INSERT INTO knowledge_sources (
            id, workspace_id, name, type, locator, detail, sort_order, status,
            sync_started_at, indexed_at, error_code, error_message, revision,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(...sourceValues(input.source))
      this.insertEvent({
        id: input.eventId,
        sourceId: input.source.id,
        operation: 'register',
        toStatus: 'registered',
        triggerSource: input.triggerSource,
        idempotencyKey: input.idempotencyKey,
        sourceRevision: input.source.revision,
        occurredAt: input.source.createdAt
      })
      this.insertCommand(
        input.idempotencyKey,
        input.source.id,
        fingerprint,
        input.source.revision,
        input.source.createdAt
      )
      return { status: 'applied' as const, source: input.source }
    })()
  }

  async transition(
    input: KnowledgeSourceTransitionInput
  ): Promise<KnowledgeSourceWriteResult> {
    return this.database.transaction(() => {
      const fingerprint = commandFingerprint({
        kind: 'transition',
        sourceId: input.sourceId,
        expectedRevision: input.expectedRevision,
        operation: input.operation,
        at: input.at,
        errorCode: input.errorCode
      })
      const replay = this.replay(input.idempotencyKey, fingerprint)
      if (replay) return replay
      const current = this.getSource(input.sourceId)
      if (!current) return { status: 'not_found' as const }
      if (current.revision !== input.expectedRevision) {
        return { status: 'revision_conflict' as const, current }
      }

      const next = transitionKnowledgeSource(current, {
        operation: input.operation,
        at: input.at,
        ...(input.errorCode ? { errorCode: input.errorCode } : {})
      })
      const revision = current.revision + 1
      this.database
        .prepare(
          `UPDATE knowledge_sources
           SET status = ?, sync_started_at = ?, indexed_at = ?,
             error_code = ?, error_message = ?, revision = ?, updated_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(
          next.status,
          next.syncStartedAt ?? null,
          next.indexedAt ?? null,
          next.errorCode ?? null,
          next.errorMessage ?? null,
          revision,
          next.updatedAt,
          input.sourceId,
          input.expectedRevision
        )
      const source = { ...next, revision }
      this.insertEvent({
        id: input.eventId,
        sourceId: source.id,
        operation: input.operation,
        fromStatus: current.status,
        toStatus: source.status,
        triggerSource: input.triggerSource,
        idempotencyKey: input.idempotencyKey,
        sourceRevision: revision,
        ...(source.errorCode ? { errorCode: source.errorCode } : {}),
        ...(source.errorMessage ? { errorMessage: source.errorMessage } : {}),
        occurredAt: source.updatedAt
      })
      this.insertCommand(
        input.idempotencyKey,
        source.id,
        fingerprint,
        revision,
        source.updatedAt
      )
      return { status: 'applied' as const, source }
    })()
  }

  async recoverInterrupted(at: number): Promise<number> {
    const sources = (
      this.database
        .prepare(
          "SELECT * FROM knowledge_sources WHERE status = 'syncing' ORDER BY id"
        )
        .all() as SourceRow[]
    ).map(mapSource)
    for (const source of sources) {
      const key = `recovery:${source.id}:${source.revision}`
      await this.transition({
        sourceId: source.id,
        expectedRevision: source.revision,
        operation: 'interrupt',
        eventId: `event:${key}`,
        idempotencyKey: key,
        triggerSource: 'recovery',
        at
      })
    }
    return sources.length
  }

  private replay(
    idempotencyKey: string,
    fingerprint: string
  ): KnowledgeSourceWriteResult | undefined {
    const command = this.database
      .prepare(
        `SELECT source_id, command_fingerprint
         FROM knowledge_source_commands WHERE idempotency_key = ?`
      )
      .get(idempotencyKey) as CommandRow | undefined
    if (!command) return undefined
    if (command.command_fingerprint !== fingerprint) {
      return { status: 'idempotency_conflict' }
    }
    const source = this.getSource(command.source_id)
    if (!source) throw new Error(`Knowledge source not found: ${command.source_id}`)
    return { status: 'replayed', source }
  }

  private getSource(id: string): KnowledgeSource | undefined {
    return mapSourceOptional(
      this.database
        .prepare('SELECT * FROM knowledge_sources WHERE id = ?')
        .get(id) as SourceRow | undefined
    )
  }

  private insertEvent(event: KnowledgeSourceEvent): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_source_events (
          id, source_id, operation, from_status, to_status, trigger_source,
          idempotency_key, source_revision, error_code, error_message, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.sourceId,
        event.operation,
        event.fromStatus ?? null,
        event.toStatus,
        event.triggerSource,
        event.idempotencyKey,
        event.sourceRevision,
        event.errorCode ?? null,
        event.errorMessage ?? null,
        event.occurredAt
      )
  }

  private insertCommand(
    idempotencyKey: string,
    sourceId: string,
    fingerprint: string,
    revision: number,
    createdAt: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_source_commands (
          idempotency_key, source_id, command_fingerprint,
          resulting_revision, created_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(idempotencyKey, sourceId, fingerprint, revision, createdAt)
  }

  private insertLocalFile(localFile: LocalFileSource): void {
    this.database
      .prepare(
        `INSERT INTO local_file_sources (
          source_id, workspace_id, storage_mode, original_path,
          managed_relative_path, content_checksum, byte_size, modified_at,
          checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        localFile.sourceId,
        localFile.workspaceId,
        localFile.storageMode,
        localFile.originalPath,
        localFile.managedRelativePath ?? null,
        localFile.contentChecksum,
        localFile.byteSize,
        localFile.modifiedAt,
        localFile.checkedAt
      )
  }

  private updateLocalFile(localFile: LocalFileSource): void {
    this.database
      .prepare(
        `UPDATE local_file_sources
         SET content_checksum = ?, byte_size = ?, modified_at = ?, checked_at = ?
         WHERE source_id = ?`
      )
      .run(
        localFile.contentChecksum,
        localFile.byteSize,
        localFile.modifiedAt,
        localFile.checkedAt,
        localFile.sourceId
      )
  }

  private getLocalFileSync(sourceId: string): LocalFileSource | undefined {
    return mapLocalFileOptional(
      this.database
        .prepare('SELECT * FROM local_file_sources WHERE source_id = ?')
        .get(sourceId) as LocalFileRow | undefined
    )
  }

  private replayLocalFileCommand<T extends object>(
    idempotencyKey: string,
    fingerprint: string
  ):
    | { status: 'replayed'; result: T }
    | { status: 'idempotency_conflict' }
    | undefined {
    const command = this.database
      .prepare(
        `SELECT command_fingerprint, result_json
         FROM local_file_ingestion_commands WHERE idempotency_key = ?`
      )
      .get(idempotencyKey) as LocalFileCommandRow | undefined
    if (!command) return undefined
    if (command.command_fingerprint !== fingerprint) {
      return { status: 'idempotency_conflict' }
    }
    return {
      status: 'replayed',
      result: JSON.parse(command.result_json) as T
    }
  }

  private insertLocalFileCommand(
    idempotencyKey: string,
    fingerprint: string,
    result: object,
    createdAt: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO local_file_ingestion_commands (
          idempotency_key, command_fingerprint, result_json, created_at
        ) VALUES (?, ?, ?, ?)`
      )
      .run(idempotencyKey, fingerprint, JSON.stringify(result), createdAt)
  }
}

function sourceValues(source: KnowledgeSource): unknown[] {
  return [
    source.id,
    source.workspaceId,
    source.name,
    source.type,
    source.locator,
    source.detail,
    source.sortOrder,
    source.status,
    source.syncStartedAt ?? null,
    source.indexedAt ?? null,
    source.errorCode ?? null,
    source.errorMessage ?? null,
    source.revision,
    source.createdAt,
    source.updatedAt
  ]
}

function mapSourceOptional(
  row: SourceRow | undefined
): KnowledgeSource | undefined {
  return row ? mapSource(row) : undefined
}

function mapSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: row.type,
    locator: row.locator,
    detail: row.detail,
    sortOrder: row.sort_order,
    status: row.status,
    ...(row.sync_started_at === null
      ? {}
      : { syncStartedAt: row.sync_started_at }),
    ...(row.indexed_at === null ? {} : { indexedAt: row.indexed_at }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapEvent(row: EventRow): KnowledgeSourceEvent {
  return {
    id: row.id,
    sourceId: row.source_id,
    operation: row.operation,
    ...(row.from_status === null ? {} : { fromStatus: row.from_status }),
    toStatus: row.to_status,
    triggerSource: row.trigger_source,
    idempotencyKey: row.idempotency_key,
    sourceRevision: row.source_revision,
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    occurredAt: row.occurred_at
  }
}

function mapLocalFileOptional(
  row: LocalFileRow | undefined
): LocalFileSource | undefined {
  return row ? mapLocalFile(row) : undefined
}

function mapLocalFile(row: LocalFileRow): LocalFileSource {
  return {
    sourceId: row.source_id,
    workspaceId: row.workspace_id,
    storageMode: row.storage_mode,
    originalPath: row.original_path,
    ...(row.managed_relative_path === null
      ? {}
      : { managedRelativePath: row.managed_relative_path }),
    contentChecksum: row.content_checksum,
    byteSize: row.byte_size,
    modifiedAt: row.modified_at,
    checkedAt: row.checked_at
  }
}

function commandFingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
