import type {
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository,
  UnitOfWork
} from '../ports/business-repositories'
import type { AdvanceWorkflowUseCase } from './advance-workflow'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'
import type { NodeCompletionGateEvaluator } from './node-completion-gate-evaluator'

export type ResolveNodeGateInput = {
  requirementId: string
  nodeRunId: string
  expectedNodeRunRevision: number
  gate:
    | { kind: 'approval'; result: 'approved' | 'rejected' }
    | { kind: 'custom'; gateId: string; passed: boolean }
}

type Dependencies = {
  requirements: Pick<RequirementRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'get' | 'save'>
  unitOfWork: UnitOfWork
  evaluator: Pick<NodeCompletionGateEvaluator, 'evaluate'>
  manager: Pick<ManageNodeExecutionUseCase, 'completeNode'>
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
      if (!['ready', 'running', 'waiting_user'].includes(nodeRun.status)) {
        throw new Error(`Node run cannot resolve gates from ${nodeRun.status}`)
      }
      if (input.gate.kind === 'approval') {
        const approvalRequired =
          node.type === 'approval' ||
          node.completionGate?.requireApproval === true
        if (!approvalRequired) {
          throw new Error('Workflow node does not require approval')
        }
      } else if (node.completionGate?.customGateId !== input.gate.gateId) {
        throw new Error(
          `Workflow node does not configure custom gate: ${input.gate.gateId}`
        )
      }
      const checkpoint = { ...(nodeRun.checkpoint ?? {}) }
      if (input.gate.kind === 'approval') {
        checkpoint.approvalResult = input.gate.result
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
      return { requirement, workflow, node, nodeRun: result.entity }
    })

    const rejected =
      (input.gate.kind === 'approval' && input.gate.result === 'rejected') ||
      (input.gate.kind === 'custom' && !input.gate.passed)
    if (rejected) return recorded.workflow

    const gates = await this.dependencies.evaluator.evaluate({
      requirementId: input.requirementId,
      node: recorded.node,
      nodeRun: recorded.nodeRun,
      executionFinished: true
    })
    if (
      !gates.executionFinished ||
      !gates.requiredArtifactsValid ||
      !gates.approvalPassed ||
      !gates.customGatePassed
    ) {
      return recorded.workflow
    }
    try {
      const completed = await this.dependencies.manager.completeNode({
        requirementId: input.requirementId,
        nodeRunId: input.nodeRunId,
        expectedNodeRunRevision: recorded.nodeRun.revision,
        expectedWorkflowRevision: recorded.workflow.revision,
        expectedRequirementRevision: recorded.requirement.revision,
        ...gates
      })
      await this.dependencies.worker.drain()
      return completed.workflow
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Node completion gates are not satisfied'
      ) {
        return recorded.workflow
      }
      throw error
    }
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
