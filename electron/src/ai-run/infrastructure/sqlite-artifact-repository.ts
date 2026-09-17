import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile
} from 'node:fs/promises'
import { renameSync } from 'node:fs'
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path'
import type Database from 'better-sqlite3'
import type {
  KnowledgeArtifact,
  KnowledgeSyncDependencies
} from '../../application/knowledge/sync-requirement-artifacts'
import type { ArtifactRepository } from '../application/ports'

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
    fileOperations: Partial<FileOperations> = {}
  ) {
    this.fileOperations = {
      renameSync: fileOperations.renameSync ?? renameSync
    }
  }

  async commit(
    input: Parameters<ArtifactRepository['commit']>[0]
  ): Promise<void> {
    this.assertArtifact(input.artifact.path, input.artifact.content)
    if (
      input.completionEvent.runId !== input.runId ||
      input.completionEvent.type !== 'run.completed'
    ) {
      throw new Error('Artifact completion event is invalid')
    }

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
        `SELECT status, requirement_id, stage_id, node_id
         FROM ai_runs WHERE id = ?`
      )
      .get(input.runId) as
      | {
          status: string
          requirement_id: string
          stage_id: string
          node_id: string | null
        }
      | undefined
    if (!run) throw new Error('AI run was not found')
    if (
      run.requirement_id !== input.requirementId ||
      run.stage_id !== input.stageId ||
      (input.nodeId !== undefined && run.node_id !== input.nodeId)
    ) {
      throw new Error('AI run does not match the artifact target')
    }
    if (!['created', 'running'].includes(run.status)) {
      throw new Error(`AI run cannot complete from status ${run.status}`)
    }

    const rootPath = await realpath(requirement.workspace_root_path).catch(
      async (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await mkdir(requirement.workspace_root_path!, { recursive: true })
        return realpath(requirement.workspace_root_path!)
      }
    )
    const targetPath = resolve(rootPath, input.artifact.path)
    this.assertInside(rootPath, targetPath)
    await mkdir(dirname(targetPath), { recursive: true })
    this.assertInside(rootPath, await realpath(dirname(targetPath)))

    const nonce = randomUUID()
    const temporaryPath = `${targetPath}.realmflow-${nonce}.tmp`
    const backupPath = `${targetPath}.realmflow-${nonce}.backup`
    const nodeId =
      input.nodeId ?? `${input.requirementId}:${input.stageId}`
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
    try {
      this.database.transaction(() => {
        const currentRun = this.database
          .prepare('SELECT status FROM ai_runs WHERE id = ?')
          .get(input.runId) as { status: string } | undefined
        if (!currentRun) throw new Error('AI run was not found')
        if (!['created', 'running'].includes(currentRun.status)) {
          throw new Error(
            `AI run cannot complete from status ${currentRun.status}`
          )
        }

        const nextVersion =
          ((this.database
            .prepare(
              `SELECT MAX(version) FROM artifacts
               WHERE requirement_id = ? AND node_id = ?`
            )
            .pluck()
            .get(input.requirementId, nodeId) as number | null) ?? 0) + 1
        const timestamp = Date.parse(input.completionEvent.timestamp)
        const checksum = `sha256:${createHash('sha256')
          .update(input.artifact.content)
          .digest('hex')}`
        const artifactId = randomUUID()

        this.database
          .prepare(
            `UPDATE artifacts SET
              is_primary = 0,
              revision = revision + 1,
              updated_at = ?
             WHERE requirement_id = ? AND node_id = ? AND is_primary = 1`
          )
          .run(timestamp, input.requirementId, nodeId)
        this.database
          .prepare(
            `INSERT INTO artifacts (
              id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
              version, byte_size, is_primary, revision, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
          )
          .run(
            artifactId,
            input.requirementId,
            input.stageId,
            nodeId,
            input.artifact.path,
            artifactKind(input.artifact.path),
            checksum,
            nextVersion,
            Buffer.byteLength(input.artifact.content, 'utf8'),
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
      })()
      if (hasPreviousFile) await unlink(backupPath)
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
  }

  async listByRequirement(
    requirementId: string
  ): Promise<KnowledgeArtifact[]> {
    const rows = this.database
      .prepare(
        `SELECT
          id, requirement_id, node_id, relative_path, checksum, version
         FROM artifacts
         WHERE requirement_id = ? AND is_primary = 1
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
    const rootPath = await realpath(requirement.workspace_root_path)
    const targetPath = resolve(rootPath, artifact.relativePath)
    this.assertInside(rootPath, targetPath)
    const resolvedTarget = await realpath(targetPath)
    this.assertInside(rootPath, resolvedTarget)
    return readFile(resolvedTarget, 'utf8')
  }

  private assertArtifact(path: string, content: string): void {
    if (
      !path ||
      path.includes('\0') ||
      isAbsolute(path) ||
      path === '..' ||
      path.startsWith('../') ||
      path.includes('/../')
    ) {
      throw new Error('Path is outside the bound workspace')
    }
    if (
      !content ||
      Buffer.byteLength(content, 'utf8') > MAX_ARTIFACT_SIZE
    ) {
      throw new Error('Generated artifact is invalid')
    }
  }

  private assertInside(rootPath: string, targetPath: string): void {
    const childPath = relative(rootPath, targetPath)
    if (
      childPath === '..' ||
      childPath.startsWith(`..${sep}`) ||
      isAbsolute(childPath)
    ) {
      throw new Error('Path is outside the bound workspace')
    }
  }
}

function artifactKind(path: string): string {
  const extension = extname(path).toLowerCase()
  if (['.md', '.markdown', '.mdx'].includes(extension)) return 'markdown'
  if (['.html', '.htm'].includes(extension)) return 'html'
  return 'file'
}
