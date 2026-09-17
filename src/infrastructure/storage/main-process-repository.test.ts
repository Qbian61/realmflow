import { vi } from 'vitest'
import type { PersistenceApi } from '../../../shared/persistence'
import { createMainProcessRepository } from './main-process-repository'

function createPersistenceApi(
  initial: { revision: number; value: unknown } = {
    revision: 1,
    value: 'default'
  }
): PersistenceApi {
  let snapshot = initial
  return {
    load: vi.fn(async () => ({ status: 'loaded' as const, snapshot })),
    save: vi.fn(async (_dataset, value, expectedRevision) => {
      if (snapshot.revision !== expectedRevision) {
        return { status: 'conflict' as const, snapshot }
      }
      snapshot = { revision: expectedRevision + 1, value }
      return { status: 'saved' as const, snapshot }
    }),
    onChanged: vi.fn(() => () => undefined)
  }
}

describe('createMainProcessRepository', () => {
  it('hydrates its initial snapshot before use without writing', async () => {
    const persistence = createPersistenceApi({
      revision: 4,
      value: ['persisted']
    })
    const repository = await createMainProcessRepository({
      dataset: 'chatSessions',
      persistence,
      fallback: () => [],
      decode: (value) => (Array.isArray(value) ? value as string[] : null),
      encode: (value) => value
    })

    expect(repository.getSnapshot()).toEqual({
      value: ['persisted'],
      revision: 4
    })
    expect(persistence.save).not.toHaveBeenCalled()
  })

  it('returns the latest decoded snapshot after a stale save', async () => {
    const persistence = createPersistenceApi()
    const first = await createMainProcessRepository({
      dataset: 'workspaceNavigation',
      persistence,
      fallback: () => 'default',
      decode: (value) => typeof value === 'string' ? value : null,
      encode: (value) => value
    })
    const second = await createMainProcessRepository({
      dataset: 'workspaceNavigation',
      persistence,
      fallback: () => 'default',
      decode: (value) => typeof value === 'string' ? value : null,
      encode: (value) => value
    })

    await expect(first.save('first', 1)).resolves.toMatchObject({
      status: 'saved'
    })
    await expect(second.save('second', 1)).resolves.toEqual({
      status: 'conflict',
      snapshot: {
        value: 'first',
        revision: 2
      }
    })
  })

  it('refreshes its cached snapshot before notifying subscribers', async () => {
    const persistence = createPersistenceApi()
    let changed:
      | ((event: {
          dataset: 'spaceResources'
          revision: number
        }) => void)
      | undefined
    persistence.onChanged = vi.fn((listener) => {
      changed = listener as typeof changed
      return () => undefined
    })
    const repository = await createMainProcessRepository({
      dataset: 'spaceResources',
      persistence,
      fallback: () => 'default',
      decode: (value) => typeof value === 'string' ? value : null,
      encode: (value) => value
    })
    const listener = vi.fn()
    repository.subscribe?.(listener)
    await persistence.save('spaceResources', 'remote', 1)

    changed?.({ dataset: 'spaceResources', revision: 2 })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    expect(repository.getSnapshot()).toEqual({ value: 'remote', revision: 2 })
  })

  it('rejects initialization failure without attempting a fallback write', async () => {
    const persistence = createPersistenceApi()
    persistence.load = vi.fn(async () => ({
      status: 'unavailable' as const
    }))
    await expect(
      createMainProcessRepository({
        dataset: 'chatSessions',
        persistence,
        fallback: () => [],
        decode: (value) => (Array.isArray(value) ? value as string[] : null),
        encode: (value) => value
      })
    ).rejects.toThrow('Repository is unavailable: chatSessions')
    expect(persistence.save).not.toHaveBeenCalled()
  })

  it('does not notify subscribers for its own in-flight revision', async () => {
    let changed:
      | ((event: {
          dataset: 'workspaceNavigation'
          revision: number
        }) => void)
      | undefined
    let resolveSave:
      | ((result: {
          status: 'saved'
          snapshot: { revision: number; value: string }
        }) => void)
      | undefined
    const persistence = createPersistenceApi()
    persistence.onChanged = vi.fn((listener) => {
      changed = listener as typeof changed
      return () => undefined
    })
    const repository = await createMainProcessRepository({
      dataset: 'workspaceNavigation',
      persistence,
      fallback: () => 'default',
      decode: (value) => typeof value === 'string' ? value : null,
      encode: (value) => value
    })
    persistence.save = vi.fn(
      () =>
        new Promise<{
          status: 'saved'
          snapshot: { revision: number; value: string }
        }>((resolve) => {
          resolveSave = resolve
        })
    )
    const listener = vi.fn()
    repository.subscribe?.(listener)

    const saving = repository.save('local', 1)
    changed?.({ dataset: 'workspaceNavigation', revision: 2 })
    resolveSave?.({
      status: 'saved',
      snapshot: { revision: 2, value: 'local' }
    })
    await saving

    expect(listener).not.toHaveBeenCalled()
  })
})
