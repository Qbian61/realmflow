import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import { CommitFormalArtifactUseCase } from './commit-formal-artifact'

const completionEvent: AiRunEvent = {
  id: 'event-4',
  runId: 'run-1',
  sequence: 4,
  type: 'run.completed',
  timestamp: '2026-09-20T08:00:00.000Z',
  data: {}
}

describe('CommitFormalArtifactUseCase', () => {
  it('commits a candidate matching the trusted artifact specification', async () => {
    const result = {
      artifactId: 'artifact-1',
      requirementId: 'requirement-1',
      nodeId: 'security-review',
      relativePath: 'artifacts/security-review.md',
      kind: 'markdown',
      checksum: 'sha256:abc',
      version: 1,
      byteSize: 17,
      committedAt: Date.parse(completionEvent.timestamp),
      idempotent: false
    }
    const commit = vi.fn().mockResolvedValue(result)
    const useCase = new CommitFormalArtifactUseCase({ commit })

    await expect(
      useCase.execute({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'analysis',
        nodeId: 'security-review',
        nodeRunId: 'node-run-1',
        expectedArtifact: {
          relativePath: 'artifacts/security-review.md',
          kind: 'markdown'
        },
        artifact: {
          path: 'artifacts/security-review.md',
          content: '# Security Review'
        },
        completionEvent
      })
    ).resolves.toEqual(result)
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeRunId: 'node-run-1',
        expectedArtifact: {
          relativePath: 'artifacts/security-review.md',
          kind: 'markdown'
        }
      })
    )
  })

  it('rejects a node artifact without the current node run attempt', async () => {
    const commit = vi.fn()
    const useCase = new CommitFormalArtifactUseCase({ commit })

    await expect(
      useCase.execute({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'analysis',
        nodeId: 'security-review',
        expectedArtifact: {
          relativePath: 'artifacts/security-review.md',
          kind: 'markdown'
        },
        artifact: {
          path: 'artifacts/security-review.md',
          content: '# Security Review'
        },
        completionEvent
      })
    ).rejects.toThrow('Node run is required for a node artifact')
    expect(commit).not.toHaveBeenCalled()
  })

  it.each([
    [
      'candidate path',
      {
        artifact: {
          path: 'artifacts/other.md',
          content: '# Security Review'
        }
      },
      'Candidate artifact path does not match node configuration'
    ],
    [
      'candidate kind',
      {
        expectedArtifact: {
          relativePath: 'artifacts/security-review.md',
          kind: 'html'
        }
      },
      'Candidate artifact kind does not match node configuration'
    ],
    [
      'completion event',
      {
        completionEvent: {
          ...completionEvent,
          runId: 'run-2'
        }
      },
      'Artifact completion event is invalid'
    ],
    [
      'completion timestamp',
      {
        completionEvent: {
          ...completionEvent,
          timestamp: 'not-a-timestamp'
        }
      },
      'Artifact completion timestamp is invalid'
    ]
  ])('rejects an invalid %s before persistence', async (_name, overrides, message) => {
    const commit = vi.fn()
    const useCase = new CommitFormalArtifactUseCase({ commit })
    const command = {
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'analysis' as const,
      nodeId: 'security-review',
      nodeRunId: 'node-run-1',
      expectedArtifact: {
        relativePath: 'artifacts/security-review.md',
        kind: 'markdown'
      },
      artifact: {
        path: 'artifacts/security-review.md',
        content: '# Security Review'
      },
      completionEvent
    }

    await expect(
      useCase.execute({ ...command, ...overrides })
    ).rejects.toThrow(message)
    expect(commit).not.toHaveBeenCalled()
  })
})
