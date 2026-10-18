import { afterEach, describe, expect, it, vi } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteConversationContextRepository } from './conversation-context-repository'
import { SqliteChatSessionRepository } from './repositories'

let database: RealmFlowDatabase

afterEach(() => {
  if (database?.open) database.close()
})

describe('SqliteChatSessionRepository.listTurns', () => {
  it('pages newest Turns with an opaque stable cursor and batch hydrates messages', async () => {
    database = openRealmFlowDatabase(':memory:')
    const repository = new SqliteChatSessionRepository(database)
    await repository.save(session(5), 0)
    const prepare = vi.spyOn(database, 'prepare')

    const latest = await repository.listTurns({
      sessionId: 'session-1',
      limit: 2
    })
    expect(latest).toMatchObject({
      totalCount: 5,
      turns: [{ index: 3 }, { index: 4 }],
      messages: [
        { id: 'user-3' },
        { id: 'assistant-3' },
        { id: 'user-4' },
        { id: 'assistant-4' }
      ],
      nextCursor: expect.any(String)
    })
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(2)

    const middle = await repository.listTurns({
      sessionId: 'session-1',
      cursor: latest.nextCursor,
      limit: 2
    })
    expect(middle.turns.map(({ index }) => index)).toEqual([1, 2])
    const oldest = await repository.listTurns({
      sessionId: 'session-1',
      cursor: middle.nextCursor,
      limit: 2
    })
    expect(oldest.turns.map(({ index }) => index)).toEqual([0])
    expect(oldest.nextCursor).toBeUndefined()
  })

  it('rejects invalid cursors and out-of-range limits before querying', async () => {
    database = openRealmFlowDatabase(':memory:')
    const repository = new SqliteChatSessionRepository(database)
    await repository.save(session(1), 0)

    await expect(
      repository.listTurns({
        sessionId: 'session-1',
        cursor: 'not-a-cursor',
        limit: 20
      })
    ).rejects.toThrow('conversation_turn_cursor_invalid')
    await expect(
      repository.listTurns({ sessionId: 'session-1', limit: 0 })
    ).rejects.toThrow('conversation_turn_page_invalid')
  })

  it('loads the history window ending at an FTS search result Turn', async () => {
    database = openRealmFlowDatabase(':memory:')
    const repository = new SqliteChatSessionRepository(database)
    await repository.save(session(5), 0)
    const [hit] = new SqliteConversationContextRepository(database)
      .searchTranscript({
        conversationId: 'session-1',
        query: 'Question 3',
        limit: 1
      })

    expect(hit?.turnId).toBe('turn-3')
    await expect(repository.listTurns({
      sessionId: 'session-1',
      anchorTurnId: hit.turnId,
      limit: 2
    })).resolves.toMatchObject({
      turns: [{ id: 'turn-2' }, { id: 'turn-3' }],
      nextCursor: expect.any(String)
    })
  })
})

function session(count: number) {
  return {
    id: 'session-1',
    kind: 'general' as const,
    title: 'Conversation',
    sortOrder: 0,
    turns: Array.from({ length: count }, (_, index) => ({
      id: `turn-${index}`,
      sessionId: 'session-1',
      index,
      userMessageId: `user-${index}`,
      assistantMessageId: `assistant-${index}`,
      status: 'completed' as const,
      createdAt: index * 2 + 1,
      completedAt: index * 2 + 2
    })),
    messages: Array.from({ length: count }, (_, index) => [
      {
        id: `user-${index}`,
        turnId: `turn-${index}`,
        role: 'user' as const,
        status: 'completed' as const,
        content: `Question ${index}`,
        sortOrder: index * 2,
        createdAt: index * 2 + 1
      },
      {
        id: `assistant-${index}`,
        turnId: `turn-${index}`,
        role: 'assistant' as const,
        status: 'completed' as const,
        content: `Answer ${index}`,
        sortOrder: index * 2 + 1,
        createdAt: index * 2 + 1,
        completedAt: index * 2 + 2
      }
    ]).flat(),
    createdAt: 1,
    updatedAt: count * 2
  }
}
