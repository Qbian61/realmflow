import type {
  ArtifactMetadataRepository,
  NodeRunHistoryReader,
  NodeRunRecord
} from '../ports/business-repositories'

type Dependencies = {
  nodeRuns: NodeRunHistoryReader
  artifacts: Pick<ArtifactMetadataRepository, 'listByRequirement'>
}

const UNSTARTED_STATUSES = new Set<NodeRunRecord['status']>([
  'pending',
  'ready'
])

export class StartedNodeProtection {
  constructor(private readonly dependencies: Dependencies) {}

  async assertUnstarted(
    requirementId: string,
    nodeIds: string[]
  ): Promise<void> {
    const uniqueNodeIds = [...new Set(nodeIds)]
    if (uniqueNodeIds.length === 0) return

    const artifacts =
      await this.dependencies.artifacts.listByRequirement(requirementId)
    const artifactNodeIds = new Set(
      artifacts
        .map((artifact) => artifact.nodeId)
        .filter((nodeId): nodeId is string => Boolean(nodeId))
    )
    const runsByNode = await Promise.all(
      uniqueNodeIds.map((nodeId) =>
        this.dependencies.nodeRuns.listByNode(nodeId)
      )
    )

    uniqueNodeIds.forEach((nodeId, index) => {
      if (
        artifactNodeIds.has(nodeId) ||
        runsByNode[index].some(hasStartedEvidence)
      ) {
        throw new Error(
          `Workflow node has already started and is protected: ${nodeId}`
        )
      }
    })
  }
}

function hasStartedEvidence(
  run: Awaited<ReturnType<NodeRunHistoryReader['listByNode']>>[number]
): boolean {
  return (
    !UNSTARTED_STATUSES.has(run.status) ||
    run.attempt > 1 ||
    run.aiRunId !== undefined ||
    run.checkpoint !== undefined ||
    run.error !== undefined ||
    run.completedAt !== undefined
  )
}
