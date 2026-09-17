import { describe, expect, it, vi } from 'vitest'
import type { ContextSnapshot } from '../../application/context/context-assembler'
import { AssembledNodeContextRepository } from './assembled-node-context-repository'

const snapshot: ContextSnapshot = {
  policyVersion: 1,
  content: 'assembled context',
  sources: [],
  characterCount: 17,
  estimatedTokens: 5,
  checksum: 'sha256:test'
}

function createHarness(checkpoint?: Record<string, unknown>) {
  const nodeRun = {
    id: 'node-run-1',
    executionId: 'execution-1',
    nodeId: 'custom-review',
    status: 'running' as const,
    attempt: 1,
    ...(checkpoint ? { checkpoint } : {}),
    revision: 3,
    createdAt: 1,
    updatedAt: 1
  }
  const save = vi.fn().mockResolvedValue({
    status: 'saved',
    entity: { ...nodeRun, revision: 4 }
  })
  const assembler = { assemble: vi.fn().mockResolvedValue(snapshot) }
  const listAttachmentPaths = vi
    .fn()
    .mockResolvedValue(['attachments/notes.md'])
  const repository = new AssembledNodeContextRepository({
    legacy: { load: vi.fn() },
    requirements: {
      get: vi.fn().mockResolvedValue({
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Checkout',
        status: 'active',
        bodyRelativePath: 'requirement.md',
        sortOrder: 0,
        revision: 2,
        createdAt: 1,
        updatedAt: 1
      })
    },
    workflows: {
      get: vi.fn().mockResolvedValue({
        requirementId: 'requirement-1',
        templateVersionId: 'template-1',
        revision: 5,
        nodes: [
          {
            id: 'custom-review',
            type: 'ai_generate',
            name: 'Review',
            description: 'Review the implementation.',
            order: 0,
            status: 'running',
            allowSkip: false,
            executor: {
              kind: 'ai_generate',
              prompt: 'Find security issues.',
              artifact: {
                relativePath: 'reviews/security.md',
                kind: 'markdown'
              }
            }
          }
        ],
        edges: []
      })
    },
    nodeRuns: { get: vi.fn().mockResolvedValue(nodeRun), save },
    assembler,
    workspace: {
      getBinding: vi.fn().mockResolvedValue({ rootName: 'Store' }),
      readRequirementBody: vi.fn().mockResolvedValue('# Requirement body'),
      listAttachmentPaths
    },
    maxCharacters: 50_000,
    now: () => 10
  })
  return { repository, assembler, listAttachmentPaths, save }
}

describe('AssembledNodeContextRepository', () => {
  it('assembles and persists a reproducible context snapshot before execution', async () => {
    const { repository, assembler, listAttachmentPaths, save } = createHarness()

    await expect(
      repository.loadNode({
        requirementId: 'requirement-1',
        nodeId: 'custom-review',
        nodeRunId: 'node-run-1',
        modelProfileId: 'profile-1',
        executor: {
          kind: 'ai_generate',
          prompt: 'Find security issues.',
          artifact: {
            relativePath: 'reviews/security.md',
            kind: 'markdown'
          }
        }
      })
    ).resolves.toMatchObject({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'custom-review',
      workspaceName: 'Store',
      prompt: 'assembled context',
      artifactPath: 'reviews/security.md'
    })
    expect(assembler.assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeRunId: 'node-run-1',
        attachmentPaths: []
      })
    )
    expect(listAttachmentPaths).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: {
          modelProfileId: 'profile-1',
          contextSnapshot: snapshot
        },
        updatedAt: 10
      }),
      3
    )
  })

  it('includes only explicitly allowed attachment paths', async () => {
    const { repository, assembler, listAttachmentPaths } = createHarness()

    await repository.loadNode({
      requirementId: 'requirement-1',
      nodeId: 'custom-review',
      nodeRunId: 'node-run-1',
      executor: {
        kind: 'ai_generate',
        prompt: 'Find security issues.',
        artifact: {
          relativePath: 'reviews/security.md',
          kind: 'markdown'
        },
        context: {
          attachments: ['attachments/notes.md']
        }
      }
    })

    expect(listAttachmentPaths).not.toHaveBeenCalled()
    expect(assembler.assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentPaths: ['attachments/notes.md']
      })
    )
  })

  it('reuses the persisted snapshot when an interrupted node resumes', async () => {
    const { repository, assembler, save } = createHarness({
      modelProfileId: 'profile-1',
      contextSnapshot: snapshot
    })

    const context = await repository.loadNode({
      requirementId: 'requirement-1',
      nodeId: 'custom-review',
      nodeRunId: 'node-run-1',
      executor: {
        kind: 'ai_generate',
        prompt: 'Find security issues.',
        artifact: {
          relativePath: 'reviews/security.md',
          kind: 'markdown'
        }
      }
    })

    expect(context.prompt).toBe('assembled context')
    expect(assembler.assemble).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('reassembles a legacy snapshot without a policy version', async () => {
    const { policyVersion: _policyVersion, ...legacySnapshot } = snapshot
    const { repository, assembler, save } = createHarness({
      contextSnapshot: {
        ...legacySnapshot,
        content: 'legacy context'
      }
    })

    const context = await repository.loadNode({
      requirementId: 'requirement-1',
      nodeId: 'custom-review',
      nodeRunId: 'node-run-1',
      executor: {
        kind: 'ai_generate',
        prompt: 'Find security issues.',
        artifact: {
          relativePath: 'reviews/security.md',
          kind: 'markdown'
        }
      }
    })

    expect(context.prompt).toBe('assembled context')
    expect(assembler.assemble).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          contextSnapshot: snapshot
        })
      }),
      3
    )
  })

  it('reassembles a snapshot created by an older context policy', async () => {
    const { repository, assembler, save } = createHarness({
      contextSnapshot: {
        ...snapshot,
        policyVersion: 0,
        content: 'stale context'
      }
    })

    const context = await repository.loadNode({
      requirementId: 'requirement-1',
      nodeId: 'custom-review',
      nodeRunId: 'node-run-1',
      executor: {
        kind: 'ai_generate',
        prompt: 'Find security issues.',
        artifact: {
          relativePath: 'reviews/security.md',
          kind: 'markdown'
        }
      }
    })

    expect(context.prompt).toBe('assembled context')
    expect(assembler.assemble).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          contextSnapshot: snapshot
        })
      }),
      3
    )
  })

  it('updates the recovery model while reusing an existing context snapshot', async () => {
    const { repository, assembler, save } = createHarness({
      modelProfileId: 'profile-1',
      contextSnapshot: snapshot
    })

    await repository.loadNode({
      requirementId: 'requirement-1',
      nodeId: 'custom-review',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-2',
      executor: {
        kind: 'ai_generate',
        prompt: 'Find security issues.',
        artifact: {
          relativePath: 'reviews/security.md',
          kind: 'markdown'
        }
      }
    })

    expect(assembler.assemble).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: {
          modelProfileId: 'profile-2',
          contextSnapshot: snapshot
        }
      }),
      3
    )
  })
})
