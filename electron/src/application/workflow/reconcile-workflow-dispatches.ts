import type {
  NodeRunRepository,
  RequirementWorkflowRepository,
  WorkflowDispatchRepository,
  WorkflowExecutionRepository
} from '../ports/business-repositories'
import { createAutomaticWorkflowDispatchId } from './workflow-dispatch'
import { isWorkflowNodeExecutable } from './execute-workflow-node'

type DrainResult = {
  completed: number
  failed: number
  skipped: number
}

type Dependencies = {
  executions: Pick<WorkflowExecutionRepository, 'listByStatus'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'getLatestByNode'>
  dispatches: Pick<WorkflowDispatchRepository, 'enqueue'>
  worker: { drain: () => Promise<DrainResult> }
}

export class ReconcileWorkflowDispatchesUseCase {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(): Promise<{ enqueued: number; drain: DrainResult }> {
    const executions = await this.dependencies.executions.listByStatus('running')
    let enqueued = 0
    for (const execution of executions) {
      const workflow = await this.dependencies.workflows.get(
        execution.requirementId
      )
      if (!workflow) continue
      const automaticReadyNodes = workflow.nodes.filter(
        (node) =>
          node.status === 'ready' &&
          isWorkflowNodeExecutable(node)
      )
      for (const node of automaticReadyNodes) {
        const nodeRun = await this.dependencies.nodeRuns.getLatestByNode(
          execution.id,
          node.id
        )
        if (!nodeRun || nodeRun.status !== 'ready') continue
        const timestamp = this.now()
        await this.dependencies.dispatches.enqueue(
          {
            id: createAutomaticWorkflowDispatchId(execution.id, nodeRun.id),
            executionId: execution.id,
            requirementId: execution.requirementId,
            nodeId: node.id,
            nodeRunId: nodeRun.id,
            triggerNodeRunId: nodeRun.id,
            status: 'pending',
            attempts: 0,
            createdAt: timestamp,
            updatedAt: timestamp
          },
          'recovery'
        )
        enqueued += 1
      }
    }
    return { enqueued, drain: await this.dependencies.worker.drain() }
  }
}
