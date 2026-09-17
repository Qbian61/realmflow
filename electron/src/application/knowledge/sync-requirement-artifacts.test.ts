import { describe, expect, it, vi } from 'vitest'
import {
  SyncRequirementArtifactsUseCase,
  type KnowledgeDocument,
  type KnowledgeSyncDependencies
} from './sync-requirement-artifacts'

function createHarness(
  overrides: Partial<KnowledgeSyncDependencies> = {}
): {
  documents: KnowledgeDocument[]
  dependencies: KnowledgeSyncDependencies
} {
  const documents: KnowledgeDocument[] = []
  return {
    documents,
    dependencies: {
      requirements: {
        get: async () => ({
          id: 'requirement-1',
          workspaceId: 'workspace-1',
          status: 'completed',
          syncCompletedArtifactsToKnowledge: true
        })
      },
      artifacts: {
        listByRequirement: async () => [
          {
            id: 'artifact-formal',
            requirementId: 'requirement-1',
            nodeId: 'node-design',
            relativePath: 'artifacts/design.md',
            checksum: 'sha256:v1',
            version: 1,
            formal: true
          },
          {
            id: 'artifact-draft',
            requirementId: 'requirement-1',
            relativePath: '.drafts/design.md',
            checksum: 'sha256:draft',
            version: 1,
            formal: false
          }
        ],
        readContent: async ({ id }) =>
          id === 'artifact-formal' ? '# Design\n\nStable content.' : '# Draft'
      },
      knowledge: {
        getBySource: async (requirementId, sourcePath) =>
          documents.find(
            (item) =>
              item.sourceRequirementId === requirementId &&
              item.sourcePath === sourcePath
          ),
        replaceDocument: async (document) => {
          const index = documents.findIndex(
            (item) =>
              item.sourceRequirementId === document.sourceRequirementId &&
              item.sourcePath === document.sourcePath
          )
          if (index === -1) documents.push(document)
          else documents[index] = document
        }
      },
      jobs: {
        recordFailure: vi.fn()
      },
      now: () => 100,
      createId: (kind, sourceId) => `${kind}-${sourceId}`,
      ...overrides
    }
  }
}

describe('SyncRequirementArtifactsUseCase', () => {
  it('syncs only formal artifacts after an opted-in requirement completes', async () => {
    const harness = createHarness()
    const useCase = new SyncRequirementArtifactsUseCase(harness.dependencies)

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 1,
      skipped: 0,
      failed: 0
    })
    expect(harness.documents).toEqual([
      expect.objectContaining({
        id: 'document-artifact-formal',
        workspaceId: 'workspace-1',
        sourceRequirementId: 'requirement-1',
        sourceNodeId: 'node-design',
        sourceArtifactId: 'artifact-formal',
        sourceVersion: 1,
        checksum: 'sha256:v1',
        content: '# Design\n\nStable content.'
      })
    ])
  })

  it('is checksum-idempotent and replaces chunks for a newer artifact version', async () => {
    const harness = createHarness()
    const useCase = new SyncRequirementArtifactsUseCase(harness.dependencies, {
      chunkSize: 8
    })

    await useCase.execute('requirement-1')
    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 0,
      skipped: 1,
      failed: 0
    })
    expect(harness.documents).toHaveLength(1)

    harness.dependencies.artifacts.listByRequirement = async () => [
      {
        id: 'artifact-formal-v2',
        requirementId: 'requirement-1',
        nodeId: 'node-design',
        relativePath: 'artifacts/design.md',
        checksum: 'sha256:v2',
        version: 2,
        formal: true
      }
    ]
    harness.dependencies.artifacts.readContent = async () =>
      'Updated artifact content'

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 1,
      skipped: 0,
      failed: 0
    })
    expect(harness.documents).toHaveLength(1)
    expect(harness.documents[0]).toMatchObject({
      sourceVersion: 2,
      checksum: 'sha256:v2',
      chunks: [
        { index: 0, content: 'Updated ' },
        { index: 1, content: 'artifact' },
        { index: 2, content: ' content' }
      ]
    })
  })

  it('records retryable failures without changing completed requirement state', async () => {
    const requirement = {
      id: 'requirement-1',
      workspaceId: 'workspace-1',
      status: 'completed' as const,
      syncCompletedArtifactsToKnowledge: true
    }
    const harness = createHarness({
      requirements: { get: async () => requirement },
      knowledge: {
        getBySource: async () => undefined,
        replaceDocument: async () => {
          throw new Error('index unavailable')
        }
      }
    })
    const useCase = new SyncRequirementArtifactsUseCase(harness.dependencies)

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 0,
      skipped: 0,
      failed: 1
    })
    expect(harness.dependencies.jobs.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: 'requirement-1',
        artifactId: 'artifact-formal',
        status: 'failed',
        retryable: true,
        error: 'index unavailable'
      })
    )
    expect(requirement.status).toBe('completed')
  })
})
