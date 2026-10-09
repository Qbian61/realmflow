import {
  getStableReadyNodeIds,
  getWorkflowExecutionProjection,
  setWorkflowParallelism,
  type RequirementNode,
  type RequirementWorkflow
} from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  NodeRunRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowDispatchRecord,
  WorkflowDispatchRepository,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository
} from '../ports/business-repositories'
import { isWorkflowNodeExecutable } from './execute-workflow-node'
import { createAutomaticWorkflowDispatchId } from './workflow-dispatch'

export type WorkflowParallelismErrorCode =
  | 'invalid_parallelism'
  | 'execution_not_configurable'
  | 'revision_conflict'
  | 'artifact_path_conflict'
  | 'persistence_failed'

export class WorkflowParallelismError extends Error {
  constructor(
    readonly code: WorkflowParallelismErrorCode,
    message: string,
    readonly details: {
      latestWorkflowRevision?: number
      latestExecutionRevision?: number
      conflictingNodeIds?: string[]
    } = {}
  ) {
    super(message)
    this.name = 'WorkflowParallelismError'
  }

  get latestWorkflowRevision(): number | undefined {
    return this.details.latestWorkflowRevision
  }

  get latestExecutionRevision(): number | undefined {
    return this.details.latestExecutionRevision
  }

  get conflictingNodeIds(): string[] | undefined {
    return this.details.conflictingNodeIds
  }
}

type Dependencies = {
  workflows: Pick<RequirementWorkflowRepository, 'get' | 'save'>
  executions: Pick<
    WorkflowExecutionRepository,
    'getActiveByRequirement' | 'transition' | 'updateCurrentNode'
  >
  nodeRuns: Pick<NodeRunRepository, 'getLatestByNode' | 'transition'>
  dispatches: Pick<WorkflowDispatchRepository, 'enqueue'>
  unitOfWork: UnitOfWork
}

export type SetWorkflowParallelismInput = {
  requirementId: string
  maxParallelism: number
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
}

export type SetWorkflowParallelismResult = {
  outcome: 'applied' | 'idempotent'
  workflow: RequirementWorkflow
  execution: Revisioned<WorkflowExecutionRecord>
  activatedNodeRuns: Array<Revisioned<NodeRunRecord>>
  dispatches: Array<Revisioned<WorkflowDispatchRecord>>
}

