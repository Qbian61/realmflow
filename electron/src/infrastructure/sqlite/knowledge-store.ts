import type Database from 'better-sqlite3'
import type {
  KnowledgeDocument,
  KnowledgeSyncDependencies,
  KnowledgeSyncFailure
} from '../../application/knowledge/sync-requirement-artifacts'

type KnowledgeDocumentRow = {
  id: string
  workspace_id: string
  source_requirement_id: string
  source_node_id: string | null
  source_artifact_id: string
  source_version: number
  source_path: string
  checksum: string
  content: string
  updated_at: number
}

type KnowledgeChunkRow = {
  id: string
  chunk_index: number
  content: string
  checksum: string
}

type KnowledgeDocumentStore = KnowledgeSyncDependencies['knowledge']
type KnowledgeSyncJobStore = KnowledgeSyncDependencies['jobs']

export class SqliteKnowledgeStore
  implements KnowledgeDocumentStore, KnowledgeSyncJobStore
{
  constructor(private readonly database: Database.Database) {}

  async getBySource(
    requirementId: string,
    sourcePath: string
  ): Promise<KnowledgeDocument | undefined> {
    const row = this.database
      .prepare(
        `SELECT * FROM knowledge_documents
         WHERE source_requirement_id = ? AND source_path = ?`
      )
      .get(requirementId, sourcePath) as KnowledgeDocumentRow | undefined
    if (!row) return undefined
    const chunks = this.database
      .prepare(
        `SELECT id, chunk_index, content, checksum
         FROM knowledge_chunks
         WHERE document_id = ?
         ORDER BY chunk_index, id`
      )
      .all(row.id) as KnowledgeChunkRow[]
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      sourceRequirementId: row.source_requirement_id,
      ...(row.source_node_id ? { sourceNodeId: row.source_node_id } : {}),
      sourceArtifactId: row.source_artifact_id,
      sourceVersion: row.source_version,
      sourcePath: row.source_path,
      checksum: row.checksum,
      content: row.content,
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        index: chunk.chunk_index,
        content: chunk.content,
        checksum: chunk.checksum
      })),
      updatedAt: row.updated_at
    }
  }

  async replaceDocument(document: KnowledgeDocument): Promise<void> {
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO knowledge_documents (
            id, workspace_id, source_requirement_id, source_node_id,
            source_artifact_id, source_version, source_path, checksum, content,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_requirement_id, source_path) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            source_node_id = excluded.source_node_id,
            source_artifact_id = excluded.source_artifact_id,
            source_version = excluded.source_version,
            source_path = excluded.source_path,
            checksum = excluded.checksum,
            content = excluded.content,
            updated_at = excluded.updated_at`
        )
        .run(
          document.id,
          document.workspaceId,
          document.sourceRequirementId,
          document.sourceNodeId ?? null,
          document.sourceArtifactId,
          document.sourceVersion,
          document.sourcePath,
          document.checksum,
          document.content,
          document.updatedAt,
          document.updatedAt
        )
      this.database
        .prepare('DELETE FROM knowledge_chunks WHERE document_id = ?')
        .run(document.id)
      const insertChunk = this.database.prepare(
        `INSERT INTO knowledge_chunks (
          id, document_id, chunk_index, content, checksum
        ) VALUES (?, ?, ?, ?, ?)`
      )
      for (const chunk of document.chunks) {
        insertChunk.run(
          chunk.id,
          document.id,
          chunk.index,
          chunk.content,
          chunk.checksum
        )
      }
    })()
  }

  async recordFailure(failure: KnowledgeSyncFailure): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO knowledge_sync_jobs (
          id, requirement_id, artifact_id, status, retryable, attempt, error,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          retryable = excluded.retryable,
          attempt = knowledge_sync_jobs.attempt + 1,
          error = excluded.error,
          updated_at = excluded.updated_at`
      )
      .run(
        failure.id,
        failure.requirementId,
        failure.artifactId,
        failure.status,
        failure.retryable ? 1 : 0,
        failure.error,
        failure.createdAt,
        failure.createdAt
      )
  }
}
