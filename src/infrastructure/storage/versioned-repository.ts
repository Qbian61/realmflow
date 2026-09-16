import type {
  RepositorySaveResult,
  RepositorySnapshot
} from '../../application/ports/repositories'

export interface StorageAdapter {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

type VersionedRepositoryOptions<T> = {
  storage: StorageAdapter
  key: string
  legacyKeys?: string[]
  fallback: () => T
  decode: (value: unknown) => T | null
  encode: (value: T) => unknown
}

export type VersionedRepository<T> = {
  load: () => RepositorySnapshot<T>
  save: (
    value: T,
    expectedRevision: number
  ) => RepositorySaveResult<T>
}

type RevisionEnvelope = {
  revision: number
  value: unknown
}

function readEnvelope(value: unknown): RevisionEnvelope | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('revision' in value) ||
    !('value' in value)
  ) {
    return null
  }
  const revision = value.revision
  return typeof revision === 'number' &&
    Number.isSafeInteger(revision) &&
    revision >= 0
    ? { revision, value: value.value }
    : null
}

export function createVersionedRepository<T>({
  storage,
  key,
  legacyKeys = [],
  fallback,
  decode,
  encode
}: VersionedRepositoryOptions<T>): VersionedRepository<T> {
  const fallbackSnapshot = (): RepositorySnapshot<T> => ({
    value: fallback(),
    revision: 0
  })

  const load = (): RepositorySnapshot<T> => {
    try {
      const rawValue =
        storage.getItem(key) ??
        legacyKeys
          .map((legacyKey) => storage.getItem(legacyKey))
          .find((value) => value !== null)
      if (!rawValue) return fallbackSnapshot()
      const parsed = JSON.parse(rawValue)
      const envelope = readEnvelope(parsed)
      const decoded = decode(envelope?.value ?? parsed)
      return decoded === null
        ? fallbackSnapshot()
        : {
            value: decoded,
            revision: envelope?.revision ?? 0
          }
    } catch {
      return fallbackSnapshot()
    }
  }

  return {
    load,
    save: (value, expectedRevision) => {
      try {
        const current = load()
        if (current.revision !== expectedRevision) {
          return {
            status: 'conflict',
            snapshot: current
          }
        }
        const snapshot = {
          value,
          revision: expectedRevision + 1
        }
        storage.setItem(
          key,
          JSON.stringify({
            revision: snapshot.revision,
            value: encode(value)
          })
        )
        for (const legacyKey of legacyKeys) storage.removeItem(legacyKey)
        return {
          status: 'saved',
          snapshot
        }
      } catch {
        return {
          status: 'unavailable',
          snapshot: {
            value,
            revision: expectedRevision
          }
        }
      }
    }
  }
}