export class SetWorkflowParallelismUseCase {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(
    input: SetWorkflowParallelismInput
  ): Promise<SetWorkflowParallelismResult> {
    this.assertParallelism(input.maxParallelism)

    return this.dependencies.unitOfWork.execute(async () => {
      const [currentWorkflow, currentExecution] = await Promise.all([
        this.dependencies.workflows.get(input.requirementId),
        this.dependencies.executions.getActiveByRequirement(input.requirementId)
      ])
      if (!currentWorkflow) {
        throw new WorkflowParallelismError(
          'execution_not_configurable',
          'Requirement workflow was not found'
        )
      }
      if (!currentExecution) {
        throw new WorkflowParallelismError(
          'execution_not_configurable',
          'Workflow execution is not configurable'
        )
      }
      if (currentWorkflow.maxParallelism === input.maxParallelism) {
        return {
          outcome: 'idempotent',
          workflow: currentWorkflow,
          execution: currentExecution,
          activatedNodeRuns: [],
          dispatches: []
        }
      }
      if (
        currentWorkflow.revision !== input.expectedWorkflowRevision ||
        currentExecution.revision !== input.expectedExecutionRevision
      ) {
        throw new WorkflowParallelismError(
          'revision_conflict',
          'Workflow parallelism revision conflict',
          {
            latestWorkflowRevision: currentWorkflow.revision,
            latestExecutionRevision: currentExecution.revision
          }
        )
      }
      if (input.maxParallelism > 1) {
        this.assertUniqueArtifactPaths(currentWorkflow.nodes)
      }

      const policyWorkflow = setWorkflowParallelism(
        currentWorkflow,
        input.maxParallelism
      )
      const admittedNodeIds = new Set(
        getStableReadyNodeIds(policyWorkflow).filter((nodeId) => {
          const node = currentWorkflow.nodes.find(
            (candidate) => candidate.id === nodeId
          )
          return node?.status === 'pending'
        })
      )
      const nextWorkflow: RequirementWorkflow = {
        ...policyWorkflow,
        nodes: policyWorkflow.nodes.map((node) =>
          admittedNodeIds.has(node.id) ? { ...node, status: 'ready' } : node
        )
      }
      const workflowResult = await this.dependencies.workflows.save(
        { ...nextWorkflow, revision: currentWorkflow.revision },
        currentWorkflow.revision,
        { reason: 'parallelism_changed', triggerSource: 'user' }
      )
      if (workflowResult.status === 'conflict') {
        throw new WorkflowParallelismError(
          'revision_conflict',
          'Workflow parallelism revision conflict',
          {
            latestWorkflowRevision: workflowResult.entity.revision,
            latestExecutionRevision: currentExecution.revision
          }
        )
      }

      const timestamp = this.now()
      const activatedNodeRuns: Array<Revisioned<NodeRunRecord>> = []
      const dispatches: Array<Revisioned<WorkflowDispatchRecord>> = []
      for (const node of workflowResult.entity.nodes) {
        if (!admittedNodeIds.has(node.id)) continue
        const nodeRun = await this.dependencies.nodeRuns.getLatestByNode(
          currentExecution.id,
          node.id
        )
        if (!nodeRun) {
          throw new WorkflowParallelismError(
            'persistence_failed',
            `Ready node run was not found: ${node.id}`
          )
        }
        const nodeRunResult = await this.dependencies.nodeRuns.transition({
          nodeRunId: nodeRun.id,
          expectedRevision: nodeRun.revision,
          status: 'ready',
          reason: 'parallelism_increased',
          triggerSource: 'user',
          transitionedAt: timestamp
        })
        if (nodeRunResult.status === 'conflict') {
          throw new WorkflowParallelismError(
            'persistence_failed',
            'Node run revision conflict'
          )
        }
        activatedNodeRuns.push(nodeRunResult.entity)
        if (isWorkflowNodeExecutable(node)) {
          dispatches.push(
            await this.dependencies.dispatches.enqueue(
              {
                id: createAutomaticWorkflowDispatchId(
                  currentExecution.id,
                  nodeRun.id
                ),
                executionId: currentExecution.id,
                requirementId: input.requirementId,
                nodeId: node.id,
                nodeRunId: nodeRun.id,
                triggerNodeRunId: nodeRun.id,
                status: 'pending',
                attempts: 0,
                createdAt: timestamp,
                updatedAt: timestamp
              },
              'user'
            )
          )
        }
      }

      const projection = getWorkflowExecutionProjection(workflowResult.entity)
      let execution = currentExecution
      if (projection.status !== currentExecution.status) {
        const executionResult = await this.dependencies.executions.transition({
          executionId: currentExecution.id,
          expectedRevision: currentExecution.revision,
          status: projection.status,
          currentNodeId: projection.focusedNodeId,
          reason: 'workflow_parallelism_changed',
          triggerSource: 'user',
          transitionedAt: timestamp
        })
        if (executionResult.status === 'conflict') {
          throw new WorkflowParallelismError(
            'persistence_failed',
            'Workflow execution revision conflict'
          )
        }
        execution = executionResult.entity
      } else if (
        projection.focusedNodeId !== currentExecution.currentNodeId
      ) {
        const executionResult =
          await this.dependencies.executions.updateCurrentNode({
            executionId: currentExecution.id,
            expectedRevision: currentExecution.revision,
            currentNodeId: projection.focusedNodeId,
            updatedAt: timestamp
          })
        if (executionResult.status === 'conflict') {
          throw new WorkflowParallelismError(
            'persistence_failed',
            'Workflow execution revision conflict'
          )
        }
        execution = executionResult.entity
      }

      return {
        outcome: 'applied',
        workflow: workflowResult.entity,
        execution,
        activatedNodeRuns,
        dispatches
      }
    })
  }

  private assertParallelism(maxParallelism: number): void {
    if (
      !Number.isSafeInteger(maxParallelism) ||
      maxParallelism < 1 ||
      maxParallelism > 8
    ) {
      throw new WorkflowParallelismError(
        'invalid_parallelism',
        'Workflow parallelism must be an integer from 1 to 8'
      )
    }
  }

  private assertUniqueArtifactPaths(nodes: RequirementNode[]): void {
    const nodeIdsByPath = new Map<string, string[]>()
    for (const node of nodes) {
      if (!isWorkflowNodeExecutable(node)) continue
      const relativePath = (
        node.configuration?.artifact.relativePath ??
        node.executor?.artifact.relativePath ??
        ''
      ).trim()
      if (!relativePath) continue
      nodeIdsByPath.set(relativePath, [
        ...(nodeIdsByPath.get(relativePath) ?? []),
        node.id
      ])
    }
    const conflictingNodeIds = [...nodeIdsByPath.values()]
      .filter((nodeIds) => nodeIds.length > 1)
      .flat()
      .sort()
    if (conflictingNodeIds.length > 0) {
      throw new WorkflowParallelismError(
        'artifact_path_conflict',
        'Executable workflow nodes must use unique artifact paths',
        { conflictingNodeIds }
      )
    }
  }
}
