import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'
import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import type { ContentExtractionCache } from './local-content-extraction-service'

type CacheEnvelope = {
  cachedAt: number
  bundle: ExtractedContentBundle
}

export class FileContentExtractionCache implements ContentExtractionCache {
  private readonly maxBytes: number
  private readonly maxAgeMs: number
  private readonly now: () => number

  constructor(
    private readonly options: {
      rootPath: string
      maxBytes?: number
      maxAgeMs?: number
      now?: () => number
    }
  ) {
    this.maxBytes = options.maxBytes ?? 256 * 1024 * 1024
    this.maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000
    this.now = options.now ?? Date.now
  }

  async get(key: string): Promise<ExtractedContentBundle | undefined> {
    const path = this.path(key)
    try {
      const envelope = parseEnvelope(await readFile(path, 'utf8'))
      if (this.isExpired(envelope)) {
        await rm(path, { force: true })
        return undefined
      }
      return cloneBundle(envelope.bundle)
    } catch (error) {
      if (isMissing(error)) return undefined
      await rm(path, { force: true })
      return undefined
    }
  }

  async put(key: string, bundle: ExtractedContentBundle): Promise<void> {
    await mkdir(this.options.rootPath, { recursive: true })
    const target = this.path(key)
    const temporary = `${target}.${randomUUID()}.tmp`
    try {
      await writeFile(
        temporary,
        JSON.stringify({
          cachedAt: this.now(),
          bundle: cloneBundle(bundle)
        } satisfies CacheEnvelope),
        { encoding: 'utf8', flag: 'wx' }
      )
      await rename(temporary, target)
    } finally {
      await rm(temporary, { force: true })
    }
  }

  async reconcile(): Promise<{
    removedCorrupt: number
    removedExpired: number
    removedOverflow: number
  }> {
    await mkdir(this.options.rootPath, { recursive: true })
    const report = {
      removedCorrupt: 0,
      removedExpired: 0,
      removedOverflow: 0
    }
    const entries: Array<{
      path: string
      cachedAt: number
      bytes: number
    }> = []
    for (const name of await readdir(this.options.rootPath)) {
      const path = join(this.options.rootPath, name)
      if (!name.endsWith('.json')) {
        if (name.includes('.tmp')) await rm(path, { force: true })
        continue
      }
      try {
        const envelope = parseEnvelope(await readFile(path, 'utf8'))
        if (this.isExpired(envelope)) {
          await rm(path, { force: true })
          report.removedExpired += 1
          continue
        }
        entries.push({
          path,
          cachedAt: envelope.cachedAt,
          bytes: (await stat(path)).size
        })
      } catch {
        await rm(path, { force: true })
        report.removedCorrupt += 1
      }
    }
    let totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0)
    for (const entry of entries.sort(
      (left, right) => left.cachedAt - right.cachedAt
    )) {
      if (totalBytes <= this.maxBytes) break
      await rm(entry.path, { force: true })
      totalBytes -= entry.bytes
      report.removedOverflow += 1
    }
    return report
  }

  private path(key: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new Error('Content extraction cache key is invalid')
    }
    return join(this.options.rootPath, `${key}.json`)
  }

  private isExpired(envelope: CacheEnvelope): boolean {
    return this.now() - envelope.cachedAt > this.maxAgeMs
  }
}

function parseEnvelope(value: string): CacheEnvelope {
  const parsed: unknown = JSON.parse(value)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('cachedAt' in parsed) ||
    typeof parsed.cachedAt !== 'number' ||
    !Number.isFinite(parsed.cachedAt) ||
    !('bundle' in parsed) ||
    typeof parsed.bundle !== 'object' ||
    parsed.bundle === null ||
    !('units' in parsed.bundle) ||
    !Array.isArray(parsed.bundle.units)
  ) {
    throw new Error('Content extraction cache entry is invalid')
  }
  return parsed as CacheEnvelope
}

function cloneBundle(bundle: ExtractedContentBundle): ExtractedContentBundle {
  return {
    ...bundle,
    units: bundle.units.map((unit) => ({
      ...unit,
      ...(unit.metadata ? { metadata: { ...unit.metadata } } : {})
    }))
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
