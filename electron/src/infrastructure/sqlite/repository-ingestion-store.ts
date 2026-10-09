import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  transitionKnowledgeSource,
  type KnowledgeSource,
  type KnowledgeSourceErrorCode,
  type KnowledgeSourceOperation
} from '../../../../domain/knowledge-source'
import type {
  RepositorySnapshot,
  RepositorySnapshotFile,
  RepositorySource,
  RepositorySourceMode
} from '../../../../domain/repository-source'
import type {
  BeginRepositoryCreateInput,
  BeginRepositorySyncInput,
  CompleteRepositorySyncInput,
  FailRepositorySyncInput,
  RepositoryBeginResult,
  RepositoryCompletionResult,
  RepositoryIngestionStore,
  RepositorySyncResult
} from '../../application/knowledge/repository-ingestion-store'

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

type RepositoryRow = {
  source_id: string
  workspace_id: string
  mode: RepositorySourceMode
  local_path: string | null
  connector_id: string | null
  path: string | null
  managed_relative_path: string | null
  locator: string
  selected_branch: string | null
  current_version: number
  revision_label: string | null
  file_count: number
  total_bytes: number
  last_scanned_at: number | null
  created_at: number
  updated_at: number
}

type SnapshotRow = {
  id: string
  source_id: string
  version: number
  branch: string | null
  revision_label: string
  manifest_checksum: string
  file_count: number
  total_bytes: number
  scanned_at: number
}

type FileRow = {
  relative_path: string
  content: string
  content_checksum: string
  byte_size: number
}

type CommandRow = {
  source_id: string
  command_fingerprint: string
  status: 'started' | 'succeeded' | 'failed'
  result_json: string | null
}

type PersistedCommandResult = {
  source: KnowledgeSource
  snapshotId?: string
}

