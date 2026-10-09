import { describe, expect, it } from 'vitest'
import {
  getAllowedNodeTodoTransitions,
  transitionNodeTodoStatus
} from './node-todo'

describe('node todo state machine', () => {
  it.each([
    ['pending', ['in_progress', 'completed', 'blocked', 'cancelled']],
    ['in_progress', ['completed', 'blocked', 'cancelled']],
    ['blocked', ['in_progress', 'cancelled']],
    ['completed', []],
    ['cancelled', []]
  ] as const)('lists transitions from %s', (status, expected) => {
    expect(getAllowedNodeTodoTransitions(status)).toEqual(expected)
  })

  it('returns the current status for an idempotent transition', () => {
    expect(transitionNodeTodoStatus('blocked', 'blocked')).toEqual({
      changed: false,
      status: 'blocked'
    })
  })

  it('accepts a legal transition', () => {
    expect(transitionNodeTodoStatus('pending', 'completed')).toEqual({
      changed: true,
      status: 'completed'
    })
  })

  it('rejects an illegal transition', () => {
    expect(() => transitionNodeTodoStatus('completed', 'pending')).toThrow(
      'Node todo cannot transition from completed to pending'
    )
  })
})
