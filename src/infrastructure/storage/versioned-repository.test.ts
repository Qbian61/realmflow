import {
  createVersionedRepository,
  type StorageAdapter
} from './versioned-repository'

function createStorage(
  initial: Record<string, string> = {}
): StorageAdapter & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    }
  }
}

describe('createVersionedRepository', () => {
  it('loads the current value through the codec', () => {
    const storage = createStorage({
      current: JSON.stringify({ version: 2, value: 'saved' })
    })
    const repository = createVersionedRepository({
      storage,
      key: 'current',
      legacyKeys: ['legacy'],
      fallback: () => 'default',
      decode: (value) => {
        const record = value as { version?: unknown; value?: unknown }
        return record.version === 2 && typeof record.value === 'string'
          ? record.value
          : null
      },
      encode: (value) => ({ version: 2, value })
    })

    expect(repository.load()).toEqual({
      value: 'saved',
      revision: 0
    })
  })

  it('falls back when stored JSON is invalid or rejected by the codec', () => {
    const malformed = createVersionedRepository({
      storage: createStorage({ current: '{' }),
      key: 'current',
      fallback: () => 'default',
      decode: () => null,
      encode: (value) => value
    })
    const rejected = createVersionedRepository({
      storage: createStorage({ current: JSON.stringify({ version: 1 }) }),
      key: 'current',
      fallback: () => 'default',
      decode: () => null,
      encode: (value) => value
    })

    expect(malformed.load()).toEqual({
      value: 'default',
      revision: 0
    })
    expect(rejected.load()).toEqual({
      value: 'default',
      revision: 0
    })
  })

  it('migrates from the first readable legacy key and removes legacy data on save', () => {
    const storage = createStorage({
      legacy: JSON.stringify({ version: 1, value: 'legacy' })
    })
    const repository = createVersionedRepository({
      storage,
      key: 'current',
      legacyKeys: ['legacy'],
      fallback: () => 'default',
      decode: (value) => {
        const record = value as { value?: unknown }
        return typeof record.value === 'string' ? record.value : null
      },
      encode: (value) => ({ version: 2, value })
    })

    expect(repository.load()).toEqual({
      value: 'legacy',
      revision: 0
    })
    expect(repository.save('next', 0)).toEqual({
      status: 'saved',
      snapshot: {
        value: 'next',
        revision: 1
      }
    })

    expect(storage.values.get('current')).toBe(
      JSON.stringify({
        revision: 1,
        value: { version: 2, value: 'next' }
      })
    )
    expect(storage.values.has('legacy')).toBe(false)
  })

  it('increments the revision after each successful save', () => {
    const storage = createStorage()
    const repository = createVersionedRepository({
      storage,
      key: 'current',
      fallback: () => 'default',
      decode: (value) => {
        const record = value as { value?: unknown }
        return typeof record.value === 'string' ? record.value : null
      },
      encode: (value) => ({ value })
    })

    expect(repository.save('first', 0)).toEqual({
      status: 'saved',
      snapshot: {
        value: 'first',
        revision: 1
      }
    })
    expect(repository.save('second', 1)).toEqual({
      status: 'saved',
      snapshot: {
        value: 'second',
        revision: 2
      }
    })
    expect(repository.load()).toEqual({
      value: 'second',
      revision: 2
    })
  })

  it('rejects a stale save without overwriting the latest value', () => {
    const storage = createStorage()
    const firstWindow = createVersionedRepository({
      storage,
      key: 'current',
      fallback: () => 'default',
      decode: (value) => {
        const record = value as { value?: unknown }
        return typeof record.value === 'string' ? record.value : null
      },
      encode: (value) => ({ value })
    })
    const secondWindow = createVersionedRepository({
      storage,
      key: 'current',
      fallback: () => 'default',
      decode: (value) => {
        const record = value as { value?: unknown }
        return typeof record.value === 'string' ? record.value : null
      },
      encode: (value) => ({ value })
    })
    const firstSnapshot = firstWindow.load()
    const secondSnapshot = secondWindow.load()

    expect(firstWindow.save('first update', firstSnapshot.revision)).toEqual({
      status: 'saved',
      snapshot: {
        value: 'first update',
        revision: 1
      }
    })
    expect(secondWindow.save('stale update', secondSnapshot.revision)).toEqual({
      status: 'conflict',
      snapshot: {
        value: 'first update',
        revision: 1
      }
    })
    expect(firstWindow.load()).toEqual({
      value: 'first update',
      revision: 1
    })
  })

  it('keeps the application usable when storage operations throw', () => {
    const storage: StorageAdapter = {
      getItem: () => {
        throw new Error('unavailable')
      },
      setItem: () => {
        throw new Error('unavailable')
      },
      removeItem: () => {
        throw new Error('unavailable')
      }
    }
    const repository = createVersionedRepository({
      storage,
      key: 'current',
      fallback: () => 'default',
      decode: () => null,
      encode: (value) => value
    })

    expect(repository.load()).toEqual({
      value: 'default',
      revision: 0
    })
    expect(repository.save('next', 0)).toEqual({
      status: 'unavailable',
      snapshot: {
        value: 'next',
        revision: 0
      }
    })
  })
})
