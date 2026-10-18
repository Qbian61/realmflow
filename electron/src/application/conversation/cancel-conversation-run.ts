import {
  projectAssistantTurn,
  type AssistantRunEvent,
  type AssistantTurnProjection
} from '../../../../domain/assistant-turn'
import type {
  AssistantRunTimelineRepository,
  ChatSessionRecord,
  ChatSessionRepository,
  Revisioned
} from '../ports/business-repositories'

type Dependencies = {
  sessions: Pick<ChatSessionRepository, 'get' | 'finishTurn'>
  timeline: Pick<AssistantRunTimelineRepository, 'appendAndProject' | 'getSnapshot'>
  publishProjection?: (input: {
    sessionId: string
    turnId: string
    projection: AssistantTurnProjection
  }) => void | Promise<void>
  now?: () => number
}

export class CancelConversationRunUseCase {
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async execute(input: {
    sessionId: string
    runId: string
  }): Promise<Revisioned<ChatSessionRecord>> {
    const session = await this.dependencies.sessions.get(input.sessionId)
    if (!session) throw new Error(`Conversation not found: ${input.sessionId}`)
    const assistant = session.messages.find(
      (message) =>
        message.role === 'assistant' &&
        message.status === 'pending' &&
        message.runId === input.runId
    )
    if (!assistant) return session

    const current = await this.dependencies.timeline.getSnapshot(input.runId)
    if (!current) return session
    const timestamp = this.now()
    const event: AssistantRunEvent = {
      id: `${input.runId}:cancel:${current.lastSequence + 1}`,
      runId: input.runId,
      sequence: current.lastSequence + 1,
      type: 'run.cancelled',
      timestamp,
      data: { message: 'Run cancelled' }
    }
    const projection = projectAssistantTurn(current, event)
    const appended = await this.dependencies.timeline.appendAndProject(
      event,
      projection
    )
    if (appended) {
      await this.dependencies.publishProjection?.({
        sessionId: input.sessionId,
        turnId: projection.turnId,
        projection
      })
    }

    const finished = await this.dependencies.sessions.finishTurn({
      sessionId: input.sessionId,
      assistantMessageId: assistant.id,
      runId: input.runId,
      status: 'failed',
      content: projection.answer,
      error: 'Run cancelled',
      expectedRevision: session.revision,
      updatedAt: timestamp
    })
    return finished.entity
  }
}
