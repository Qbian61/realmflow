import type {
  KnowledgeSearchScope,
  KnowledgeSearchQueryInput,
  KnowledgeSearchResult
} from '../../../../domain/knowledge-search'
import type { RetrievalQuery } from '../../../../domain/conversation-processor'

const DEFAULT_MAX_CHARACTERS = 32 * 1024
const MAX_KNOWLEDGE_CHUNKS = 8
const MIN_KNOWLEDGE_CONFIDENCE = 0.01
const INSUFFICIENT_KNOWLEDGE_SIGNAL =
  '## Knowledge status\nLocal knowledge is insufficient for a grounded answer.\n'

type SpaceKnowledgeSource = {
  search: (
    input: KnowledgeSearchQueryInput
  ) => Promise<Array<KnowledgeSearchResult & { workspaceName?: string }>>
  searchPlan?: (input: {
    scope: KnowledgeSearchScope
    queries: readonly RetrievalQuery[]
    topK: number
  }) => Promise<Array<KnowledgeSearchResult & { workspaceName?: string }>>
}

export class SpaceConversationContextAssembler {
  constructor(
    private readonly knowledge: SpaceKnowledgeSource,
    private readonly maxCharacters = DEFAULT_MAX_CHARACTERS
  ) {}

  async assemble(
    workspaceId: string,
    query: string | readonly RetrievalQuery[]
  ): Promise<string | undefined> {
    return this.assembleScope({ kind: 'workspace', workspaceId }, query)
  }

  async assembleScope(
    scope: KnowledgeSearchScope,
    query: string | readonly RetrievalQuery[]
  ): Promise<string | undefined> {
    const snapshot = await this.assembleSnapshot(scope, query)
    return snapshot.content || undefined
  }

  async assembleSnapshot(
    scope: KnowledgeSearchScope,
    query: string | readonly RetrievalQuery[]
  ): Promise<{
    content: string
    allowedReferenceIds: string[]
    insufficientKnowledge: boolean
  }> {
    try {
      const recalled =
        typeof query === 'string'
          ? await this.knowledge.search({
              scope,
              query,
              topK: MAX_KNOWLEDGE_CHUNKS
            })
          : this.knowledge.searchPlan
            ? await this.knowledge.searchPlan({
                scope,
                queries: query,
                topK: MAX_KNOWLEDGE_CHUNKS
              })
            : await this.knowledge.search({
                scope,
                query:
                  query.find(({ kind }) => kind === 'semantic')?.query ??
                  query[0]?.query ??
                  '',
                topK: MAX_KNOWLEDGE_CHUNKS
              })
      const chunks = deduplicateChunks(recalled).filter(
        (chunk) =>
          (chunk.fusionScore ?? Number.POSITIVE_INFINITY) >=
          MIN_KNOWLEDGE_CONFIDENCE
      )
      let remaining = this.maxCharacters
      let context = ''
      const allowedReferenceIds: string[] = []
      for (const chunk of chunks) {
        if (remaining === 0) break
        const workspace =
          scope.kind === 'all_workspaces' && chunk.workspaceName
            ? ` / ${chunk.workspaceName}`
            : ''
        const section =
          `## Space knowledge${workspace}: ${chunk.title} / ${chunk.documentKey} / ` +
          `chunk ${chunk.chunkOrdinal + 1}\n${chunk.content}\n\n`
        const included = section.slice(0, remaining)
        context += included
        if (included.length === section.length) {
          allowedReferenceIds.push(chunk.id)
        }
        remaining -= included.length
      }
      const insufficientKnowledge = allowedReferenceIds.length === 0
      if (insufficientKnowledge) {
        context = INSUFFICIENT_KNOWLEDGE_SIGNAL.slice(0, this.maxCharacters)
      }
      return {
        content: context,
        allowedReferenceIds,
        insufficientKnowledge
      }
    } catch {
      throw new Error('读取空间知识失败，请重试')
    }
  }
}

function deduplicateChunks(
  chunks: Array<KnowledgeSearchResult & { workspaceName?: string }>
): Array<KnowledgeSearchResult & { workspaceName?: string }> {
  const seen = new Set<string>()
  return chunks.filter((chunk) => {
    const key = [
      chunk.workspaceId,
      chunk.sourceId,
      chunk.sourceVersion,
      chunk.documentKey,
      chunk.chunkId,
      chunk.checksum
    ].join('\0')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
