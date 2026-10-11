import { describe, expect, it, vi } from 'vitest'
import type { ConversationMemoryEntry } from '../../../../domain/conversation-memory'
import { ConversationMemoryService } from './conversation-memory-service'

describe('ConversationMemoryService', () => {
  it('keeps transcript search explicit and conversation-scoped', () => {
    const searchTranscript = vi.fn().mockReturnValue([
      {
        messageId: 'message-1',
        role: 'user',
        content: 'runtime_resource_stale',
        rank: -1
      }
    ])
    const service = new ConversationMemoryService({
      repository: {
        searchTranscript,
        listMemoryEntries: vi.fn().mockReturnValue([])
      }
    })

    expect(
      service.searchTranscript({
        conversationId: 'conversation-1',
        query: 'runtime_resource_stale'
      })
    ).toHaveLength(1)
    expect(searchTranscript).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      query: 'runtime_resource_stale',
      limit: 8
    })
  })

  it('hybrid-ranks trusted memory and excludes model summaries from automatic recall', async () => {
    const trusted = memory(
      'trusted',
      'Persist conversation state in local SQLite.',
      'user_confirmed'
    )
    const summary = memory(
      'summary',
      'Persist state in a remote service.',
      'model_summary'
    )
    const service = new ConversationMemoryService({
      repository: {
        searchTranscript: vi.fn().mockReturnValue([]),
        listMemoryEntries: vi.fn().mockReturnValue([trusted, summary])
      },
      semanticSearch: {
        score: vi.fn().mockResolvedValue(
          new Map([
            ['trusted', 0.9],
            ['summary', 1]
          ])
        )
      },
      now: () => 100
    })

    await expect(
      service.recall({
        query: 'Where is conversation state stored?',
        scope: { kind: 'conversation', id: 'conversation-1' }
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'trusted',
        content: 'Persist conversation state in local SQLite.',
        sourceMessageIds: ['message-1']
      })
    ])
  })
})

function memory(
  id: string,
  content: string,
  trust: ConversationMemoryEntry['trust']
): ConversationMemoryEntry {
  return {
    id,
    scope: 'conversation',
    scopeId: 'conversation-1',
    kind: 'decision',
    content,
    sourceMessageIds: ['message-1'],
    sourceDigest: `digest-${id}`,
    importance: 0.8,
    validFrom: 1,
    trust
  }
}
