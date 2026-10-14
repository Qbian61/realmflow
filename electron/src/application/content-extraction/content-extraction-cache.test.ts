import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import { FileContentExtractionCache } from './content-extraction-cache'

describe('FileContentExtractionCache', () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('persists normalized bundles without original file bytes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-extraction-cache-'))
    const cache = new FileContentExtractionCache({
      rootPath: directory,
      now: () => 100
    })

    await cache.put('cache-key', bundle())

    await expect(cache.get('cache-key')).resolves.toEqual(bundle())
    const persisted = await readFile(
      join(directory, 'cache-key.json'),
      'utf8'
    )
    expect(persisted).toContain('normalized text')
    expect(persisted).not.toContain('original-secret-bytes')
  })

  it('removes corrupt and expired entries during reconciliation', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-extraction-cache-'))
    await writeFile(join(directory, 'corrupt.json'), '{')
    await writeFile(
      join(directory, 'expired.json'),
      JSON.stringify({ cachedAt: 1, bundle: bundle() })
    )
    const cache = new FileContentExtractionCache({
      rootPath: directory,
      maxAgeMs: 10,
      now: () => 100
    })

    await expect(cache.reconcile()).resolves.toEqual({
      removedCorrupt: 1,
      removedExpired: 1,
      removedOverflow: 0
    })
    await expect(cache.get('corrupt')).resolves.toBeUndefined()
    await expect(cache.get('expired')).resolves.toBeUndefined()
  })

  it('evicts the oldest entries above the byte budget', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-extraction-cache-'))
    let now = 1
    const cache = new FileContentExtractionCache({
      rootPath: directory,
      maxBytes: 650,
      now: () => now++
    })

    await cache.put('first', bundle('a'.repeat(180)))
    await cache.put('second', bundle('b'.repeat(180)))
    const report = await cache.reconcile()

    expect(report.removedOverflow).toBe(1)
    await expect(cache.get('first')).resolves.toBeUndefined()
    await expect(cache.get('second')).resolves.toBeDefined()
  })
})

function bundle(text = 'normalized text'): ExtractedContentBundle {
  return {
    sourceChecksum: `sha256:${'a'.repeat(64)}`,
    format: 'pdf',
    extractorVersion: 'pdf-v1',
    units: [
      {
        key: 'content',
        title: 'Invoice',
        text,
        checksum: `sha256:${'b'.repeat(64)}`,
        byteSize: text.length
      }
    ]
  }
}
