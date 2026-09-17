import type Database from 'better-sqlite3'
import type { ContextAssemblerDependencies } from '../../application/context/context-assembler'
import type { WorkspaceService } from '../../workspace/workspace-service'

type ArtifactRow = {
  id: string
  relative_path: string
  version: number
  name: string
}

type KnowledgeRow = {
  id: string
  source_version: number
  content: string
}

type ArtifactContextSource = ContextAssemblerDependencies['artifacts']
type KnowledgeContextSource = ContextAssemblerDependencies['knowledge']

export class SqliteContextSources
  implements ArtifactContextSource, KnowledgeContextSource
{
  constructor(
    private readonly database: Database.Database,
    private readonly workspace: Pick<WorkspaceService, 'readFile'>
  ) {}

  async listPredecessorArtifacts(requirementId: string, nodeId: string) {
    const rows = this.database
      .prepare(
        `SELECT a.id, a.relative_path, a.version, source.name
         FROM requirement_edges edge
         JOIN requirement_nodes source
           ON source.requirement_id = edge.requirement_id
          AND source.id = edge.source_node_id
         JOIN artifacts a
           ON a.requirement_id = edge.requirement_id
          AND a.node_id = edge.source_node_id
          AND a.is_primary = 1
         WHERE edge.requirement_id = ? AND edge.target_node_id = ?
         ORDER BY source.sort_order, a.version, a.id`
      )
      .all(requirementId, nodeId) as ArtifactRow[]
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        version: row.version,
        name: row.name,
        content: (await this.workspace.readFile(requirementId, row.relative_path))
          .content
      }))
    )
  }

  async search(requirementId: string, query: string) {
    const terms = new Set(
      query
        .toLocaleLowerCase()
        .split(/\s+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
    )
    const rows = this.database
      .prepare(
        `SELECT chunk.id, document.source_version, chunk.content
         FROM knowledge_chunks chunk
         JOIN knowledge_documents document ON document.id = chunk.document_id
         WHERE document.workspace_id = (
           SELECT workspace_id FROM requirements WHERE id = ?
         )
         ORDER BY document.updated_at DESC, chunk.chunk_index, chunk.id
         LIMIT 100`
      )
      .all(requirementId) as KnowledgeRow[]
    return rows
      .map((row) => {
        const content = row.content.toLocaleLowerCase()
        const matches = [...terms].filter((term) => content.includes(term)).length
        return {
          id: row.id,
          version: row.source_version,
          content: row.content,
          score: terms.size === 0 ? 0 : matches / terms.size
        }
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, 8)
  }
}
