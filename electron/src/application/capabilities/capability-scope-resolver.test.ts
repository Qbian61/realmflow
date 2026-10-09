import { describe, expect, it, vi } from 'vitest'
import { CapabilityScopeResolver } from './capability-scope-resolver'

describe('CapabilityScopeResolver', () => {
  it('builds a canonical folder chain from the owning work root', async () => {
    const resolver = new CapabilityScopeResolver({
      workspaces: {
        get: vi.fn().mockResolvedValue(undefined)
      },
      workRoots: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'root-1',
            path: '/work',
            isCurrent: true,
            createdAt: 1,
            lastUsedAt: 1,
            revision: 1
          }
        ])
      },
      canonicalizeDirectory: vi.fn().mockResolvedValue('/work/project/docs')
    })

    await expect(
      resolver.resolve({
        conversationId: 'conversation-folder',
        folderPath: '/work/project/../project/docs',
        messages: []
      })
    ).resolves.toEqual([
      { kind: 'global' },
      { kind: 'work-root', workRootId: 'root-1' },
      {
        kind: 'folder',
        workRootId: 'root-1',
        canonicalPath: '/work/project/docs'
      }
    ])
  })

  it('combines workspace ownership with folder and requirement specificity', async () => {
    const resolver = new CapabilityScopeResolver({
      workspaces: {
        get: vi.fn().mockResolvedValue({
          id: 'workspace-1',
          workRootId: 'root-1',
          path: '/work/space',
          label: 'Space',
          description: '',
          sortOrder: 0,
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        })
      },
      workRoots: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'root-1',
            path: '/work',
            isCurrent: true,
            createdAt: 1,
            lastUsedAt: 1,
            revision: 1
          }
        ])
      },
      canonicalizeDirectory: vi.fn().mockResolvedValue('/work/space/src')
    })

    await expect(
      resolver.resolve({
        conversationId: 'conversation-requirement',
        workspaceId: 'workspace-1',
        folderPath: '/work/space/src',
        requirementId: 'requirement-1',
        nodeId: 'node-1',
        nodeRunId: 'node-run-1',
        messages: []
      })
    ).resolves.toEqual([
      { kind: 'global' },
      { kind: 'work-root', workRootId: 'root-1' },
      { kind: 'workspace', workspaceId: 'workspace-1' },
      {
        kind: 'folder',
        workRootId: 'root-1',
        canonicalPath: '/work/space/src'
      },
      {
        kind: 'requirement',
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1'
      }
    ])
  })
})
