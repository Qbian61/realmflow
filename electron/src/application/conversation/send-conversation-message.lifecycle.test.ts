import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import type {
  ChatSessionRecord,
  ChatSessionRepository,
  Revisioned
} from '../ports/business-repositories'
import { SendConversationMessageUseCase } from './send-conversation-message'

describe('SendConversationMessageUseCase lifecycle', () => {
  it('commits a completed assistant through the persisted turn lifecycle', async () => {
    const harness = createHarness([
      event(1, 'run.started', {}),
      event(2, 'answer.delta', { delta: 'Hello ' }),
      event(3, 'answer.delta', { delta: 'world' }),
      event(4, 'run.completed', {})
    ])
    const updates: Revisioned<ChatSessionRecord>[] = []

    const result = await harness.useCase.execute({
      ...command(),
      onUpdate: (conversation) => updates.push(conversation)
    })

    expect(harness.beginTurn).toHaveBeenCalledOnce()
    expect(harness.bindTurnRun).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: 'message-1:assistant',
        runId: 'run-1',
        expectedRevision: 2
      })
    )
    expect(harness.finishTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: 'message-1:assistant',
        status: 'completed',
        content: 'Hello world',
        expectedRevision: 3
      })
    )
    expect(result.messages.at(-1)).toMatchObject({
      status: 'completed',
      content: 'Hello world'
    })
    expect(
      updates.map((conversation) => conversation.messages.at(-1))
    ).toEqual([
      expect.objectContaining({ status: 'pending', content: '' }),
      expect.objectContaining({
        status: 'pending',
        content: '',
        runId: 'run-1'
      }),
      expect.objectContaining({
        status: 'pending',
        content: '',
        runId: 'run-1',
        execution: expect.objectContaining({
          status: 'running',
          lastSequence: 1
        })
      }),
      expect.objectContaining({
        status: 'pending',
        content: 'Hello ',
        runId: 'run-1'
      }),
      expect.objectContaining({
        status: 'pending',
        content: 'Hello world',
        runId: 'run-1'
      }),
      expect.objectContaining({
        status: 'pending',
        content: 'Hello world',
        runId: 'run-1',
        execution: expect.objectContaining({
          status: 'completed',
          lastSequence: 4
        })
      }),
      expect.objectContaining({
        status: 'completed',
        content: 'Hello world',
        runId: 'run-1'
      })
    ])
  })

  it('schedules the completed turn hook without blocking the response', async () => {
    let releaseHook!: () => void
    const pendingHook = new Promise<void>((resolve) => {
      releaseHook = resolve
    })
    const onCompleted = vi.fn(() => pendingHook)
    const harness = createHarness([
      event(1, 'answer.delta', { delta: 'Hello world' }),
      event(2, 'run.completed', {})
    ], onCompleted)

    const result = await harness.useCase.execute(command())

    expect(result.messages.at(-1)).toMatchObject({
      status: 'completed',
      content: 'Hello world'
    })
    expect(onCompleted).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      assistantMessageId: 'message-1:assistant',
      sourceRunId: 'run-1',
      responseLocale: 'en',
      userObjective: 'Hello',
      finalAnswer: 'Hello world',
      unresolvedItems: [],
      artifactSummaries: [],
      executionOutcome: 'completed'
    })
    releaseHook()
  })

  it('does not schedule the completed turn hook for failed runs', async () => {
    const onCompleted = vi.fn()
    const harness = createHarness([
      event(1, 'run.failed', { message: 'Provider unavailable' })
    ], onCompleted)

    await harness.useCase.execute(command())

    expect(onCompleted).not.toHaveBeenCalled()
  })

  it('persists partial content and the terminal run error', async () => {
    const harness = createHarness([
      event(1, 'answer.delta', { delta: 'Partial answer' }),
      event(2, 'run.failed', { message: 'Provider stream interrupted' })
    ])
    const updates: Revisioned<ChatSessionRecord>[] = []

    const result = await harness.useCase.execute({
      ...command(),
      onUpdate: (conversation) => updates.push(conversation)
    })

    expect(harness.finishTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        content: 'Partial answer',
        error: 'Provider stream interrupted'
      })
    )
    expect(result.messages.at(-1)).toMatchObject({
      status: 'failed',
      content: 'Partial answer',
      error: 'Provider stream interrupted'
    })
    expect(updates.at(-1)?.messages.at(-1)).toMatchObject({
      status: 'failed',
      content: 'Partial answer',
      error: 'Provider stream interrupted'
    })
  })

  it('finalizes a waiting-input boundary without replacing it with an error', async () => {
    const harness = createHarness([
      event(1, 'run.started', {}),
      event(2, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-1',
          name: 'rf_builtin_process_run_5ac7e7bf',
          arguments: '{"command":"pwd"}'
        }
      }),
      event(3, 'run.waiting_input', {
        recoveryReason: 'consecutive_tool_failures'
      })
    ])
    const updates: Revisioned<ChatSessionRecord>[] = []

    const result = await harness.useCase.execute({
      ...command(),
      onUpdate: (conversation) => updates.push(conversation)
    })

    expect(harness.finishTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        content: '',
        runId: 'run-1'
      })
    )
    expect(result.messages.at(-1)).toMatchObject({
      status: 'completed',
      content: '',
      execution: expect.objectContaining({
        status: 'waiting_input',
        recovery: { reason: 'consecutive_tool_failures' },
        toolCalls: [
          expect.objectContaining({
            callId: 'call-1',
            status: 'failed',
            errorCode: 'run_suspended'
          })
        ]
      })
    })
    expect(result.messages.at(-1)?.error).toBeUndefined()
    expect(updates.at(-1)?.messages.at(-1)?.error).toBeUndefined()
  })

  it('still fails a stream that ends without a terminal or suspension boundary', async () => {
    const harness = createHarness([
      event(1, 'run.started', {}),
      event(2, 'answer.delta', { delta: 'Partial answer' })
    ])

    const result = await harness.useCase.execute(command())

    expect(result.messages.at(-1)).toMatchObject({
      status: 'failed',
      content: 'Partial answer',
      error: 'Conversation run ended without a terminal event'
    })
  })

  it('redacts provider URLs and credentials from persisted errors', async () => {
    const harness = createHarness([
      event(1, 'run.failed', {
        message:
          'POST https://provider.example/v1 failed Authorization: Bearer secret-token'
      })
    ])

    const result = await harness.useCase.execute(command())

    expect(result.messages.at(-1)).toMatchObject({
      status: 'failed',
      error: 'Conversation response failed'
    })
  })

  it('returns an idempotent turn without creating a second run', async () => {
    const harness = createHarness([])
    harness.beginTurn.mockResolvedValueOnce({
      status: 'idempotent',
      entity: completedSession()
    })

    const result = await harness.useCase.execute(command())

    expect(result).toEqual(completedSession())
    expect(harness.createRun).not.toHaveBeenCalled()
  })

  it('cancels a created run when its assistant binding cannot be persisted', async () => {
    const harness = createHarness([])
    harness.bindTurnRun.mockResolvedValueOnce({
      status: 'conflict',
      entity: pendingSession(3)
    })

    await expect(harness.useCase.execute(command())).rejects.toThrow(
      'Conversation revision conflict'
    )
    expect(harness.cancelRun).toHaveBeenCalledWith('run-1')
    expect(harness.finishTurn).not.toHaveBeenCalled()
  })
})

