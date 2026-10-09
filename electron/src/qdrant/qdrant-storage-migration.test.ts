import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareQdrantIndexStorageUpgrade } from './qdrant-storage-migration'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('Qdrant storage migration', () => {
  it('removes rebuildable legacy storage once and persists a marker', async () => {
    const userDataPath = await temporaryDirectory()
    await mkdir(join(userDataPath, 'qdrant', 'storage'), { recursive: true })
    await mkdir(join(userDataPath, 'qdrant', 'snapshots'), { recursive: true })
    await writeFile(
      join(userDataPath, 'qdrant', 'storage', 'legacy.index'),
      'legacy'
    )
    await writeFile(
      join(userDataPath, 'qdrant', 'snapshots', 'legacy.snapshot'),
      'legacy'
    )

    await expect(
      prepareQdrantIndexStorageUpgrade({ userDataPath })
    ).resolves.toEqual({ migrated: true })

    await expect(
      stat(join(userDataPath, 'qdrant', 'storage'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      stat(join(userDataPath, 'qdrant', 'snapshots'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      readFile(
        join(userDataPath, 'qdrant', '.realmflow-vector-index-v1'),
        'utf8'
      )
    ).resolves.toBe('1\n')
  })

  it('preserves current storage after the migration marker exists', async () => {
    const userDataPath = await temporaryDirectory()
    await mkdir(join(userDataPath, 'qdrant', 'storage'), { recursive: true })
    await writeFile(
      join(userDataPath, 'qdrant', '.realmflow-vector-index-v1'),
      '1\n'
    )
    await writeFile(
      join(userDataPath, 'qdrant', 'storage', 'current.index'),
      'current'
    )

    await expect(
      prepareQdrantIndexStorageUpgrade({ userDataPath })
    ).resolves.toEqual({ migrated: false })
    await expect(
      readFile(join(userDataPath, 'qdrant', 'storage', 'current.index'), 'utf8')
    ).resolves.toBe('current')
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'realmflow-qdrant-upgrade-'))
  directories.push(directory)
  return directory
}
