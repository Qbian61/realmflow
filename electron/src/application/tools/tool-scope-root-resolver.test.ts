import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  resolveToolBoundScopeAuthorization,
  resolveToolScopeRoots
} from './tool-scope-root-resolver'

describe('resolveToolScopeRoots', () => {
  it('freezes a canonical folder authorization snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-bound-scope-'))
    const folder = join(directory, 'folder')
    await mkdir(folder)
    try {
      await expect(
        resolveToolBoundScopeAuthorization(
          {
            definition: {
              kind: 'tool',
              id: 'builtin.files.write',
              version: '1.0.0',
              digest: 'a'.repeat(64)
            },
            triggerSource: 'model',
            context: {
              scope: {
                kind: 'conversation',
                conversationId: 'conversation-1'
              },
              conversationId: 'conversation-1',
              folderPath: folder
            },
            input: { path: 'result.txt' }
          },
          {
            assertFolderAvailable: vi.fn(),
            requirements: { get: vi.fn() },
            workspaces: { get: vi.fn() }
          },
          100
        )
      ).resolves.toEqual([
        {
          authorizationId: expect.stringMatching(/^bound-/),
          source: {
            kind: 'folder',
            folderSessionId: 'conversation-1'
          },
          roots: [
            {
              canonicalPath: await realpath(folder),
              access: 'read-write'
            }
          ],
          bindingRevision: 1,
          status: 'active',
          createdAt: 100
        }
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('binds requirement Tool calls to the requirement directory', async () => {
    const assertFolderAvailable = vi.fn()
    const requirements = {
      get: vi.fn().mockResolvedValue({
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        workspaceRootPath: '/spaces/space-1/requirements/requirement-1'
      })
    }
    const workspaces = {
      get: vi.fn().mockResolvedValue({
        id: 'workspace-1',
        path: '/spaces/space-1',
        rootPath: '/spaces/space-1'
      })
    }

    await expect(
      resolveToolScopeRoots(
        {
          definition: {
            kind: 'tool',
            id: 'builtin.files.write',
            version: '1.0.0',
            digest: 'a'.repeat(64)
          },
          triggerSource: 'model',
          context: {
            scope: {
              kind: 'requirement',
              requirementId: 'requirement-1'
            },
            workspaceId: 'workspace-1',
            requirementId: 'requirement-1',
            nodeRunId: 'node-run-1'
          },
          input: { path: 'artifacts/analysis.md', content: '# Analysis' }
        },
        {
          assertFolderAvailable,
          requirements,
          workspaces
        }
      )
    ).resolves.toEqual([
      '/spaces/space-1/requirements/requirement-1'
    ])

    expect(requirements.get).toHaveBeenCalledWith('requirement-1')
    expect(workspaces.get).not.toHaveBeenCalled()
    expect(assertFolderAvailable).not.toHaveBeenCalled()
  })

  it('rejects a requirement outside the declared workspace context', async () => {
    const dependencies = {
      assertFolderAvailable: vi.fn(),
      requirements: {
        get: vi.fn().mockResolvedValue({
          id: 'requirement-1',
          workspaceId: 'workspace-2',
          workspaceRootPath: '/spaces/space-2/requirements/requirement-1'
        })
      },
      workspaces: { get: vi.fn() }
    }

    await expect(
      resolveToolScopeRoots(
        {
          definition: {
            kind: 'tool',
            id: 'builtin.files.write',
            version: '1.0.0',
            digest: 'a'.repeat(64)
          },
          triggerSource: 'model',
          context: {
            scope: {
              kind: 'requirement',
              requirementId: 'requirement-1'
            },
            workspaceId: 'workspace-1',
            requirementId: 'requirement-1'
          },
          input: { path: 'artifacts/analysis.md', content: '# Analysis' }
        },
        dependencies
      )
    ).rejects.toThrow('Tool execution requirement workspace mismatch')
  })
})
