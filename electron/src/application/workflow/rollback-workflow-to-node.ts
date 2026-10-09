import { planWorkflowRollback } from '../../../../domain/workflow-rollback'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  ArtifactMetadataRepository,
  NodeRunRecord,
  NodeRunRepository,
  NodeTodoRepository,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowDispatchRecord,
  WorkflowDispatchRepository,
  WorkflowExecutionRecord,
  WorkflowExecutionRepository,
  WorkflowAuditRepository,
  WorkflowRollbackOperationRecord,
  WorkflowRollbackOperationRepository
} from '../ports/business-repositories'
import { isWorkflowNodeExecutable } from './execute-workflow-node'
import { initializeConfiguredNodeTodos } from './manage-node-todos'
import { createAutomaticWorkflowDispatchId } from './workflow-dispatch'
import {
  CoordinateWorkflowRollbackUseCase,
  type RollbackCoordinationWarning
} from './coordinate-workflow-rollback'

export type RollbackWorkflowToNodeCommand = {
  requestId: string
  requirementId: string
  executionId: string
  targetNodeId: string
  expectedRequirementRevision: number
  expectedWorkflowRevision: number
  expectedExecutionRevision: number
  expectedNodeRunRevision: number
}

export type RollbackWorkflowToNodeResult =
  | {
      outcome: 'idempotent'
      operation: Revisioned<WorkflowRollbackOperationRecord>
      warnings: RollbackCoordinationWarning[]
    }
  | {
      outcome: 'applied'
      operation: Revisioned<WorkflowRollbackOperationRecord>
      workflow: RequirementWorkflow
      execution: Revisioned<WorkflowExecutionRecord>
      requirement: Revisioned<RequirementRecord>
      nodeRuns: Array<Revisioned<NodeRunRecord>>
      dispatches: Array<Revisioned<WorkflowDispatchRecord>>
      warnings: RollbackCoordinationWarning[]
    }

export type RollbackWorkflowErrorCode =
  | 'not_found'
  | 'invalid_target'
  | 'no_effect'
  | 'active_conflict'
  | 'revision_conflict'
  | 'persistence_failed'

export class RollbackWorkflowError extends Error {
  override readonly name = 'RollbackWorkflowError'

  constructor(
    readonly code: RollbackWorkflowErrorCode,
    message: string
  ) {
    super(message)
  }
}

type Dependencies = {
  requirements: Pick<RequirementRepository, 'get' | 'save'>
  workflows: Pick<RequirementWorkflowRepository, 'get' | 'save'>
  executions: Pick<WorkflowExecutionRepository, 'get'> & {
    reopenForRollback: NonNullable<
      WorkflowExecutionRepository['reopenForRollback']
    >
  }
  nodeRuns: Pick<
    NodeRunRepository,
    'listLatestByExecution' | 'listByExecution' | 'save' | 'transition'
  > & {
    listLatestByExecution: NonNullable<
      NodeRunRepository['listLatestByExecution']
    >
    listByExecution: NonNullable<NodeRunRepository['listByExecution']>
  }
  todos: Pick<NodeTodoRepository, 'save'>
  artifacts: Pick<ArtifactMetadataRepository, 'invalidateByNodeRunIds'>
  dispatches: Pick<WorkflowDispatchRepository, 'enqueue'>
  workflowRollbacks: WorkflowRollbackOperationRepository
  workflowAudit: Pick<WorkflowAuditRepository, 'append'>
  unitOfWork: UnitOfWork
  cancel: {
    execute: (
      runId: string,
      options?: { forceProvider?: boolean }
    ) => Promise<void>
  }
  knowledgeSync: {
    execute: (requirementId: string) => Promise<{
      synced: number
      skipped: number
      failed: number
    }>
  }
  requirementMemory?: {
    withdraw(input: {
      requirementId: string
      retiredAt: number
    }): Promise<boolean>
  }
  coordinator?: Pick<CoordinateWorkflowRollbackUseCase, 'execute'>
}

type CommittedRollback = Exclude<
  RollbackWorkflowToNodeResult,
  { outcome: 'idempotent' }
>

const LOCALLY_ACTIVE_NODE_RUN_STATUSES = new Set<NodeRunRecord['status']>([
  'pending',
  'ready',
  'running',
  'waiting_user',
  'paused',
  'blocked',
  'interrupted'
])

