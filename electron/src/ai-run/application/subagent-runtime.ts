import {
  validateDelegationRequest,
  type DelegationPolicy,
  type DelegationRequest,
  type DelegationResult,
  type SubagentTaskResult,
  type ValidatedDelegationTask
} from '../../../../domain/subagent'

type Dependencies = {
  runTask?: (
    task: ValidatedDelegationTask,
    signal: AbortSignal
  ) => Promise<SubagentTaskResult>
}

type RootUsage = {
  subagents: number
  toolCalls: number
}

export class SubagentRuntime {
  private readonly usage = new Map<string, RootUsage>()
  private readonly controllers = new Map<string, Set<AbortController>>()

  constructor(private readonly dependencies: Dependencies = {}) {}

  async execute(input: {
    rootRunId: string
    request: DelegationRequest
    policy: DelegationPolicy
    signal: AbortSignal
    runTask?: Dependencies['runTask']
  }): Promise<DelegationResult> {
    const runTask = input.runTask ?? this.dependencies.runTask
    if (!runTask) throw new Error('Subagent task runner is unavailable')
    const consumed = this.usage.get(input.rootRunId) ?? {
      subagents: 0,
      toolCalls: 0
    }
    const validated = validateDelegationRequest(input.request, {
      ...input.policy,
      consumedSubagents: Math.max(
        input.policy.consumedSubagents,
        consumed.subagents
      ),
      consumedToolCalls: Math.max(
        input.policy.consumedToolCalls,
        consumed.toolCalls
      )
    })
    this.usage.set(input.rootRunId, {
      subagents: consumed.subagents + validated.reservation.subagents,
      toolCalls: consumed.toolCalls + validated.reservation.toolCalls
    })

    const controller = new AbortController()
    const abort = (): void => controller.abort()
    input.signal.addEventListener('abort', abort, { once: true })
    this.addController(input.rootRunId, controller)
    const results = new Array<SubagentTaskResult | undefined>(
      validated.tasks.length
    )
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (!controller.signal.aborted) {
        const index = cursor
        cursor += 1
        const task = validated.tasks[index]
        if (!task) return
        results[index] = await this.runTask(
          task,
          controller.signal,
          runTask
        )
      }
    }

    try {
      await Promise.all(
        Array.from({ length: validated.concurrency }, () => worker())
      )
      for (let index = 0; index < validated.tasks.length; index += 1) {
        results[index] ??= cancelled(validated.tasks[index])
      }
      const tasks = results as SubagentTaskResult[]
      return {
        status: aggregateStatus(tasks),
        tasks
      }
    } finally {
      input.signal.removeEventListener('abort', abort)
      this.removeController(input.rootRunId, controller)
    }
  }

  cancel(rootRunId: string): void {
    for (const controller of this.controllers.get(rootRunId) ?? []) {
      controller.abort()
    }
  }

  release(rootRunId: string): void {
    this.usage.delete(rootRunId)
    this.controllers.delete(rootRunId)
  }

  private async runTask(
    task: ValidatedDelegationTask,
    signal: AbortSignal,
    runTask: NonNullable<Dependencies['runTask']>
  ): Promise<SubagentTaskResult> {
    try {
      return await runTask(task, signal)
    } catch (error) {
      return {
        taskId: task.id,
        status: signal.aborted ? 'cancelled' : 'failed',
        summary: signal.aborted
          ? 'Subagent task was cancelled'
          : 'Subagent task failed',
        evidence: [],
        unresolved: signal.aborted ? [] : [safeErrorMessage(error)],
        artifactIds: [],
        ...(signal.aborted ? {} : { errorCode: 'subagent_failed' })
      }
    }
  }

  private addController(
    rootRunId: string,
    controller: AbortController
  ): void {
    const current = this.controllers.get(rootRunId) ?? new Set()
    current.add(controller)
    this.controllers.set(rootRunId, current)
  }

  private removeController(
    rootRunId: string,
    controller: AbortController
  ): void {
    const current = this.controllers.get(rootRunId)
    current?.delete(controller)
    if (current?.size === 0) this.controllers.delete(rootRunId)
  }
}

function aggregateStatus(
  tasks: readonly SubagentTaskResult[]
): DelegationResult['status'] {
  if (tasks.every(({ status }) => status === 'completed')) return 'completed'
  if (tasks.every(({ status }) => status === 'cancelled')) return 'cancelled'
  if (tasks.every(({ status }) => status === 'failed')) return 'failed'
  return 'partial'
}

function cancelled(task: ValidatedDelegationTask): SubagentTaskResult {
  return {
    taskId: task.id,
    status: 'cancelled',
    summary: 'Subagent task was cancelled',
    evidence: [],
    unresolved: [],
    artifactIds: []
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Subagent task failed'
}
