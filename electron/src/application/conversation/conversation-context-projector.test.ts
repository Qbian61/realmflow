import { describe, expect, it } from 'vitest'
import type { TurnContextRoute } from '../../../../domain/conversation-context-route'
import { ConversationContextProjector } from './conversation-context-projector'

describe('ConversationContextProjector', () => {
  const projector = new ConversationContextProjector()

  it('projects only the current message for a fresh turn', () => {
    const projection = projector.project({
      conversationId: 'conversation-1',
      sourceMessage: {
        id: 'message-new',
        role: 'user',
        content: 'new topic',
        sortOrder: 2
      },
      route: route({
        relation: 'fresh',
        selectedMessageIds: [],
        excludedMessageIds: ['message-old', 'assistant-old']
      }),
      history: [
        {
          id: 'message-old',
          role: 'user',
          content: 'old topic',
          sortOrder: 0
        },
        {
          id: 'assistant-old',
          role: 'assistant',
          content: 'old answer browser-dead-session',
          sortOrder: 1
        }
      ],
      createdAt: 10
    })

    expect(projection.recentMessages).toEqual([
      {
        messageId: 'message-new',
        role: 'user',
        content: 'new topic'
      }
    ])
    expect(projection.excluded).toEqual([
      { messageId: 'message-old', reason: 'unrelated' },
      { messageId: 'assistant-old', reason: 'runtime_handle' }
    ])
    expect(projection.digest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps the latest three selected turns and compacts older sources', () => {
    const history = Array.from({ length: 8 }, (_, index) => ({
      id: `${index % 2 === 0 ? 'user' : 'assistant'}-${index}`,
      role: (index % 2 === 0 ? 'user' : 'assistant') as
        | 'user'
        | 'assistant',
      content:
        index === 0
          ? 'old objective with browser-dead-session'
          : `stable content ${index}`,
      sortOrder: index
    }))
    const projection = projector.project({
      conversationId: 'conversation-1',
      sourceMessage: {
        id: 'message-new',
        role: 'user',
        content: 'continue',
        sortOrder: 8
      },
      route: route({
        relation: 'continuation',
        selectedMessageIds: history.map(({ id }) => id),
        excludedMessageIds: []
      }),
      history,
      createdAt: 11
    })

    expect(projection.recentMessages.map(({ messageId }) => messageId)).toEqual([
      'user-2',
      'assistant-3',
      'user-4',
      'assistant-5',
      'user-6',
      'assistant-7',
      'message-new'
    ])
    expect(projection.compactedFacts).toEqual([
      expect.objectContaining({
        sourceMessageIds: ['user-0', 'assistant-1'],
        objective: 'old objective with [runtime resource omitted]',
        stableReferences: []
      })
    ])
  })

  it('prunes tool results and preserves the current message under budget pressure', () => {
    const projection = new ConversationContextProjector({
      maxCharacters: 20
    }).project({
      conversationId: 'conversation-1',
      sourceMessage: {
        id: 'message-new',
        role: 'user',
        content: 'current message must remain',
        sortOrder: 2
      },
      route: route({
        relation: 'continuation',
        selectedMessageIds: ['tool-old', 'assistant-old'],
        excludedMessageIds: []
      }),
      history: [
        {
          id: 'tool-old',
          role: 'tool',
          content: '<html>large result</html>',
          sortOrder: 0
        },
        {
          id: 'assistant-old',
          role: 'assistant',
          content: 'older answer',
          sortOrder: 1
        }
      ],
      createdAt: 12
    })

    expect(projection.recentMessages).toEqual([
      {
        messageId: 'message-new',
        role: 'user',
        content: 'current message must remain'
      }
    ])
    expect(projection.excluded).toEqual(
      expect.arrayContaining([
        { messageId: 'tool-old', reason: 'tool_result_pruned' },
        { messageId: 'assistant-old', reason: 'budget' }
      ])
    )
  })

  it('adds trusted recalled memory after turn context within the remaining budget', () => {
    const projection = new ConversationContextProjector({
      maxCharacters: 80
    }).project({
      conversationId: 'conversation-1',
      sourceMessage: {
        id: 'message-new',
        role: 'user',
        content: 'Where is state stored?',
        sortOrder: 0
      },
      route: route({}),
      history: [],
      recalledMemory: [
        {
          id: 'memory-1',
          content: 'State is stored in local SQLite.',
          sourceMessageIds: ['message-memory'],
          score: 0.9
        },
        {
          id: 'memory-too-large',
          content: 'x'.repeat(100),
          sourceMessageIds: ['message-large'],
          score: 0.8
        }
      ],
      createdAt: 13
    })

    expect(projection.recalledMemory.map(({ id }) => id)).toEqual([
      'memory-1'
    ])
  })
})

function route(
  overrides: Partial<TurnContextRoute>
): TurnContextRoute {
  return {
    schemaVersion: 1,
    policyVersion: '1.0.0',
    sourceMessageId: 'message-new',
    sourceDigest: 'digest-new',
    relation: 'fresh',
    selectedMessageIds: [],
    excludedMessageIds: [],
    reasons: ['topic_changed'],
    confidence: 0.8,
    createdAt: 10,
    ...overrides
  }
}
