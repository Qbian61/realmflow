import type Database from 'better-sqlite3'
import type { KnowledgeSearchResult } from '../../../../domain/knowledge-search'
import type {
  KnowledgeSearchScopeSnapshot,
  KnowledgeSearchStore
} from '../../application/knowledge/knowledge-search-store'

type WorkspaceRow = {
  id: string
  label: string
}

type GenerationRow = {
  id: string
  scope_id: string
  source_kind: string
  source_id: string
  source_version: string
  source_checksum: string
}

type SearchChunkRow = {
  point_id: string
  profile_id: string
  workspace_id: string
  generation_id: string
  source_kind: KnowledgeSearchResult['sourceKind']
  source_id: string
  source_version: string
  requirement_id: string | null
  node_id: string | null
  session_id: string | null
  document_id: string
  document_key: string
  title: string
  content: string
  chunk_id: string
  chunk_ordinal: number
  start_offset: number
  end_offset: number
  start_line: number
  end_line: number
  checksum: string
  created_at: number
  lexical_rank: number
}

export class SqliteKnowledgeSearchStore implements KnowledgeSearchStore {
  constructor(private readonly database: Database.Database) {}

  async resolveScope(input: Parameters<KnowledgeSearchStore['resolveScope']>[0]):
    Promise<KnowledgeSearchScopeSnapshot> {
    const workspaces =
      input.scope.kind === 'workspace'
        ? this.getWorkspace(input.scope.workspaceId)
        : this.listWorkspaces()
    if (input.scope.kind === 'workspace' && workspaces.length === 0) {
      throw new Error('Workspace not found')
    }
    if (workspaces.length === 0) {
      return { workspaces: [], generations: [] }
    }
    const workspaceIds = workspaces.map(({ id }) => id)
    const placeholders = workspaceIds.map(() => '?').join(', ')
    const generations = this.database
      .prepare(
        `SELECT generation.id, generation.scope_id, generation.source_kind,
                generation.source_id, generation.source_version,
                generation.source_checksum
         FROM knowledge_index_generations generation
         LEFT JOIN knowledge_sources source
           ON source.id = generation.source_id
         WHERE generation.scope_kind = 'workspace'
           AND generation.scope_id IN (${placeholders})
           AND generation.profile_id = ?
           AND generation.status = 'current'
           AND (source.id IS NULL OR source.status <> 'removed')
         ORDER BY generation.scope_id, generation.source_kind,
                  generation.source_id, generation.id`
      )
      .all(...workspaceIds, input.profileId) as GenerationRow[]
    return {
      workspaces: workspaces.map(({ id, label }) => ({ id, name: label })),
      generations: generations.map((row) => ({
        id: row.id,
        workspaceId: row.scope_id,
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        sourceVersion: row.source_version,
        sourceChecksum: row.source_checksum
      }))
    }
  }

  async searchLexical(input: {
    query: string
    topK: number
    sourceKinds?: KnowledgeSearchResult['sourceKind'][]
    requirementId?: string
    snapshot: KnowledgeSearchScopeSnapshot
  }): Promise<KnowledgeSearchResult[]> {
    if (input.snapshot.generations.length === 0) return []
    const matchQuery = lexicalMatchQuery(input.query)
    if (!matchQuery) return []
    const generationIds = input.snapshot.generations.map(({ id }) => id)
    const generationPlaceholders = generationIds.map(() => '?').join(', ')
    const sourceKinds = input.sourceKinds ?? []
    const sourceFilter =
      sourceKinds.length === 0
        ? ''
        : ` AND chunk.source_kind IN (${sourceKinds.map(() => '?').join(', ')})`
    const requirementFilter = input.requirementId
      ? ' AND chunk.requirement_id = ?'
      : ''
    const rows = this.database
      .prepare(
        `SELECT chunk.*, bm25(knowledge_search_chunks_fts) AS lexical_rank
         FROM knowledge_search_chunks_fts
         JOIN knowledge_search_chunks chunk
           ON chunk.rowid = knowledge_search_chunks_fts.rowid
         WHERE knowledge_search_chunks_fts MATCH ?
           AND chunk.generation_id IN (${generationPlaceholders})
           ${sourceFilter}
           ${requirementFilter}
         ORDER BY lexical_rank, chunk.source_kind, chunk.source_id,
                  chunk.document_key, chunk.chunk_ordinal, chunk.chunk_id
         LIMIT ?`
      )
      .all(
        matchQuery,
        ...generationIds,
        ...sourceKinds,
        ...(input.requirementId ? [input.requirementId] : []),
        input.topK
      ) as SearchChunkRow[]
    return rows.map((row, index) => {
      const score = 1 / (1 + Math.abs(row.lexical_rank))
      return {
        id: row.point_id,
        schemaVersion: 1,
        profileId: row.profile_id,
        workspaceId: row.workspace_id,
        generationId: row.generation_id,
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        sourceVersion: row.source_version,
        ...(row.requirement_id
          ? { requirementId: row.requirement_id }
          : {}),
        ...(row.node_id ? { nodeId: row.node_id } : {}),
        ...(row.session_id ? { sessionId: row.session_id } : {}),
        documentId: row.document_id,
        documentKey: row.document_key,
        title: row.title,
        content: row.content,
        chunkId: row.chunk_id,
        chunkOrdinal: row.chunk_ordinal,
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        startLine: row.start_line,
        endLine: row.end_line,
        checksum: row.checksum,
        createdAt: row.created_at,
        bm25Score: score,
        bm25Rank: index + 1,
        fusionScore: score,
        fusionRank: index + 1
      }
    })
  }

  private getWorkspace(id: string): WorkspaceRow[] {
    const row = this.database
      .prepare(
        `SELECT id, label FROM workspaces
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as WorkspaceRow | undefined
    return row ? [row] : []
  }

  private listWorkspaces(): WorkspaceRow[] {
    return this.database
      .prepare(
        `SELECT id, label FROM workspaces
         WHERE deleted_at IS NULL
         ORDER BY sort_order, id`
      )
      .all() as WorkspaceRow[]
  }
}

function lexicalMatchQuery(query: string): string {
  return [
    ...new Set(
      query
        .normalize('NFKC')
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}_-]+/gu) ?? []
    )
  ]
    .slice(0, 32)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' OR ')
}
