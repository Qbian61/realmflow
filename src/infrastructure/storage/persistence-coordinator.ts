import {
  PERSISTENCE_DATASETS,
  PERSISTENCE_SCHEMA_VERSION,
  type PersistenceDataset
} from './persistence-registry'
import type { StorageAdapter } from './versioned-repository'

export type StorageEventSource = {
  addEventListener: (
    type: 'storage',
    listener: (event: { key: string | null }) => void
  ) => void
  removeEventListener: (
    type: 'storage',
    listener: (event: { key: string | null }) => void
  ) => void
}

export type PersistenceSnapshot = {
  schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION
  exportedAt: number
  records: Partial<Record<PersistenceDataset, string>>
}

const datasetEntries = Object.entries(PERSISTENCE_DATASETS) as [
  PersistenceDataset,
  (typeof PERSISTENCE_DATASETS)[PersistenceDataset]
][]

export function createPersistenceCoordinator(
  storage: StorageAdapter,
  events?: StorageEventSource
) {
  return {
    exportSnapshot(): PersistenceSnapshot {
      const records: PersistenceSnapshot['records'] = {}
      for (const [dataset, definition] of datasetEntries) {
        const value = storage.getItem(definition.key)
        if (value !== null) records[dataset] = value
      }
      return {
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        exportedAt: Date.now(),
        records
      }
    },

    restoreSnapshot(snapshot: PersistenceSnapshot): void {
      if (snapshot.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) {
        throw new Error('Unsupported persistence snapshot version')
      }
      const previous = new Map(
        datasetEntries.map(([, definition]) => [
          definition.key,
          storage.getItem(definition.key)
        ])
      )

      try {
        for (const [dataset, definition] of datasetEntries) {
          const value = snapshot.records[dataset]
          if (value === undefined) storage.removeItem(definition.key)
          else storage.setItem(definition.key, value)
        }
      } catch (error) {
        for (const [, definition] of datasetEntries) {
          const value = previous.get(definition.key)
          if (value === null || value === undefined) {
            storage.removeItem(definition.key)
          } else {
            storage.setItem(definition.key, value)
          }
        }
        throw error
      }
    },

    subscribe(listener: (dataset: PersistenceDataset) => void): () => void {
      if (!events) return () => undefined
      const onStorage = (event: { key: string | null }): void => {
        const entry = datasetEntries.find(
          ([, definition]) => definition.key === event.key
        )
        if (entry) listener(entry[0])
      }
      events.addEventListener('storage', onStorage)
      return () => events.removeEventListener('storage', onStorage)
    }
  }
}
