import { describe, expect, it, vi } from 'vitest'
import { createRealmFlowApi } from '../preload-api'
import { registerSkillRegistryIpc } from './skill-registry-ipc'

describe('Skill Registry IPC', () => {
  it('exposes typed list, synchronization, review and activation calls', async () => {
    const invoke = vi.fn()
    const api = createRealmFlowApi(
      { invoke, on: vi.fn(), removeListener: vi.fn() },
      'darwin',
    )
    const review = {
      skillId: 'workspace.review',
      version: '1.0.0',
      digest: 'a'.repeat(64),
      status: 'approved' as const,
      notes: '',
      expectedRevision: 1,
      requestId: 'review-one',
    }
    const activation = {
      skillId: 'workspace.review',
      version: '1.0.0',
      digest: 'a'.repeat(64),
      enabled: true,
      expectedRevision: 1,
      requestId: 'activation-one',
    }
    await api.skillRegistry!.list()
    await api.skillRegistry!.synchronize()
    await api.skillRegistry!.review(review)
    await api.skillRegistry!.setActivation(activation)
    expect(invoke.mock.calls).toEqual([
      ['skill-registry:list'],
      ['skill-registry:synchronize'],
      ['skill-registry:review', review],
      ['skill-registry:set-activation', activation],
    ])
  })

  it('strictly validates commands before dispatching to the Main service', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const service = {
      list: vi.fn(() => []),
      review: vi.fn(),
      setActivation: vi.fn(),
    }
    const synchronize = vi.fn(async () => ({ published: 2, errorCount: 0 }))
    registerSkillRegistryIpc({
      service,
      synchronize,
      ipcMain: {
        handle: (name, handler) =>
          handlers.set(name, handler as (...args: unknown[]) => unknown),
      },
    })

    expect(handlers.get('skill-registry:list')!({})).toEqual([])
    expect(() => handlers.get('skill-registry:list')!({}, {})).toThrow()
    await expect(
      handlers.get('skill-registry:synchronize')!({}),
    ).resolves.toEqual({ published: 2, errorCount: 0 })
    expect(() =>
      handlers.get('skill-registry:review')!(
        {},
        {
          skillId: 'workspace.review',
          version: '1.0.0',
          digest: 'a'.repeat(64),
          status: 'pending',
          notes: '',
          expectedRevision: 1,
          requestId: 'review-one',
        },
      ),
    ).toThrow()
    expect(() =>
      handlers.get('skill-registry:set-activation')!(
        {},
        {
          skillId: 'workspace.review',
          version: '1.0.0',
          digest: 'short',
          enabled: true,
          expectedRevision: 1,
          requestId: 'activation-one',
        },
      ),
    ).toThrow()
    expect(service.review).not.toHaveBeenCalled()
    expect(service.setActivation).not.toHaveBeenCalled()
  })
})
