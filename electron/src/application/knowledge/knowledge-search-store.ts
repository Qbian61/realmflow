import type { KnowledgeSearchScope } from '../../../../domain/knowledge-search'

export type KnowledgeSearchScopeSnapshot = {
  workspaces: Array<{ id: string; name: string }>
  generations: Array<{
    id: string
    workspaceId: string
    sourceKind: string
    sourceId: string
    sourceVersion: string
    sourceChecksum: string
  }>
}

export interface KnowledgeSearchStore {
  resolveScope(input: {
    scope: KnowledgeSearchScope
    profileId: string
  }): Promise<KnowledgeSearchScopeSnapshot>
}
