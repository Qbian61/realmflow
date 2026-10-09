import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CapabilityDraftWorkspace } from './capability-draft-workspace'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'realmflow-builder-workspace-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('CapabilityDraftWorkspace', () => {
  it('publishes one immutable revision under the managed draft root', async () => {
    const workspace = createWorkspace()

    const path = await workspace.publish({
      sessionId: 'generation-1',
      revision: 2,
      files: {
        'capability.yaml': 'schemaVersion: 1\n',
        'nested/README.md': '# Draft\n'
      }
    })

    expect(path).toBe(
      join(
        root,
        'capabilities',
        'drafts',
        'generation-1',
        '2'
      )
    )
    await expect(
      readFile(join(path, 'nested', 'README.md'), 'utf8')
    ).resolves.toBe('# Draft\n')
    expect(
      await readdir(
        join(root, 'capabilities', 'drafts', 'generation-1')
      )
    ).toEqual(['2'])

    await expect(
      workspace.publish({
        sessionId: 'generation-1',
        revision: 2,
        files: { 'capability.yaml': 'changed: true\n' }
      })
    ).rejects.toThrow('Capability draft revision already exists')
  })

  it('rejects identifiers and file paths that escape managed storage', async () => {
    const workspace = createWorkspace()

    await expect(
      workspace.publish({
        sessionId: '../outside',
        revision: 1,
        files: { 'capability.yaml': 'schemaVersion: 1\n' }
      })
    ).rejects.toThrow('Capability draft session ID is invalid')

    await expect(
      workspace.publish({
        sessionId: 'generation-1',
        revision: 1,
        files: { '../outside.txt': 'blocked' }
      })
    ).rejects.toThrow('Capability draft file path is invalid')
  })

  it('does not expose a partial revision when writing fails', async () => {
    const workspace = createWorkspace({
      write: async (path, content) => {
        if (path.endsWith('README.md')) {
          throw new Error('disk full')
        }
        const { writeFile } = await import('node:fs/promises')
        await writeFile(path, content)
      }
    })

    await expect(
      workspace.publish({
        sessionId: 'generation-1',
        revision: 1,
        files: {
          'capability.yaml': 'schemaVersion: 1\n',
          'README.md': '# Draft\n'
        }
      })
    ).rejects.toThrow('disk full')
    await expect(
      access(
        join(
          root,
          'capabilities',
          'drafts',
          'generation-1',
          '1'
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes every revision when a generation is cancelled', async () => {
    const workspace = createWorkspace()
    await workspace.publish({
      sessionId: 'generation-1',
      revision: 1,
      files: { 'capability.yaml': 'schemaVersion: 1\n' }
    })

    await workspace.remove('generation-1')

    await expect(
      access(
        join(root, 'capabilities', 'drafts', 'generation-1')
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

function createWorkspace(options: {
  write?: (path: string, content: string) => Promise<void>
} = {}) {
  return new CapabilityDraftWorkspace({
    userDataPath: root,
    createId: () => 'temporary-1',
    ...options
  })
}
