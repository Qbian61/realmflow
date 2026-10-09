import { mkdtemp, readFile, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TemporaryToolArtifactStore } from './temporary-tool-artifact-store'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-tool-artifact-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('TemporaryToolArtifactStore', () => {
  it('writes content-addressed bytes with private file permissions', async () => {
    const store = new TemporaryToolArtifactStore(directory)

    const artifact = await store.createTemporary({
      executionId: 'execution-1',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
      expiresAt: 2_000
    })

    expect(artifact).toEqual({
      artifactId: expect.stringMatching(/^temporary-tool-/),
      mediaType: 'image/png',
      byteLength: 3,
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    const path = store.resolvePath(artifact.artifactId)
    expect(await readFile(path)).toEqual(Buffer.from([1, 2, 3]))
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('removes only expired temporary artifacts', async () => {
    const store = new TemporaryToolArtifactStore(directory, () => 10_000)
    const expired = await store.createTemporary({
      executionId: 'execution-expired',
      mediaType: 'application/octet-stream',
      bytes: new Uint8Array([1]),
      expiresAt: 5_000
    })
    const active = await store.createTemporary({
      executionId: 'execution-active',
      mediaType: 'application/octet-stream',
      bytes: new Uint8Array([2]),
      expiresAt: 20_000
    })
    await utimes(store.resolvePath(expired.artifactId), 1, 1)

    await expect(store.removeExpired()).resolves.toBe(1)
    await expect(stat(store.resolvePath(expired.artifactId))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(stat(store.resolvePath(active.artifactId))).resolves.toBeDefined()
  })
})
