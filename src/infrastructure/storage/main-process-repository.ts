import type {
  PersistenceApi,
  PersistenceDataset,
  PersistenceSnapshot
} from '../../../shared/persistence'
import type {
  Repository,
  RepositorySaveResult,
  RepositorySnapshot
} from '../../application/ports/repositories'

type MainProcessRepositoryOptions<T> = {
  dataset: PersistenceDataset
  persistence: PersistenceApi
  legacySnapshot: () => RepositorySnapshot<T>
  fallback: () => T
  decode: (value: unknown) => T | null
  encode: (value: T) => unknown
}

export async function createMainProcessRepository<T>({
  dataset,
  persistence,
  legacySnapshot,
  fallback,
  decode,
  encode
}: MainProcessRepositoryOptions<T>): Promise<Repository<T>> {
  let snapshot: RepositorySnapshot<T> = {
    value: fallback(),
    revision: 0
  }
  let pendingRevision = 0
  let initializationUnavailable = false
  const listeners = new Set<() => void>()

  const decodeSnapshot = (
    persisted: PersistenceSnapshot
  ): RepositorySnapshot<T> | null => {
    const value = decode(persisted.value)
    return value === null
      ? null
      : { value, revision: persisted.revision }
  }

  const refresh = async (): Promise<boolean> => {
    const result = await persistence.load(dataset)
    if (result.status === 'unavailable') return false
    const decoded = decodeSnapshot(result.snapshot)
    if (!decoded) return false
    snapshot = decoded
    return true
  }

  const initial = await persistence.load(dataset)
  initializationUnavailable = initial.status === 'unavailable'
  if (
    initial.status === 'loaded' &&
    initial.snapshot.revision === 0 &&
    initial.snapshot.value === null
  ) {
    const legacy = legacySnapshot()
    const migrated = await persistence.save(
      dataset,
      encode(legacy.value),
      0
    )
    if (migrated.status !== 'unavailable') {
      snapshot =
        decodeSnapshot(migrated.snapshot) ?? {
          value: fallback(),
          revision: migrated.snapshot.revision
        }
    }
  } else if (initial.status === 'loaded') {
    snapshot =
      decodeSnapshot(initial.snapshot) ?? {
        value: fallback(),
        revision: initial.snapshot.revision
      }
  }

  persistence.onChanged((event) => {
    if (
      event.dataset !== dataset ||
      event.revision <= Math.max(snapshot.revision, pendingRevision)
    ) {
      return
    }
    void refresh().then((loaded) => {
      if (loaded) listeners.forEach((listener) => listener())
    })
  })

  return {
    load: () => snapshot,
    skipInitialSave: true,
    serializeSaves: true,
    initializationUnavailable,
    save: async (value, expectedRevision) => {
      const expectedSavedRevision = expectedRevision + 1
      pendingRevision = Math.max(pendingRevision, expectedSavedRevision)
      let result
      try {
        result = await persistence.save(
          dataset,
          encode(value),
          expectedRevision
        )
      } catch (error) {
        if (pendingRevision === expectedSavedRevision) pendingRevision = 0
        throw error
      }
      if (result.status === 'unavailable') {
        if (pendingRevision === expectedSavedRevision) pendingRevision = 0
        return {
          status: 'unavailable',
          snapshot: { value, revision: expectedRevision }
        }
      }
      const decoded =
        decodeSnapshot(result.snapshot) ?? {
          value: fallback(),
          revision: result.snapshot.revision
        }
      snapshot = decoded
      if (pendingRevision === expectedSavedRevision) pendingRevision = 0
      return {
        status: result.status,
        snapshot: decoded
      } as RepositorySaveResult<T>
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
