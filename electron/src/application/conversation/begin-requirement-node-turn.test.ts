import { describe, expect, it, vi } from 'vitest'
import type {
  ChatSessionRecord,
  ConversationTurnResult,
  NodeQuestionRecord,
  Revisioned,
  UnitOfWork
} from '../ports/business-repositories'
import { BeginRequirementNodeTurnUseCase } from './begin-requirement-node-turn'

const session: ChatSessionRecord = {
  id: 'conversation-node',
  kind: 'requirement_node',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1',
  title: 'Build',
  sortOrder: 1,
  messages: [],
  createdAt: 1,
  updatedAt: 1
}

const question: Revisioned<NodeQuestionRecord> = {
  id: 'question-1',
  nodeRunId: 'node-run-1',
  prompt: 'Which rollout?',
  required: true,
  status: 'open',
  revision: 1,
  createdAt: 1,
  updatedAt: 1
}

const turnInput = {
  session,
  expectedRevision: 0,
  userMessageId: 'message-1',
  assistantMessageId: 'message-2',
  content: 'Canary',
  references: { questionId: question.id },
  createdAt: 100
}

describe('BeginRequirementNodeTurnUseCase', () => {
  it('commits the question answer and conversation turn in one unit of work', async () => {
    const order: string[] = []
    const resolved = { ...question, status: 'answered' as const, answer: 'Canary' }
    const started: ConversationTurnResult = {
      status: 'started',
      entity: {
        ...session,
        revision: 1,
        messages: [
          {
            id: 'message-1',
            role: 'user',
            status: 'completed',
            content: 'Canary',
            questionId: question.id,
            sortOrder: 0,
            createdAt: 100
          },
          {
            id: 'message-2',
            role: 'assistant',
            status: 'pending',
            content: '',
            sortOrder: 1,
            createdAt: 100
          }
        ]
      }
    }
    const resolveWithinTransaction = vi.fn(async () => {
      order.push('question')
      return resolved
    })
    const beginTurn = vi.fn(async () => {
      order.push('turn')
      return started
    })
    const useCase = new BeginRequirementNodeTurnUseCase({
      sessions: { beginTurn },
      questions: { resolveWithinTransaction },
      unitOfWork: {
        execute: vi.fn(async (operation) => {
          order.push('transaction')
          return operation()
        })
      }
    })

    await expect(
      useCase.execute(turnInput, {
        id: question.id,
        nodeRunId: question.nodeRunId,
        answer: 'Canary',
        expectedRevision: 1
      })
    ).resolves.toEqual({
      ...started,
      answeredQuestion: resolved
    })
    expect(order).toEqual(['transaction', 'question', 'turn'])
  })

  it('rolls back the question when the conversation turn is rejected', async () => {
    let questionStatus: NodeQuestionRecord['status'] = 'open'
    const unitOfWork = {
      execute: vi.fn(async <T>(operation: () => Promise<T>) => {
        const before = questionStatus
        try {
          return await operation()
        } catch (error) {
          questionStatus = before
          throw error
        }
      })
    }
    const conflict: ConversationTurnResult = {
      status: 'conflict',
      entity: { ...session, revision: 2 }
    }
    const useCase = new BeginRequirementNodeTurnUseCase({
      sessions: { beginTurn: vi.fn().mockResolvedValue(conflict) },
      questions: {
        resolveWithinTransaction: vi.fn(async () => {
          questionStatus = 'answered'
          return {
            ...question,
            status: 'answered' as const,
            answer: 'Canary',
            revision: 2
          }
        })
      },
      unitOfWork: unitOfWork as unknown as UnitOfWork
    })

    await expect(
      useCase.execute(turnInput, {
        id: question.id,
        nodeRunId: question.nodeRunId,
        answer: 'Canary',
        expectedRevision: 1
      })
    ).resolves.toEqual(conflict)
    expect(questionStatus).toBe('open')
  })
})
