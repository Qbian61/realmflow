import { describe, expect, it, vi } from 'vitest'
import type { ChatSessionRecord } from '../ports/business-repositories'
import { CreateGeneralConversationUseCase } from './create-general-conversation'

describe('CreateGeneralConversationUseCase', () => {
  it('creates a trimmed context-free general conversation with a stable first message id', async () => {
    const execute = vi.fn().mockImplementation(async (input) => ({
      ...input.session,
      revision: 2
    }))
    const useCase = new CreateGeneralConversationUseCase({
      sender: { execute },
      now: () => 100
    })

    const result = await useCase.execute({
      id: 'conversation-1',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: '  First chat  ',
      prompt: '  Hello RealmFlow  ',
      modelProfileId: 'profile-1'
    })

    expect(execute).toHaveBeenCalledWith({
      sessionId: 'conversation-1',
      session: {
        id: 'conversation-1',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        title: 'First chat',
        sortOrder: 100,
        messages: [],
        createdAt: 100,
        updatedAt: 100
      },
      content: 'Hello RealmFlow',
      expectedRevision: 0,
      messageId: 'conversation-1:message:1',
      modelProfileId: 'profile-1'
    })
    expect(result).toMatchObject({
      id: 'conversation-1',
      kind: 'general',
      title: 'First chat'
    })
  })

  it.each([
    [{ title: '   ' }, 'Conversation title is required'],
    [{ prompt: '\n\t' }, 'Conversation message is required']
  ])('rejects blank creation input', async (override, message) => {
    const execute = vi.fn()
    const useCase = new CreateGeneralConversationUseCase({
      sender: { execute }
    })

    await expect(
      useCase.execute(command(override))
    ).rejects.toThrow(message)
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'space' as const },
    { workspaceId: 'workspace-1' },
    { requirementId: 'requirement-1' },
    { nodeRunId: 'node-run-1' },
    { folderPath: '/tmp/task' },
    { folderBindingId: 'session-folder-1' }
  ])('rejects non-general context bindings %#', async (override) => {
    const execute = vi.fn()
    const useCase = new CreateGeneralConversationUseCase({
      sender: { execute }
    })

    await expect(useCase.execute(command(override))).rejects.toThrow(
      'General conversations cannot bind workspace, requirement, node run, or folder context'
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('propagates model routing failure without retrying creation', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('No text model available'))
    const useCase = new CreateGeneralConversationUseCase({
      sender: { execute }
    })

    await expect(useCase.execute(command())).rejects.toThrow(
      'No text model available'
    )
    expect(execute).toHaveBeenCalledOnce()
  })

  it('persists an all-workspaces scope without binding workspace ids', async () => {
    const execute = vi.fn().mockImplementation(async ({ session }) => ({
      ...session,
      revision: 1
    }))
    const useCase = new CreateGeneralConversationUseCase({
      sender: { execute },
      now: () => 100
    })

    await useCase.execute(
      command({ knowledgeScope: { kind: 'all_workspaces' } })
    )

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          kind: 'general',
          knowledgeScope: { kind: 'all_workspaces' }
        })
      })
    )
  })

  it('rejects a workspace scope on a general conversation', async () => {
    const execute = vi.fn()
    const useCase = new CreateGeneralConversationUseCase({
      sender: { execute }
    })

    await expect(
      useCase.execute({
        ...command(),
        knowledgeScope: { kind: 'workspace', workspaceId: 'workspace-1' }
      })
    ).rejects.toThrow(
      'Conversation knowledge scope does not match its bindings'
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('uses the same session and message identities for exact command replay', async () => {
    const snapshots: ChatSessionRecord[] = []
    const execute = vi.fn().mockImplementation(async ({ session }) => {
      snapshots.push(session)
      return { ...session, revision: snapshots.length }
    })
    const useCase = new CreateGeneralConversationUseCase({
      sender: { execute },
      now: () => 200
    })
    const input = command()

    await useCase.execute(input)
    await useCase.execute(input)

    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: input.id,
        messageId: `${input.id}:message:1`,
        content: input.prompt,
        expectedRevision: 0
      })
    )
    expect(snapshots[1]).toEqual(snapshots[0])
  })
})

function command(
  override: Partial<{
    id: string
    kind: 'general' | 'space' | 'requirement_node'
    knowledgeScope:
      | { kind: 'none' | 'all_workspaces' }
      | { kind: 'workspace'; workspaceId: string }
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
    title: 'First chat',
    prompt: 'Hello',
    ...override
  }
}
