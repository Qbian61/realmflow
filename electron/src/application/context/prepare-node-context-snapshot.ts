import {
  type ModelRouteRequest,
  type ModelRouteResult
} from '../../../../domain/model'
import type {
  AiGenerateExecutorConfig,
  WorkflowNodeConfiguration
} from '../../../../domain/workflow'
import type { StageContextRepository } from '../../ai-run/application/ports'
import type {
  ContextSnapshotRepository,
  NodeRunRepository,
  RequirementWorkflowRepository,
  WorkflowExecutionRepository
} from '../ports/business-repositories'
import type { PersistedContextSnapshot } from './context-snapshot'

export type PrepareNodeContextSnapshotErrorCode =
  | 'not_found'
  | 'ownership_mismatch'
  | 'not_current_node'
  | 'invalid_state'
  | 'revision_conflict'
  | 'not_executable'
  | 'model_unavailable'
  | 'persistence_failed'

export class PrepareNodeContextSnapshotError extends Error {
  constructor(
    readonly code: PrepareNodeContextSnapshotErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'PrepareNodeContextSnapshotError'
  }
}

type Dependencies = {
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  executions: Pick<WorkflowExecutionRepository, 'getLatestByRequirement'>
  nodeRuns: Pick<NodeRunRepository, 'get'>
  models: {
    routeModel: (request: ModelRouteRequest) => Promise<ModelRouteResult>
  }
  contexts: Pick<StageContextRepository, 'loadNode'>
  snapshots: Pick<ContextSnapshotRepository, 'get'>
}

export class PrepareNodeContextSnapshotUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(command: {
    requirementId: string
    nodeRunId: string
    expectedWorkflowRevision: number
    expectedExecutionRevision: number
    expectedNodeRunRevision: number
    modelProfileId?: string
  }): Promise<PersistedContextSnapshot> {
    const [workflow, execution, nodeRun] = await Promise.all([
      this.dependencies.workflows.get(command.requirementId),
      this.dependencies.executions.getLatestByRequirement(
        command.requirementId
      ),
      this.dependencies.nodeRuns.get(command.nodeRunId)
    ])
    if (!workflow || !execution || !nodeRun) {
      throw new PrepareNodeContextSnapshotError(
        'not_found',
        'Context preview dependencies are unavailable'
      )
    }
    if (
      execution.requirementId !== command.requirementId ||
      nodeRun.executionId !== execution.id
    ) {
      throw new PrepareNodeContextSnapshotError(
        'ownership_mismatch',
        'Node run does not belong to the requirement execution'
      )
    }
    if (execution.currentNodeId !== nodeRun.nodeId) {
      throw new PrepareNodeContextSnapshotError(
        'not_current_node',
        '当前节点尚不能生成上下文预览'
      )
    }
    if (
      workflow.revision !== command.expectedWorkflowRevision ||
      execution.revision !== command.expectedExecutionRevision ||
      nodeRun.revision !== command.expectedNodeRunRevision
    ) {
      throw new PrepareNodeContextSnapshotError(
        'revision_conflict',
        '节点状态已更新，请刷新后重试'
      )
    }
    if (nodeRun.status !== 'ready') {
      throw new PrepareNodeContextSnapshotError(
        'invalid_state',
        '当前节点尚不能生成上下文预览'
      )
    }
    const node = workflow.nodes.find(
      (candidate) => candidate.id === nodeRun.nodeId
    )
    if (!node || node.type !== 'ai_generate' || !node.executor) {
      throw new PrepareNodeContextSnapshotError(
        'not_executable',
        '当前节点不支持上下文预览'
      )
    }
    const route = await this.dependencies.models.routeModel(
      routeRequest(
        node.configuration?.model,
        nodeRun.checkpoint,
        command.modelProfileId
      )
    )
    if (route.outcome === 'unavailable') {
      throw new PrepareNodeContextSnapshotError(
        'model_unavailable',
        route.message
      )
    }
    const context = await this.dependencies.contexts.loadNode({
      requirementId: command.requirementId,
      nodeId: node.id,
      nodeRunId: nodeRun.id,
      executor: node.executor as AiGenerateExecutorConfig,
      modelProfileId: route.profile.id
    })
    if (!context.contextSnapshotId) {
      throw new PrepareNodeContextSnapshotError(
        'persistence_failed',
        '保存上下文快照失败，请重试'
      )
    }
    const snapshot = await this.dependencies.snapshots.get(
      context.contextSnapshotId
    )
    if (!snapshot) {
      throw new PrepareNodeContextSnapshotError(
        'persistence_failed',
        '保存上下文快照失败，请重试'
      )
    }
    return snapshot
  }
}

function routeRequest(
  strategy: WorkflowNodeConfiguration['model'] | undefined,
  checkpoint: Record<string, unknown> | undefined,
  inheritedProfileId: string | undefined
): ModelRouteRequest {
  const checkpointProfileId =
    typeof checkpoint?.modelProfileId === 'string'
      ? checkpoint.modelProfileId
      : undefined
  if (checkpointProfileId) {
    return { strategy: 'fixed', profileId: checkpointProfileId }
  }
  if (strategy?.strategy === 'fixed') return strategy
  if (strategy?.strategy === 'capability') return strategy
  if (inheritedProfileId) {
    return { strategy: 'fixed', profileId: inheritedProfileId }
  }
  return {
    strategy: 'capability',
    requiredCapabilities: ['text'],
    minimumContextWindow: 1
  }
}
