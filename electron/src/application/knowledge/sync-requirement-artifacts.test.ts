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
        readSource: vi.fn().mockResolvedValue({
          bytes: new TextEncoder().encode('accepted design'),
          fileName: 'artifacts/design.md',
          mimeType: 'text/markdown'
        })
      },
      contentExtractor: extractor('accepted design'),
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
            documentKey: 'content',
            sourceEntityId: 'artifact-1',
            title: 'design.md',
            content: 'accepted design',
            checksum: digest('accepted design'),
            byteSize: 15
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
        readSource: vi.fn().mockResolvedValue({
          bytes: new TextEncoder().encode('changed'),
          fileName: 'artifacts/design.md',
          mimeType: 'text/markdown'
        })
      },
      contentExtractor: extractor('changed'),
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
      readSource: vi.fn()
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
      contentExtractor: extractor('unused'),
      coordinator: { enqueueSnapshot: vi.fn() }
    })

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 0,
      skipped: 0,
      failed: 0
    })
    expect(artifacts.listByRequirement).not.toHaveBeenCalled()
  })

  it('extracts a formal PDF artifact into the same logical units as local files', async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff])
    const checksum = digest(bytes)
    const contentExtractor = {
      extract: vi.fn().mockResolvedValue({
        sourceChecksum: checksum,
        format: 'pdf',
        extractorVersion: 'pdf-v1',
        units: [
          {
            key: 'page/000001',
            title: 'Page 1',
            text: 'Accepted report',
            checksum: digest('Accepted report'),
            byteSize: 15,
            metadata: {
              format: 'pdf',
              extraction: 'native',
              page: 1
            }
          }
        ]
      })
    }
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
          artifact({
            relativePath: 'artifacts/report.pdf',
            checksum
          })
        ]),
        readSource: vi.fn().mockResolvedValue({
          bytes,
          fileName: 'artifacts/report.pdf',
          mimeType: 'application/pdf'
        })
      },
      contentExtractor,
      coordinator
    })

    await expect(useCase.execute('requirement-1')).resolves.toEqual({
      synced: 1,
      skipped: 0,
      failed: 0
    })
    expect(contentExtractor.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes,
        fileName: 'artifacts/report.pdf',
        mimeType: 'application/pdf',
        sourceChecksum: checksum,
        policy: expect.objectContaining({ consumer: 'artifact_sync' })
      })
    )
    expect(coordinator.enqueueSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [
          expect.objectContaining({
            documentKey: 'page/000001',
            content: 'Accepted report'
          })
        ]
      }),
      'source_event'
    )
  })
})

function artifact(
  overrides: Partial<{
    id: string
    formal: boolean
    relativePath: string
    checksum: string
  }> = {}
) {
  return {
    id: 'artifact-1',
    requirementId: 'requirement-1',
    nodeId: 'node-design',
    relativePath: 'artifacts/design.md',
    checksum: digest('accepted design'),
    version: 2,
    formal: true,
    ...overrides
  }
}

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function extractor(content: string) {
  return {
    extract: vi.fn().mockResolvedValue({
      sourceChecksum: digest(content),
      format: 'md',
      extractorVersion: 'text-v1',
      units: [
        {
          key: 'content',
          title: 'design.md',
          text: content,
          checksum: digest(content),
          byteSize: Buffer.byteLength(content)
        }
      ]
    })
  }
}
