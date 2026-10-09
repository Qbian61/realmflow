import type Database from 'better-sqlite3'
import type { ContextAssemblerDependencies } from '../../application/context/context-assembler'
import type { HybridKnowledgeSearchService } from '../../application/knowledge/hybrid-knowledge-search-service'
import type { WorkspaceService } from '../../workspace/workspace-service'

type ArtifactRow = {
  id: string
  relative_path: string
  version: number
  name: string
  depth: number
}

type ArtifactContextSource = ContextAssemblerDependencies['artifacts']
type KnowledgeContextSource = ContextAssemblerDependencies['knowledge']

export class SqliteContextSources
  implements ArtifactContextSource, KnowledgeContextSource
{
  constructor(
    private readonly database: Database.Database,
    private readonly workspace: Pick<WorkspaceService, 'readFile'>,
    private readonly knowledgeSearch?: Pick<HybridKnowledgeSearchService, 'search'>
  ) {}

  async listPredecessorArtifacts(
    requirementId: string,
    nodeId: string,
    scope: 'direct' | 'all'
  ) {
    const rows = this.database
      .prepare(
        `WITH RECURSIVE reachable(node_id, depth) AS (
           SELECT source_node_id, 1
           FROM requirement_edges
           WHERE requirement_id = ? AND target_node_id = ?
           UNION ALL
           SELECT edge.source_node_id, reachable.depth + 1
           FROM requirement_edges edge
           JOIN reachable ON edge.target_node_id = reachable.node_id
           WHERE edge.requirement_id = ?
         ),
         ancestors(node_id, depth) AS (
           SELECT node_id, MIN(depth) FROM reachable GROUP BY node_id
         )
         SELECT a.id, a.relative_path, a.version, source.name, ancestors.depth
         FROM ancestors
         JOIN requirement_nodes source
           ON source.requirement_id = ?
          AND source.id = ancestors.node_id
         JOIN artifacts a
           ON a.requirement_id = source.requirement_id
          AND a.node_id = source.id
          AND a.is_primary = 1
          AND a.is_valid = 1
         WHERE (? = 'all' OR ancestors.depth = 1)
         ORDER BY
           CASE WHEN ancestors.depth = 1 THEN 0 ELSE 1 END,
           ancestors.depth, source.sort_order, a.version, a.id`
      )
      .all(requirementId, nodeId, requirementId, requirementId, scope) as ArtifactRow[]
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        version: row.version,
        name: row.name,
        relationship: row.depth === 1 ? ('direct' as const) : ('ancestor' as const),
        content: (await this.workspace.readFile(requirementId, row.relative_path))
          .content
      }))
    )
  }

  async search(requirementId: string, query: string) {
    const workspace = this.database
      .prepare('SELECT workspace_id FROM requirements WHERE id = ?')
      .get(requirementId) as { workspace_id: string } | undefined
    if (!workspace) return []
    return this.searchByWorkspace(workspace.workspace_id, query)
  }

  async searchByWorkspace(workspaceId: string, query: string) {
    if (this.knowledgeSearch) {
      const current = await this.knowledgeSearch.search({
        scope: { kind: 'workspace', workspaceId },
        query
      })
      return current.map((chunk) => ({
        id: chunk.id,
        sourceId: chunk.sourceId,
        documentKey: chunk.documentKey,
        generationId: chunk.generationId,
        sourceVersion: chunk.sourceVersion,
        chunkId: chunk.chunkId,
        chunkOrdinal: chunk.chunkOrdinal,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        checksum: chunk.checksum,
        version: chunk.createdAt,
        content: chunk.content,
        denseScore: chunk.denseScore,
        denseRank: chunk.denseRank,
        bm25Score: chunk.bm25Score,
        bm25Rank: chunk.bm25Rank,
        fusionScore: chunk.fusionScore,
        fusionRank: chunk.fusionRank
      }))
    }
    return []
  }
}
