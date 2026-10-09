import { describe, expect, it, vi } from 'vitest'
import type {
  ChatSessionRecord,
  Revisioned
} from '../ports/business-repositories'
import type { SendConversationMessageUseCase } from './send-conversation-message'
import { SendRequirementNodeMessageUseCase } from './send-requirement-node-message'

const question = {
  id: 'question-1',
  nodeRunId: 'node-run-1',
  prompt: 'Which rollout?',
  required: true,
  status: 'open' as const,
  revision: 1,
  createdAt: 1,
  updatedAt: 1
}

function createHarness(options: {
  questionNodeRunId?: string
  questionStatus?: 'open' | 'answered'
  artifactNodeId?: string
} = {}) {
  let session: Revisioned<ChatSessionRecord> | undefined
  const context = {
    assemble: vi.fn().mockResolvedValue({
      context: '## Current node\nBuild',
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeId: 'node-1'
    })
  }
  const reevaluate = vi.fn().mockResolvedValue({
    question: { ...question, status: 'answered' },
    completed: false
  })
  const begin = vi.fn(async (input, answer) => {
    const entity: Revisioned<ChatSessionRecord> = {
      ...input.session,
      revision: input.expectedRevision + 1,
      messages: [
        {
          id: input.userMessageId,
          role: 'user',
          status: 'completed',
          content: input.content,
          ...input.references,
          sortOrder: 0,
          createdAt: input.createdAt
        },
        {
          id: input.assistantMessageId,
          role: 'assistant',
          status: 'pending',
          content: '',
          sortOrder: 1,
          createdAt: input.createdAt
        }
      ]
    }
    session = entity
    return {
      status: 'started' as const,
      entity,
      ...(answer
        ? {
            answeredQuestion: {
              ...question,
              status: 'answered' as const,
              answer: answer.answer,
              revision: 2
            }
          }
        : {})
    }
  })
  const sender = {
    execute: vi.fn(async (
      input: Parameters<SendConversationMessageUseCase['execute']>[0]
    ) => {
      const turn = await input.turnStarter!({
        session: input.session!,
        expectedRevision: input.expectedRevision,
        userMessageId: input.messageId!,
        assistantMessageId: 'assistant-1',
        content: input.content,
        references: input.messageReferences,
        createdAt: 100
      })
      await input.afterTurnStarted?.(turn.entity)
      const completed = {
        ...turn.entity,
        revision: turn.entity.revision + 1,
        messages: turn.entity.messages.map((message) =>
          message.id === 'assistant-1'
            ? { ...message, status: 'completed' as const, content: 'Done' }
            : message
        )
      }
      session = completed
      return completed
    })
  }
  const getSession = vi.fn(async () => session)
  const useCase = new SendRequirementNodeMessageUseCase({
    sessions: {
      get: getSession,
      listByNodeRun: vi.fn(async () => (session ? [session] : []))
    },
    questions: {
      get: vi.fn().mockResolvedValue({
        ...question,
        nodeRunId: options.questionNodeRunId ?? question.nodeRunId,
        status: options.questionStatus ?? question.status
      })
    },
    todos: { get: vi.fn().mockResolvedValue(undefined) },
    artifacts: {
      listByRequirement: vi.fn().mockResolvedValue(
        options.artifactNodeId
          ? [
              {
                id: 'artifact-1',
                requirementId: 'requirement-1',
                stageId: 'implementation',
                nodeId: options.artifactNodeId,
                relativePath: 'artifacts/result.md',
                kind: 'markdown',
                checksum: 'checksum',
                version: 1,
                byteSize: 10,
                isPrimary: true,
                createdAt: 1,
                updatedAt: 1
              }
            ]
          : []
      )
    },
    context,
    turns: { execute: begin },
    reevaluator: { reevaluate },
    sender,
    now: () => 90
  })
  return { begin, context, getSession, reevaluate, sender, useCase }
}

