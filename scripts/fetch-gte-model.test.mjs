import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGteModel } from './fetch-gte-model.mjs'

describe('fetchGteModel recovery', () => {
  let directory

  afterEach(async () => {
    vi.unstubAllGlobals()
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('replaces a checksum-damaged asset from its pinned source', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-gte-recovery-'))
    const expected = 'licensed model asset'
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        model: 'Alibaba-NLP/gte-multilingual-base',
        revision: '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        dimensions: 768,
        runtime: 'onnxruntime-cpu',
        files: [
          {
            path: 'LICENSE',
            size: Buffer.byteLength(expected),
            sha256: createHash('sha256').update(expected).digest('hex')
          }
        ]
      })
    )
    await writeFile(join(directory, 'LICENSE'), 'checksum-damaged')
    const request = vi.fn().mockResolvedValue(
      new Response(expected, { status: 200 })
    )
    vi.stubGlobal('fetch', request)

    await fetchGteModel(directory)

    await expect(readFile(join(directory, 'LICENSE'), 'utf8')).resolves.toBe(
      expected
    )
    expect(request).toHaveBeenCalledTimes(1)
    await expect(
      readFile(join(directory, `LICENSE.${process.pid}.tmp`), 'utf8')
    ).rejects.toThrow()
  })
})
