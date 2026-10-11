import { describe, expect, it } from 'vitest'
import {
  rankConversationMemories,
  type ConversationMemoryEntry
} from './conversation-memory'

describe('conversation memory ranking', () => {
  it('auto-recalls only trusted, current, scope-matching entries', () => {
    const results = rankConversationMemories({
      query: 'local SQLite decision',
      scope: { kind: 'conversation', id: 'conversation-1' },
      entries: [
        memory('trusted', 'Use local SQLite for persistence.'),
        memory('model', 'Use remote storage.', {
          trust: 'model_summary'
        }),
        memory('expired', 'Old SQLite choice.', { expiresAt: 99 }),
        memory('other', 'SQLite in another conversation.', {
          scopeId: 'conversation-2'
        }),
        memory('superseded', 'Earlier local decision.', {
          supersededBy: 'trusted'
        })
      ],
      now: 100
    })

    expect(results.map(({ entry }) => entry.id)).toEqual(['trusted'])
  })

  it('caps diverse results at eight and uses semantic scores as a secondary signal', () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      memory(`memory-${index}`, `decision topic ${index}`)
    )
    const results = rankConversationMemories({
      query: 'unrelated wording',
      scope: { kind: 'conversation', id: 'conversation-1' },
      entries,
      semanticScores: new Map(
        entries.map((entry, index) => [entry.id, 1 - index / 20])
      ),
      now: 100,
      limit: 8
    })

    expect(results).toHaveLength(8)
    expect(results[0].entry.id).toBe('memory-0')
  })
})

function memory(
  id: string,
  content: string,
  overrides: Partial<ConversationMemoryEntry> = {}
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
    trust: 'user_confirmed',
    ...overrides
  }
}
