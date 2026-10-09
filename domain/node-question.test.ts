import { describe, expect, it } from 'vitest'
import {
  transitionNodeQuestionStatus,
  type NodeQuestionState
} from './node-question'

function question(
  required: boolean,
  status: NodeQuestionState['status'] = 'open'
): NodeQuestionState {
  return { required, status }
}

describe('transitionNodeQuestionStatus', () => {
  it('answers an open question', () => {
    expect(
      transitionNodeQuestionStatus(question(true), 'answered')
    ).toEqual({
      changed: true,
      status: 'answered'
    })
  })

  it('dismisses an optional open question', () => {
    expect(
      transitionNodeQuestionStatus(question(false), 'dismissed')
    ).toEqual({
      changed: true,
      status: 'dismissed'
    })
  })

  it('rejects dismissing a required question', () => {
    expect(() =>
      transitionNodeQuestionStatus(question(true), 'dismissed')
    ).toThrow('Required node question cannot be dismissed')
  })

  it('treats a request for the current status as idempotent', () => {
    expect(
      transitionNodeQuestionStatus(question(true, 'answered'), 'answered')
    ).toEqual({
      changed: false,
      status: 'answered'
    })
  })

  it.each([
    ['answered', 'dismissed'],
    ['dismissed', 'answered']
  ] as const)('rejects transition from terminal %s to %s', (from, to) => {
    expect(() =>
      transitionNodeQuestionStatus(question(false, from), to)
    ).toThrow(`Node question cannot transition from ${from} to ${to}`)
  })
})
