import {
  createPersistenceCoordinator,
  type PersistenceSnapshot
} from './persistence-coordinator'
import { PERSISTENCE_DATASETS } from './persistence-registry'
import type { StorageAdapter } from './versioned-repository'

function createStorage(initial: Record<string, string> = {}): {
  storage: StorageAdapter
  values: Map<string, string>
} {
  const values = new Map(Object.entries(initial))
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
      removeItem: (key) => {
        values.delete(key)
      }
    }
  }
}

describe('persistence coordinator', () => {
  it('exports only registered datasets in a versioned snapshot', () => {
    const navigation = PERSISTENCE_DATASETS.workspaceNavigation.key
    const { storage } = createStorage({
      [navigation]: '{"version":1}',
      unrelated: 'ignored'
    })

    const snapshot = createPersistenceCoordinator(storage).exportSnapshot()

    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.records).toEqual({
      workspaceNavigation: '{"version":1}'
    })
  })

  it('rolls back all registered records when restore fails', () => {
    const navigation = PERSISTENCE_DATASETS.workspaceNavigation.key
    const sessions = PERSISTENCE_DATASETS.chatSessions.key
    const { storage, values } = createStorage({
      [navigation]: 'old-navigation',
      [sessions]: 'old-sessions'
    })
    const originalSetItem = storage.setItem
    storage.setItem = (key, value) => {
      if (key === sessions && value === 'new-sessions') {
        throw new Error('quota exceeded')
      }
      originalSetItem(key, value)
    }
    const snapshot: PersistenceSnapshot = {
      schemaVersion: 1,
      exportedAt: 1,
      records: {
        workspaceNavigation: 'new-navigation',
        chatSessions: 'new-sessions'
      }
    }

    expect(() =>
      createPersistenceCoordinator(storage).restoreSnapshot(snapshot)
    ).toThrow('quota exceeded')
    expect(values.get(navigation)).toBe('old-navigation')
    expect(values.get(sessions)).toBe('old-sessions')
  })

  it('notifies subscribers only for registered storage keys', () => {
    const listeners = new Set<(event: { key: string | null }) => void>()
    const events = {
      addEventListener: (
        _type: 'storage',
        listener: (event: { key: string | null }) => void
      ) => listeners.add(listener),
      removeEventListener: (
        _type: 'storage',
        listener: (event: { key: string | null }) => void
      ) => listeners.delete(listener)
    }
    const { storage } = createStorage()
    const changed: string[] = []
    const unsubscribe = createPersistenceCoordinator(
      storage,
      events
    ).subscribe((dataset) => changed.push(dataset))

    for (const listener of listeners) {
      listener({ key: 'unrelated' })
      listener({ key: PERSISTENCE_DATASETS.spaceResources.key })
    }
    unsubscribe()

    expect(changed).toEqual(['spaceResources'])
    expect(listeners.size).toBe(0)
  })
})
