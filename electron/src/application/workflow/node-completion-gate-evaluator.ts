import type { RequirementNode } from '../../../../domain/workflow'
import type {
  ArtifactMetadataRepository,
  NodeRunRecord,
  Revisioned
} from '../ports/business-repositories'
import type { NodeCompletionGates } from './workflow-runtime'

type Dependencies = {
  artifacts: Pick<ArtifactMetadataRepository, 'listByRequirement'>
}

export class NodeCompletionGateEvaluator {
  constructor(private readonly dependencies: Dependencies) {}

  async evaluate(input: {
    requirementId: string
    node: RequirementNode
    nodeRun: Revisioned<NodeRunRecord>
    executionFinished: boolean
  }): Promise<
    Pick<
      NodeCompletionGates,
      | 'executionFinished'
      | 'requiredArtifactsValid'
      | 'approvalPassed'
      | 'customGatePassed'
    >
  > {
    const artifacts = await this.dependencies.artifacts.listByRequirement(
      input.requirementId
    )
    const expectedArtifact = input.node.executor?.artifact
    const requiredArtifactsValid =
      !expectedArtifact ||
      artifacts.some(
        (artifact) =>
          artifact.nodeId === input.node.id &&
          artifact.relativePath === expectedArtifact.relativePath &&
          artifact.kind === expectedArtifact.kind &&
          artifact.isPrimary &&
          artifact.byteSize > 0 &&
          artifact.checksum.length > 0
      )
    const checkpoint = input.nodeRun.checkpoint
    const approvalRequired =
      input.node.type === 'approval' ||
      input.node.completionGate?.requireApproval === true
    const customGateId = input.node.completionGate?.customGateId

    return {
      executionFinished: input.executionFinished,
      requiredArtifactsValid,
      approvalPassed:
        !approvalRequired || checkpoint?.approvalResult === 'approved',
      customGatePassed:
        !customGateId ||
        readCustomGateResult(checkpoint?.customGateResults, customGateId)
    }
  }
}

function readCustomGateResult(value: unknown, gateId: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    gateId in value &&
    (value as Record<string, unknown>)[gateId] === true
  )
}
