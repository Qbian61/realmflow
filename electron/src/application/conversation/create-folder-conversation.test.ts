import { describe, expect, it, vi } from 'vitest'
import { CreateFolderConversationUseCase } from './create-folder-conversation'

describe('CreateFolderConversationUseCase', () => {
  it('creates a general conversation with the canonical selected folder', async () => {
    const getSessionDirectoryBinding = vi.fn().mockResolvedValue({
      requirementId: 'session-folder-1',
      rootName: 'project',
      rootPath: '/canonical/project'
    })
    const execute = vi.fn().mockImplementation(async ({ session }) => ({
      ...session,
      revision: 2
    }))
    const useCase = new CreateFolderConversationUseCase({
      folders: { getSessionDirectoryBinding },
      sender: { execute },
      now: () => 100
    })

    await expect(
      useCase.execute(command({ title: '  Folder chat  ', prompt: '  Hello  ' }))
    ).resolves.toMatchObject({
      id: 'conversation-1',
      kind: 'general',
      folderPath: '/canonical/project',
      title: 'Folder chat'
    })
    expect(getSessionDirectoryBinding).toHaveBeenCalledWith('session-folder-1')
    expect(execute).toHaveBeenCalledWith({
      sessionId: 'conversation-1',
      session: {
        id: 'conversation-1',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        folderPath: '/canonical/project',
        title: 'Folder chat',
        sortOrder: 100,
        messages: [],
        createdAt: 100,
        updatedAt: 100
      },
      content: 'Hello',
      expectedRevision: 0,
      messageId: 'conversation-1:message:1'
    })
  })

  it('rejects an unavailable folder authorization before sending', async () => {
    const execute = vi.fn()
    const useCase = new CreateFolderConversationUseCase({
      folders: {
        getSessionDirectoryBinding: vi.fn().mockResolvedValue(null)
      },
      sender: { execute }
    })

    await expect(useCase.execute(command())).rejects.toThrow(
      '文件夹授权已失效，请重新选择'
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    { folderBindingId: undefined },
    { folderBindingId: '   ' },
    { kind: 'space' as const },
    { workspaceId: 'workspace-1' },
    { requirementId: 'requirement-1' },
    { nodeRunId: 'node-run-1' },
    { folderPath: '/tmp/task' }
  ])('rejects invalid folder bindings %#', async (override) => {
    const execute = vi.fn()
    const getSessionDirectoryBinding = vi.fn()
    const useCase = new CreateFolderConversationUseCase({
      folders: { getSessionDirectoryBinding },
      sender: { execute }
    })

    await expect(useCase.execute(command(override))).rejects.toThrow(
      'Folder conversations require exactly one folder binding'
    )
    expect(getSessionDirectoryBinding).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('uses the same identities for an exact command replay', async () => {
    const execute = vi.fn().mockImplementation(async ({ session }) => ({
      ...session,
      revision: 2
    }))
    const useCase = new CreateFolderConversationUseCase({
      folders: {
        getSessionDirectoryBinding: vi.fn().mockResolvedValue({
          requirementId: 'session-folder-1',
          rootName: 'project',
          rootPath: '/canonical/project'
        })
      },
      sender: { execute },
      now: () => 100
    })
    const input = command()

    await useCase.execute(input)
    await useCase.execute(input)

    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: 'conversation-1',
        messageId: 'conversation-1:message:1',
        content: 'Hello',
        expectedRevision: 0
      })
    )
  })
})

function command(
  override: Partial<{
    id: string
    kind: 'general' | 'space' | 'requirement_node'
    knowledgeScope: { kind: 'none' | 'all_workspaces' }
    title: string
    prompt: string
    workspaceId: string
    requirementId: string
    nodeRunId: string
    folderPath: string
    folderBindingId: string
    modelProfileId: string
  }> = {}
) {
  return {
    id: 'conversation-1',
    kind: 'general' as const,
    knowledgeScope: { kind: 'none' as const },
    title: 'Folder chat',
    prompt: 'Hello',
    folderBindingId: 'session-folder-1',
    ...override
  }
}
