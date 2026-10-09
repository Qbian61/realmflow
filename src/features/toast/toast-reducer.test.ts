import { describe, expect, it } from 'vitest'
import {
  initialToastState,
  toastReducer
} from './toast-reducer'
import type { ToastMessage } from './toast-types'

function message(
  id: string,
  overrides: Partial<ToastMessage> = {}
): ToastMessage {
  return {
    id,
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    level: 'error',
    messageKey: 'app.persistenceUnavailable',
    ...overrides
  }
}

describe('toastReducer', () => {
  it('appends messages in FIFO order', () => {
    const first = message('toast-1')
    const second = message('toast-2')

    const withFirst = toastReducer(initialToastState, {
      type: 'enqueue',
      message: first
    })
    const withSecond = toastReducer(withFirst, {
      type: 'enqueue',
      message: second
    })

    expect(withSecond.queue).toEqual([first, second])
  })

  it('removes a message by id without reordering the queue', () => {
    const first = message('toast-1')
    const second = message('toast-2')
    const third = message('toast-3')
    const state = { queue: [first, second, third] }

    expect(
      toastReducer(state, { type: 'remove', id: second.id }).queue
    ).toEqual([first, third])
  })

  it('removes only the queue head', () => {
    const first = message('toast-1')
    const second = message('toast-2')
    const state = { queue: [first, second] }

    expect(toastReducer(state, { type: 'remove-head' }).queue).toEqual([
      second
    ])
  })

  it('ignores an enqueue when its dedupe key is already queued', () => {
    const first = message('toast-1', { dedupeKey: 'workspace-root-required' })
    const duplicate = message('toast-2', {
      dedupeKey: 'workspace-root-required'
    })
    const state = { queue: [first] }

    expect(
      toastReducer(state, { type: 'enqueue', message: duplicate })
    ).toBe(state)
  })

  it('allows the same dedupe key after the previous message is removed', () => {
    const first = message('toast-1', { dedupeKey: 'workspace-root-required' })
    const next = message('toast-2', {
      dedupeKey: 'workspace-root-required'
    })
    const removed = toastReducer(
      { queue: [first] },
      { type: 'remove-head' }
    )

    expect(
      toastReducer(removed, { type: 'enqueue', message: next }).queue
    ).toEqual([next])
  })
})
