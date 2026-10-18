import { describe, expect, it, vi } from 'vitest'
import {
  createAssistantTurnProjection,
  projectAssistantTurn,
  type AssistantRunEvent
} from '../../../../domain/assistant-turn'
import type {
  ChatSessionRecord,
  ChatSessionRepository,
  Revisioned
} from '../ports/business-repositories'
import { CancelConversationRunUseCase } from './cancel-conversation-run'

describe('CancelConversationRunUseCase', () => {
  it('persists run.cancelled and finishes a suspended pending conversation turn', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'session-1',
      kind: 'general',
      title: 'Pending approval',
      sortOrder: 0,
      turns: [{
        id: 'turn-1',
        sessionId: 'session-1',
        index: 0,
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        runId: 'run-1',
        status: 'running',
        createdAt: 1
      }],
      messages: [
        {
          id: 'user-1',
          turnId: 'turn-1',
          role: 'user',
          status: 'completed',
          content: 'Write a file',
          sortOrder: 0,
          createdAt: 1
        },
        {
          id: 'assistant-1',
          turnId: 'turn-1',
          role: 'assistant',
          status: 'pending',
          content: 'Waiting',
          runId: 'run-1',
          sortOrder: 1,
          createdAt: 1
        }
      ],
      revision: 3,
      createdAt: 1,
      updatedAt: 1
    }
    const requested = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: 'run-1',
        turnId: 'turn-1',
        assistantMessageId: 'assistant-1',
        startedAt: 1
      }),
      {
        id: 'tool-1',
        runId: 'run-1',
        sequence: 1,
        type: 'tool.call.requested',
        timestamp: 2,
        data: {
          callId: 'call-1',
          toolName: 'bash',
          category: 'command',
          argumentsSummary: 'write file'
        }
      }
    )
    const waiting = projectAssistantTurn(
      requested,
      {
        id: 'permission-1',
        runId: 'run-1',
        sequence: 2,
        type: 'tool.call.permission_required',
        timestamp: 2,
        data: {
          callId: 'call-1',
          toolExecutionId: 'execution-1',
          message: 'Allow bash?'
        }
      }
    )
    const appended: AssistantRunEvent[] = []
    const published = vi.fn()
    const useCase = new CancelConversationRunUseCase({
      sessions: repository(() => session, next => { session = next }),
      timeline: {
        getSnapshot: vi.fn(async () => waiting),
        appendAndProject: vi.fn(async (event) => {
          appended.push(event)
          return true
        })
      },
      publishProjection: published,
      now: () => 10
    })

    const result = await useCase.execute({
      sessionId: 'session-1',
      runId: 'run-1'
    })

    expect(appended).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        sequence: 3,
        type: 'run.cancelled',
        data: { message: 'Run cancelled' }
      })
    ])
    expect(published).toHaveBeenCalledWith({
      sessionId: 'session-1',
      turnId: 'turn-1',
      projection: expect.objectContaining({
        status: 'cancelled',
        lastSequence: 3
      })
    })
    expect(result.messages.at(-1)).toMatchObject({
      status: 'failed',
      error: 'Run cancelled'
    })
    expect(result.turns.at(-1)).toMatchObject({ status: 'failed' })
  })
})

function repository(
  read: () => Revisioned<ChatSessionRecord>,
  write: (session: Revisioned<ChatSessionRecord>) => void
): ChatSessionRepository {
  return {
    get: async () => structuredClone(read()),
    listByWorkspace: async () => [],
    listByNodeRun: async () => [],
    listRecent: async () => ({
      conversations: [],
      folderPaths: [],
      totalCount: 0
    }),
    delete: async () => false,
    save: vi.fn(),
    beginTurn: vi.fn(),
    bindTurnRun: vi.fn(),
    markTurnRetrying: vi.fn(),
    finishTurn: async (input) => {
      const current = read()
      const next: Revisioned<ChatSessionRecord> = {
        ...current,
        revision: current.revision + 1,
        updatedAt: input.updatedAt,
        turns: current.turns.map(turn =>
          turn.assistantMessageId === input.assistantMessageId
            ? { ...turn, status: input.status, completedAt: input.updatedAt }
            : turn
        ),
        messages: current.messages.map(message =>
          message.id === input.assistantMessageId
            ? {
                ...message,
                status: input.status,
                content: input.content,
                completedAt: input.updatedAt,
                ...(input.error ? { error: input.error } : {})
              }
            : message
        )
      }
      write(next)
      return { status: 'updated' as const, entity: structuredClone(next) }
    },
    recoverPendingTurns: vi.fn()
  }
}
