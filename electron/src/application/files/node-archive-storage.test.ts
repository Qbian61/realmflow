import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeArchiveStorage } from './node-archive-storage'

describe('NodeArchiveStorage', () => {
  let rootPath: string
  let storage: NodeArchiveStorage

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'realmflow-node-archive-'))
    storage = new NodeArchiveStorage()
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('atomically commits a complete staging directory', async () => {
    const outputPath = join(rootPath, 'output')
    const stagingPath = await storage.createStagingDirectory(outputPath)
    await writeFile(join(stagingPath, 'report.txt'), 'complete')

    await storage.commitDirectory({
      stagingPath,
      outputCanonicalPath: outputPath
    })

    expect(await readFile(join(outputPath, 'report.txt'), 'utf8')).toBe(
      'complete'
    )
    await expect(stat(stagingPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never replaces an existing extraction directory', async () => {
    const outputPath = join(rootPath, 'output')
    await mkdir(outputPath)
    await writeFile(join(outputPath, 'existing.txt'), 'keep')
    const stagingPath = await storage.createStagingDirectory(outputPath)
    await writeFile(join(stagingPath, 'new.txt'), 'new')

    await expect(
      storage.commitDirectory({
        stagingPath,
        outputCanonicalPath: outputPath
      })
    ).rejects.toMatchObject({ code: 'EEXIST' })

    expect(await readFile(join(outputPath, 'existing.txt'), 'utf8')).toBe('keep')
    expect(await readFile(join(stagingPath, 'new.txt'), 'utf8')).toBe('new')
  })

  it('creates a new archive exclusively and preserves existing bytes', async () => {
    const outputPath = join(rootPath, 'bundle.zip')
    await writeFile(outputPath, 'existing')

    await expect(
      storage.commitNew({
        canonicalPath: outputPath,
        content: Buffer.from('candidate')
      })
    ).rejects.toMatchObject({ code: 'EEXIST' })

    expect(await readFile(outputPath, 'utf8')).toBe('existing')
  })

  it('removes staging recursively', async () => {
    const stagingPath = await storage.createStagingDirectory(
      join(rootPath, 'output')
    )
    await writeFile(join(stagingPath, 'temporary.txt'), 'temporary')

    await storage.remove(stagingPath)

    await expect(stat(stagingPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
