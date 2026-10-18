import { describe, expect, it, vi } from 'vitest'
import {
  ConversationTurnViewAssembler,
  type ConversationTurnPage
} from './conversation-turn-view-assembler'

describe('ConversationTurnViewAssembler', () => {
  it('assembles one stable view per Turn without per-Turn repository reads', async () => {
    const page = turnPage()
    const listTurns = vi.fn(async () => page)
    const assembler = new ConversationTurnViewAssembler({ listTurns })

    await expect(
      assembler.execute({ sessionId: 'session-1', limit: 20 })
    ).resolves.toEqual({
      turns: [
        {
          id: 'turn-1',
          index: 0,
          status: 'completed',
          userMessage: expect.objectContaining({
            id: 'user-1',
            turnId: 'turn-1',
            role: 'user'
          }),
          assistantMessage: expect.objectContaining({
            id: 'assistant-1',
            turnId: 'turn-1',
            role: 'assistant'
          }),
          execution: page.projections[0],
          isLast: false,
          isHistory: true
        },
        {
          id: 'turn-2',
          index: 1,
          status: 'running',
          userMessage: expect.objectContaining({ id: 'user-2' }),
          assistantMessage: expect.objectContaining({ id: 'assistant-2' }),
          isLast: true,
          isHistory: false
        }
      ],
      nextCursor: 'cursor-1',
      totalCount: 2
    })
    expect(listTurns).toHaveBeenCalledOnce()
  })

  it('rejects missing or cross-Turn message bindings', async () => {
    const page = turnPage()
    const assembler = new ConversationTurnViewAssembler({
      listTurns: async () => ({
        ...page,
        messages: page.messages.filter(({ id }) => id !== 'assistant-2')
      })
    })

    await expect(
      assembler.execute({ sessionId: 'session-1', limit: 20 })
    ).rejects.toThrow('conversation_turn_view_invalid')
  })
})

function turnPage(): ConversationTurnPage {
  return {
    turns: [
      {
        id: 'turn-1',
        sessionId: 'session-1',
        index: 0,
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        runId: 'run-1',
        status: 'completed',
        createdAt: 1,
        completedAt: 2
      },
      {
        id: 'turn-2',
        sessionId: 'session-1',
        index: 1,
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        runId: 'run-2',
        status: 'running',
        createdAt: 3
      }
    ],
    messages: [
      {
        id: 'user-1',
        sessionId: 'session-1',
        turnId: 'turn-1',
        role: 'user',
        status: 'completed',
        content: 'Question 1',
        createdAt: 1
      },
      {
        id: 'assistant-1',
        sessionId: 'session-1',
        turnId: 'turn-1',
        role: 'assistant',
        status: 'completed',
        content: 'Answer 1',
        createdAt: 1,
        completedAt: 2
      },
      {
        id: 'user-2',
        sessionId: 'session-1',
        turnId: 'turn-2',
        role: 'user',
        status: 'completed',
        content: 'Question 2',
        createdAt: 3
      },
      {
        id: 'assistant-2',
        sessionId: 'session-1',
        turnId: 'turn-2',
        role: 'assistant',
        status: 'pending',
        content: '',
        createdAt: 3
      }
    ],
    projections: [
      {
        schemaVersion: 2,
        runId: 'run-1',
        turnId: 'turn-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        startedAt: 1,
        completedAt: 2,
        answer: 'Answer 1',
        tree: [],
        collapsedDefaults: [],
        executionSummaries: [],
        references: [],
        toolCalls: [],
        delegations: [],
        compactions: [],
        lastSequence: 1
      }
    ],
    nextCursor: 'cursor-1',
    totalCount: 2
  }
}
