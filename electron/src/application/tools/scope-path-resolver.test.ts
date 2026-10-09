import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScopePathResolver } from './scope-path-resolver'

let directory: string
let root: string
let outside: string
let resolver: ScopePathResolver

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-scope-path-'))
  root = join(directory, 'workspace')
  outside = join(directory, 'workspace-private')
  await mkdir(root)
  await mkdir(outside)
  resolver = new ScopePathResolver()
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('ScopePathResolver', () => {
  it('resolves an existing relative path inside the only bound root', async () => {
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'RealmFlow')

    await expect(
      resolver.resolve({
        path: 'README.md',
        roots: [root],
        operation: 'read'
      })
    ).resolves.toEqual({
      canonicalPath: await realpath(filePath),
      canonicalRoot: await realpath(root)
    })
  })

  it('resolves a new nested path from its nearest existing parent', async () => {
    await mkdir(join(root, 'artifacts'))

    await expect(
      resolver.resolve({
        path: 'artifacts/reports/final.pdf',
        roots: [root],
        operation: 'write'
      })
    ).resolves.toEqual({
      canonicalPath: join(
        await realpath(root),
        'artifacts/reports/final.pdf'
      ),
      canonicalRoot: await realpath(root)
    })
  })

  it('rejects an absolute sibling path sharing the root prefix', async () => {
    await expect(
      resolver.resolve({
        path: join(outside, 'secret.txt'),
        roots: [root],
        operation: 'write'
      })
    ).rejects.toThrow('outside the authorized scope')
  })

  it('canonicalizes an out-of-root effect without authorizing it', async () => {
    const target = join(outside, 'new.txt')

    await expect(
      resolver.plan({
        path: target,
        roots: [root],
        operation: 'write'
      })
    ).resolves.toEqual({
      canonicalPath: join(await realpath(outside), 'new.txt'),
      canonicalRoot: undefined
    })
  })

  it('rejects a symbolic-link escape for existing and new targets', async () => {
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(outside, join(root, 'linked-outside'))

    await expect(
      resolver.resolve({
        path: 'linked-outside/secret.txt',
        roots: [root],
        operation: 'read'
      })
    ).rejects.toThrow('outside the authorized scope')
    await expect(
      resolver.resolve({
        path: 'linked-outside/new.txt',
        roots: [root],
        operation: 'write'
      })
    ).rejects.toThrow('outside the authorized scope')
  })

  it('rejects an ambiguous relative path when multiple roots are bound', async () => {
    await expect(
      resolver.resolve({
        path: 'README.md',
        roots: [root, outside],
        operation: 'read'
      })
    ).rejects.toThrow('requires exactly one scope root')
  })
})
