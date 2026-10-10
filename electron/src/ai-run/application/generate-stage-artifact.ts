import {
  createAiRun,
  isTerminalAiRunStatus,
  transitionAiRun,
  type AiRun,
  type AiRunEvent
} from '../../../../domain/ai-run'
import type { RequirementStageId } from '../../../../domain/requirement'
import type {
  ModelCallErrorCode,
  ModelExecutionConfig
} from '../../../../domain/model'
import type {
  AiGenerateExecutorConfig,
  WorkflowReasoningPolicy
} from '../../../../domain/workflow'
import type {
  AiRunGateway,
  RunEventPublisher,
  RunRepository,
  StageContextRepository
} from './ports'
import type { CommitFormalArtifactUseCase } from './commit-formal-artifact'

type GenerateDependencies = {
  runs: RunRepository
  gateway: AiRunGateway
  contexts: StageContextRepository
  artifactCommitter: Pick<CommitFormalArtifactUseCase, 'execute'>
  publisher: RunEventPublisher
  models?: {
    resolveExecution: (profileId: string) => Promise<ModelExecutionConfig>
    recordCall: (input: {
      modelProfileId: string
      source: 'workflow_stage' | 'workflow_node'
      workspaceId: string
      requirementId: string
      nodeId?: string
      aiRunId: string
      contextSnapshotId?: string
      requestedReasoning?: WorkflowReasoningPolicy
      effectiveReasoning?: Exclude<WorkflowReasoningPolicy, 'inherit'>
      startedAt?: number
      inputTokens: number
      outputTokens: number
      cachedTokens: number
      reasoningTokens: number
      firstTokenLatencyMs?: number
      durationMs: number
      retryCount: number
      status: 'completed' | 'failed' | 'cancelled'
      errorCode?: ModelCallErrorCode
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
    let workspaceId: string
    try {
      const context = await this.dependencies.contexts.load(
        input.requirementId,
        input.stageId
      )
      workspaceId = context.workspaceId
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
      input.stageId,
      undefined,
      {
        workspaceId,
        ...(input.modelProfileId
          ? { modelProfileId: input.modelProfileId }
          : {}),
        startedAt
      }
    )
    await this.saveCreatedRun(run)
    const completion = this.consume(run, input.modelProfileId, startedAt, {
      workspaceId,
      expectedArtifact: legacyArtifactSpecification(input.stageId)
    })
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
    let contextSnapshotId: string | undefined
    let requestedReasoning: WorkflowReasoningPolicy | undefined
    let effectiveReasoning:
      | Exclude<WorkflowReasoningPolicy, 'inherit'>
      | undefined
    let workspaceId: string
    try {
      const context = await this.dependencies.contexts.loadNode(input)
      contextSnapshotId = context.contextSnapshotId
      requestedReasoning = context.requestedReasoning
      effectiveReasoning = context.effectiveReasoning
      workspaceId = context.workspaceId
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
      input.nodeId,
      {
        workspaceId,
        ...(input.modelProfileId
          ? { modelProfileId: input.modelProfileId }
          : {}),
        ...(contextSnapshotId ? { contextSnapshotId } : {}),
        startedAt
      }
    )
    await this.saveCreatedRun(run)
    const completion = this.consume(
      run,
      input.modelProfileId,
      startedAt,
      {
        workspaceId,
        nodeId: input.nodeId,
        nodeRunId: input.nodeRunId,
        legacyStageId: input.executor.legacyStageId,
        expectedArtifact: input.executor.artifact,
        contextSnapshotId,
        requestedReasoning,
        effectiveReasoning
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

  private async saveCreatedRun(run: AiRun): Promise<void> {
    try {
      await this.dependencies.runs.save(run)
    } catch (error) {
      await this.dependencies.gateway.cancelRun(run.id).catch(() => undefined)
      throw error
    }
  }

  private async consume(
    initialRun: AiRun,
    modelProfileId?: string,
    startedAt?: number,
    artifactTarget?: {
      workspaceId: string
      nodeId?: string
      nodeRunId?: string
      legacyStageId?: RequirementStageId
      expectedArtifact: {
        relativePath: string
        kind: string
      }
      contextSnapshotId?: string
      requestedReasoning?: WorkflowReasoningPolicy
      effectiveReasoning?: Exclude<WorkflowReasoningPolicy, 'inherit'>
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
            if (event.sequence !== current.lastSequence + 1) {
              throw new Error('AI run event sequence gap')
            }
            if (
              current.status === 'cancelling' &&
              event.type !== 'run.cancelled' &&
              event.type !== 'run.failed'
            ) {
              return { ...current, lastSequence: event.sequence }
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
          await this.recordTerminalMetric(
            run,
            event,
            modelProfileId,
            startedAt,
            artifactTarget?.contextSnapshotId,
            artifactTarget?.workspaceId,
            artifactTarget?.requestedReasoning,
            artifactTarget?.effectiveReasoning
          )
        }
        if (isTerminalAiRunStatus(run.status)) break
      }
    } catch (error) {
      const failure = await this.failRun(run, error)
      run = failure.run
      controller.abort()
      if (failure.event) {
        await this.recordTerminalMetric(
          run,
          failure.event,
          modelProfileId,
          startedAt,
          artifactTarget?.contextSnapshotId,
          artifactTarget?.workspaceId,
          artifactTarget?.requestedReasoning,
          artifactTarget?.effectiveReasoning
        )
      }
    }
  }

  private async recordTerminalMetric(
    run: AiRun,
    event: AiRunEvent,
    modelProfileId?: string,
    startedAt?: number,
    contextSnapshotId?: string,
    workspaceId?: string,
    requestedReasoning?: WorkflowReasoningPolicy,
    effectiveReasoning?: Exclude<WorkflowReasoningPolicy, 'inherit'>
  ): Promise<void> {
    if (
      !modelProfileId ||
      !this.dependencies.models ||
      !workspaceId ||
      !['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)
    ) {
      return
    }
    const usage = event.data.usage
    try {
      await this.dependencies.models.recordCall({
        source: run.nodeId ? 'workflow_node' : 'workflow_stage',
        modelProfileId,
        workspaceId,
        requirementId: run.requirementId,
        ...(run.nodeId ? { nodeId: run.nodeId } : {}),
        aiRunId: run.id,
        ...(contextSnapshotId ? { contextSnapshotId } : {}),
        ...(requestedReasoning ? { requestedReasoning } : {}),
        ...(effectiveReasoning ? { effectiveReasoning } : {}),
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
        ...(event.data.errorCode
          ? { errorCode: event.data.errorCode }
          : {}),
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
      workspaceId: string
      nodeId?: string
      nodeRunId?: string
      legacyStageId?: RequirementStageId
      expectedArtifact: {
        relativePath: string
        kind: string
      }
      contextSnapshotId?: string
    }
  ): Promise<AiRun> {
    const next = { ...run, lastSequence: event.sequence }
    switch (event.type) {
      case 'run.started':
        return transitionAiRun(next, 'running')
      case 'run.progress':
      case 'run.turn_ready':
      case 'execution.summary.delta':
      case 'reference.added':
      case 'tool.call.requested':
      case 'tool.call.started':
      case 'tool.call.progress':
      case 'tool.call.completed':
      case 'tool.call.failed':
      case 'tool.call.permission_required':
      case 'run.retrying':
      case 'run.waiting_input':
      case 'run.paused':
      case 'run.recovery_blocked':
      case 'run.resumed':
      case 'context.compacted':
      case 'heartbeat':
        return next
      case 'answer.delta':
        if (typeof event.data.delta !== 'string') {
          throw new Error('Invalid answer.delta event')
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
        if (!artifactTarget) {
          throw new Error('Formal artifact specification is unavailable')
        }
        await this.dependencies.artifactCommitter.execute({
          runId: next.id,
          requirementId: next.requirementId,
          stageId: next.stageId,
          ...(artifactTarget.nodeId
            ? { nodeId: artifactTarget.nodeId }
            : {}),
          ...(artifactTarget.nodeRunId
            ? { nodeRunId: artifactTarget.nodeRunId }
            : {}),
          ...(artifactTarget.legacyStageId
            ? { legacyStageId: artifactTarget.legacyStageId }
            : {}),
          expectedArtifact: artifactTarget.expectedArtifact,
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

  private async failRun(
    run: AiRun,
    error: unknown
  ): Promise<{ run: AiRun; event?: AiRunEvent }> {
    const message = error instanceof Error ? error.message : 'AI run failed'
    const failed =
      (await this.dependencies.runs.update(run.id, (current) => {
        if (isTerminalAiRunStatus(current.status)) return current
        return {
          ...transitionAiRun(current, 'failed'),
          lastSequence: current.lastSequence + 1,
          error: message
        }
      })) ?? run
    if (failed.status !== 'failed') return { run: failed }
    const failureEvent: AiRunEvent = {
      id: `local-failure-${run.id}`,
      runId: run.id,
      sequence: failed.lastSequence,
      type: 'run.failed',
      timestamp: new Date().toISOString(),
      data: { message, errorCode: 'stream_error' }
    }
    await this.dependencies.runs.appendEvent(failureEvent)
    this.dependencies.publisher.publish(failureEvent)
    return { run: failed, event: failureEvent }
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

  async execute(
    runId: string,
    options: { forceProvider?: boolean } = {}
  ): Promise<void> {
    const run = await this.dependencies.runs.update(runId, (current) =>
      isTerminalAiRunStatus(current.status)
        ? current
        : transitionAiRun(current, 'cancelling')
    )
    if (!run) return
    if (isTerminalAiRunStatus(run.status) && !options.forceProvider) return
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
              lastSequence: current.lastSequence + 1,
              error: message
            }
      )
      if (failed?.status === 'failed') {
        const failureEvent: AiRunEvent = {
          id: `local-cancel-failure-${runId}`,
          runId,
          sequence: failed.lastSequence,
          type: 'run.failed',
          timestamp: new Date().toISOString(),
          data: { message }
        }
        await this.dependencies.runs.appendEvent(failureEvent)
        this.dependencies.publisher.publish(failureEvent)
      }
      throw error
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

function legacyArtifactSpecification(stageId: RequirementStageId): {
  relativePath: string
  kind: string
} {
  return {
    relativePath: `artifacts/${stageId}.md`,
    kind: 'markdown'
  }
}