export class SqliteRepositoryIngestionStore
  implements RepositoryIngestionStore
{
  constructor(private readonly database: Database.Database) {}

  async beginRepositoryCreate(
    input: BeginRepositoryCreateInput
  ): Promise<RepositoryBeginResult> {
    return this.database.transaction(() => {
      const replay = this.replayBegin(input.idempotencyKey, input.fingerprint)
      if (replay) return replay
      if (
        input.source.id !== input.repository.sourceId ||
        input.source.workspaceId !== input.repository.workspaceId ||
        input.source.locator !== input.repository.locator ||
        input.source.type !== 'repository'
      ) {
        throw new Error('Repository source identity does not match')
      }
      if (this.getSource(input.source.id)) {
        return { status: 'idempotency_conflict' as const }
      }
      if (this.hasActiveRepositoryIdentity(input.repository)) {
        throw new Error('Repository already exists in workspace')
      }

      this.insertSource(input.source)
      this.insertRepository(input.repository)
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
        { kind: 'repository_register', source: input.source },
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
      this.insertRepositoryCommand(
        input.idempotencyKey,
        source.id,
        input.fingerprint,
        input.at
      )
      return {
        status: 'started' as const,
        source,
        repository: input.repository,
        nextVersion: 1
      }
    })()
  }

  async beginRepositorySync(
    input: BeginRepositorySyncInput
  ): Promise<RepositoryBeginResult> {
    return this.database.transaction(() => {
      const replay = this.replayBegin(input.idempotencyKey, input.fingerprint)
      if (replay) return replay
      const current = this.getSource(input.sourceId)
      const repository = this.getRepository(input.sourceId)
      if (!current || !repository) return { status: 'not_found' as const }
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
      this.insertRepositoryCommand(
        input.idempotencyKey,
        source.id,
        input.fingerprint,
        input.at
      )
      return {
        status: 'started' as const,
        source,
        repository,
        nextVersion: repository.currentVersion + 1
      }
    })()
  }

  async completeRepositorySync(
    input: CompleteRepositorySyncInput
  ): Promise<RepositoryCompletionResult> {
    return this.database.transaction(() => {
      const command = this.getCommand(input.idempotencyKey)
      const replay = this.replayCompletion(command, input.sourceId)
      if (replay) return replay
      const current = this.getSource(input.sourceId)
      const repository = this.getRepository(input.sourceId)
      if (!current || !repository) return { status: 'not_found' as const }
      if (current.revision !== input.expectedRevision) {
        return { status: 'revision_conflict' as const, current }
      }
      if (
        input.snapshot.sourceId !== input.sourceId ||
        input.snapshot.version !== repository.currentVersion + 1
      ) {
        throw new Error('Repository snapshot identity does not match')
      }

      this.insertSnapshot(input.snapshot)
      this.updateRepositoryFromSnapshot(input.snapshot, input.at)
      const source = this.applyTransition({
        current,
        operation: 'complete_index',
        eventId: input.eventId,
        idempotencyKey: `${input.idempotencyKey}:complete`,
        at: input.at
      })
      const result = { source, snapshot: input.snapshot }
      this.finishCommand(
        input.idempotencyKey,
        'succeeded',
        { source, snapshotId: input.snapshot.id },
        input.at
      )
      return { status: 'applied' as const, result }
    })()
  }

  async failRepositorySync(
    input: FailRepositorySyncInput
  ): Promise<RepositoryCompletionResult> {
    return this.database.transaction(() => {
      const command = this.getCommand(input.idempotencyKey)
      const replay = this.replayCompletion(command, input.sourceId)
      if (replay) return replay
      const current = this.getSource(input.sourceId)
      if (!current || !this.getRepository(input.sourceId)) {
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
      this.finishCommand(
        input.idempotencyKey,
        'failed',
        { source },
        input.at
      )
      return { status: 'applied' as const, result }
    })()
  }

  async getRepositorySource(
    sourceId: string
  ): Promise<RepositorySource | undefined> {
    return this.getRepository(sourceId)
  }

  async listRepositorySources(): Promise<RepositorySource[]> {
    return (
      this.database
        .prepare(
          `SELECT repository_sources.*
           FROM repository_sources
           JOIN knowledge_sources
             ON knowledge_sources.id = repository_sources.source_id
           WHERE knowledge_sources.status <> 'removed'
           ORDER BY repository_sources.source_id`
        )
        .all() as RepositoryRow[]
    ).map(mapRepository)
  }

  async getCurrentRepositorySnapshot(
    sourceId: string
  ): Promise<RepositorySnapshot | undefined> {
    const repository = this.getRepository(sourceId)
    if (!repository || repository.currentVersion === 0) return undefined
    const row = this.database
      .prepare(
        `SELECT * FROM repository_snapshots
         WHERE source_id = ? AND version = ?`
      )
      .get(sourceId, repository.currentVersion) as SnapshotRow | undefined
    return row ? this.mapSnapshot(row) : undefined
  }

  private replayBegin(
    idempotencyKey: string,
    fingerprint: string
  ): RepositoryBeginResult | undefined {
    const command = this.getCommand(idempotencyKey)
    if (!command) return undefined
    if (command.command_fingerprint !== fingerprint) {
      return { status: 'idempotency_conflict' }
    }
    if (command.status !== 'started') {
      return { status: 'replayed', result: this.parseCommandResult(command) }
    }
    const source = this.getSource(command.source_id)
    const repository = this.getRepository(command.source_id)
    if (!source || !repository) {
      throw new Error(`Repository source not found: ${command.source_id}`)
    }
    return {
      status: 'started',
      source,
      repository,
      nextVersion: repository.currentVersion + 1
    }
  }

  private replayCompletion(
    command: CommandRow | undefined,
    sourceId: string
  ): RepositoryCompletionResult | undefined {
    if (!command) return { status: 'not_found' }
    if (command.source_id !== sourceId) {
      return { status: 'idempotency_conflict' }
    }
    return command.status === 'started'
      ? undefined
      : { status: 'replayed', result: this.parseCommandResult(command) }
  }

  private parseCommandResult(command: CommandRow): RepositorySyncResult {
    if (!command.result_json) {
      throw new Error(`Repository command has no result: ${command.source_id}`)
    }
    const persisted = JSON.parse(command.result_json) as PersistedCommandResult
    if (!persisted.snapshotId) return { source: persisted.source }
    const snapshot = this.getSnapshot(persisted.snapshotId)
    if (!snapshot) {
      throw new Error(`Repository snapshot not found: ${persisted.snapshotId}`)
    }
    return { source: persisted.source, snapshot }
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
    const write = this.database
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
    if (write.changes !== 1) {
      throw new Error('Repository source revision conflict')
    }
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
        kind: 'repository_transition',
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

  private hasActiveRepositoryIdentity(repository: RepositorySource): boolean {
    const identity =
      repository.mode === 'local'
        ? {
            clause: 'repository.local_path = ?',
            values: [repository.workspaceId, repository.localPath]
          }
        : {
            clause: 'repository.connector_id = ? AND repository.path = ?',
            values: [
              repository.workspaceId,
              repository.connectorId,
              repository.path
            ]
          }
    return Boolean(
      this.database
        .prepare(
          `SELECT 1
           FROM repository_sources AS repository
           INNER JOIN knowledge_sources AS source
             ON source.id = repository.source_id
           WHERE repository.workspace_id = ?
             AND ${identity.clause}
             AND source.status <> 'removed'
           LIMIT 1`
        )
        .get(...identity.values)
    )
  }

  private insertRepository(repository: RepositorySource): void {
    this.database
      .prepare(
        `INSERT INTO repository_sources (
          source_id, workspace_id, mode, local_path, connector_id, path,
          managed_relative_path, locator, selected_branch, current_version, revision_label,
          file_count, total_bytes, last_scanned_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        repository.sourceId,
        repository.workspaceId,
        repository.mode,
        repository.mode === 'local' ? repository.localPath : null,
        repository.mode === 'remote' ? repository.connectorId : null,
        repository.mode === 'remote' ? repository.path : null,
        repository.mode === 'remote' ? repository.managedRelativePath : null,
        repository.locator,
        repository.selectedBranch ?? null,
        repository.currentVersion,
        repository.revisionLabel ?? null,
        repository.fileCount,
        repository.totalBytes,
        repository.lastScannedAt ?? null,
        repository.createdAt,
        repository.updatedAt
      )
  }

  private insertSnapshot(snapshot: RepositorySnapshot): void {
    this.database
      .prepare(
        `INSERT INTO repository_snapshots (
          id, source_id, version, branch, revision_label, manifest_checksum,
          file_count, total_bytes, scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snapshot.id,
        snapshot.sourceId,
        snapshot.version,
        snapshot.branch ?? null,
        snapshot.revisionLabel,
        snapshot.manifestChecksum,
        snapshot.fileCount,
        snapshot.totalBytes,
        snapshot.scannedAt
      )
    const insertFile = this.database.prepare(
      `INSERT INTO repository_snapshot_files (
        snapshot_id, source_id, version, relative_path, content,
        content_checksum, byte_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (const file of snapshot.files) {
      insertFile.run(
        snapshot.id,
        snapshot.sourceId,
        snapshot.version,
        file.relativePath,
        file.content,
        file.contentChecksum,
        file.byteSize
      )
    }
  }

  private updateRepositoryFromSnapshot(
    snapshot: RepositorySnapshot,
    at: number
  ): void {
    const write = this.database
      .prepare(
        `UPDATE repository_sources
         SET selected_branch = COALESCE(?, selected_branch),
           current_version = ?, revision_label = ?, file_count = ?,
           total_bytes = ?, last_scanned_at = ?, updated_at = ?
         WHERE source_id = ?`
      )
      .run(
        snapshot.branch ?? null,
        snapshot.version,
        snapshot.revisionLabel,
        snapshot.fileCount,
        snapshot.totalBytes,
        snapshot.scannedAt,
        at,
        snapshot.sourceId
      )
    if (write.changes !== 1) {
      throw new Error(`Repository source not found: ${snapshot.sourceId}`)
    }
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
      .run(idempotencyKey, sourceId, hashCommand(value), revision, at)
  }

  private insertRepositoryCommand(
    idempotencyKey: string,
    sourceId: string,
    fingerprint: string,
    at: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO repository_commands (
          idempotency_key, source_id, command_fingerprint, status,
          result_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'started', NULL, ?, ?)`
      )
      .run(idempotencyKey, sourceId, fingerprint, at, at)
  }

  private finishCommand(
    idempotencyKey: string,
    status: 'succeeded' | 'failed',
    result: PersistedCommandResult,
    at: number
  ): void {
    const write = this.database
      .prepare(
        `UPDATE repository_commands
         SET status = ?, result_json = ?, updated_at = ?
         WHERE idempotency_key = ? AND status = 'started'`
      )
      .run(status, JSON.stringify(result), at, idempotencyKey)
    if (write.changes !== 1) {
      throw new Error(`Repository command is not active: ${idempotencyKey}`)
    }
  }

  private getSource(sourceId: string): KnowledgeSource | undefined {
    const row = this.database
      .prepare('SELECT * FROM knowledge_sources WHERE id = ?')
      .get(sourceId) as SourceRow | undefined
    return row ? mapSource(row) : undefined
  }

  private getRepository(sourceId: string): RepositorySource | undefined {
    const row = this.database
      .prepare('SELECT * FROM repository_sources WHERE source_id = ?')
      .get(sourceId) as RepositoryRow | undefined
    return row ? mapRepository(row) : undefined
  }

  private getSnapshot(snapshotId: string): RepositorySnapshot | undefined {
    const row = this.database
      .prepare('SELECT * FROM repository_snapshots WHERE id = ?')
      .get(snapshotId) as SnapshotRow | undefined
    return row ? this.mapSnapshot(row) : undefined
  }

  private mapSnapshot(row: SnapshotRow): RepositorySnapshot {
    const files = (
      this.database
        .prepare(
          `SELECT relative_path, content, content_checksum, byte_size
           FROM repository_snapshot_files
           WHERE snapshot_id = ? ORDER BY relative_path`
        )
        .all(row.id) as FileRow[]
    ).map(mapSnapshotFile)
    return {
      id: row.id,
      sourceId: row.source_id,
      version: row.version,
      ...(row.branch === null ? {} : { branch: row.branch }),
      revisionLabel: row.revision_label,
      manifestChecksum: row.manifest_checksum,
      fileCount: row.file_count,
      totalBytes: row.total_bytes,
      files,
      scannedAt: row.scanned_at
    }
  }

  private getCommand(idempotencyKey: string): CommandRow | undefined {
    return this.database
      .prepare(
        `SELECT source_id, command_fingerprint, status, result_json
         FROM repository_commands WHERE idempotency_key = ?`
      )
      .get(idempotencyKey) as CommandRow | undefined
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

function mapRepository(row: RepositoryRow): RepositorySource {
  const common = {
    sourceId: row.source_id,
    workspaceId: row.workspace_id,
    locator: row.locator,
    ...(row.selected_branch === null
      ? {}
      : { selectedBranch: row.selected_branch }),
    currentVersion: row.current_version,
    ...(row.revision_label === null
      ? {}
      : { revisionLabel: row.revision_label }),
    fileCount: row.file_count,
    totalBytes: row.total_bytes,
    ...(row.last_scanned_at === null
      ? {}
      : { lastScannedAt: row.last_scanned_at }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
  if (row.mode === 'local') {
    if (!row.local_path) throw new Error('Local repository path is missing')
    return { ...common, mode: 'local', localPath: row.local_path }
  }
  if (!row.connector_id || !row.path || !row.managed_relative_path) {
    throw new Error('Remote repository configuration is missing')
  }
  return {
    ...common,
    mode: 'remote',
    connectorId: row.connector_id,
    path: row.path,
    managedRelativePath: row.managed_relative_path
  }
}

function mapSnapshotFile(row: FileRow): RepositorySnapshotFile {
  return {
    relativePath: row.relative_path,
    content: row.content,
    contentChecksum: row.content_checksum,
    byteSize: row.byte_size
  }
}

function hashCommand(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
