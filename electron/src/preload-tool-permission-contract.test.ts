import { describe, expect, it, vi } from 'vitest'
import { createRealmFlowApi } from './preload-api'

describe('preload Tool permission contract', () => {
  it('exposes only list, resolve, and invalidation operations', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const on = vi.fn()
    const removeListener = vi.fn()
    const api = createRealmFlowApi(
      { invoke, on, removeListener },
      'darwin'
    ) as unknown as {
      toolPermissions: {
        listPending(): Promise<unknown>
        resolve(command: {
          requestId: string
          expectedRevision: number
          decision: 'allow_once' | 'deny'
        }): Promise<unknown>
        onChanged(listener: () => void): () => void
      }
    }
    const listener = vi.fn()

    await api.toolPermissions.listPending()
    await api.toolPermissions.resolve({
      requestId: 'permission-1',
      expectedRevision: 1,
      decision: 'allow_once'
    })
    const unsubscribe = api.toolPermissions.onChanged(listener)

    expect(invoke.mock.calls).toEqual([
      ['tool-permission:list-pending'],
      [
        'tool-permission:resolve',
        {
          requestId: 'permission-1',
          expectedRevision: 1,
          decision: 'allow_once'
        }
      ]
    ])
    expect(on).toHaveBeenCalledWith(
      'tool-permission:changed',
      expect.any(Function)
    )
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(
      'tool-permission:changed',
      expect.any(Function)
    )
  })
})
