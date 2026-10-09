export type RepositoryIndexManifestEntry = Readonly<{
  documentKey: string
  checksum: string
}>

export type RepositoryIndexManifestDiff<
  T extends RepositoryIndexManifestEntry
> = Readonly<{
  added: T[]
  changed: Array<{ previous: T; current: T }>
  unchanged: T[]
  deleted: T[]
}>

export function diffRepositoryIndexManifest<
  T extends RepositoryIndexManifestEntry
>(input: {
  previous: readonly T[]
  current: readonly T[]
}): RepositoryIndexManifestDiff<T> {
  const previous = indexManifest(input.previous)
  const current = indexManifest(input.current)
  const added: T[] = []
  const changed: Array<{ previous: T; current: T }> = []
  const unchanged: T[] = []
  const deleted: T[] = []

  for (const [documentKey, entry] of current) {
    const old = previous.get(documentKey)
    if (!old) added.push(entry)
    else if (old.checksum === entry.checksum) unchanged.push(entry)
    else changed.push({ previous: old, current: entry })
  }
  for (const [documentKey, entry] of previous) {
    if (!current.has(documentKey)) deleted.push(entry)
  }

  const byKey = (left: T, right: T) =>
    left.documentKey.localeCompare(right.documentKey)
  return {
    added: added.sort(byKey),
    changed: changed.sort((left, right) =>
      left.current.documentKey.localeCompare(right.current.documentKey)
    ),
    unchanged: unchanged.sort(byKey),
    deleted: deleted.sort(byKey)
  }
}

function indexManifest<T extends RepositoryIndexManifestEntry>(
  entries: readonly T[]
): Map<string, T> {
  const result = new Map<string, T>()
  for (const entry of entries) {
    if (!entry.documentKey || result.has(entry.documentKey)) {
      throw new Error(
        'Repository index manifest contains duplicate document keys'
      )
    }
    result.set(entry.documentKey, entry)
  }
  return result
}
