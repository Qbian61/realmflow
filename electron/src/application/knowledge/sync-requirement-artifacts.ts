import { createHash } from 'node:crypto'

export type KnowledgeArtifact = {
  id: string
  requirementId: string
  nodeId?: string
  relativePath: string
  checksum: string
  version: number
  formal: boolean
}

export type KnowledgeChunk = {
  id: string
  index: number
  content: string
  checksum: string
}

export type KnowledgeDocument = {
  id: string
  workspaceId: string
  sourceRequirementId: string
  sourceNodeId?: string
  sourceArtifactId: string
  sourceVersion: number
  sourcePath: string
  checksum: string
  content: string
  chunks: KnowledgeChunk[]
  updatedAt: number
}

export type KnowledgeSyncFailure = {
  id: string
  requirementId: string
  artifactId: string
  status: 'failed'
  retryable: true
  error: string
  createdAt: number
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
  knowledge: {
    getBySource: (
      requirementId: string,
      sourcePath: string
    ) => Promise<KnowledgeDocument | undefined>
    replaceDocument: (document: KnowledgeDocument) => Promise<void>
  }
  jobs: {
    recordFailure: (failure: KnowledgeSyncFailure) => Promise<void> | void
  }
  now?: () => number
  createId?: (kind: 'document' | 'chunk' | 'job', sourceId: string) => string
}

export class SyncRequirementArtifactsUseCase {
  private readonly chunkSize: number

  constructor(
    private readonly dependencies: KnowledgeSyncDependencies,
    options: { chunkSize?: number } = {}
  ) {
    this.chunkSize = options.chunkSize ?? 2_000
    if (!Number.isInteger(this.chunkSize) || this.chunkSize <= 0) {
      throw new Error('Knowledge chunk size must be a positive integer')
    }
  }

  async execute(
    requirementId: string
  ): Promise<{ synced: number; skipped: number; failed: number }> {
    const requirement = await this.dependencies.requirements.get(requirementId)
    if (
      !requirement ||
      requirement.status !== 'completed' ||
      !requirement.syncCompletedArtifactsToKnowledge
    ) {
      return { synced: 0, skipped: 0, failed: 0 }
    }

    const artifacts = (
      await this.dependencies.artifacts.listByRequirement(requirementId)
    ).filter((artifact) => artifact.formal)
    let synced = 0
    let skipped = 0
    let failed = 0

    for (const artifact of artifacts) {
      try {
        const existing = await this.dependencies.knowledge.getBySource(
          requirementId,
          artifact.relativePath
        )
        if (
          existing?.checksum === artifact.checksum &&
          existing.sourceVersion === artifact.version
        ) {
          skipped += 1
          continue
        }
        const content =
          await this.dependencies.artifacts.readContent(artifact)
        const documentId =
          existing?.id ?? this.createId('document', artifact.id)
        await this.dependencies.knowledge.replaceDocument({
          id: documentId,
          workspaceId: requirement.workspaceId,
          sourceRequirementId: requirement.id,
          ...(artifact.nodeId ? { sourceNodeId: artifact.nodeId } : {}),
          sourceArtifactId: artifact.id,
          sourceVersion: artifact.version,
          sourcePath: artifact.relativePath,
          checksum: artifact.checksum,
          content,
          chunks: chunkContent(content, this.chunkSize).map(
            (chunkContentValue, index) => ({
              id: this.createId('chunk', `${documentId}:${index}`),
              index,
              content: chunkContentValue,
              checksum: checksum(chunkContentValue)
            })
          ),
          updatedAt: this.now()
        })
        synced += 1
      } catch (error) {
        failed += 1
        const createdAt = this.now()
        await this.dependencies.jobs.recordFailure({
          id: this.createId('job', `${artifact.id}:${createdAt}`),
          requirementId,
          artifactId: artifact.id,
          status: 'failed',
          retryable: true,
          error: error instanceof Error ? error.message : String(error),
          createdAt
        })
      }
    }

    return { synced, skipped, failed }
  }

  private now(): number {
    return (this.dependencies.now ?? Date.now)()
  }

  private createId(
    kind: 'document' | 'chunk' | 'job',
    sourceId: string
  ): string {
    return (
      this.dependencies.createId?.(kind, sourceId) ??
      `${kind}-${checksum(sourceId).slice('sha256:'.length, 24)}`
    )
  }
}

function chunkContent(content: string, chunkSize: number): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < content.length; offset += chunkSize) {
    chunks.push(content.slice(offset, offset + chunkSize))
  }
  return chunks
}

function checksum(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}
