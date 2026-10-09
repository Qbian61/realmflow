import type {
  NodeRunRepository,
  RequirementWorkflowRepository,
  Revisioned,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository
} from '../ports/business-repositories'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type { CancelAiRunUseCase } from '../../ai-run/application/generate-stage-artifact'
import {
  isWorkflowNodeExecutable,
  type ExecuteWorkflowNodeUseCase
} from './execute-workflow-node'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'

type NodeCommand = {
  requirementId: string
  nodeRunId: string
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
  expectedNodeRunRevision: number
}

type NodeControlResult = {
  outcome: 'applied' | 'idempotent'
  action: 'start' | 'pause' | 'resume' | 'cancel' | 'retry' | 'skip'
  workflow: RequirementWorkflow
  execution: Revisioned<WorkflowExecutionRecord>
  nodeRun: NonNullable<Awaited<ReturnType<NodeRunRepository['get']>>>
}

export type WorkflowNodeControlErrorCode =
  | 'not_found'
  | 'ownership_mismatch'
  | 'not_current_node'
  | 'revision_conflict'
  | 'invalid_state'
  | 'skip_not_allowed'
  | 'skip_reason_required'
  | 'retry_limit_reached'
  | 'not_executable'
  | 'persistence_failed'

export class WorkflowNodeControlError extends Error {
  constructor(
    readonly code: WorkflowNodeControlErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'WorkflowNodeControlError'
  }
}

type Dependencies = {
  manager: Pick<
    ManageNodeExecutionUseCase,
    | 'pauseNode'
    | 'resumeNode'
    | 'cancelNode'
    | 'skipNode'
    | 'prepareRetry'
  >
  nodeRuns: Pick<NodeRunRepository, 'get' | 'getLatestByNode'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  executions: Pick<WorkflowExecutionRepository, 'get'>
  cancel: Pick<CancelAiRunUseCase, 'execute'>
  executeNode: Pick<ExecuteWorkflowNodeUseCase, 'execute'>
}

