import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from 'node:fs/promises'
import { renameSync } from 'node:fs'
import { dirname, extname } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  KnowledgeArtifact,
  KnowledgeSyncDependencies
} from '../../application/knowledge/sync-requirement-artifacts'
import type {
  ArtifactRepository,
  FormalArtifactCommitResult
} from '../application/ports'
import { SecurePathService } from '../../workspace/secure-path-service'

const MAX_ARTIFACT_SIZE = 2 * 1024 * 1024

type FileOperations = {
  renameSync: typeof renameSync
}

type KnowledgeArtifactSource = KnowledgeSyncDependencies['artifacts']

export class SqliteArtifactRepository
  implements ArtifactRepository, KnowledgeArtifactSource
{
  private readonly fileOperations: FileOperations

  constructor(
    private readonly database: Database.Database,
    fileOperations: Partial<FileOperations> = {},
    private readonly securePaths = new SecurePathService()
  ) {
    this.fileOperations = {
      renameSync: fileOperations.renameSync ?? renameSync
    }
  }

  async commit(
    input: Parameters<ArtifactRepository['commit']>[0] & {
      nodeRunId?: string
    }
  ): Promise<FormalArtifactCommitResult> {
    if (input.nodeId && !input.nodeRunId) {
      throw new Error('Node run is required for a node artifact')
    }
    this.assertArtifact(input.artifact.path, input.artifact.content)
    if (input.artifact.path !== input.expectedArtifact.relativePath) {
      throw new Error(
        'Candidate artifact path does not match node configuration'
      )
    }
    if (artifactKind(input.artifact.path) !== input.expectedArtifact.kind) {
      throw new Error(
        'Candidate artifact kind does not match node configuration'
      )
    }
    if (
      input.completionEvent.runId !== input.runId ||
      input.completionEvent.type !== 'run.completed'
    ) {
      throw new Error('Artifact completion event is invalid')
    }
    const completionTimestamp = Date.parse(input.completionEvent.timestamp)
    if (!Number.isFinite(completionTimestamp)) {
      throw new Error('Artifact completion timestamp is invalid')
    }
    const nodeId =
      input.nodeId ?? `${input.requirementId}:${input.stageId}`

    const requirement = this.database
      .prepare(
        `SELECT workspace_root_path FROM requirements
         WHERE id = ?`
      )
      .get(input.requirementId) as
      | { workspace_root_path: string | null }
      | undefined
    if (!requirement) throw new Error('Requirement was not found')
    if (!requirement.workspace_root_path) {
      throw new Error('Requirement workspace is not bound')
    }
    const run = this.database
      .prepare(
        `SELECT status, requirement_id, stage_id, node_id, last_sequence,
          artifact_id
         FROM ai_runs WHERE id = ?`
      )
      .get(input.runId) as
      | {
          status: string
          requirement_id: string
          stage_id: string
          node_id: string | null
          last_sequence: number
          artifact_id: string | null
        }
      | undefined
    if (!run) throw new Error('AI run was not found')
    if (
      run.requirement_id !== input.requirementId ||
      run.stage_id !== input.stageId ||
      (input.nodeId
        ? run.node_id !== input.nodeId
        : run.node_id !== null && run.node_id !== nodeId)
    ) {
      throw new Error('AI run does not match the artifact target')
    }
    if (run.status === 'completed') {
      return this.readIdempotentResult(input, run)
    }
    if (!['created', 'running'].includes(run.status)) {
      throw new Error(`AI run cannot complete from status ${run.status}`)
    }
    this.assertCurrentNodeRun(input)
    if (input.completionEvent.sequence !== run.last_sequence + 1) {
      throw new Error('AI run completion sequence conflicted')
    }

    const rootPath = await this.securePaths
      .canonicalizeDirectory(requirement.workspace_root_path)
      .catch(
        async (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          await mkdir(requirement.workspace_root_path!, { recursive: true })
          return this.securePaths.canonicalizeDirectory(
            requirement.workspace_root_path!
          )
        }
      )
    const targetPath = (
      await this.securePaths.resolvePathForCreation(
        rootPath,
        input.artifact.path
      )
    ).targetPath
    await mkdir(dirname(targetPath), { recursive: true })

    const nonce = randomUUID()
    const temporaryPath = `${targetPath}.realmflow-${nonce}.tmp`
    const backupPath = `${targetPath}.realmflow-${nonce}.backup`
    let hasPreviousFile = false
    try {
      await readFile(targetPath)
      hasPreviousFile = true
      await copyFile(targetPath, backupPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await writeFile(temporaryPath, input.artifact.content, 'utf8')

    let renamed = false
    let result: FormalArtifactCommitResult | undefined
    try {
      this.database.transaction(() => {
        const currentRun = this.database
          .prepare(
            `SELECT status, requirement_id, stage_id, node_id, last_sequence
             FROM ai_runs WHERE id = ?`
          )
          .get(input.runId) as
          | {
              status: string
              requirement_id: string
              stage_id: string
              node_id: string | null
              last_sequence: number
            }
          | undefined
        if (!currentRun) throw new Error('AI run was not found')
        if (
          currentRun.requirement_id !== input.requirementId ||
          currentRun.stage_id !== input.stageId ||
          (input.nodeId
            ? currentRun.node_id !== input.nodeId
            : currentRun.node_id !== null &&
              currentRun.node_id !== nodeId)
        ) {
          throw new Error('AI run does not match the artifact target')
        }
        if (!['created', 'running'].includes(currentRun.status)) {
          throw new Error(
            `AI run cannot complete from status ${currentRun.status}`
          )
        }
        this.assertCurrentNodeRun(input)
        if (
          input.completionEvent.sequence !==
          currentRun.last_sequence + 1
        ) {
          throw new Error('AI run completion sequence conflicted')
        }

        const nextVersion =
          ((this.database
            .prepare(
              `SELECT MAX(version) FROM artifacts
               WHERE requirement_id = ? AND node_id = ?`
            )
            .pluck()
            .get(input.requirementId, nodeId) as number | null) ?? 0) + 1
        const timestamp = completionTimestamp
        const checksum = `sha256:${createHash('sha256')
          .update(input.artifact.content)
          .digest('hex')}`
        const artifactId = randomUUID()
        const kind = artifactKind(input.artifact.path)
        const byteSize = Buffer.byteLength(input.artifact.content, 'utf8')

        this.database
          .prepare(
            `UPDATE artifacts SET
              is_primary = 0,
              revision = revision + 1,
              updated_at = ?
             WHERE requirement_id = ? AND node_id = ?
               AND is_primary = 1 AND is_valid = 1`
          )
          .run(timestamp, input.requirementId, nodeId)
        this.database
          .prepare(
            `INSERT INTO artifacts (
              id, requirement_id, stage_id, node_id, node_run_id, relative_path,
              kind, checksum, version, byte_size, is_primary, is_valid, revision,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`
          )
          .run(
            artifactId,
            input.requirementId,
            input.stageId,
            nodeId,
            input.nodeRunId ?? null,
            input.artifact.path,
            kind,
            checksum,
            nextVersion,
            byteSize,
            timestamp,
            timestamp
          )
        const legacyStageId = input.nodeId
          ? input.legacyStageId
          : input.stageId
        if (legacyStageId) {
          const requirementUpdate = this.database
            .prepare(
              `UPDATE requirements SET
                stage = ?,
                revision = revision + 1,
                updated_at = ?
               WHERE id = ?`
            )
            .run(legacyStageId, timestamp, input.requirementId)
          if (requirementUpdate.changes !== 1) {
            throw new Error('Requirement was not found')
          }
        }
        this.database
          .prepare(
            `INSERT INTO ai_run_events (
              id, run_id, sequence, type, timestamp, data_json
            ) VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            input.completionEvent.id,
            input.runId,
            input.completionEvent.sequence,
            input.completionEvent.type,
            timestamp,
            JSON.stringify(input.completionEvent.data)
          )
        const runUpdate = this.database
          .prepare(
            `UPDATE ai_runs SET
              status = 'completed',
              last_sequence = ?,
              artifact_id = ?,
              revision = revision + 1,
              updated_at = ?,
              completed_at = ?
             WHERE id = ? AND status IN ('created', 'running')`
          )
          .run(
            input.completionEvent.sequence,
            artifactId,
            timestamp,
            timestamp,
            input.runId
          )
        if (runUpdate.changes !== 1) {
          throw new Error('AI run completion conflicted')
        }

        this.fileOperations.renameSync(temporaryPath, targetPath)
        renamed = true
        result = {
          artifactId,
          requirementId: input.requirementId,
          nodeId,
          relativePath: input.artifact.path,
          kind,
          checksum,
          version: nextVersion,
          byteSize,
          committedAt: timestamp,
          idempotent: false
        }
      })()
    } catch (error) {
      if (renamed) {
        if (hasPreviousFile) {
          await rename(backupPath, targetPath)
        } else {
          await unlink(targetPath).catch(() => undefined)
        }
      }
      await unlink(temporaryPath).catch(() => undefined)
      if (hasPreviousFile) await unlink(backupPath).catch(() => undefined)
      throw error
    }
    if (hasPreviousFile) await unlink(backupPath).catch(() => undefined)
    if (!result) throw new Error('Formal artifact commit produced no result')
    return result
  }

  async listByRequirement(
    requirementId: string
  ): Promise<KnowledgeArtifact[]> {
    const rows = this.database
      .prepare(
        `SELECT
          id, requirement_id, node_id, relative_path, checksum, version
         FROM artifacts
         WHERE requirement_id = ? AND is_primary = 1 AND is_valid = 1
         ORDER BY node_id, relative_path, id`
      )
      .all(requirementId) as Array<{
      id: string
      requirement_id: string
      node_id: string
      relative_path: string
      checksum: string
      version: number
    }>
    return rows.map((row) => ({
      id: row.id,
      requirementId: row.requirement_id,
      nodeId: row.node_id,
      relativePath: row.relative_path,
      checksum: row.checksum,
      version: row.version,
      formal: true
    }))
  }

  async getKnowledgeArtifact(id: string): Promise<
    | {
        artifact: KnowledgeArtifact
        workspaceId: string
      }
    | undefined
  > {
    const row = this.database
      .prepare(
        `SELECT
          artifact.id, artifact.requirement_id, artifact.node_id,
          artifact.relative_path, artifact.checksum, artifact.version,
          requirement.workspace_id
         FROM artifacts artifact
         JOIN requirements requirement
           ON requirement.id = artifact.requirement_id
         WHERE artifact.id = ?
           AND artifact.is_primary = 1
           AND artifact.is_valid = 1`
      )
      .get(id) as
      | {
          id: string
          requirement_id: string
          node_id: string | null
          relative_path: string
          checksum: string
          version: number
          workspace_id: string
        }
      | undefined
    if (!row) return undefined
    return {
      artifact: {
        id: row.id,
        requirementId: row.requirement_id,
        ...(row.node_id ? { nodeId: row.node_id } : {}),
        relativePath: row.relative_path,
        checksum: row.checksum,
        version: row.version,
        formal: true
      },
      workspaceId: row.workspace_id
    }
  }

  async readContent(artifact: KnowledgeArtifact): Promise<string> {
    const requirement = this.database
      .prepare(
        `SELECT workspace_root_path FROM requirements
         WHERE id = ?`
      )
      .get(artifact.requirementId) as
      | { workspace_root_path: string | null }
      | undefined
    if (!requirement?.workspace_root_path) {
      throw new Error('Requirement workspace is not bound')
    }
    const targetPath = (
      await this.securePaths.resolveExistingPath(
        requirement.workspace_root_path,
        artifact.relativePath
      )
    ).targetPath
    return readFile(targetPath, 'utf8')
  }

  private assertCurrentNodeRun(
    input: Parameters<ArtifactRepository['commit']>[0] & {
      nodeRunId?: string
    }
  ): void {
    if (!input.nodeId || !input.nodeRunId) return
    const nodeRun = this.database
      .prepare(
        `SELECT
          node_runs.id,
          node_runs.execution_id,
          node_runs.node_id,
          node_runs.ai_run_id,
          node_runs.status
         FROM node_runs
         INNER JOIN workflow_executions
           ON workflow_executions.id = node_runs.execution_id
         WHERE node_runs.id = ?
           AND workflow_executions.requirement_id = ?`
      )
      .get(input.nodeRunId, input.requirementId) as
      | {
          id: string
          execution_id: string
          node_id: string
          ai_run_id: string | null
          status: string
        }
      | undefined
    if (!nodeRun || nodeRun.node_id !== input.nodeId) {
      throw new Error('Node run does not match the artifact target')
    }
    const latestNodeRunId = this.database
      .prepare(
        `SELECT id FROM node_runs
         WHERE execution_id = ? AND node_id = ?
         ORDER BY attempt DESC, created_at DESC, id DESC
         LIMIT 1`
      )
      .pluck()
      .get(nodeRun.execution_id, input.nodeId) as string | undefined
    if (latestNodeRunId !== input.nodeRunId) {
      throw new Error('Node run is no longer the latest attempt')
    }
    if (nodeRun.ai_run_id !== input.runId) {
      throw new Error('Node run is not bound to the completing AI run')
    }
    if (!['ready', 'running', 'waiting_user'].includes(nodeRun.status)) {
      throw new Error(
        `Node run cannot commit an artifact from ${nodeRun.status}`
      )
    }
  }

  private assertArtifact(path: string, content: string): void {
    this.securePaths.normalizeRelativePath(path)
    if (
      !content ||
      Buffer.byteLength(content, 'utf8') > MAX_ARTIFACT_SIZE
    ) {
      throw new Error('Generated artifact is invalid')
    }
  }

  private readIdempotentResult(
    input: Parameters<ArtifactRepository['commit']>[0] & {
      nodeRunId?: string
    },
    run: { artifact_id: string | null; last_sequence: number }
  ): FormalArtifactCommitResult {
    const artifact = run.artifact_id
      ? (this.database
          .prepare(
            `SELECT id, requirement_id, node_id, node_run_id, relative_path,
              kind, checksum, version, byte_size, is_valid, created_at
             FROM artifacts WHERE id = ?`
          )
          .get(run.artifact_id) as
          | {
              id: string
              requirement_id: string
              node_id: string
              node_run_id: string | null
              relative_path: string
              kind: string
              checksum: string
              version: number
              byte_size: number
              is_valid: number
              created_at: number
            }
          | undefined)
      : undefined
    const event = this.database
      .prepare(
        `SELECT id, type, timestamp, data_json
         FROM ai_run_events WHERE run_id = ? AND sequence = ?`
      )
      .get(input.runId, input.completionEvent.sequence) as
      | { id: string; type: string; timestamp: number; data_json: string }
      | undefined
    const checksum = `sha256:${createHash('sha256')
      .update(input.artifact.content)
      .digest('hex')}`
    if (
      !artifact ||
      run.last_sequence !== input.completionEvent.sequence ||
      !event ||
      event.id !== input.completionEvent.id ||
      event.type !== input.completionEvent.type ||
      event.timestamp !== Date.parse(input.completionEvent.timestamp) ||
      event.data_json !== JSON.stringify(input.completionEvent.data) ||
      artifact.requirement_id !== input.requirementId ||
      artifact.node_id !==
        (input.nodeId ?? `${input.requirementId}:${input.stageId}`) ||
      artifact.node_run_id !== (input.nodeRunId ?? null) ||
      artifact.relative_path !== input.artifact.path ||
      artifact.kind !== input.expectedArtifact.kind ||
      artifact.checksum !== checksum ||
      artifact.is_valid !== 1
    ) {
      throw new Error('Formal artifact commit conflicts with completed run')
    }
    return {
      artifactId: artifact.id,
      requirementId: artifact.requirement_id,
      nodeId: artifact.node_id,
      relativePath: artifact.relative_path,
      kind: artifact.kind,
      checksum: artifact.checksum,
      version: artifact.version,
      byteSize: artifact.byte_size,
      committedAt: artifact.created_at,
      idempotent: true
    }
  }

}

function artifactKind(path: string): string {
  const extension = extname(path).toLowerCase()
  if (['.md', '.markdown', '.mdx'].includes(extension)) return 'markdown'
  if (['.html', '.htm'].includes(extension)) return 'html'
  return 'file'
}
