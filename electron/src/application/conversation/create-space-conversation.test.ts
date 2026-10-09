import { describe, expect, it, vi } from 'vitest'
import { CreateSpaceConversationUseCase } from './create-space-conversation'

describe('CreateSpaceConversationUseCase', () => {
  it('creates a space-bound conversation after validating the workspace', async () => {
    const get = vi.fn().mockResolvedValue({ id: 'workspace-1', revision: 2 })
    const execute = vi.fn().mockImplementation(async ({ session }) => ({
      ...session,
      revision: 2
    }))
    const useCase = new CreateSpaceConversationUseCase({
      workspaces: { get },
      sender: { execute },
      now: () => 100
    })

    await expect(
      useCase.execute(command({ title: '  Space chat  ', prompt: '  Hello  ' }))
    ).resolves.toMatchObject({
      id: 'conversation-1',
      kind: 'space',
      workspaceId: 'workspace-1',
      title: 'Space chat'
    })
    expect(get).toHaveBeenCalledWith('workspace-1')
    expect(execute).toHaveBeenCalledWith({
      sessionId: 'conversation-1',
      session: {
        id: 'conversation-1',
        kind: 'space',
        workspaceId: 'workspace-1',
        knowledgeScope: {
          kind: 'workspace',
          workspaceId: 'workspace-1'
        },
        title: 'Space chat',
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

  it('rejects a missing workspace before sending', async () => {
    const execute = vi.fn()
    const useCase = new CreateSpaceConversationUseCase({
      workspaces: { get: vi.fn().mockResolvedValue(undefined) },
      sender: { execute }
    })

    await expect(useCase.execute(command())).rejects.toThrow(
      'Workspace not found: workspace-1'
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    { workspaceId: undefined },
    { kind: 'general' as const },
    { requirementId: 'requirement-1' },
    { nodeRunId: 'node-run-1' },
    { folderPath: '/tmp/task' },
    { folderBindingId: 'session-folder-1' }
  ])('rejects invalid space bindings %#', async (override) => {
    const execute = vi.fn()
    const get = vi.fn()
    const useCase = new CreateSpaceConversationUseCase({
      workspaces: { get },
      sender: { execute }
    })

    await expect(useCase.execute(command(override))).rejects.toThrow(
      'Space conversations require exactly one workspace'
    )
    expect(get).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})

function command(
  override: Partial<{
    id: string
    kind: 'general' | 'space' | 'requirement_node'
    knowledgeScope: {
      kind: 'workspace'
      workspaceId: string
    }
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
    kind: 'space' as const,
    knowledgeScope: {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1'
    },
    title: 'Space chat',
    prompt: 'Hello',
    workspaceId: 'workspace-1',
    ...override
  }
}
