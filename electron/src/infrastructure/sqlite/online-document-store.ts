import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  transitionKnowledgeSource,
  type KnowledgeSource,
  type KnowledgeSourceErrorCode,
  type KnowledgeSourceOperation
} from '../../../../domain/knowledge-source'
import type {
  OnlineDocumentSnapshot,
  OnlineDocumentSource
} from '../../../../domain/online-document'
import type {
  BeginOnlineDocumentCreateInput,
  BeginOnlineDocumentSyncInput,
  CompleteOnlineDocumentSyncInput,
  FailOnlineDocumentSyncInput,
  OnlineDocumentBeginResult,
  OnlineDocumentCompletionResult,
  OnlineDocumentStore,
  OnlineDocumentSyncResult
} from '../../application/knowledge/online-document-store'

type SourceRow = {
  id: string
  workspace_id: string
  name: string
  type: KnowledgeSource['type']
  locator: string
  detail: string
  sort_order: number
  status: KnowledgeSource['status']
  sync_started_at: number | null
  indexed_at: number | null
  error_code: KnowledgeSourceErrorCode | null
  error_message: string | null
  revision: number
  created_at: number
  updated_at: number
}

type DocumentRow = {
  source_id: string
  workspace_id: string
  connector_id: string
  path: string
  locator: string
  media_type: string | null
  etag: string | null
  last_modified: string | null
  last_fetched_at: number | null
  created_at: number
  updated_at: number
}

type SnapshotRow = {
  id: string
  source_id: string
  version: number
  content: string
  media_type: string
  content_checksum: string
  byte_size: number
  etag: string | null
  last_modified: string | null
  fetched_at: number
}

type CommandRow = {
  source_id: string
  command_fingerprint: string
  status: 'started' | 'succeeded' | 'failed'
  result_json: string | null
}

export class SqliteOnlineDocumentStore implements OnlineDocumentStore {
  constructor(private readonly database: Database.Database) {}

  async beginOnlineDocumentCreate(
    input: BeginOnlineDocumentCreateInput
  ): Promise<OnlineDocumentBeginResult> {
    return this.database.transaction(() => {
      const replay = this.replayBegin(input.idempotencyKey, input.fingerprint)
      if (replay) return replay
      if (
        input.source.id !== input.document.sourceId ||
        input.source.workspaceId !== input.document.workspaceId ||
        input.source.locator !== input.document.locator
      ) {
        throw new Error('Online document source identity does not match')
      }
      if (this.getSource(input.source.id)) {
        return { status: 'idempotency_conflict' as const }
      }

      this.insertSource(input.source)
      this.insertDocument(input.document)
      this.insertEvent({
        id: input.registerEventId,
        source: input.source,
        operation: 'register',
        idempotencyKey: `${input.idempotencyKey}:register`,
        at: input.at
      })
      this.insertKnowledgeCommand(
        `${input.idempotencyKey}:register`,
        input.source.id,
        { kind: 'online_document_register', source: input.source },
        input.source.revision,
        input.at
      )
      const source = this.applyTransition({
        current: input.source,
        operation: 'start_sync',
        eventId: input.startEventId,
        idempotencyKey: `${input.idempotencyKey}:start`,
        at: input.at
      })
      this.insertOnlineCommand(
        input.idempotencyKey,
        source.id,
        input.fingerprint,
        input.at
      )
      return {
        status: 'started' as const,
        source,
        document: input.document,
        nextVersion: 1
      }
    })()
  }