describe('SendRequirementNodeMessageUseCase', () => {
  it('creates a bound conversation and atomically answers the selected question', async () => {
    const harness = createHarness()

    const result = await harness.useCase.create({
      id: 'conversation-node',
      kind: 'requirement_node',
      knowledgeScope: { kind: 'node_configuration' },
      title: 'Build',
      prompt: 'Canary',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1',
      references: {
        questionId: 'question-1',
        expectedQuestionRevision: 1
      }
    })

    expect(result).toMatchObject({
      kind: 'requirement_node',
      knowledgeScope: { kind: 'node_configuration' },
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      messages: [
        { questionId: 'question-1', content: 'Canary' },
        { content: 'Done' }
      ]
    })
    expect(harness.context.assemble).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      query: 'Canary',
      pendingQuestion: {
        prompt: 'Which rollout?',
        answer: 'Canary'
      }
    })
    expect(harness.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        references: { questionId: 'question-1' }
      }),
      {
        id: 'question-1',
        nodeRunId: 'node-run-1',
        answer: 'Canary',
        expectedRevision: 1
      }
    )
    expect(harness.reevaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: 'requirement-1',
        question: expect.objectContaining({ status: 'answered' })
      })
    )
    expect(harness.sender.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementNodeContext: {
          requirementId: 'requirement-1',
          nodeId: 'node-1',
          nodeRunId: 'node-run-1'
        },
        metricContext: {
          workspaceId: 'workspace-1',
          requirementId: 'requirement-1',
          nodeId: 'node-1'
        }
      })
    )

    await expect(
      harness.useCase.create({
        id: 'conversation-node',
        kind: 'requirement_node',
        title: 'Build',
        prompt: 'Canary',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        references: {
          questionId: 'question-1',
          expectedQuestionRevision: 1
        }
      })
    ).resolves.toEqual(result)
    expect(harness.context.assemble).toHaveBeenCalledOnce()
    expect(harness.sender.execute).toHaveBeenCalledOnce()
  })

  it('rejects a question from another node before context or conversation side effects', async () => {
    const harness = createHarness({ questionNodeRunId: 'node-run-2' })

    await expect(
      harness.useCase.create({
        id: 'conversation-node',
        kind: 'requirement_node',
        title: 'Build',
        prompt: 'Canary',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        references: {
          questionId: 'question-1',
          expectedQuestionRevision: 1
        }
      })
    ).rejects.toThrow('消息关联不属于当前需求节点')
    expect(harness.context.assemble).not.toHaveBeenCalled()
    expect(harness.sender.execute).not.toHaveBeenCalled()
  })

  it('rejects an artifact from another node before conversation side effects', async () => {
    const harness = createHarness({ artifactNodeId: 'node-2' })

    await expect(
      harness.useCase.create({
        id: 'conversation-node',
        kind: 'requirement_node',
        title: 'Build',
        prompt: 'Review this artifact',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        references: { artifactId: 'artifact-1' }
      })
    ).rejects.toThrow('消息关联不属于当前需求节点')
    expect(harness.sender.execute).not.toHaveBeenCalled()
  })

  it('rejects a new message linked to an already answered question', async () => {
    const harness = createHarness({ questionStatus: 'answered' })

    await expect(
      harness.useCase.create({
        id: 'conversation-node',
        kind: 'requirement_node',
        title: 'Build',
        prompt: 'Canary',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        references: {
          questionId: 'question-1',
          expectedQuestionRevision: 2
        }
      })
    ).rejects.toThrow('节点问题已更新，请刷新后重试')
    expect(harness.sender.execute).not.toHaveBeenCalled()
  })

  it('appends to the persisted node identity and rejects another conversation kind', async () => {
    const harness = createHarness()
    await harness.useCase.create({
      id: 'conversation-node',
      kind: 'requirement_node',
      title: 'Build',
      prompt: 'First',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1'
    })
    const current = await harness.useCase.append({
      sessionId: 'conversation-node',
      messageId: 'message-2',
      content: 'Second',
      expectedRevision: 2
    })
    expect(current.messages.at(-2)?.content).toBe('Second')

    harness.getSession.mockResolvedValueOnce({
      ...current,
      kind: 'space'
    })
    await expect(
      harness.useCase.append({
        sessionId: 'conversation-node',
        messageId: 'message-3',
        content: 'Third',
        expectedRevision: current.revision
      })
    ).rejects.toThrow('Conversation is not a requirement node conversation')
  })
})
