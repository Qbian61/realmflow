import type {
  NodeRunRepository,
  RequirementWorkflowRepository,
  Revisioned,
  WorkflowDispatchRecord,
  WorkflowDispatchRepository,
  WorkflowExecutionRepository
} from '../ports/business-repositories'
import type { ExecuteWorkflowNodeUseCase } from './execute-workflow-node'

type Dependencies = {
  dispatches: Pick<
    WorkflowDispatchRepository,
    'listDispatchable' | 'claim' | 'save'
  >
  executions: Pick<WorkflowExecutionRepository, 'getActiveByRequirement'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'get'>
  executeNode: Pick<ExecuteWorkflowNodeUseCase, 'execute'>
}

type DrainResult = {
  completed: number
  failed: number
  skipped: number
}

export class AdvanceWorkflowUseCase {
  private activeDrain?: Promise<DrainResult>
  private drainRequested = false

  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  drain(limit = 50): Promise<DrainResult> {
    if (this.activeDrain) {
      this.drainRequested = true
      return this.activeDrain
    }
    this.activeDrain = this.drainUntilSettled(limit).finally(() => {
      this.activeDrain = undefined
    })
    return this.activeDrain
  }

  private async drainUntilSettled(limit: number): Promise<DrainResult> {
    const total: DrainResult = { completed: 0, failed: 0, skipped: 0 }
    do {
      this.drainRequested = false
      const pass = await this.drainOnce(limit)
      total.completed += pass.completed
      total.failed += pass.failed
      total.skipped += pass.skipped
    } while (this.drainRequested)
    return total
  }

  private async drainOnce(limit: number): Promise<DrainResult> {
    const result: DrainResult = { completed: 0, failed: 0, skipped: 0 }
    const dispatches = await this.dependencies.dispatches.listDispatchable(limit)
    for (const dispatch of dispatches) {
      const claimed = await this.dependencies.dispatches.claim(
        dispatch.id,
        dispatch.revision,
        this.now()
      )
      if (claimed.status === 'conflict') {
        result.skipped += 1
        continue
      }
      const outcome = await this.process(claimed.entity)
      result[outcome] += 1
    }
    return result
  }

  private async process(
    dispatch: Revisioned<WorkflowDispatchRecord>
  ): Promise<keyof DrainResult> {
    try {
      const [execution, workflow, nodeRun] = await Promise.all([
        this.dependencies.executions.getActiveByRequirement(
          dispatch.requirementId
        ),
        this.dependencies.workflows.get(dispatch.requirementId),
        this.dependencies.nodeRuns.get(dispatch.nodeRunId)
      ])
      if (!execution || execution.id !== dispatch.executionId) {
        throw new Error('Workflow dispatch execution is not active')
      }
      if (!workflow || !nodeRun || nodeRun.nodeId !== dispatch.nodeId) {
        throw new Error('Workflow dispatch state is incomplete')
      }
      if (execution.status !== 'running') {
        await this.complete(dispatch)
        return 'skipped'
      }
      if (nodeRun.status === 'running' || nodeRun.status === 'completed') {
        await this.complete(dispatch)
        return 'completed'
      }
      const node = workflow.nodes.find(
        (candidate) => candidate.id === dispatch.nodeId
      )
      if (
        !node ||
        node.type !== 'ai_generate' ||
        !node.executor ||
        !['ready', 'failed'].includes(node.status) ||
        !['ready', 'failed'].includes(nodeRun.status)
      ) {
        await this.complete(dispatch)
        return 'skipped'
      }
      await this.dependencies.executeNode.execute({
        requirementId: dispatch.requirementId,
        nodeId: dispatch.nodeId,
        nodeRunId: dispatch.nodeRunId
      })
      await this.complete(dispatch)
      return 'completed'
    } catch (error) {
      const saved = await this.dependencies.dispatches.save(
        {
          ...dispatch,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: this.now(),
          completedAt: undefined
        },
        dispatch.revision
      )
      return saved.status === 'saved' ? 'failed' : 'skipped'
    }
  }

  private async complete(
    dispatch: Revisioned<WorkflowDispatchRecord>
  ): Promise<void> {
    await this.dependencies.dispatches.save(
      {
        ...dispatch,
        status: 'completed',
        error: undefined,
        updatedAt: this.now(),
        completedAt: this.now()
      },
      dispatch.revision
    )
  }
}