  async beginOnlineDocumentSync(
    input: BeginOnlineDocumentSyncInput
  ): Promise<OnlineDocumentBeginResult> {
    return this.database.transaction(() => {
      const replay = this.replayBegin(input.idempotencyKey, input.fingerprint)
      if (replay) return replay
      const current = this.getSource(input.sourceId)
      const document = this.getDocument(input.sourceId)
      if (!current || !document) return { status: 'not_found' as const }
      if (current.revision !== input.expectedRevision) {
        return { status: 'revision_conflict' as const, current }
      }
      const source = this.applyTransition({
        current,
        operation:
          current.status === 'failed' || current.status === 'stale'
            ? 'retry_sync'
            : 'start_sync',
        eventId: input.eventId,
        idempotencyKey: `${input.idempotencyKey}:start`,
        at: input.at
      })
      this.insertOnlineCommand(
        input.idempotencyKey,
        source.id,
        input.fingerprint,
        input.at
      )
      return {
        status: 'started' as const,
        source,
        document,
        nextVersion: this.nextVersion(source.id)
      }
    })()
  }

  async completeOnlineDocumentSync(
    input: CompleteOnlineDocumentSyncInput
  ): Promise<OnlineDocumentCompletionResult> {
    return this.database.transaction(() => {
      const command = this.getCommand(input.idempotencyKey)
      const replay = this.replayCompletion(command, input.sourceId)
      if (replay) return replay
      const current = this.getSource(input.sourceId)
      if (!current || !this.getDocument(input.sourceId)) {
        return { status: 'not_found' as const }
      }
      if (current.revision !== input.expectedRevision) {
        return { status: 'revision_conflict' as const, current }
      }
      if (
        input.snapshot.sourceId !== input.sourceId ||
        input.snapshot.version !== this.nextVersion(input.sourceId)
      ) {
        throw new Error('Online document snapshot identity does not match')
      }

      this.insertSnapshot(input.snapshot)
      this.updateDocumentFromSnapshot(input.snapshot, input.at)
      const source = this.applyTransition({
        current,
        operation: 'complete_index',
        eventId: input.eventId,
        idempotencyKey: `${input.idempotencyKey}:complete`,
        at: input.at
      })
      const result = { source, snapshot: input.snapshot }
      this.finishCommand(input.idempotencyKey, 'succeeded', result, input.at)
      return { status: 'applied' as const, result }
    })()
  }

  async failOnlineDocumentSync(
    input: FailOnlineDocumentSyncInput
  ): Promise<OnlineDocumentCompletionResult> {
    return this.database.transaction(() => {
      const command = this.getCommand(input.idempotencyKey)
      const replay = this.replayCompletion(command, input.sourceId)
      if (replay) return replay
      const current = this.getSource(input.sourceId)
      if (!current || !this.getDocument(input.sourceId)) {
        return { status: 'not_found' as const }
      }
      if (current.revision !== input.expectedRevision) {
        return { status: 'revision_conflict' as const, current }
      }
      const source = this.applyTransition({
        current,
        operation: 'fail_sync',
        eventId: input.eventId,
        idempotencyKey: `${input.idempotencyKey}:failed`,
        errorCode: input.errorCode,
        at: input.at
      })
      const result = { source }
      this.finishCommand(input.idempotencyKey, 'failed', result, input.at)
      return { status: 'applied' as const, result }
    })()
  }

  async getOnlineDocumentSource(
    sourceId: string
  ): Promise<OnlineDocumentSource | undefined> {
    return this.getDocument(sourceId)
  }

