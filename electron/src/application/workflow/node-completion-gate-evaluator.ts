import type { RequirementNode } from '../../../../domain/workflow'
import type {
  ArtifactMetadataRepository,
  NodeApprovalRepository,
  NodeQuestionRepository,
  NodeRunRecord,
  NodeTodoRepository,
  Revisioned
} from '../ports/business-repositories'
import type { NodeCompletionGates } from './workflow-runtime'

type Dependencies = {
  artifacts: Pick<
    ArtifactMetadataRepository,
    'listByRequirement' | 'verifyRegisteredBinary'
  >
  todos: Pick<NodeTodoRepository, 'listByNodeRun'>
  questions: Pick<NodeQuestionRepository, 'listByNodeRun'>
  approvals: Pick<NodeApprovalRepository, 'getByNodeRun'>
}

export type NodeCompletionGateReason =
  | 'execution_not_finished'
  | 'required_artifact_invalid'
  | 'required_todos_incomplete'
  | 'required_questions_open'
  | 'approval_not_passed'
  | 'custom_gate_not_passed'

export type NodeCompletionGateSnapshot = NodeCompletionGates & {
  allowed: boolean
  reasons: NodeCompletionGateReason[]
}

export class NodeCompletionGateError extends Error {
  constructor(readonly snapshot: NodeCompletionGateSnapshot) {
    super('Node completion gates are not satisfied')
    this.name = 'NodeCompletionGateError'
  }
}

export class NodeCompletionGateEvaluator {
  constructor(private readonly dependencies: Dependencies) {}

  async evaluate(input: {
    requirementId: string
    node: RequirementNode
    nodeRun: Revisioned<NodeRunRecord>
    executionFinished: boolean
  }): Promise<NodeCompletionGateSnapshot> {
    const [artifacts, todos, questions, approval] = await Promise.all([
      this.dependencies.artifacts.listByRequirement(input.requirementId),
      this.dependencies.todos.listByNodeRun(input.nodeRun.id),
      this.dependencies.questions.listByNodeRun(input.nodeRun.id),
      this.dependencies.approvals.getByNodeRun(input.nodeRun.id)
    ])
    const expectedArtifact = input.node.executor?.artifact
    const matchingArtifact = expectedArtifact
      ? artifacts.find(
        (artifact) =>
          artifact.nodeId === input.node.id &&
          artifact.relativePath === expectedArtifact.relativePath &&
          artifact.kind === expectedArtifact.kind &&
          artifact.isPrimary &&
          artifact.byteSize > 0 &&
          artifact.checksum.length > 0
      )
      : undefined
    let requiredArtifactsValid = !expectedArtifact || Boolean(matchingArtifact)
    if (
      requiredArtifactsValid &&
      matchingArtifact &&
      requiresVerifiedDocument(expectedArtifact!.relativePath)
    ) {
      requiredArtifactsValid =
        await this.dependencies.artifacts.verifyRegisteredBinary(
          matchingArtifact
        )
    }
    const checkpoint = input.nodeRun.checkpoint
    const approvalRequired =
      input.node.type === 'approval' ||
      input.node.completionGate?.requireApproval === true
    const customGateId = input.node.completionGate?.customGateId
    const gates: NodeCompletionGates = {
      executionFinished: input.executionFinished,
      requiredArtifactsValid,
      requiredTodosComplete: todos.every(
        (todo) => todo.status === 'completed'
      ),
      openRequiredQuestions: questions.filter(
        (question) => question.required && question.status === 'open'
      ).length,
      approvalPassed: !approvalRequired || approval?.result === 'approved',
      customGatePassed:
        !customGateId ||
        readCustomGateResult(checkpoint?.customGateResults, customGateId)
    }
    const reasons = collectReasons(gates)

    return {
      ...gates,
      allowed: reasons.length === 0,
      reasons
    }
  }
}

function requiresVerifiedDocument(relativePath: string): boolean {
  return /\.(?:docx|pdf)$/i.test(relativePath)
}

function collectReasons(
  gates: NodeCompletionGates
): NodeCompletionGateReason[] {
  const reasons: NodeCompletionGateReason[] = []
  if (!gates.executionFinished) reasons.push('execution_not_finished')
  if (!gates.requiredArtifactsValid) reasons.push('required_artifact_invalid')
  if (!gates.requiredTodosComplete) reasons.push('required_todos_incomplete')
  if (gates.openRequiredQuestions > 0) {
    reasons.push('required_questions_open')
  }
  if (!gates.approvalPassed) reasons.push('approval_not_passed')
  if (!gates.customGatePassed) reasons.push('custom_gate_not_passed')
  return reasons
}

function readCustomGateResult(value: unknown, gateId: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    gateId in value &&
    (value as Record<string, unknown>)[gateId] === true
  )
}
