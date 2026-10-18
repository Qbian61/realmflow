import { describe, expect, it } from 'vitest'
import {
  isTerminalConversationTurnStatus,
  validateConversationTurn,
  validateConversationTurns,
  type ConversationTurn
} from './conversation-turn'

function turn(
  overrides: Partial<ConversationTurn> = {}
): ConversationTurn {
  return {
    id: 'turn-1',
    sessionId: 'session-1',
    index: 0,
    userMessageId: 'message-user-1',
    assistantMessageId: 'message-assistant-1',
    status: 'running',
    createdAt: 100,
    ...overrides
  }
}

describe('conversation turn', () => {
  it('accepts exactly one distinct user and assistant message binding', () => {
    expect(validateConversationTurn(turn())).toEqual(turn())

    expect(() =>
      validateConversationTurn(
        turn({ assistantMessageId: 'message-user-1' })
      )
    ).toThrow(/distinct user and assistant messages/i)
    expect(() =>
      validateConversationTurn(turn({ userMessageId: '' }))
    ).toThrow(/user message/i)
    expect(() =>
      validateConversationTurn(turn({ assistantMessageId: '' }))
    ).toThrow(/assistant message/i)
  })

  it('requires a non-negative session-local integer index', () => {
    expect(() => validateConversationTurn(turn({ index: -1 }))).toThrow(
      /index/i
    )
    expect(() => validateConversationTurn(turn({ index: 0.5 }))).toThrow(
      /index/i
    )
  })

  it('rejects duplicate indexes and message bindings within a session', () => {
    expect(() =>
      validateConversationTurns([
        turn(),
        turn({
          id: 'turn-2',
          userMessageId: 'message-user-2',
          assistantMessageId: 'message-assistant-2'
        })
      ])
    ).toThrow(/index/i)

    expect(() =>
      validateConversationTurns([
        turn(),
        turn({
          id: 'turn-2',
          index: 1,
          assistantMessageId: 'message-assistant-2'
        })
      ])
    ).toThrow(/message binding/i)
  })

  it('requires terminal completion timestamps and rejects them before creation', () => {
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      expect(() => validateConversationTurn(turn({ status }))).toThrow(
        /completion timestamp/i
      )
      expect(() =>
        validateConversationTurn(
          turn({ status, completedAt: 99 })
        )
      ).toThrow(/before creation/i)
      expect(
        validateConversationTurn(turn({ status, completedAt: 100 }))
      ).toMatchObject({ status, completedAt: 100 })
    }
  })

  it('forbids completion timestamps on non-terminal turns', () => {
    expect(() =>
      validateConversationTurn(turn({ completedAt: 101 }))
    ).toThrow(/non-terminal/i)
    expect(isTerminalConversationTurnStatus('completed')).toBe(true)
    expect(isTerminalConversationTurnStatus('running')).toBe(false)
  })
})