  async getCurrentOnlineDocumentSnapshot(
    sourceId: string
  ): Promise<OnlineDocumentSnapshot | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM online_document_snapshots
         WHERE source_id = ? ORDER BY version DESC LIMIT 1`
      )
      .get(sourceId) as SnapshotRow | undefined
    return row ? mapSnapshot(row) : undefined
  }

  private replayBegin(
    idempotencyKey: string,
    fingerprint: string
  ): OnlineDocumentBeginResult | undefined {
    const command = this.getCommand(idempotencyKey)
    if (!command) return undefined
    if (command.command_fingerprint !== fingerprint) {
      return { status: 'idempotency_conflict' }
    }
    if (command.status !== 'started') {
      return {
        status: 'replayed',
        result: parseCommandResult(command)
      }
    }
    const source = this.getSource(command.source_id)
    const document = this.getDocument(command.source_id)
    if (!source || !document) {
      throw new Error(`Online document not found: ${command.source_id}`)
    }
    return {
      status: 'started',
      source,
      document,
      nextVersion: this.nextVersion(source.id)
    }
  }

  private replayCompletion(
    command: CommandRow | undefined,
    sourceId: string
  ): OnlineDocumentCompletionResult | undefined {
    if (!command) return { status: 'not_found' }
    if (command.source_id !== sourceId) {
      return { status: 'idempotency_conflict' }
    }
    return command.status === 'started'
      ? undefined
      : { status: 'replayed', result: parseCommandResult(command) }
  }

  private applyTransition(input: {
    current: KnowledgeSource
    operation: KnowledgeSourceOperation
    eventId: string
    idempotencyKey: string
    at: number
    errorCode?: KnowledgeSourceErrorCode
  }): KnowledgeSource {
    const transitioned = transitionKnowledgeSource(input.current, {
      operation: input.operation,
      at: input.at,
      ...(input.errorCode ? { errorCode: input.errorCode } : {})
    })
    const source = {
      ...transitioned,
      revision: input.current.revision + 1
    }
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
        input.current.revision
      )
    this.insertEvent({
      id: input.eventId,
      source,
      operation: input.operation,
      fromStatus: input.current.status,
      idempotencyKey: input.idempotencyKey,
      at: input.at
    })
    this.insertKnowledgeCommand(
      input.idempotencyKey,
      source.id,
      {
        kind: 'online_document_transition',
        sourceId: source.id,
        operation: input.operation,
        expectedRevision: input.current.revision,
        errorCode: input.errorCode
      },
      source.revision,
      input.at
    )
    return source
  }

  private insertSource(source: KnowledgeSource): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_sources (
          id, workspace_id, name, type, locator, detail, sort_order, status,
          sync_started_at, indexed_at, error_code, error_message, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
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
      )
  }

  private insertDocument(document: OnlineDocumentSource): void {
    this.database
      .prepare(
        `INSERT INTO online_document_sources (
          source_id, workspace_id, connector_id, path, locator, media_type,
          etag, last_modified, last_fetched_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        document.sourceId,
        document.workspaceId,
        document.connectorId,
        document.path,
        document.locator,
        document.mediaType ?? null,
        document.etag ?? null,
        document.lastModified ?? null,
        document.lastFetchedAt ?? null,
        document.createdAt,
        document.updatedAt
      )
  }

  private insertSnapshot(snapshot: OnlineDocumentSnapshot): void {
    this.database
      .prepare(
        `INSERT INTO online_document_snapshots (
          id, source_id, version, content, media_type, content_checksum,
          byte_size, etag, last_modified, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snapshot.id,
        snapshot.sourceId,
        snapshot.version,
        snapshot.content,
        snapshot.mediaType,
        snapshot.contentChecksum,
        snapshot.byteSize,
        snapshot.etag ?? null,
        snapshot.lastModified ?? null,
        snapshot.fetchedAt
      )
  }

  private updateDocumentFromSnapshot(
    snapshot: OnlineDocumentSnapshot,
    at: number
  ): void {
    this.database
      .prepare(
        `UPDATE online_document_sources
         SET media_type = ?, etag = ?, last_modified = ?,
           last_fetched_at = ?, updated_at = ?
         WHERE source_id = ?`
      )
      .run(
        snapshot.mediaType,
        snapshot.etag ?? null,
        snapshot.lastModified ?? null,
        snapshot.fetchedAt,
        at,
        snapshot.sourceId
      )
  }

  private insertEvent(input: {
    id: string
    source: KnowledgeSource
    operation: 'register' | KnowledgeSourceOperation
    fromStatus?: KnowledgeSource['status']
    idempotencyKey: string
    at: number
  }): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_source_events (
          id, source_id, operation, from_status, to_status, trigger_source,
          idempotency_key, source_revision, error_code, error_message, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.source.id,
        input.operation,
        input.fromStatus ?? null,
        input.source.status,
        'ingestion',
        input.idempotencyKey,
        input.source.revision,
        input.source.errorCode ?? null,
        input.source.errorMessage ?? null,
        input.at
      )
  }

  private insertKnowledgeCommand(
    idempotencyKey: string,
    sourceId: string,
    value: object,
    revision: number,
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_source_commands (
          idempotency_key, source_id, command_fingerprint,
          resulting_revision, created_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        idempotencyKey,
        sourceId,
        hashCommand(value),
        revision,
        at
      )
  }

  private insertOnlineCommand(
    idempotencyKey: string,
    sourceId: string,
    fingerprint: string,
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO online_document_commands (
          idempotency_key, source_id, command_fingerprint, status,
          result_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'started', NULL, ?, ?)`
      )
      .run(idempotencyKey, sourceId, fingerprint, at, at)
  }

  private finishCommand(
    idempotencyKey: string,
    status: 'succeeded' | 'failed',
    result: OnlineDocumentSyncResult,
    at: number
  ): void {
    const write = this.database
      .prepare(
        `UPDATE online_document_commands
         SET status = ?, result_json = ?, updated_at = ?
         WHERE idempotency_key = ? AND status = 'started'`
      )
      .run(status, JSON.stringify(result), at, idempotencyKey)
    if (write.changes !== 1) {
      throw new Error(`Online document command is not active: ${idempotencyKey}`)
    }
  }

  private getSource(sourceId: string): KnowledgeSource | undefined {
    const row = this.database
      .prepare('SELECT * FROM knowledge_sources WHERE id = ?')
      .get(sourceId) as SourceRow | undefined
    return row ? mapSource(row) : undefined
  }

  private getDocument(sourceId: string): OnlineDocumentSource | undefined {
    const row = this.database
      .prepare('SELECT * FROM online_document_sources WHERE source_id = ?')
      .get(sourceId) as DocumentRow | undefined
    return row ? mapDocument(row) : undefined
  }

  private getCommand(idempotencyKey: string): CommandRow | undefined {
    return this.database
      .prepare(
        `SELECT source_id, command_fingerprint, status, result_json
         FROM online_document_commands WHERE idempotency_key = ?`
      )
      .get(idempotencyKey) as CommandRow | undefined
  }

  private nextVersion(sourceId: string): number {
    const current = this.database
      .prepare(
        `SELECT COALESCE(MAX(version), 0)
         FROM online_document_snapshots WHERE source_id = ?`
      )
      .pluck()
      .get(sourceId) as number
    return current + 1
  }
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

