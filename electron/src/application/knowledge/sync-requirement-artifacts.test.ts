import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { SyncRequirementArtifactsUseCase } from './sync-requirement-artifacts'

describe('SyncRequirementArtifactsUseCase', () => {
  it('enqueues every current formal artifact through the shared coordinator', async () => {
    const coordinator = {
      enqueueSnapshot: vi.fn().mockResolvedValue({
        status: 'enqueued',
        job: { id: 'job-1', generationId: 'generation-1' }
      })
    }
    const useCase = new SyncRequirementArtifactsUseCase({
      requirements: {
        get: vi.fn().mockResolvedValue({
          id: 'requirement-1',
          workspaceId: 'space-1',
          status: 'completed',
          syncCompletedArtifactsToKnowledge: true
        })
      },
      artifacts: {
        listByRequirement: vi.fn().mockResolvedValue([
          artifact({ formal: true }),
          artifact({ id: 'draft-1', formal: false })
        ]),
        readContent: vi.fn().mockResolvedValue('accepted design')
      },
      coordinator
    })

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 1,
      skipped: 1,
      failed: 0
    })
    expect(coordinator.enqueueSnapshot).toHaveBeenCalledWith(
      {
        scopeKind: 'workspace',
        scopeId: 'space-1',
        sourceKind: 'artifact',
        sourceId: 'artifact-1',
        sourceRevision: 2,
        sourceVersion: 'artifact:2',
        sourceChecksum: digest('accepted design'),
        documents: [
          {
            documentKey: 'artifacts/design.md',
            sourceEntityId: 'artifact-1',
            title: 'artifacts/design.md',
            content: 'accepted design'
          }
        ]
      },
      'source_event'
    )
  })

  it('does not enqueue when the artifact changed before reading', async () => {
    const coordinator = { enqueueSnapshot: vi.fn() }
    const useCase = new SyncRequirementArtifactsUseCase({
      requirements: {
        get: vi.fn().mockResolvedValue({
          id: 'requirement-1',
          workspaceId: 'space-1',
          status: 'completed',
          syncCompletedArtifactsToKnowledge: true
        })
      },
      artifacts: {
        listByRequirement: vi.fn().mockResolvedValue([artifact()]),
        readContent: vi.fn().mockResolvedValue('changed')
      },
      coordinator
    })

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 0,
      skipped: 0,
      failed: 1
    })
    expect(coordinator.enqueueSnapshot).not.toHaveBeenCalled()
  })

  it('skips requirements that did not opt into artifact knowledge', async () => {
    const artifacts = {
      listByRequirement: vi.fn(),
      readContent: vi.fn()
    }
    const useCase = new SyncRequirementArtifactsUseCase({
      requirements: {
        get: vi.fn().mockResolvedValue({
          id: 'requirement-1',
          workspaceId: 'space-1',
          status: 'completed',
          syncCompletedArtifactsToKnowledge: false
        })
      },
      artifacts,
      coordinator: { enqueueSnapshot: vi.fn() }
    })

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 0,
      skipped: 0,
      failed: 0
    })
    expect(artifacts.listByRequirement).not.toHaveBeenCalled()
  })
})

function artifact(
  overrides: Partial<{
    id: string
    formal: boolean
  }> = {}
) {
  return {
    id: 'artifact-1',
    requirementId: 'requirement-1',
    relativePath: 'artifacts/design.md',
    checksum: digest('accepted design'),
    version: 2,
    formal: true,
    ...overrides
  }
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
