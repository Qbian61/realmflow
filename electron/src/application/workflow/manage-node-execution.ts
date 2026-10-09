import {
  getWorkflowExecutionProjection,
  type NodeRunStatus,
  type RequirementWorkflow
} from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  NodeRunRepository,
  NodeTodoRepository,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowDispatchRecord,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository,
  WorkflowDispatchRepository
} from '../ports/business-repositories'
import {
  createAutomaticWorkflowDispatchId,
  createRecoveryWorkflowDispatchId
} from './workflow-dispatch'
import { initializeConfiguredNodeTodos } from './manage-node-todos'
import {
  NodeCompletionGateError,
  type NodeCompletionGateEvaluator,
  type NodeCompletionGateSnapshot
} from './node-completion-gate-evaluator'
import { isWorkflowNodeExecutable } from './execute-workflow-node'
import { WorkflowRuntime } from './workflow-runtime'

export type NodeExecutionDependencies = {
  requirements: RequirementRepository
  workflows: RequirementWorkflowRepository
  executions: WorkflowExecutionRepository
  nodeRuns: NodeRunRepository
  todos: Pick<NodeTodoRepository, 'save'>
  dispatches: Pick<WorkflowDispatchRepository, 'enqueue'>
  completionGates: Pick<NodeCompletionGateEvaluator, 'evaluate'>
  unitOfWork: UnitOfWork
  knowledgeSync: {
    execute: (requirementId: string) => Promise<{
      synced: number
      skipped: number
      failed: number
    }>
  }
}

export type CompleteNodeInput = {
  requirementId: string
  nodeRunId: string
  expectedNodeRunRevision: number
  expectedWorkflowRevision: number
  expectedRequirementRevision: number
  executionFinished: boolean
}

export type SkipNodeInput = {
  requirementId: string
  nodeRunId: string
  expectedNodeRunRevision: number
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
  expectedRequirementRevision: number
  reason?: string
}

export type AtomicWorkflowAdvanceResult = {
  workflow: RequirementWorkflow
  nodeRun: Revisioned<NodeRunRecord>
  activatedNodeRuns: Array<Revisioned<NodeRunRecord>>
  execution: Revisioned<WorkflowExecutionRecord>
  dispatches: Array<Revisioned<WorkflowDispatchRecord>>
  requirementCompleted: boolean
  gates: NodeCompletionGateSnapshot
}

export type CommittedNodeCompletion = AtomicWorkflowAdvanceResult

export type NodeExecutionControlSnapshot = {
  workflow: RequirementWorkflow
  nodeRun: Revisioned<NodeRunRecord>
  execution: Revisioned<WorkflowExecutionRecord>
}

export type AtomicWorkflowSkipResult = NodeExecutionControlSnapshot & {
  activatedNodeRuns: Array<Revisioned<NodeRunRecord>>
  dispatches: Array<Revisioned<WorkflowDispatchRecord>>
  requirementCompleted: boolean
}

export class ManageNodeExecutionUseCase {
  private readonly runtime: WorkflowRuntime

  constructor(
    private readonly dependencies: NodeExecutionDependencies,
    private readonly now: () => number = Date.now
  ) {
    this.runtime = new WorkflowRuntime(dependencies.workflows)
  }

