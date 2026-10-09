import { createHash } from 'node:crypto'
import type {
  FrozenKnowledgeSourceSnapshot,
  KnowledgeIndexEnqueueResult
} from './knowledge-index-coordinator'

export type KnowledgeArtifact = {
  id: string
  requirementId: string
  nodeId?: string
  relativePath: string
  checksum: string
  version: number
  formal: boolean
}

export type KnowledgeSyncDependencies = {
  requirements: {
    get: (id: string) => Promise<
      | {
          id: string
          workspaceId: string
          status: 'pending' | 'active' | 'completed'
          syncCompletedArtifactsToKnowledge: boolean
        }
      | undefined
    >
  }
  artifacts: {
    listByRequirement: (requirementId: string) => Promise<KnowledgeArtifact[]>
    readContent: (artifact: KnowledgeArtifact) => Promise<string>
  }
  coordinator: {
    enqueueSnapshot(
      snapshot: FrozenKnowledgeSourceSnapshot,
      triggerSource: 'source_event'
    ): Promise<KnowledgeIndexEnqueueResult>
  }
}

type SyncResult = { synced: number; skipped: number; failed: number }

export class SyncRequirementArtifactsUseCase {
  private readonly active = new Map<string, Promise<SyncResult>>()

  constructor(private readonly dependencies: KnowledgeSyncDependencies) {}

  async execute(requirementId: string): Promise<SyncResult> {
    const running = this.active.get(requirementId)
    if (running) return running
    const promise = this.executeOnce(requirementId)
    this.active.set(requirementId, promise)
    try {
      return await promise
    } finally {
      this.active.delete(requirementId)
    }
  }

  async recover(): Promise<SyncResult> {
    return { synced: 0, skipped: 0, failed: 0 }
  }

  private async executeOnce(requirementId: string): Promise<SyncResult> {
    const requirement = await this.dependencies.requirements.get(requirementId)
    if (
      !requirement ||
      requirement.status !== 'completed' ||
      !requirement.syncCompletedArtifactsToKnowledge
    ) {
      return { synced: 0, skipped: 0, failed: 0 }
    }

    const artifacts =
      await this.dependencies.artifacts.listByRequirement(requirementId)
    const result: SyncResult = { synced: 0, skipped: 0, failed: 0 }
    for (const artifact of artifacts) {
      if (!artifact.formal) {
        result.skipped += 1
        continue
      }
      try {
        const content = await this.dependencies.artifacts.readContent(artifact)
        if (checksum(content) !== artifact.checksum) {
          throw new Error('Artifact content changed before knowledge enqueue')
        }
        const enqueued = await this.dependencies.coordinator.enqueueSnapshot(
          {
            scopeKind: 'workspace',
            scopeId: requirement.workspaceId,
            sourceKind: 'artifact',
            sourceId: artifact.id,
            sourceRevision: artifact.version,
            sourceVersion: `artifact:${artifact.version}`,
            sourceChecksum: artifact.checksum,
            documents: [
              {
                documentKey: artifact.relativePath,
                sourceEntityId: artifact.id,
                title: artifact.relativePath,
                content
              }
            ]
          },
          'source_event'
        )
        if (enqueued.status === 'replayed') result.skipped += 1
        else result.synced += 1
      } catch {
        result.failed += 1
      }
    }
    return result
  }
}

function checksum(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}
