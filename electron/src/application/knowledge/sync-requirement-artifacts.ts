import { createHash } from 'node:crypto'
import { CONTENT_EXTRACTION_LIMITS } from '../../../../domain/content-extraction'
import type {
  FrozenKnowledgeSourceSnapshot,
  KnowledgeIndexEnqueueResult
} from './knowledge-index-coordinator'
import { mapExtractedBundleToKnowledgeDocuments } from './knowledge-extraction-adapter'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'

export type KnowledgeArtifact = {
  id: string
  requirementId: string
  nodeId?: string
  relativePath: string
  checksum: string
  mediaType?: string
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
    readSource: (artifact: KnowledgeArtifact) => Promise<{
      bytes: Uint8Array
      fileName: string
      mimeType?: string
    }>
  }
  contentExtractor: Pick<LocalContentExtractionService, 'extract'>
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
        const source = await this.dependencies.artifacts.readSource(artifact)
        if (checksum(source.bytes) !== artifact.checksum) {
          throw new Error('Artifact content changed before knowledge enqueue')
        }
        const bundle = await this.dependencies.contentExtractor.extract({
          bytes: source.bytes,
          fileName: source.fileName,
          ...(source.mimeType ? { mimeType: source.mimeType } : {}),
          sourceChecksum: artifact.checksum,
          policy: {
            consumer: 'artifact_sync',
            allowLocalOcr: true,
            allowLocalConversion: true,
            maxCharacters: CONTENT_EXTRACTION_LIMITS.maxExtractedCharacters,
            maxUnits: CONTENT_EXTRACTION_LIMITS.maxArchiveEntries
          },
          signal: new AbortController().signal,
          depth: 0
        })
        const enqueued = await this.dependencies.coordinator.enqueueSnapshot(
          {
            scopeKind: 'workspace',
            scopeId: requirement.workspaceId,
            sourceKind: 'artifact',
            sourceId: artifact.id,
            sourceRevision: artifact.version,
            sourceVersion: `artifact:${artifact.version}`,
            sourceChecksum: artifact.checksum,
            documents: mapExtractedBundleToKnowledgeDocuments(
              bundle,
              artifact.id
            )
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

function checksum(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}
