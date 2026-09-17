import { randomUUID } from 'node:crypto'
import type { AiRunEvent } from '../../../../domain/ai-run'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type {
  ChatSessionRecord,
  ChatSessionRepository,
  Revisioned
} from '../ports/business-repositories'
import type { ConversationContext } from '../../ai-run/application/ports'

type Dependencies = {
  sessions: ChatSessionRepository
  gateway: {
    createRun: (
      context: ConversationContext,
      model?: ModelExecutionConfig
    ) => Promise<{ runId: string }>
    streamEvents: (
      runId: string,
      signal: AbortSignal
    ) => AsyncIterable<AiRunEvent>
  }
  models?: {
    resolveExecution: (profileId: string) => Promise<ModelExecutionConfig>
    recordCall: (input: {
      modelProfileId: string
      workspaceId?: string
      conversationId: string
      aiRunId: string
      startedAt: number
      inputTokens: number
      outputTokens: number
      cachedTokens: number
      reasoningTokens: number
      firstTokenLatencyMs?: number
      durationMs: number
      retryCount: number
      status: 'completed' | 'failed' | 'cancelled'
    }) => Promise<unknown>
  }
  createId?: () => string
  now?: () => number
}

export class SendConversationMessageUseCase {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.createId = dependencies.createId ?? randomUUID
    this.now = dependencies.now ?? Date.now
  }

  async execute(input: {
    sessionId: string
    content: string
    expectedRevision: number
    messageId?: string
    modelProfileId?: string
  }): Promise<Revisioned<ChatSessionRecord>> {
    const content = input.content.trim()
    if (!content) throw new Error('Conversation message is required')
    const current = await this.dependencies.sessions.get(input.sessionId)
    if (!current) throw new Error(`Conversation not found: ${input.sessionId}`)
    const timestamp = this.now()
    const userResult = await this.dependencies.sessions.save(
      {
        ...current,
        messages: [
          ...current.messages,
          {
            id: input.messageId ?? this.createId(),
            role: 'user',
            content,
            sortOrder: current.messages.length,
            createdAt: timestamp
          }
        ],
        updatedAt: timestamp
      },
      input.expectedRevision
    )
    if (userResult.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }

    const model =
      input.modelProfileId && this.dependencies.models
        ? await this.dependencies.models.resolveExecution(input.modelProfileId)
        : undefined
    const startedAt = this.now()
    const created = await this.dependencies.gateway.createRun(
      {
        conversationId: current.id,
        messages: userResult.entity.messages.map(({ role, content }) => ({
          role,
          content
        })),
        ...(current.workspaceId ? { workspaceId: current.workspaceId } : {}),
        ...(current.folderPath ? { folderPath: current.folderPath } : {})
      },
      model
    )
    let assistantContent = ''
    let lastSequence = 0
    let terminalEvent: AiRunEvent | undefined
    for await (const event of this.dependencies.gateway.streamEvents(
      created.runId,
      new AbortController().signal
    )) {
      if (event.runId !== created.runId || event.sequence <= lastSequence) continue
      lastSequence = event.sequence
      if (event.type === 'content.delta' && typeof event.data.delta === 'string') {
        assistantContent += event.data.delta
      }
      if (
        event.type === 'run.completed' ||
        event.type === 'run.failed' ||
        event.type === 'run.cancelled'
      ) {
        terminalEvent = event
        break
      }
    }
    if (!terminalEvent) throw new Error('Conversation run ended without a terminal event')
    await this.recordMetric(
      input.modelProfileId,
      current,
      created.runId,
      startedAt,
      terminalEvent
    )
    if (terminalEvent.type !== 'run.completed') {
      throw new Error(
        terminalEvent.data.message ??
          (terminalEvent.type === 'run.cancelled'
            ? 'Conversation run cancelled'
            : 'Conversation run failed')
      )
    }
    if (!assistantContent.trim()) {
      throw new Error('Conversation run completed without assistant content')
    }
    const completedAt = this.now()
    const assistantResult = await this.dependencies.sessions.save(
      {
        ...userResult.entity,
        messages: [
          ...userResult.entity.messages,
          {
            id: this.createId(),
            role: 'assistant',
            content: assistantContent,
            sortOrder: userResult.entity.messages.length,
            createdAt: completedAt
          }
        ],
        updatedAt: completedAt
      },
      userResult.entity.revision
    )
    if (assistantResult.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    return assistantResult.entity
  }

  private async recordMetric(
    modelProfileId: string | undefined,
    session: Revisioned<ChatSessionRecord>,
    runId: string,
    startedAt: number,
    event: AiRunEvent
  ): Promise<void> {
    if (!modelProfileId || !this.dependencies.models) return
    const usage = event.data.usage
    await this.dependencies.models.recordCall({
      modelProfileId,
      ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
      conversationId: session.id,
      aiRunId: runId,
      startedAt,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cachedTokens: usage?.cachedTokens ?? 0,
      reasoningTokens: usage?.reasoningTokens ?? 0,
      ...(event.data.firstTokenLatencyMs === undefined
        ? {}
        : { firstTokenLatencyMs: event.data.firstTokenLatencyMs }),
      durationMs: event.data.durationMs ?? 0,
      retryCount: event.data.retryCount ?? 0,
      status:
        event.type === 'run.completed'
          ? 'completed'
          : event.type === 'run.cancelled'
            ? 'cancelled'
            : 'failed'
    })
  }
}