export class RollbackWorkflowToNodeUseCase {
  private readonly coordinator: Pick<
    CoordinateWorkflowRollbackUseCase,
    'execute'
  >

  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now,
    private readonly createId: (
      kind: 'operation' | 'node_run',
      sourceId: string
    ) => string = () => globalThis.crypto.randomUUID()
  ) {
    this.coordinator =
      dependencies.coordinator ??
      new CoordinateWorkflowRollbackUseCase(dependencies, now)
  }

  async execute(
    command: RollbackWorkflowToNodeCommand
  ): Promise<RollbackWorkflowToNodeResult> {
    const committed = await this.dependencies.unitOfWork.execute(async () => {
      const replay = await this.dependencies.workflowRollbacks.getByRequestId(
        command.requestId
      )
      if (replay) {
        assertReplayMatches(command, replay)
        return {
          outcome: 'idempotent' as const,
          operation: replay,
          warnings: [] as []
        }
      }
      return this.commit(command)
    })
    if (committed.outcome === 'idempotent') {
      if (
        !['committed', 'coordination_pending'].includes(
          committed.operation.status
        )
      ) {
        return committed
      }
      const coordinated = await this.coordinator.execute(committed.operation)
      return { ...committed, ...coordinated }
    }
    return this.coordinate(committed)
  }

  private async commit(
    command: RollbackWorkflowToNodeCommand
  ): Promise<CommittedRollback> {
    const [
      requirement,
      workflow,
      execution,
      latestNodeRuns,
      allNodeRuns,
      pendingOperations
    ] = await Promise.all([
        this.dependencies.requirements.get(command.requirementId),
        this.dependencies.workflows.get(command.requirementId),
        this.dependencies.executions.get(command.executionId),
        this.dependencies.nodeRuns.listLatestByExecution(command.executionId),
        this.dependencies.nodeRuns.listByExecution(command.executionId),
        this.dependencies.workflowRollbacks.listPending()
      ])
    if (!requirement) {
      throw new RollbackWorkflowError(
        'not_found',
        `Requirement not found: ${command.requirementId}`
      )
    }
    if (!workflow) {
      throw new RollbackWorkflowError(
        'not_found',
        `Requirement workflow not found: ${command.requirementId}`
      )
    }
    if (
      !execution ||
      execution.requirementId !== command.requirementId
    ) {
      throw new RollbackWorkflowError(
        'invalid_target',
        'Workflow execution does not match requirement'
      )
    }
    const latestByNode = new Map(
      latestNodeRuns.map((nodeRun) => [nodeRun.nodeId, nodeRun])
    )
    const targetNodeRun = latestByNode.get(command.targetNodeId)
    if (!targetNodeRun) {
      throw new RollbackWorkflowError(
        'invalid_target',
        'Workflow rollback target has no execution history'
      )
    }
    const targetNode = workflow.nodes.find(
      (node) => node.id === command.targetNodeId
    )
    if (!targetNode) {
      throw new RollbackWorkflowError(
        'invalid_target',
        `Workflow rollback target not found: ${command.targetNodeId}`
      )
    }
    if (targetNode.status === 'pending' || targetNode.status === 'ready') {
      throw new RollbackWorkflowError(
        'no_effect',
        'Workflow rollback would produce no state change'
      )
    }

    assertRevision(
      'requirement',
      requirement.revision,
      command.expectedRequirementRevision
    )
    assertRevision(
      'workflow',
      workflow.revision,
      command.expectedWorkflowRevision
    )
    assertRevision(
      'execution',
      execution.revision,
      command.expectedExecutionRevision
    )
    assertRevision(
      'node run',
      targetNodeRun.revision,
      command.expectedNodeRunRevision
    )
    if (
      pendingOperations.some(
        (operation) => operation.executionId === execution.id
      )
    ) {
      throw new RollbackWorkflowError(
        'active_conflict',
        'Workflow execution already has an unresolved rollback'
      )
    }

    const plan = planWorkflowRollback({
      workflow,
      targetNodeId: command.targetNodeId
    })
    const timestamp = this.now()
    const workflowResult = await this.dependencies.workflows.save(
      {
        ...workflow,
        revision: workflow.revision + 1,
        nodes: workflow.nodes.map((node) => {
          const attempt = plan.attempts.find(
            (candidate) => candidate.nodeId === node.id
          )
          return attempt ? { ...node, status: attempt.status } : node
        })
      },
      workflow.revision,
      { reason: 'workflow_rolled_back', triggerSource: 'user' }
    )
    assertSaved(workflowResult, 'workflow')

    const executionResult =
      await this.dependencies.executions.reopenForRollback({
        executionId: execution.id,
        expectedRevision: execution.revision,
        currentNodeId: command.targetNodeId,
        reason: 'workflow_rolled_back',
        triggerSource: 'user',
        transitionedAt: timestamp
      })
    assertSaved(executionResult, 'execution')

    let savedRequirement = requirement
    if (requirement.status === 'completed') {
      const requirementResult = await this.dependencies.requirements.save(
        { ...requirement, status: 'active', updatedAt: timestamp },
        requirement.revision
      )
      assertSaved(requirementResult, 'requirement')
      savedRequirement = requirementResult.entity
      await this.dependencies.requirementMemory?.withdraw({
        requirementId: requirement.id,
        retiredAt: timestamp
      })
    }

    const pendingAiRunIds: string[] = []
    for (const nodeId of plan.affectedNodeIds) {
      const oldNodeRun = latestByNode.get(nodeId)
      if (oldNodeRun?.aiRunId) pendingAiRunIds.push(oldNodeRun.aiRunId)
      if (
        oldNodeRun &&
        LOCALLY_ACTIVE_NODE_RUN_STATUSES.has(oldNodeRun.status)
      ) {
        const transition = await this.dependencies.nodeRuns.transition({
          nodeRunId: oldNodeRun.id,
          expectedRevision: oldNodeRun.revision,
          status: 'cancelled',
          clearAiRunId: true,
          clearError: true,
          reason: 'workflow_rolled_back',
          triggerSource: 'user',
          transitionedAt: timestamp
        })
        assertSaved(transition, 'node run')
      }
    }

    const createdNodeRuns: Array<Revisioned<NodeRunRecord>> = []
    for (const attempt of plan.attempts) {
      const previous = latestByNode.get(attempt.nodeId)
      const result = await this.dependencies.nodeRuns.save(
        {
          id: this.createId('node_run', attempt.nodeId),
          executionId: execution.id,
          nodeId: attempt.nodeId,
          status: attempt.status,
          attempt: (previous?.attempt ?? 0) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        0
      )
      assertSaved(result, 'new node run')
      createdNodeRuns.push(result.entity)
      const node = workflow.nodes.find(
        (candidate) => candidate.id === attempt.nodeId
      )
      await initializeConfiguredNodeTodos(this.dependencies.todos, {
        nodeRunId: result.entity.id,
        configuredTodos: node?.configuration?.todos,
        timestamp
      })
    }

    await this.dependencies.artifacts.invalidateByNodeRunIds(
      plan.affectedNodeIds.flatMap((nodeId) =>
        allNodeRuns
          .filter((nodeRun) => nodeRun.nodeId === nodeId)
          .map((nodeRun) => nodeRun.id)
      ),
      timestamp,
      plan.affectedNodeIds
    )

    const dispatches: Array<Revisioned<WorkflowDispatchRecord>> = []
    const targetAttempt = createdNodeRuns.find(
      (nodeRun) => nodeRun.nodeId === command.targetNodeId
    )
    if (
      targetNode &&
      targetAttempt?.status === 'ready' &&
      isWorkflowNodeExecutable(targetNode)
    ) {
      dispatches.push(
        await this.dependencies.dispatches.enqueue(
          {
            id: createAutomaticWorkflowDispatchId(
              execution.id,
              targetAttempt.id
            ),
            executionId: execution.id,
            requirementId: command.requirementId,
            nodeId: targetNode.id,
            nodeRunId: targetAttempt.id,
            triggerNodeRunId: targetNodeRun.id,
            status: 'pending',
            attempts: 0,
            createdAt: timestamp,
            updatedAt: timestamp
          },
          'user'
        )
      )
    }

    const operation =
      await this.dependencies.workflowRollbacks.append({
        id: this.createId('operation', command.requestId),
        requestId: command.requestId,
        requirementId: command.requirementId,
        executionId: execution.id,
        targetNodeId: command.targetNodeId,
        affectedNodeIds: plan.affectedNodeIds,
        createdNodeRunIds: createdNodeRuns.map((nodeRun) => nodeRun.id),
        pendingAiRunIds,
        knowledgeSyncPending: true,
        status: 'committed',
        createdAt: timestamp,
        updatedAt: timestamp
      })
    const auditId = `workflow-rollback:${operation.id}`
    await this.dependencies.workflowAudit.append({
      id: auditId,
      idempotencyKey: auditId,
      scope: 'workflow_execution',
      scopeId: execution.id,
      requirementId: command.requirementId,
      executionId: execution.id,
      eventType: 'workflow_rolled_back',
      actorType: 'local_user',
      actorId: 'local-user',
      triggerSource: 'user',
      fromState: execution.status,
      toState: executionResult.entity.status,
      reason: 'workflow_rolled_back',
      aggregateRevision: executionResult.entity.revision,
      metadata: {
        targetNodeId: command.targetNodeId,
        affectedNodeIds: plan.affectedNodeIds,
        createdNodeRunIds: createdNodeRuns.map((nodeRun) => nodeRun.id)
      },
      occurredAt: timestamp
    })

    return {
      outcome: 'applied',
      operation,
      workflow: workflowResult.entity,
      execution: executionResult.entity,
      requirement: savedRequirement,
      nodeRuns: createdNodeRuns,
      dispatches,
      warnings: []
    }
  }

  private async coordinate(
    committed: CommittedRollback
  ): Promise<CommittedRollback> {
    const coordinated = await this.coordinator.execute(committed.operation)
    return {
      ...committed,
      ...coordinated
    }
  }
}

function assertReplayMatches(
  command: RollbackWorkflowToNodeCommand,
  operation: WorkflowRollbackOperationRecord
): void {
  if (
    operation.requirementId !== command.requirementId ||
    operation.executionId !== command.executionId ||
    operation.targetNodeId !== command.targetNodeId
  ) {
    throw new RollbackWorkflowError(
      'active_conflict',
      'Workflow rollback request conflict'
    )
  }
}

function assertRevision(
  name: string,
  actual: number,
  expected: number
): void {
  if (actual !== expected) {
    throw new RollbackWorkflowError(
      'revision_conflict',
      `${name} revision conflict`
    )
  }
}

function assertSaved<T>(
  result: { status: 'saved' | 'conflict'; entity: T },
  name: string
): asserts result is { status: 'saved'; entity: T } {
  if (result.status === 'conflict') {
    throw new RollbackWorkflowError(
      'revision_conflict',
      `${name} revision conflict`
    )
  }
}
