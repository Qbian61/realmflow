import {
  createAiRun,
  isTerminalAiRunStatus,
  transitionAiRun,
  type AiRun,
  type AiRunEvent
} from '../../../../domain/ai-run'
import type { RequirementStageId } from '../../../../domain/requirement'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { AiGenerateExecutorConfig } from '../../../../domain/workflow'
import type {
  AiRunGateway,
  ArtifactRepository,
  RunEventPublisher,
  RunRepository,
  StageContextRepository
} from './ports'

type GenerateDependencies = {
  runs: RunRepository
  gateway: AiRunGateway
  contexts: StageContextRepository
  artifacts: ArtifactRepository
  publisher: RunEventPublisher
  models?: {
    resolveExecution: (profileId: string) => Promise<ModelExecutionConfig>
    recordCall: (input: {
      modelProfileId: string
      requirementId: string
      aiRunId: string
      startedAt?: number
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
  schedule?: (task: Promise<void>) => void
  createId?: () => string
  now?: () => number
}

export class GenerateStageArtifactUseCase {
  private readonly schedule: (task: Promise<void>) => void

  constructor(private readonly dependencies: GenerateDependencies) {
    this.schedule =
      dependencies.schedule ??
      ((task) => {
        void task
      })
  }

  async execute(input: {
    requirementId: string
    stageId: RequirementStageId
    modelProfileId?: string
  }): Promise<{ runId: string; completion: Promise<void> }> {
    const startedAt = (this.dependencies.now ?? Date.now)()
    let created: { runId: string }
    try {
      const context = await this.dependencies.contexts.load(
        input.requirementId,
        input.stageId
      )
      const model = input.modelProfileId
        ? await this.dependencies.models?.resolveExecution(input.modelProfileId)
        : undefined
      created = await this.dependencies.gateway.createRun(context, model)
    } catch (error) {
      return this.createFailedRun(input, error)
    }
    const run = createAiRun(
      created.runId,
      input.requirementId,
      input.stageId
    )
    await this.dependencies.runs.save(run)
    const completion = this.consume(run, input.modelProfileId, startedAt)
    this.schedule(completion)
    return { runId: run.id, completion }
  }

  async executeNode(input: {
    requirementId: string
    nodeId: string
    nodeRunId: string
    executor: AiGenerateExecutorConfig
    modelProfileId?: string
  }): Promise<{ runId: string; completion: Promise<void> }> {
    const startedAt = (this.dependencies.now ?? Date.now)()
    const compatibilityStageId = input.executor.legacyStageId ?? 'analysis'
    let created: { runId: string }
    try {
      const context = await this.dependencies.contexts.loadNode(input)
      const model = input.modelProfileId
        ? await this.dependencies.models?.resolveExecution(input.modelProfileId)
        : undefined
      created = await this.dependencies.gateway.createRun(context, model)
    } catch (error) {
      return this.createFailedRun(
        {
          requirementId: input.requirementId,
          stageId: compatibilityStageId,
          nodeId: input.nodeId,
          ...(input.modelProfileId
            ? { modelProfileId: input.modelProfileId }
            : {})
        },
        error
      )
    }
    const run = createAiRun(
      created.runId,
      input.requirementId,
      compatibilityStageId,
      input.nodeId
    )
    await this.dependencies.runs.save(run)
    const completion = this.consume(
      run,
      input.modelProfileId,
      startedAt,
      {
        nodeId: input.nodeId,
        legacyStageId: input.executor.legacyStageId
      }
    )
    this.schedule(completion)
    return { runId: run.id, completion }
  }

  private async createFailedRun(
    input: {
      requirementId: string
      stageId: RequirementStageId
      nodeId?: string
      modelProfileId?: string
    },
    error: unknown
  ): Promise<{ runId: string; completion: Promise<void> }> {
    const runId = `local-${
      this.dependencies.createId?.() ?? globalThis.crypto.randomUUID()
    }`
    const message = error instanceof Error ? error.message : 'AI run failed'
    const failed = {
      ...transitionAiRun(
        createAiRun(runId, input.requirementId, input.stageId, input.nodeId),
        'failed'
      ),
      lastSequence: 1,
      error: message
    }
    await this.dependencies.runs.save(failed)
    const event: AiRunEvent = {
      id: `local-failure-${runId}`,
      runId,
      sequence: 1,
      type: 'run.failed',
      timestamp: new Date().toISOString(),
      data: { message }
    }
    await this.dependencies.runs.appendEvent(event)
    this.dependencies.publisher.publish(event)
    return { runId, completion: Promise.resolve() }
  }

  private async consume(
    initialRun: AiRun,
    modelProfileId?: string,
    startedAt?: number,
    artifactTarget?: {
      nodeId: string
      legacyStageId?: RequirementStageId
    }
  ): Promise<void> {
    const controller = new AbortController()
    let run = initialRun
    try {
      for await (const event of this.dependencies.gateway.streamEvents(
        run.id,
        controller.signal
      )) {
        if (event.runId !== run.id) {
          throw new Error('Event runId does not match the active run')
        }
        let accepted = false
        const updated = await this.dependencies.runs.update(
          run.id,
          async (current) => {
            if (event.sequence <= current.lastSequence) return current
            if (
              current.status === 'cancelling' &&
              event.type !== 'run.cancelled' &&
              event.type !== 'run.failed'
            ) {
              return current
            }
            if (isTerminalAiRunStatus(current.status)) return current
            accepted = true
            return this.applyEvent(current, event, artifactTarget)
          }
        )
        if (!updated) throw new Error('AI run no longer exists')
        run = updated
        if (accepted) {
          await this.dependencies.runs.appendEvent(event)
          this.dependencies.publisher.publish(event)
          await this.recordTerminalMetric(run, event, modelProfileId, startedAt)
        }
        if (isTerminalAiRunStatus(run.status)) break
      }
    } catch (error) {
      run = await this.failRun(run, error)
      controller.abort()
    }
  }

  private async recordTerminalMetric(
    run: AiRun,
    event: AiRunEvent,
    modelProfileId?: string,
    startedAt?: number
  ): Promise<void> {
    if (
      !modelProfileId ||
      !this.dependencies.models ||
      !['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)
    ) {
      return
    }
    const usage = event.data.usage
    try {
      await this.dependencies.models.recordCall({
        modelProfileId,
        requirementId: run.requirementId,
        aiRunId: run.id,
        ...(startedAt === undefined ? {} : { startedAt }),
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
    } catch {
      // Metrics are observational and must not change the committed run outcome.
    }
  }

  private async applyEvent(
    run: AiRun,
    event: AiRunEvent,
    artifactTarget?: {
      nodeId: string
      legacyStageId?: RequirementStageId
    }
  ): Promise<AiRun> {
    const next = { ...run, lastSequence: event.sequence }
    switch (event.type) {
      case 'run.started':
        return transitionAiRun(next, 'running')
      case 'run.progress':
      case 'heartbeat':
        return next
      case 'content.delta':
        if (typeof event.data.delta !== 'string') {
          throw new Error('Invalid content.delta event')
        }
        return { ...next, content: next.content + event.data.delta }
      case 'artifact.ready':
        if (!isValidArtifact(event.data.artifact)) {
          throw new Error('Invalid artifact.ready event')
        }
        return { ...next, artifact: event.data.artifact }
      case 'run.completed':
        if (!next.artifact) {
          throw new Error('Run completed without a valid artifact')
        }
        await this.dependencies.artifacts.commit({
          runId: next.id,
          requirementId: next.requirementId,
          stageId: next.stageId,
          ...(artifactTarget
            ? {
                nodeId: artifactTarget.nodeId,
                legacyStageId: artifactTarget.legacyStageId
              }
            : {}),
          artifact: next.artifact,
          completionEvent: event
        })
        return transitionAiRun(next, 'completed')
      case 'run.failed':
        return {
          ...transitionAiRun(next, 'failed'),
          error: event.data.message ?? 'AI run failed'
        }
      case 'run.cancelled':
        return transitionAiRun(next, 'cancelled')
    }
  }

  private async failRun(run: AiRun, error: unknown): Promise<AiRun> {
    const message = error instanceof Error ? error.message : 'AI run failed'
    const failed =
      (await this.dependencies.runs.update(run.id, (current) => {
        if (isTerminalAiRunStatus(current.status)) return current
        return {
          ...transitionAiRun(current, 'failed'),
          error: message
        }
      })) ?? run
    if (failed.status !== 'failed') return failed
    const failureEvent: AiRunEvent = {
      id: `local-failure-${run.id}`,
      runId: run.id,
      sequence: run.lastSequence + 1,
      type: 'run.failed',
      timestamp: new Date().toISOString(),
      data: { message }
    }
    await this.dependencies.runs.appendEvent(failureEvent)
    this.dependencies.publisher.publish(failureEvent)
    return failed
  }
}

export class CancelAiRunUseCase {
  constructor(
    private readonly dependencies: {
      runs: RunRepository
      gateway: AiRunGateway
      publisher: RunEventPublisher
    }
  ) {}

  async execute(runId: string): Promise<void> {
    const run = await this.dependencies.runs.update(runId, (current) =>
      isTerminalAiRunStatus(current.status)
        ? current
        : transitionAiRun(current, 'cancelling')
    )
    if (!run || isTerminalAiRunStatus(run.status)) return
    try {
      await this.dependencies.gateway.cancelRun(runId)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI run cancellation failed'
      const failed = await this.dependencies.runs.update(runId, (current) =>
        isTerminalAiRunStatus(current.status)
          ? current
          : {
              ...transitionAiRun(current, 'failed'),
              error: message
            }
      )
      if (failed?.status !== 'failed') return
      const failureEvent: AiRunEvent = {
        id: `local-cancel-failure-${runId}`,
        runId,
        sequence: failed.lastSequence + 1,
        type: 'run.failed',
        timestamp: new Date().toISOString(),
        data: { message }
      }
      await this.dependencies.runs.appendEvent(failureEvent)
      this.dependencies.publisher.publish(failureEvent)
    }
  }
}

function isValidArtifact(
  value: unknown
): value is { path: string; content: string } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { path?: unknown }).path === 'string' &&
    (value as { path: string }).path.length > 0 &&
    typeof (value as { content?: unknown }).content === 'string' &&
    (value as { content: string }).content.length > 0
  )
}
