import type { AiRunEvent } from '../../../../domain/ai-run'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { Schedule } from '../../../../domain/schedule'
import type {
  AiRunGateway,
  ConversationContext
} from '../../ai-run/application/ports'

type SkillRunGateway = AiRunGateway & {
  prepare(context: ConversationContext): Promise<void>
}

type Dependencies = {
  models: {
    resolveExecution(profileId: string): Promise<ModelExecutionConfig>
  }
  gateway: SkillRunGateway
}

type Command = {
  schedule: Schedule
  scheduleRunId: string
}

type Execution = {
  id: string
  status: 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  error?: { code: string; message: string }
  finishedAt: number
}

export class ModelSkillExecutionRuntime {
  constructor(private readonly dependencies: Dependencies) {}

  async prepare(
    command: Command
  ): Promise<{ outcome: 'ready'; permissionRequests: [] }> {
    this.requireSkill(command.schedule)
    await this.dependencies.models.resolveExecution(
      command.schedule.modelProfileId
    )
    await this.dependencies.gateway.prepare(contextFor(command))
    return { outcome: 'ready', permissionRequests: [] }
  }

  async execute(
    command: Command
  ): Promise<{ outcome: 'executed'; execution: Execution }> {
    this.requireSkill(command.schedule)
    const model = await this.dependencies.models.resolveExecution(
      command.schedule.modelProfileId
    )
    const { runId } = await this.dependencies.gateway.createRun(
      contextFor(command),
      model
    )
    const controller = new AbortController()
    for await (const event of this.dependencies.gateway.streamEvents(
      runId,
      controller.signal
    )) {
      const execution = terminalExecution(runId, event)
      if (execution) return { outcome: 'executed', execution }
    }
    return {
      outcome: 'executed',
      execution: {
        id: runId,
        status: 'interrupted',
        error: {
          code: 'stream_interrupted',
          message: 'Skill execution failed'
        },
        finishedAt: Date.now()
      }
    }
  }

  private requireSkill(schedule: Schedule): void {
    if (schedule.executionTarget.kind !== 'skill') {
      throw new Error('Model Skill runtime requires a Skill target')
    }
  }
}

function contextFor(command: Command): ConversationContext {
  const { schedule, scheduleRunId } = command
  const task = schedule.description || schedule.name
  return {
    conversationId: `schedule:${schedule.id}:${scheduleRunId}`,
    workspaceId: schedule.workspaceId,
    scheduleRunId,
    triggerBindingId: `schedule:${schedule.id}:revision:${schedule.revision}`,
    triggerEventId: `schedule-run:${scheduleRunId}`,
    connectorBindings: schedule.connectorBindings,
    skill: schedule.executionTarget,
    context: `Scheduled automation: ${schedule.name}`,
    messages: [
      {
        role: 'user',
        content: `${task}\n\nInput:\n${JSON.stringify(schedule.skillInput)}`
      }
    ]
  }
}

function terminalExecution(
  runId: string,
  event: AiRunEvent
): Execution | undefined {
  const finishedAt = Date.parse(event.timestamp)
  if (event.type === 'run.completed') {
    return { id: runId, status: 'succeeded', finishedAt }
  }
  if (event.type === 'run.cancelled') {
    return { id: runId, status: 'cancelled', finishedAt }
  }
  if (event.type === 'run.failed') {
    return {
      id: runId,
      status: 'failed',
      error: {
        code: event.data.errorCode ?? 'schedule_execution_failed',
        message: 'Skill execution failed'
      },
      finishedAt
    }
  }
  return undefined
}