function createHarness(
  events: AiRunEvent[],
  onCompleted?: (input: {
    conversationId: string
    assistantMessageId: string
    sourceRunId: string
    responseLocale: string
    userObjective: string
    finalAnswer: string
    unresolvedItems: string[]
    artifactSummaries: []
    executionOutcome: 'completed'
  }) => void | Promise<void>
) {
  const initial = session(1, [])
  const started = pendingSession(2)
  const bound = {
    ...pendingSession(3),
    messages: pendingSession(3).messages.map((message) =>
      message.role === 'assistant' ? { ...message, runId: 'run-1' } : message
    )
  }
  const completed = completedSession()
  const beginTurn = vi.fn().mockResolvedValue({
    status: 'started',
    entity: started
  })
  const bindTurnRun = vi.fn().mockResolvedValue({
    status: 'updated',
    entity: bound
  })
  const rebindTurnRun = vi.fn()
  const finishTurn = vi.fn().mockImplementation(async (input) => ({
    status: 'updated',
    entity: {
      ...bound,
      revision: 4,
      messages: bound.messages.map((message) =>
        message.role === 'assistant'
          ? {
              ...message,
              status: input.status,
              content: input.content,
              ...(input.error ? { error: input.error } : {})
            }
          : message
      )
    }
  }))
  const createRun = vi.fn().mockResolvedValue({ runId: 'run-1' })
  const cancelRun = vi.fn().mockResolvedValue(undefined)
  const sessions = {
    get: vi.fn().mockResolvedValue(initial),
    listByWorkspace: vi.fn(),
    listByNodeRun: vi.fn(),
    listRecent: vi.fn(),
    save: vi.fn(async () => {
      throw new Error('legacy aggregate save must not be used')
    }),
    beginTurn,
    bindTurnRun,
    rebindTurnRun,
    finishTurn,
    recoverPendingTurns: vi.fn(),
    delete: vi.fn()
  } satisfies ChatSessionRepository
  return {
    beginTurn,
    bindTurnRun,
    finishTurn,
    createRun,
    cancelRun,
    useCase: new SendConversationMessageUseCase({
      sessions,
      gateway: {
        createRun,
        cancelRun,
        streamEvents: async function* () {
          yield* events
        }
      },
      now: () => 200,
      createId: () => 'message-1:assistant',
      onCompleted
    } as ConstructorParameters<typeof SendConversationMessageUseCase>[0])
  }
}

function command() {
  return {
    sessionId: 'conversation-1',
    content: 'Hello',
    expectedRevision: 1,
    messageId: 'message-1'
  }
}

function session(
  revision: number,
  messages: ChatSessionRecord['messages']
): Revisioned<ChatSessionRecord> {
  return {
    id: 'conversation-1',
    kind: 'general',
    title: 'Hello',
    sortOrder: 1,
    messages,
    revision,
    createdAt: 1,
    updatedAt: 1
  }
}

function pendingSession(revision: number): Revisioned<ChatSessionRecord> {
  return session(revision, [
    {
      id: 'message-1',
      role: 'user',
      status: 'completed',
      content: 'Hello',
      sortOrder: 0,
      createdAt: 200
    },
    {
      id: 'message-1:assistant',
      role: 'assistant',
      status: 'pending',
      content: '',
      sortOrder: 1,
      createdAt: 200
    }
  ])
}

function completedSession(): Revisioned<ChatSessionRecord> {
  return {
    ...pendingSession(4),
    messages: pendingSession(4).messages.map((message) =>
      message.role === 'assistant'
        ? { ...message, status: 'completed', runId: 'run-1', content: 'Hello world' }
        : message
    )
  }
}

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data']
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    timestamp: '2026-09-20T00:00:00.000Z',
    data
  }
}