function mapDocument(row: DocumentRow): OnlineDocumentSource {
  return {
    sourceId: row.source_id,
    workspaceId: row.workspace_id,
    connectorId: row.connector_id,
    path: row.path,
    locator: row.locator,
    ...(row.media_type === null ? {} : { mediaType: row.media_type }),
    ...(row.etag === null ? {} : { etag: row.etag }),
    ...(row.last_modified === null ? {} : { lastModified: row.last_modified }),
    ...(row.last_fetched_at === null
      ? {}
      : { lastFetchedAt: row.last_fetched_at }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapSnapshot(row: SnapshotRow): OnlineDocumentSnapshot {
  return {
    id: row.id,
    sourceId: row.source_id,
    version: row.version,
    content: row.content,
    mediaType: row.media_type,
    contentChecksum: row.content_checksum,
    byteSize: row.byte_size,
    ...(row.etag === null ? {} : { etag: row.etag }),
    ...(row.last_modified === null ? {} : { lastModified: row.last_modified }),
    fetchedAt: row.fetched_at
  }
}

function parseCommandResult(command: CommandRow): OnlineDocumentSyncResult {
  if (!command.result_json) {
    throw new Error(`Online document command has no result: ${command.source_id}`)
  }
  return JSON.parse(command.result_json) as OnlineDocumentSyncResult
}

function hashCommand(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
