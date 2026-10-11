import {
  rankConversationMemories,
  type ConversationMemoryEntry,
  type ConversationMemoryScope
} from '../../../../domain/conversation-memory'
import type {
  RecalledMemoryReference
} from '../../../../domain/conversation-context-projection'

type ConversationMemoryRepository = {
  searchTranscript(input: {
    conversationId: string
    query: string
    limit: number
  }): Array<{
    messageId: string
    role: 'user' | 'assistant'
    content: string
    rank: number
  }>
  listMemoryEntries(input: {
    scope: ConversationMemoryScope
    scopeId: string
  }): ConversationMemoryEntry[]
}

export class ConversationMemoryService {
  private readonly now: () => number

  constructor(
    private readonly dependencies: {
      repository: ConversationMemoryRepository
      semanticSearch?: {
        score(input: {
          query: string
          entries: readonly ConversationMemoryEntry[]
        }): Promise<ReadonlyMap<string, number>>
      }
      now?: () => number
    }
  ) {
    this.now = dependencies.now ?? Date.now
  }

  searchTranscript(input: {
    conversationId: string
    query: string
    limit?: number
  }) {
    return this.dependencies.repository.searchTranscript({
      conversationId: input.conversationId,
      query: input.query,
      limit: Math.max(1, Math.min(8, input.limit ?? 8))
    })
  }

  async recall(input: {
    query: string
    scope: { kind: ConversationMemoryScope; id: string }
    limit?: number
  }): Promise<RecalledMemoryReference[]> {
    const entries = this.dependencies.repository.listMemoryEntries({
      scope: input.scope.kind,
      scopeId: input.scope.id
    })
    let semanticScores: ReadonlyMap<string, number> | undefined
    try {
      semanticScores = await this.dependencies.semanticSearch?.score({
        query: input.query,
        entries
      })
    } catch {
      // Local lexical ranking remains available when the vector index is down.
    }
    return rankConversationMemories({
      query: input.query,
      scope: input.scope,
      entries,
      ...(semanticScores ? { semanticScores } : {}),
      now: this.now(),
      limit: input.limit
    }).map(({ entry, score }) => ({
      id: entry.id,
      content: entry.content,
      sourceMessageIds: entry.sourceMessageIds,
      score
    }))
  }
}
