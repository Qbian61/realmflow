import { normalizeNodeApprovalNote } from '../../../../domain/node-approval'
import type {
  NodeApprovalRepository,
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository,
  UnitOfWork
} from '../ports/business-repositories'
import type { AdvanceWorkflowUseCase } from './advance-workflow'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'
import { NodeCompletionGateError } from './node-completion-gate-evaluator'

export type ResolveNodeGateInput = {
  requirementId: string
  nodeRunId: string
  expectedNodeRunRevision: number
  gate:
    | {
        kind: 'approval'
        decisionId: string
        expectedApprovalRevision: number
        result: 'approved' | 'rejected'
        note?: string
      }
    | { kind: 'custom'; gateId: string; passed: boolean }
}

type Dependencies = {
  requirements: Pick<RequirementRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'get' | 'save'>
  approvals: Pick<NodeApprovalRepository, 'getByNodeRun' | 'decide'>
  unitOfWork: UnitOfWork
  manager: Pick<
    ManageNodeExecutionUseCase,
    'completeNodeInTransaction' | 'finalizeNodeCompletion'
  >
  worker: Pick<AdvanceWorkflowUseCase, 'drain'>
}

export class ResolveNodeGateUseCase {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: ResolveNodeGateInput) {
    const recorded = await this.dependencies.unitOfWork.execute(async () => {
      const [requirement, workflow, nodeRun] = await Promise.all([
        this.dependencies.requirements.get(input.requirementId),
        this.dependencies.workflows.get(input.requirementId),
        this.dependencies.nodeRuns.get(input.nodeRunId)
      ])
      if (!requirement || !workflow || !nodeRun) {
        throw new Error('Workflow gate state is incomplete')
      }
      const node = workflow.nodes.find(
        (candidate) => candidate.id === nodeRun.nodeId
      )
      if (!node) throw new Error(`Workflow node not found: ${nodeRun.nodeId}`)
      if (input.gate.kind === 'approval') {
        const approvalRequired =
          node.type === 'approval' ||
          node.completionGate?.requireApproval === true
        if (!approvalRequired) {
          throw new Error('Workflow node does not require approval')
        }
        const note = normalizeNodeApprovalNote(input.gate.note)
        const currentApproval =
          await this.dependencies.approvals.getByNodeRun(input.nodeRunId)
        if (currentApproval?.decisionId === input.gate.decisionId) {
          if (
            currentApproval.result !== input.gate.result ||
            currentApproval.note !== note
          ) {
            throw new Error(
              'Approval decision id conflicts with existing content'
            )
          }
          return {
            requirement,
            workflow,
            node,
            nodeRun,
            rejected: currentApproval.result === 'rejected',
            idempotent: true
          }
        }
      } else if (node.completionGate?.customGateId !== input.gate.gateId) {
        throw new Error(
          `Workflow node does not configure custom gate: ${input.gate.gateId}`
        )
      }
      if (!['ready', 'running', 'waiting_user'].includes(nodeRun.status)) {
        throw new Error(`Node run cannot resolve gates from ${nodeRun.status}`)
      }
      const checkpoint = { ...(nodeRun.checkpoint ?? {}) }
      if (input.gate.kind === 'approval') {
        const approval = await this.dependencies.approvals.decide({
          nodeRunId: input.nodeRunId,
          decisionId: input.gate.decisionId,
          expectedRevision: input.gate.expectedApprovalRevision,
          result: input.gate.result,
          actorType: 'local_user',
          actorId: 'local-user',
          ...(input.gate.note
            ? { note: normalizeNodeApprovalNote(input.gate.note) }
            : {}),
          decidedAt: this.now()
        })
        if (approval.status === 'conflict') {
          throw new Error('Node approval revision conflict')
        }
        checkpoint.approvalResult = input.gate.result
        checkpoint.approvalDecisionId = input.gate.decisionId
      } else {
        checkpoint.customGateResults = {
          ...readCustomGateResults(checkpoint.customGateResults),
          [input.gate.gateId]: input.gate.passed
        }
      }
      const result = await this.dependencies.nodeRuns.save(
        {
          ...nodeRun,
          checkpoint,
          updatedAt: this.now()
        },
        input.expectedNodeRunRevision
      )
      if (result.status === 'conflict') {
        throw new Error('Node run revision conflict')
      }
      const rejected =
        (input.gate.kind === 'approval' &&
          input.gate.result === 'rejected') ||
        (input.gate.kind === 'custom' && !input.gate.passed)
      if (rejected) {
        return {
          requirement,
          workflow,
          node,
          nodeRun: result.entity,
          rejected,
          idempotent: false
        }
      }
      try {
        const completion =
          await this.dependencies.manager.completeNodeInTransaction({
            requirementId: input.requirementId,
            nodeRunId: input.nodeRunId,
            expectedNodeRunRevision: result.entity.revision,
            expectedWorkflowRevision: workflow.revision,
            expectedRequirementRevision: requirement.revision,
            executionFinished: true
          })
        return {
          requirement,
          workflow,
          node,
          nodeRun: result.entity,
          rejected: false,
          idempotent: false,
          completion
        }
      } catch (error) {
        if (!(error instanceof NodeCompletionGateError)) throw error
        return {
          requirement,
          workflow,
          node,
          nodeRun: result.entity,
          rejected: false,
          idempotent: false,
          gates: error.snapshot
        }
      }
    })

    if (recorded.idempotent || recorded.rejected) return recorded.workflow
    if (recorded.completion) {
      await this.dependencies.manager.finalizeNodeCompletion(
        input.requirementId,
        recorded.completion.requirementCompleted
      )
      await this.dependencies.worker.drain()
      return recorded.completion.workflow
    }
    return recorded.workflow
  }
}

function readCustomGateResults(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
    )
  )
}