  async startNode(input: {
    requirementId: string
    nodeRunId: string
    aiRunId: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['ready', 'interrupted', 'failed', 'cancelled'],
      status: 'running',
      reason: 'node_started',
      triggerSource: 'system'
    })
  }

  async reserveNode(input: {
    requirementId: string
    nodeRunId: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: [
        'ready',
        'waiting_user',
        'interrupted',
        'failed',
        'cancelled'
      ],
      status: 'running',
      reason: 'node_started',
      triggerSource: 'system'
    })
  }

  async failRecovery(input: {
    requirementId: string
    nodeRunId: string
    error: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['running'],
      status: 'interrupted',
      reason: 'recovery_failed',
      triggerSource: 'recovery'
    })
  }

  async bindAiRun(input: {
    nodeRunId: string
    aiRunId: string
    expectedNodeRunRevision: number
  }): Promise<Revisioned<NodeRunRecord>> {
    const nodeRun = await this.getNodeRun(input.nodeRunId)
    if (nodeRun.status !== 'running') {
      throw new Error(`Node run cannot bind from ${nodeRun.status}`)
    }
    if (nodeRun.aiRunId && nodeRun.aiRunId !== input.aiRunId) {
      throw new Error('Node run is already bound to another AI run')
    }
    const result = await this.dependencies.nodeRuns.save(
      {
        ...nodeRun,
        aiRunId: input.aiRunId,
        updatedAt: this.now()
      },
      input.expectedNodeRunRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Node run revision conflict')
    }
    return result.entity
  }

  async waitForUser(input: {
    requirementId: string
    nodeRunId: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['running'],
      status: 'waiting_user',
      reason: 'node_waiting_user',
      triggerSource: 'system'
    })
  }

  async finishNode(input: {
    requirementId: string
    nodeRunId: string
    status: 'failed' | 'cancelled'
    error?: string
  }): Promise<
    | {
        workflow: RequirementWorkflow
        nodeRun: Revisioned<NodeRunRecord>
      }
    | undefined
  > {
    const current = await this.getNodeRun(input.nodeRunId)
    if (current.status === 'paused') return undefined
    return this.transitionCurrentExecution({
      ...input,
      allowedStatuses: ['ready', 'running', 'waiting_user', 'interrupted'],
      status: input.status,
      reason: input.status === 'failed' ? 'node_failed' : 'node_cancelled',
      triggerSource: 'system'
    })
  }

  async pauseNode(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
    expectedExecutionRevision: number
  }): Promise<NodeExecutionControlSnapshot> {
    return this.changeExecutionStatus(
      input,
      ['running', 'ready'],
      'paused',
      'workflow_paused'
    )
  }

  async resumeNode(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
    expectedExecutionRevision: number
  }): Promise<NodeExecutionControlSnapshot> {
    return this.changeExecutionStatus(
      input,
      ['paused'],
      'ready',
      'workflow_resumed'
    )
  }

  async interruptNode(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
    expectedExecutionRevision: number
  }): Promise<
    NodeExecutionControlSnapshot & {
      dispatch: Revisioned<WorkflowDispatchRecord>
    }
  > {
    const result = await this.changeExecutionStatus(
      input,
      ['running'],
      'interrupted',
      'startup_interrupted',
      'recovery',
      true
    )
    if (!result.dispatch) {
      throw new Error('Recovery dispatch was not created')
    }
    return { ...result, dispatch: result.dispatch }
  }

  async cancelNode(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
    expectedExecutionRevision: number
  }): Promise<NodeExecutionControlSnapshot> {
    return this.changeExecutionStatus(
      input,
      [
        'ready',
        'running',
        'waiting_user',
        'blocked',
        'paused',
        'failed',
        'interrupted'
      ],
      'cancelled',
      'workflow_cancelled'
    )
  }

  async skipNode(
    input: SkipNodeInput
  ): Promise<AtomicWorkflowSkipResult & { knowledgeSyncFailed: boolean }> {
    const committed = await this.dependencies.unitOfWork.execute(() =>
      this.skipNodeInTransaction(input)
    )
    const knowledgeSyncFailed = await this.finalizeNodeCompletion(
      input.requirementId,
      committed.requirementCompleted
    )
    return { ...committed, knowledgeSyncFailed }
  }

  private async skipNodeInTransaction(
    input: SkipNodeInput
  ): Promise<AtomicWorkflowSkipResult> {
      const [requirement, nodeRun, currentWorkflow] = await Promise.all([
        this.dependencies.requirements.get(input.requirementId),
        this.getNodeRun(input.nodeRunId),
        this.dependencies.workflows.get(input.requirementId)
      ])
      if (!requirement) {
        throw new Error(`Requirement not found: ${input.requirementId}`)
      }
      if (!currentWorkflow) {
        throw new Error(`Requirement workflow not found: ${input.requirementId}`)
      }
      const execution = await this.dependencies.executions.get(
        nodeRun.executionId
      )
      if (
        !execution ||
        execution.requirementId !== input.requirementId
      ) {
        throw new Error('Workflow execution does not match node run')
      }
      if (nodeRun.revision !== input.expectedNodeRunRevision) {
        throw new Error('Node run revision conflict')
      }
      if (currentWorkflow.revision !== input.expectedWorkflowRevision) {
        throw new Error('Workflow revision conflict')
      }
      if (execution.revision !== input.expectedExecutionRevision) {
        throw new Error('Workflow execution revision conflict')
      }
      if (requirement.revision !== input.expectedRequirementRevision) {
        throw new Error('Requirement revision conflict')
      }

      const workflow = await this.runtime.skipNode({
        requirementId: input.requirementId,
        nodeId: nodeRun.nodeId,
        expectedRevision: input.expectedWorkflowRevision
      })
      const timestamp = this.now()
      const nodeRunResult = await this.dependencies.nodeRuns.transition({
        nodeRunId: nodeRun.id,
        expectedRevision: input.expectedNodeRunRevision,
        status: 'skipped',
        reason: input.reason?.trim()
          ? `node_skipped:${input.reason.trim()}`
          : 'node_skipped',
        triggerSource: 'user',
        transitionedAt: timestamp
      })
      if (nodeRunResult.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }

      const requirementCompleted = workflow.nodes.every(
        (node) => node.status === 'completed' || node.status === 'skipped'
      )
      let activatedNodeRuns: Array<Revisioned<NodeRunRecord>> = []
      let dispatches: Array<Revisioned<WorkflowDispatchRecord>> = []
      if (requirementCompleted) {
        await this.completeRequirement(
          input.requirementId,
          input.expectedRequirementRevision,
          timestamp
        )
      } else {
        const activated = await this.activateReadyNodeRuns({
          previousWorkflow: currentWorkflow,
          workflow,
          executionId: nodeRun.executionId,
          triggerNodeRunId: nodeRun.id,
          reason: 'dependencies_skipped',
          triggerSource: 'user',
          timestamp
        })
        activatedNodeRuns = activated.nodeRuns
        dispatches = activated.dispatches
      }
      let currentExecution = execution
      if (requirementCompleted && currentExecution.status === 'created') {
        currentExecution = await this.updateExecution({
          requirementId: input.requirementId,
          executionId: nodeRun.executionId,
          status: 'running',
          currentNodeId: nodeRun.nodeId,
          updatedAt: timestamp,
          reason: 'workflow_started_by_skip',
          triggerSource: 'user'
        })
      }
      const projection = getWorkflowExecutionProjection(workflow)
      const updatedExecution = await this.updateExecution({
        requirementId: input.requirementId,
        executionId: nodeRun.executionId,
        status: projection.status,
        currentNodeId: projection.focusedNodeId,
        updatedAt: timestamp,
        reason: requirementCompleted
          ? 'workflow_completed_by_skip'
          : 'current_node_changed_by_skip',
        triggerSource: 'user'
      })
      return {
        workflow,
        nodeRun: nodeRunResult.entity,
        activatedNodeRuns,
        execution: updatedExecution,
        dispatches,
        requirementCompleted
      }
  }

  async prepareRetry(input: {
    requirementId: string
    nodeRunId: string
    expectedNodeRunRevision: number
    expectedWorkflowRevision: number
    expectedExecutionRevision: number
  }): Promise<NodeExecutionControlSnapshot> {
    return this.dependencies.unitOfWork.execute(async () => {
      const [workflow, sourceNodeRun] = await Promise.all([
        this.dependencies.workflows.get(input.requirementId),
        this.getNodeRun(input.nodeRunId)
      ])
      if (!workflow) {
        throw new Error(`Requirement workflow not found: ${input.requirementId}`)
      }
      const execution = await this.dependencies.executions.get(
        sourceNodeRun.executionId
      )
      if (
        !execution ||
        execution.requirementId !== input.requirementId
      ) {
        throw new Error('Workflow execution does not match node run')
      }
      const node = workflow.nodes.find(
        (candidate) => candidate.id === sourceNodeRun.nodeId
      )
      if (!node) throw new Error(`Workflow node not found: ${sourceNodeRun.nodeId}`)
      const latest = await this.dependencies.nodeRuns.getLatestByNode(
        execution.id,
        node.id
      )
      if (latest && latest.attempt > sourceNodeRun.attempt) {
        return { workflow, execution, nodeRun: latest }
      }
      if (workflow.revision !== input.expectedWorkflowRevision) {
        throw new Error('Requirement workflow revision conflict')
      }
      if (execution.revision !== input.expectedExecutionRevision) {
        throw new Error('Workflow execution revision conflict')
      }
      if (sourceNodeRun.revision !== input.expectedNodeRunRevision) {
        throw new Error('Node run revision conflict')
      }
      if (!['failed', 'cancelled', 'interrupted'].includes(sourceNodeRun.status)) {
        throw new Error(`Node run cannot retry from ${sourceNodeRun.status}`)
      }
      const nextAttempt = sourceNodeRun.attempt + 1
      const maxAttempts = node.configuration?.retry.maxAttempts ?? 1
      if (nextAttempt > maxAttempts) {
        throw new Error('Workflow node retry limit reached')
      }
      const timestamp = this.now()
      const result = await this.dependencies.nodeRuns.save(
        {
          id: `${sourceNodeRun.id}:retry:${nextAttempt}`,
          executionId: execution.id,
          nodeId: node.id,
          status: 'ready',
          attempt: nextAttempt,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        0
      )
      if (result.status === 'conflict') {
        const existing = await this.dependencies.nodeRuns.get(result.entity.id)
        if (existing) return { workflow, execution, nodeRun: existing }
        throw new Error('Retry node run revision conflict')
      }
      await initializeConfiguredNodeTodos(this.dependencies.todos, {
        nodeRunId: result.entity.id,
        configuredTodos: node.configuration?.todos,
        timestamp
      })
      return { workflow, execution, nodeRun: result.entity }
    })
  }

  async completeNode(
    input: CompleteNodeInput
  ): Promise<CommittedNodeCompletion & { knowledgeSyncFailed: boolean }> {
    const committed = await this.dependencies.unitOfWork.execute(() =>
      this.completeNodeInTransaction(input)
    )
    const knowledgeSyncFailed = await this.finalizeNodeCompletion(
      input.requirementId,
      committed.requirementCompleted
    )
    return { ...committed, knowledgeSyncFailed }
  }

  async completeNodeInTransaction(
    input: CompleteNodeInput
  ): Promise<CommittedNodeCompletion> {
    const [requirement, nodeRun, currentWorkflow] = await Promise.all([
      this.dependencies.requirements.get(input.requirementId),
      this.getNodeRun(input.nodeRunId),
      this.dependencies.workflows.get(input.requirementId)
    ])
    if (!requirement) {
      throw new Error(`Requirement not found: ${input.requirementId}`)
    }
    if (!currentWorkflow) {
      throw new Error(`Requirement workflow not found: ${input.requirementId}`)
    }
    const currentExecution = await this.dependencies.executions.get(
      nodeRun.executionId
    )
    if (
      !currentExecution ||
      currentExecution.requirementId !== input.requirementId
    ) {
      throw new Error('Workflow execution does not match node run')
    }
    const node = currentWorkflow.nodes.find(
      (candidate) => candidate.id === nodeRun.nodeId
    )
    if (!node) throw new Error(`Workflow node not found: ${nodeRun.nodeId}`)
    if (nodeRun.revision !== input.expectedNodeRunRevision) {
      throw new Error('Node run revision conflict')
    }
    if (currentWorkflow.revision !== input.expectedWorkflowRevision) {
      throw new Error('Workflow revision conflict')
    }
    if (requirement.revision !== input.expectedRequirementRevision) {
      throw new Error('Requirement revision conflict')
    }
    const gates = await this.dependencies.completionGates.evaluate({
      requirementId: input.requirementId,
      node,
      nodeRun,
      executionFinished: input.executionFinished
    })
    if (!gates.allowed) throw new NodeCompletionGateError(gates)
    const workflow = await this.runtime.completeNode({
      requirementId: input.requirementId,
      nodeId: nodeRun.nodeId,
      expectedRevision: input.expectedWorkflowRevision,
      gates
    })
    const timestamp = this.now()
    const nodeRunResult = await this.dependencies.nodeRuns.transition({
      nodeRunId: nodeRun.id,
      expectedRevision: input.expectedNodeRunRevision,
      status: 'completed',
      reason: 'node_completed',
      triggerSource: 'system',
      transitionedAt: timestamp
    })
    if (nodeRunResult.status === 'conflict') {
      throw new Error('Node run revision conflict')
    }

    const requirementCompleted = workflow.nodes.every(
      (node) => node.status === 'completed' || node.status === 'skipped'
    )
    let activatedNodeRuns: Array<Revisioned<NodeRunRecord>> = []
    let dispatches: Array<Revisioned<WorkflowDispatchRecord>> = []
    if (requirementCompleted) {
      await this.completeRequirement(
        input.requirementId,
        input.expectedRequirementRevision,
        timestamp
      )
    } else {
      const activated = await this.activateReadyNodeRuns({
        previousWorkflow: currentWorkflow,
        workflow,
        executionId: nodeRun.executionId,
        triggerNodeRunId: nodeRun.id,
        reason: 'dependencies_completed',
        triggerSource: 'system',
        timestamp
      })
      activatedNodeRuns = activated.nodeRuns
      dispatches = activated.dispatches
    }
    const projection = getWorkflowExecutionProjection(workflow)
    const execution = await this.updateExecution({
      requirementId: input.requirementId,
      executionId: nodeRun.executionId,
      status: projection.status,
      currentNodeId: projection.focusedNodeId,
      updatedAt: timestamp,
      reason: requirementCompleted
        ? 'workflow_completed'
        : 'current_node_changed',
      triggerSource: 'system'
    })
    return {
      workflow,
      nodeRun: nodeRunResult.entity,
      activatedNodeRuns,
      execution,
      dispatches,
      requirementCompleted,
      gates
    }
  }

  async finalizeNodeCompletion(
    requirementId: string,
    requirementCompleted: boolean
  ): Promise<boolean> {
    if (!requirementCompleted) return false
    try {
      const result = await this.dependencies.knowledgeSync.execute(requirementId)
      return result.failed > 0
    } catch {
      return true
    }
  }

  private async changeExecutionStatus(
    input: {
      requirementId: string
      nodeRunId: string
      expectedNodeRunRevision: number
      expectedWorkflowRevision: number
      expectedExecutionRevision: number
    },
    allowedStatuses: NodeRunStatus[],
    status: NodeRunStatus,
    reason: string,
    triggerSource: 'user' | 'recovery' = 'user',
    enqueueRecovery = false
  ): Promise<
    NodeExecutionControlSnapshot & {
      dispatch?: Revisioned<WorkflowDispatchRecord>
    }
  > {
    return this.dependencies.unitOfWork.execute(async () => {
      const nodeRun = await this.getNodeRun(input.nodeRunId)
      const execution = await this.dependencies.executions.get(
        nodeRun.executionId
      )
      if (
        !execution ||
        execution.requirementId !== input.requirementId
      ) {
        throw new Error('Workflow execution does not match node run')
      }
      if (execution.revision !== input.expectedExecutionRevision) {
        throw new Error('Workflow execution revision conflict')
      }
      if (nodeRun.revision !== input.expectedNodeRunRevision) {
        throw new Error('Node run revision conflict')
      }
      if (!allowedStatuses.includes(nodeRun.status)) {
        throw new Error(`Node run cannot transition from ${nodeRun.status}`)
      }
      const timestamp = this.now()
      let workflow: RequirementWorkflow
      if (status === 'paused') {
        workflow = await this.runtime.pauseNode({
          requirementId: input.requirementId,
          nodeId: nodeRun.nodeId,
          expectedRevision: input.expectedWorkflowRevision
        })
      } else if (status === 'ready') {
        workflow = await this.runtime.resumeNode({
          requirementId: input.requirementId,
          nodeId: nodeRun.nodeId,
          expectedRevision: input.expectedWorkflowRevision
        })
      } else if (status === 'interrupted') {
        workflow = await this.runtime.interruptNode({
          requirementId: input.requirementId,
          nodeId: nodeRun.nodeId,
          expectedRevision: input.expectedWorkflowRevision
        })
      } else {
        workflow = await this.runtime.finishNode({
          requirementId: input.requirementId,
          nodeId: nodeRun.nodeId,
          expectedRevision: input.expectedWorkflowRevision,
          status: 'cancelled'
        })
      }
      const result = await this.dependencies.nodeRuns.transition({
        nodeRunId: nodeRun.id,
        expectedRevision: input.expectedNodeRunRevision,
        status,
        reason:
          status === 'paused'
            ? 'node_paused'
            : status === 'ready'
              ? 'node_resumed'
              : status === 'interrupted'
                ? 'startup_interrupted'
                : 'node_cancelled',
        triggerSource,
        transitionedAt: timestamp
      })
      if (result.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }
      const projection = getWorkflowExecutionProjection(workflow)
      const updatedExecution = await this.updateExecution({
        requirementId: input.requirementId,
        executionId: nodeRun.executionId,
        status: projection.status,
        currentNodeId: projection.focusedNodeId,
        updatedAt: timestamp,
        reason,
        triggerSource
      })
      const dispatch = enqueueRecovery
        ? await this.dependencies.dispatches.enqueue(
            {
              id: createRecoveryWorkflowDispatchId(
                nodeRun.executionId,
                nodeRun.id,
                result.entity.revision
              ),
              executionId: nodeRun.executionId,
              requirementId: input.requirementId,
              nodeId: nodeRun.nodeId,
              nodeRunId: nodeRun.id,
              triggerNodeRunId: nodeRun.id,
              status: 'pending',
              attempts: 0,
              createdAt: timestamp,
              updatedAt: timestamp
            },
            triggerSource
          )
        : undefined
      return {
        workflow,
        nodeRun: result.entity,
        execution: updatedExecution,
        ...(dispatch ? { dispatch } : {})
      }
    })
  }

  private async transitionCurrentExecution(input: {
    requirementId: string
    nodeRunId: string
    allowedStatuses: NodeRunStatus[]
    status: 'running' | 'waiting_user' | 'failed' | 'cancelled' | 'interrupted'
    reason: string
    triggerSource: 'user' | 'system' | 'recovery'
    aiRunId?: string
    error?: string
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.dependencies.unitOfWork.execute(async () => {
      const [nodeRun, workflow] = await Promise.all([
        this.getNodeRun(input.nodeRunId),
        this.dependencies.workflows.get(input.requirementId)
      ])
      if (!workflow) {
        throw new Error(
          `Requirement workflow not found: ${input.requirementId}`
        )
      }
      if (!input.allowedStatuses.includes(nodeRun.status)) {
        throw new Error(`Node run cannot transition from ${nodeRun.status}`)
      }

      const nextWorkflow =
        input.status === 'running'
          ? await this.runtime.startNode({
              requirementId: input.requirementId,
              nodeId: nodeRun.nodeId,
              expectedRevision: workflow.revision
            })
          : input.status === 'waiting_user'
            ? await this.runtime.waitForUser({
                requirementId: input.requirementId,
                nodeId: nodeRun.nodeId,
                expectedRevision: workflow.revision
              })
            : input.status === 'interrupted'
              ? await this.runtime.interruptNode({
                  requirementId: input.requirementId,
                  nodeId: nodeRun.nodeId,
                  expectedRevision: workflow.revision
                })
            : await this.runtime.finishNode({
                requirementId: input.requirementId,
                nodeId: nodeRun.nodeId,
                expectedRevision: workflow.revision,
                status: input.status as 'failed' | 'cancelled'
              })
      const timestamp = this.now()
      const result = await this.dependencies.nodeRuns.transition({
        nodeRunId: nodeRun.id,
        expectedRevision: nodeRun.revision,
        status: input.status,
        aiRunId: input.aiRunId,
        clearAiRunId: input.status === 'running' && input.aiRunId === undefined,
        error: input.error,
        clearError: input.error === undefined,
        reason: input.reason,
        triggerSource: input.triggerSource,
        transitionedAt: timestamp
      })
      if (result.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }
      if (input.status === 'failed' || input.status === 'cancelled') {
        await this.activateReadyNodeRuns({
          previousWorkflow: workflow,
          workflow: nextWorkflow,
          executionId: nodeRun.executionId,
          triggerNodeRunId: nodeRun.id,
          reason:
            input.status === 'failed'
              ? 'independent_branch_available'
              : 'branch_cancelled',
          triggerSource: input.triggerSource === 'recovery'
            ? 'system'
            : input.triggerSource,
          timestamp
        })
      }
      const projection = getWorkflowExecutionProjection(nextWorkflow)
      await this.updateExecution({
        requirementId: input.requirementId,
        executionId: nodeRun.executionId,
        status: projection.status,
        currentNodeId: projection.focusedNodeId,
        updatedAt: timestamp,
        reason: input.reason,
        triggerSource: input.triggerSource
      })
      if (input.status === 'running') {
        const requirement = await this.dependencies.requirements.get(
          input.requirementId
        )
        if (!requirement) {
          throw new Error(`Requirement not found: ${input.requirementId}`)
        }
        if (requirement.status === 'pending') {
          const requirementResult = await this.dependencies.requirements.save(
            { ...requirement, status: 'active', updatedAt: timestamp },
            requirement.revision
          )
          if (requirementResult.status === 'conflict') {
            throw new Error('Requirement revision conflict')
          }
        }
      }
      return { workflow: nextWorkflow, nodeRun: result.entity }
    })
  }

  private async activateReadyNodeRuns(input: {
    previousWorkflow: RequirementWorkflow
    workflow: RequirementWorkflow
    executionId: string
    triggerNodeRunId: string
    reason: string
    triggerSource: 'user' | 'system'
    timestamp: number
  }): Promise<{
    nodeRuns: Array<Revisioned<NodeRunRecord>>
    dispatches: Array<Revisioned<WorkflowDispatchRecord>>
  }> {
    const previousStatuses = new Map(
      input.previousWorkflow.nodes.map((node) => [node.id, node.status])
    )
    const nodes = input.workflow.nodes.filter(
      (node) =>
        node.status === 'ready' && previousStatuses.get(node.id) === 'pending'
    )
    const nodeRuns: Array<Revisioned<NodeRunRecord>> = []
    const dispatches: Array<Revisioned<WorkflowDispatchRecord>> = []

    for (const node of nodes) {
      const current = await this.dependencies.nodeRuns.getLatestByNode(
        input.executionId,
        node.id
      )
      if (!current) {
        throw new Error(`Ready node run not found: ${node.id}`)
      }
      let nodeRun = current
      if (current.status === 'pending') {
        const result = await this.dependencies.nodeRuns.transition({
          nodeRunId: current.id,
          expectedRevision: current.revision,
          status: 'ready',
          reason: input.reason,
          triggerSource: input.triggerSource,
          transitionedAt: input.timestamp
        })
        if (result.status === 'conflict') {
          throw new Error('Next node run revision conflict')
        }
        nodeRun = result.entity
      } else if (current.status !== 'ready') {
        throw new Error(
          `Next node run cannot become ready from ${current.status}`
        )
      }
      nodeRuns.push(nodeRun)

      if (isWorkflowNodeExecutable(node)) {
        dispatches.push(
          await this.dependencies.dispatches.enqueue(
            {
              id: createAutomaticWorkflowDispatchId(
                input.executionId,
                nodeRun.id
              ),
              executionId: input.executionId,
              requirementId: input.workflow.requirementId,
              nodeId: node.id,
              nodeRunId: nodeRun.id,
              triggerNodeRunId: input.triggerNodeRunId,
              status: 'pending',
              attempts: 0,
              createdAt: input.timestamp,
              updatedAt: input.timestamp
            },
            input.triggerSource
          )
        )
      }
    }

    return { nodeRuns, dispatches }
  }

  private async updateExecution(input: {
    requirementId: string
    executionId: string
    status: WorkflowExecutionRecord['status']
    currentNodeId?: string
    updatedAt: number
    reason: string
    triggerSource: 'user' | 'system' | 'recovery'
  }): Promise<Revisioned<WorkflowExecutionRecord>> {
    const execution = await this.dependencies.executions.get(input.executionId)
    if (!execution || execution.requirementId !== input.requirementId) {
      throw new Error('Workflow execution does not match node run')
    }
    const result =
      execution.status === input.status
        ? await this.dependencies.executions.updateCurrentNode({
            executionId: execution.id,
            expectedRevision: execution.revision,
            currentNodeId: input.currentNodeId,
            updatedAt: input.updatedAt
          })
        : await this.dependencies.executions.transition({
            executionId: execution.id,
            expectedRevision: execution.revision,
            status: input.status,
            currentNodeId: input.currentNodeId,
            reason: input.reason,
            triggerSource: input.triggerSource,
            transitionedAt: input.updatedAt
          })
    if (result.status === 'conflict') {
      throw new Error('Workflow execution revision conflict')
    }
    return result.entity
  }

  private async getNodeRun(id: string): Promise<Revisioned<NodeRunRecord>> {
    const nodeRun = await this.dependencies.nodeRuns.get(id)
    if (!nodeRun) throw new Error(`Node run not found: ${id}`)
    return nodeRun
  }

  private async completeRequirement(
    requirementId: string,
    expectedRevision: number,
    updatedAt: number
  ): Promise<Revisioned<RequirementRecord>> {
    const requirement = await this.dependencies.requirements.get(requirementId)
    if (!requirement) throw new Error(`Requirement not found: ${requirementId}`)
    const result = await this.dependencies.requirements.save(
      { ...requirement, status: 'completed', updatedAt },
      expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Requirement revision conflict')
    }
    return result.entity
  }
}