export class ControlWorkflowNodeUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async start(
    command: NodeCommand & { modelProfileId?: string }
  ): Promise<NodeControlResult> {
    const { workflow, execution, nodeRun } = await this.requireCurrent(command)
    if (nodeRun.status === 'running') {
      return {
        outcome: 'idempotent',
        action: 'start',
        workflow,
        execution,
        nodeRun
      }
    }
    this.assertExpectedRevisions(command, workflow, execution, nodeRun)
    if (nodeRun.status !== 'ready') {
      throw new WorkflowNodeControlError(
        'invalid_state',
        `Node run cannot start from ${nodeRun.status}`
      )
    }
    const node = workflow.nodes.find((candidate) => candidate.id === nodeRun.nodeId)
    if (!isWorkflowNodeExecutable(node)) {
      throw new WorkflowNodeControlError(
        'not_executable',
        `Workflow node is not executable: ${nodeRun.nodeId}`
      )
    }
    await this.dependencies.executeNode.execute({
      requirementId: command.requirementId,
      nodeId: nodeRun.nodeId,
      nodeRunId: command.nodeRunId,
      ...(command.modelProfileId
        ? { modelProfileId: command.modelProfileId }
        : {})
    })
    return {
      outcome: 'applied',
      action: 'start',
      ...(await this.getSnapshot(command.requirementId, command.nodeRunId))
    }
  }

  async pause(command: NodeCommand) {
    const current = await this.requireCurrent(command)
    if (current.nodeRun.status === 'paused') {
      return {
        outcome: 'idempotent' as const,
        action: 'pause' as const,
        ...current
      }
    }
    this.assertExpectedRevisions(
      command,
      current.workflow,
      current.execution,
      current.nodeRun
    )
    const committed = await this.dependencies.manager.pauseNode(command)
    const nodeRun = committed.nodeRun
    if (nodeRun.aiRunId) {
      await this.dependencies.cancel.execute(nodeRun.aiRunId)
    }
    return {
      outcome: 'applied' as const,
      action: 'pause' as const,
      ...committed
    }
  }

  async resume(command: NodeCommand & { modelProfileId?: string }) {
    const current = await this.requireCurrent(command)
    if (current.nodeRun.status === 'running') {
      return {
        outcome: 'idempotent' as const,
        action: 'resume' as const,
        ...current
      }
    }
    const resumableFromCheckpoint = current.nodeRun.status === 'ready'
    if (!resumableFromCheckpoint) {
      this.assertExpectedRevisions(
        command,
        current.workflow,
        current.execution,
        current.nodeRun
      )
      if (current.nodeRun.status !== 'paused') {
        throw new WorkflowNodeControlError(
          'invalid_state',
          `Node run cannot resume from ${current.nodeRun.status}`
        )
      }
    }
    const { modelProfileId, ...executionCommand } = command
    const committed = resumableFromCheckpoint
      ? current
      : await this.dependencies.manager.resumeNode(executionCommand)
    await this.dependencies.executeNode.execute({
      requirementId: command.requirementId,
      nodeId: committed.nodeRun.nodeId,
      nodeRunId: command.nodeRunId,
      ...(modelProfileId ? { modelProfileId } : {})
    })
    return {
      outcome: 'applied' as const,
      action: 'resume' as const,
      ...(await this.getSnapshot(command.requirementId, command.nodeRunId))
    }
  }

  async cancel(command: NodeCommand): Promise<NodeControlResult> {
    const current = await this.requireCurrent(command)
    if (current.nodeRun.status === 'cancelled') {
      return {
        outcome: 'idempotent',
        action: 'cancel',
        ...current
      }
    }
    this.assertExpectedRevisions(
      command,
      current.workflow,
      current.execution,
      current.nodeRun
    )
    const committed = await this.dependencies.manager.cancelNode(command)
    if (current.nodeRun.aiRunId) {
      await this.dependencies.cancel.execute(current.nodeRun.aiRunId)
    }
    return {
      outcome: 'applied',
      action: 'cancel',
      ...committed
    }
  }

  async skip(
    command: NodeCommand & {
      expectedRequirementRevision: number
      reason?: string
    }
  ): Promise<NodeControlResult> {
    const current = await this.requireCurrent(command)
    if (current.nodeRun.status === 'skipped') {
      return {
        outcome: 'idempotent',
        action: 'skip',
        ...current
      }
    }
    this.assertExpectedRevisions(
      command,
      current.workflow,
      current.execution,
      current.nodeRun
    )
    if (!['pending', 'ready'].includes(current.nodeRun.status)) {
      throw new WorkflowNodeControlError(
        'invalid_state',
        `Node run cannot skip from ${current.nodeRun.status}`
      )
    }
    const node = current.workflow.nodes.find(
      (candidate) => candidate.id === current.nodeRun.nodeId
    )
    if (!node?.allowSkip || node.configuration?.skip.allowed === false) {
      throw new WorkflowNodeControlError(
        'skip_not_allowed',
        `Workflow node cannot be skipped: ${current.nodeRun.nodeId}`
      )
    }
    const reason = command.reason?.trim()
    if (node.configuration?.skip.requireReason && !reason) {
      throw new WorkflowNodeControlError(
        'skip_reason_required',
        'A reason is required to skip this workflow node'
      )
    }
    const committed = await this.dependencies.manager.skipNode({
      ...command,
      ...(reason ? { reason } : {})
    })
    return {
      outcome: 'applied',
      action: 'skip',
      ...committed
    }
  }

  async retry(
    command: NodeCommand & { modelProfileId?: string }
  ): Promise<NodeControlResult> {
    const current = await this.requireCurrent(command, true)
    const latest = await this.dependencies.nodeRuns.getLatestByNode(
      current.execution.id,
      current.nodeRun.nodeId
    )
    if (latest && latest.attempt > current.nodeRun.attempt) {
      if (latest.status === 'running') {
        return {
          outcome: 'idempotent',
          action: 'retry',
          workflow: current.workflow,
          execution: current.execution,
          nodeRun: latest
        }
      }
      if (latest.status === 'ready') {
        await this.execute(command, latest)
        return {
          outcome: 'applied',
          action: 'retry',
          ...(await this.getSnapshot(command.requirementId, latest.id))
        }
      }
    }
    this.assertExpectedRevisions(
      command,
      current.workflow,
      current.execution,
      current.nodeRun
    )
    if (!['failed', 'cancelled', 'interrupted'].includes(current.nodeRun.status)) {
      throw new WorkflowNodeControlError(
        'invalid_state',
        `Node run cannot retry from ${current.nodeRun.status}`
      )
    }
    const node = current.workflow.nodes.find(
      (candidate) => candidate.id === current.nodeRun.nodeId
    )
    if (!node || node.type !== 'ai_generate' || !node.executor) {
      throw new WorkflowNodeControlError(
        'not_executable',
        `Workflow node is not AI executable: ${current.nodeRun.nodeId}`
      )
    }
    if (current.nodeRun.attempt >= (node.configuration?.retry.maxAttempts ?? 1)) {
      throw new WorkflowNodeControlError(
        'retry_limit_reached',
        `Workflow node retry limit reached: ${current.nodeRun.nodeId}`
      )
    }
    const prepared = await this.dependencies.manager.prepareRetry(command)
    await this.execute(command, prepared.nodeRun)
    return {
      outcome: 'applied',
      action: 'retry',
      ...(await this.getSnapshot(command.requirementId, prepared.nodeRun.id))
    }
  }

  private async getNodeRun(nodeRunId: string) {
    const nodeRun = await this.dependencies.nodeRuns.get(nodeRunId)
    if (!nodeRun) throw new Error(`Node run not found: ${nodeRunId}`)
    return nodeRun
  }

  private async getWorkflow(requirementId: string) {
    const workflow = await this.dependencies.workflows.get(requirementId)
    if (!workflow) throw new Error('Requirement workflow not found')
    return workflow
  }

  private async requireCurrent(
    command: NodeCommand,
    allowSupersededAttempt = false
  ) {
    const nodeRun = await this.getNodeRun(command.nodeRunId)
    const [workflow, execution] = await Promise.all([
      this.getWorkflow(command.requirementId),
      this.dependencies.executions.get(nodeRun.executionId)
    ])
    if (
      !execution ||
      execution.id !== nodeRun.executionId ||
      execution.requirementId !== command.requirementId ||
      workflow.requirementId !== command.requirementId ||
      !workflow.nodes.some((node) => node.id === nodeRun.nodeId)
    ) {
      throw new WorkflowNodeControlError(
        'ownership_mismatch',
        'Workflow execution does not match node run'
      )
    }
    if (!allowSupersededAttempt) {
      const latest = await this.dependencies.nodeRuns.getLatestByNode(
        execution.id,
        nodeRun.nodeId
      )
      if (latest && latest.id !== nodeRun.id) {
        throw new WorkflowNodeControlError(
          'ownership_mismatch',
          'Node run is not the latest workflow node attempt'
        )
      }
    }
    return { workflow, execution, nodeRun }
  }

  private assertExpectedRevisions(
    command: NodeCommand,
    workflow: RequirementWorkflow,
    execution: Revisioned<WorkflowExecutionRecord>,
    nodeRun: NonNullable<Awaited<ReturnType<NodeRunRepository['get']>>>
  ): void {
    if (
      workflow.revision !== command.expectedWorkflowRevision ||
      execution.revision !== command.expectedExecutionRevision ||
      nodeRun.revision !== command.expectedNodeRunRevision
    ) {
      throw new WorkflowNodeControlError(
        'revision_conflict',
        'Workflow control revision conflict'
      )
    }
  }

  private async getSnapshot(
    requirementId: string,
    nodeRunId: string
  ): Promise<Pick<NodeControlResult, 'workflow' | 'execution' | 'nodeRun'>> {
    const [workflow, nodeRun] = await Promise.all([
      this.getWorkflow(requirementId),
      this.getNodeRun(nodeRunId)
    ])
    const execution = await this.dependencies.executions.get(nodeRun.executionId)
    if (!execution || execution.requirementId !== requirementId) {
      throw new Error('Workflow execution does not match node run')
    }
    return { workflow, execution, nodeRun }
  }

  private async execute(
    command: NodeCommand & { modelProfileId?: string },
    nodeRun: NonNullable<Awaited<ReturnType<NodeRunRepository['get']>>>
  ): Promise<void> {
    await this.dependencies.executeNode.execute({
      requirementId: command.requirementId,
      nodeId: nodeRun.nodeId,
      nodeRunId: nodeRun.id,
      ...(command.modelProfileId
        ? { modelProfileId: command.modelProfileId }
        : {})
    })
  }
}
