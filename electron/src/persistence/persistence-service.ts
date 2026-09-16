import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  PersistenceChangedEvent,
  PersistenceDataset,
  PersistenceLoadResult,
  PersistenceSaveResult,
  PersistenceSnapshot
} from '../../../shared/persistence'

type PersistenceStore = Partial<
  Record<PersistenceDataset, PersistenceSnapshot>
>

export class PersistenceService {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly onChanged: (event: PersistenceChangedEvent) => void
  ) {}

  load(dataset: PersistenceDataset): Promise<PersistenceLoadResult> {
    return this.runExclusive(async () => {
      try {
        const store = await this.readStore()
        return {
          status: 'loaded',
          snapshot: store[dataset] ?? { revision: 0, value: null }
        }
      } catch {
        return { status: 'unavailable' }
      }
    })
  }

  save(
    dataset: PersistenceDataset,
    value: unknown,
    expectedRevision: number
  ): Promise<PersistenceSaveResult> {
    return this.runExclusive(async () => {
      try {
        const store = await this.readStore()
        const current = store[dataset] ?? { revision: 0, value: null }
        if (current.revision !== expectedRevision) {
          return { status: 'conflict', snapshot: current }
        }
        const snapshot = {
          revision: expectedRevision + 1,
          value
        }
        await this.writeStore({ ...store, [dataset]: snapshot })
        this.onChanged({ dataset, revision: snapshot.revision })
        return { status: 'saved', snapshot }
      } catch {
        return { status: 'unavailable' }
      }
    })
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async readStore(): Promise<PersistenceStore> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown
      if (!isPersistenceStore(parsed)) throw new Error('Invalid persistence store')
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }

  private async writeStore(store: PersistenceStore): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.filePath)
  }
}

function isPersistenceStore(value: unknown): value is PersistenceStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(
    (snapshot) =>
      snapshot !== undefined &&
      typeof snapshot === 'object' &&
      snapshot !== null &&
      'revision' in snapshot &&
      typeof snapshot.revision === 'number' &&
      Number.isSafeInteger(snapshot.revision) &&
      snapshot.revision >= 0 &&
      'value' in snapshot
  )
}
