import type {
  NodeRunRepository,
  RequirementWorkflowRepository,
  WorkflowDispatchRepository,
  WorkflowExecutionRepository,
  WorkflowRollbackOperationRepository
} from '../ports/business-repositories'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'
import type { CoordinateWorkflowRollbackUseCase } from './coordinate-workflow-rollback'
import { createRecoveryWorkflowDispatchId } from './workflow-dispatch'

type Dependencies = {
  executions: Pick<WorkflowExecutionRepository, 'get' | 'listByStatus'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'getLatestByNode' | 'listInterrupted'>
  dispatches: Pick<WorkflowDispatchRepository, 'enqueue'>
  manager: Pick<ManageNodeExecutionUseCase, 'interruptNode'>
}

type RecoveryResult = {
  interrupted: number
  enqueued: number
  failed: number
}

export class RecoverPendingWorkflowRollbacksUseCase {
  constructor(
    private readonly dependencies: {
      workflowRollbacks: Pick<
        WorkflowRollbackOperationRepository,
        'listPending'
      >
      coordinator: Pick<CoordinateWorkflowRollbackUseCase, 'execute'>
    }
  ) {}

  async execute(): Promise<{ coordinated: number; failed: number }> {
    const result = { coordinated: 0, failed: 0 }
    const pending = await this.dependencies.workflowRollbacks.listPending()
    for (const operation of pending) {
      try {
        await this.dependencies.coordinator.execute(operation)
        result.coordinated += 1
      } catch {
        result.failed += 1
      }
    }
    return result
  }
}

export class RecoverInterruptedNodeRunsUseCase {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      interrupted: 0,
      enqueued: 0,
      failed: 0
    }
    const handledNodeRuns = new Set<string>()
    const runningExecutions =
      await this.dependencies.executions.listByStatus('running')

    for (const execution of runningExecutions) {
      const initialWorkflow = await this.dependencies.workflows.get(
        execution.requirementId
      )
      if (!initialWorkflow) {
        result.failed += 1
        continue
      }
      const runningNodes = [...initialWorkflow.nodes]
        .filter((node) => node.status === 'running')
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      if (runningNodes.length === 0) {
        result.failed += 1
        continue
      }
      for (const runningNode of runningNodes) {
        try {
          const [currentExecution, workflow, nodeRun] = await Promise.all([
            this.dependencies.executions.get(execution.id),
          this.dependencies.workflows.get(execution.requirementId),
          this.dependencies.nodeRuns.getLatestByNode(
            execution.id,
              runningNode.id
            )
          ])
          const node = workflow?.nodes.find(
            (candidate) => candidate.id === runningNode.id
          )
          if (
            !currentExecution ||
            !['running', 'interrupted'].includes(currentExecution.status) ||
            !workflow ||
            !node ||
            !nodeRun ||
            nodeRun.executionId !== execution.id ||
            nodeRun.nodeId !== node.id ||
            node.status !== 'running' ||
            nodeRun.status !== 'running'
          ) {
            result.failed += 1
            continue
          }
          await this.dependencies.manager.interruptNode({
            requirementId: execution.requirementId,
            nodeRunId: nodeRun.id,
            expectedWorkflowRevision: workflow.revision,
            expectedExecutionRevision: currentExecution.revision,
            expectedNodeRunRevision: nodeRun.revision
          })
          handledNodeRuns.add(nodeRun.id)
          result.interrupted += 1
          result.enqueued += 1
        } catch {
          result.failed += 1
        }
      }
    }

    const interruptedNodeRuns =
      await this.dependencies.nodeRuns.listInterrupted()
    for (const nodeRun of interruptedNodeRuns) {
      if (handledNodeRuns.has(nodeRun.id)) continue
      try {
        const [execution, latestNodeRun] = await Promise.all([
          this.dependencies.executions.get(nodeRun.executionId),
          this.dependencies.nodeRuns.getLatestByNode(
            nodeRun.executionId,
            nodeRun.nodeId
          )
        ])
        if (
          !execution ||
          ['completed', 'cancelled'].includes(execution.status) ||
          latestNodeRun?.id !== nodeRun.id
        ) {
          result.failed += 1
          continue
        }
        const workflow = await this.dependencies.workflows.get(
          execution.requirementId
        )
        const node = workflow?.nodes.find(
          (candidate) => candidate.id === nodeRun.nodeId
        )
        if (!node || node.status !== 'interrupted') {
          result.failed += 1
          continue
        }
        const timestamp = this.now()
        await this.dependencies.dispatches.enqueue(
          {
            id: createRecoveryWorkflowDispatchId(
              execution.id,
              nodeRun.id,
              nodeRun.revision
            ),
            executionId: execution.id,
            requirementId: execution.requirementId,
            nodeId: nodeRun.nodeId,
            nodeRunId: nodeRun.id,
            triggerNodeRunId: nodeRun.id,
            status: 'pending',
            attempts: 0,
            createdAt: timestamp,
            updatedAt: timestamp
          },
          'recovery'
        )
        result.enqueued += 1
      } catch {
        result.failed += 1
      }
    }

    return result
  }
}
