import { describe, expect, it, vi } from 'vitest'
import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import type {
  ContextSnapshot,
  PersistedContextSnapshot
} from '../../application/context/context-snapshot'
import { AssembledNodeContextRepository } from './assembled-node-context-repository'

const snapshot: ContextSnapshot = {
  policyVersion: 3,
  content: 'assembled context',
  sources: [],
  plan: {
    totalTokenBudget: 5,
    allocations: { fixed: 5, knowledge: 0 }
  },
  insufficientKnowledge: false,
  characterCount: 17,
  estimatedTokens: 5,
  checksum: 'sha256:test'
}

const persistedSnapshot: PersistedContextSnapshot = {
  ...snapshot,
  id: 'context-snapshot-1',
  requirementId: 'requirement-1',
  nodeId: 'custom-review',
  nodeRunId: 'node-run-1',
  providerId: 'provider-1',
  modelProfileId: 'profile-1',
  modelId: 'model-1',
  modelParameters: {
    timeoutMs: 60_000,
    maxRetries: 2,
    maxConcurrency: 1
  },
  createdAt: 10
}

const defaultConfiguration: WorkflowNodeConfiguration = {
  input: {
    includeRequirementBody: true,
    predecessorArtifacts: 'direct',
    includeSpaceKnowledge: true,
    attachments: []
  },
  prompt: 'Find security issues.',
  model: { strategy: 'inherit' },
  connectorIds: [],
  permissions: [],
  artifact: {
    required: true,
    relativePath: 'reviews/security.md',
    kind: 'markdown'
  },
  todos: [],
  completionGate: { requireApproval: false },
  retry: { maxAttempts: 1, backoffMs: 0 },
  skip: { allowed: false, requireReason: false }
}

function createHarness(input: {
  checkpoint?: Record<string, unknown>
  configuration?: WorkflowNodeConfiguration
  existingSnapshot?: PersistedContextSnapshot
} = {}) {
  const nodeRun = {
    id: 'node-run-1',
    executionId: 'execution-1',
    nodeId: 'custom-review',
    status: 'running' as const,
    attempt: 1,
    ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
    revision: 3,
    createdAt: 1,
    updatedAt: 1
  }
  const save = vi.fn().mockImplementation(async (entity) => ({
    status: 'saved',
    entity: { ...entity, revision: 4 }
  }))
  const append = vi.fn().mockResolvedValue(undefined)
  const getByNodeRun = vi
    .fn()
    .mockResolvedValue(input.existingSnapshot)
  const assembler = { assemble: vi.fn().mockResolvedValue(snapshot) }
  const readRequirementBody = vi
    .fn()
    .mockResolvedValue('# Requirement body')
  const transaction = vi.fn(async (operation) => operation())
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
        maxParallelism: 1,
        nodes: [
          {
            id: 'custom-review',
            type: 'ai_generate',
            name: 'Review',
            description: 'Review the implementation.',
            order: 0,
            status: 'running',
            allowSkip: false,
            configuration: input.configuration ?? defaultConfiguration,
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
    snapshots: {
      get: vi.fn().mockResolvedValue(input.existingSnapshot),
      getByNodeRun,
      append
    },
    models: {
      getProfile: vi.fn().mockResolvedValue({
        id: 'profile-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        timeoutMs: 60_000,
        maxRetries: 2,
        maxConcurrency: 1,
        revision: 1
      }),
      getProvider: vi.fn().mockResolvedValue({
        id: 'provider-1',
        revision: 1
      })
    },
    unitOfWork: { execute: transaction },
    assembler,
    workspace: {
      getBinding: vi.fn().mockResolvedValue({ rootName: 'Store' }),
      readRequirementBody
    },
    createId: () => 'context-snapshot-1',
    maxCharacters: 50_000,
    now: () => 10
  })
  return {
    repository,
    assembler,
    readRequirementBody,
    save,
    append,
    getByNodeRun,
    transaction
  }
}

const loadInput = {
  requirementId: 'requirement-1',
  nodeId: 'custom-review',
  nodeRunId: 'node-run-1',
  modelProfileId: 'profile-1',
  executor: {
    kind: 'ai_generate' as const,
    prompt: 'Find security issues.',
    artifact: {
      relativePath: 'reviews/security.md',
      kind: 'markdown'
    }
  }
}

describe('AssembledNodeContextRepository', () => {
  it('atomically persists one immutable snapshot before returning model context', async () => {
    const { repository, assembler, append, save, transaction } = createHarness()

    await expect(repository.loadNode(loadInput)).resolves.toMatchObject({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'custom-review',
      nodeRunId: 'node-run-1',
      workspaceName: 'Store',
      prompt: 'assembled context',
      requestedReasoning: 'inherit',
      contextSnapshotId: 'context-snapshot-1',
      artifactPath: 'reviews/security.md'
    })
    expect(assembler.assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeRunId: 'node-run-1',
        attachmentPaths: [],
        includeRequirementBody: true,
        predecessorArtifacts: 'direct',
        includeSpaceKnowledge: true
      })
    )
    expect(transaction).toHaveBeenCalledOnce()
    expect(append).toHaveBeenCalledWith(persistedSnapshot)
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: {
          modelProfileId: 'profile-1',
          contextSnapshotId: 'context-snapshot-1'
        },
        updatedAt: 10
      }),
      3
    )
  })

  it('exposes explicit reasoning as both requested and effective', async () => {
    const { repository } = createHarness({
      configuration: {
        ...defaultConfiguration,
        reasoning: 'medium'
      }
    })

    await expect(repository.loadNode(loadInput)).resolves.toMatchObject({
      reasoning: 'medium',
      requestedReasoning: 'medium',
      effectiveReasoning: 'medium'
    })
  })

  it('uses only attachment paths selected by the node configuration', async () => {
    const { repository, assembler } = createHarness({
      configuration: {
        ...defaultConfiguration,
        input: {
          ...defaultConfiguration.input,
          attachments: ['attachments/notes.md']
        }
      }
    })

    await repository.loadNode(loadInput)

    expect(assembler.assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentPaths: ['attachments/notes.md']
      })
    )
  })

  it('does not read the requirement body when configuration excludes it', async () => {
    const { repository, assembler, readRequirementBody } = createHarness({
      configuration: {
        ...defaultConfiguration,
        input: {
          includeRequirementBody: false,
          predecessorArtifacts: 'none',
          includeSpaceKnowledge: false,
          attachments: []
        }
      }
    })

    await repository.loadNode(loadInput)

    expect(readRequirementBody).not.toHaveBeenCalled()
    expect(assembler.assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        includeRequirementBody: false,
        predecessorArtifacts: 'none',
        includeSpaceKnowledge: false
      })
    )
  })

  it('reuses the persisted snapshot without reading mutable sources', async () => {
    const { repository, assembler, append, save } = createHarness({
      checkpoint: {
        modelProfileId: 'profile-1',
        contextSnapshotId: persistedSnapshot.id
      },
      existingSnapshot: persistedSnapshot
    })

    const context = await repository.loadNode(loadInput)

    expect(context).toMatchObject({
      prompt: 'assembled context',
      contextSnapshotId: persistedSnapshot.id
    })
    expect(assembler.assemble).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a different model after the snapshot is fixed', async () => {
    const { repository, assembler } = createHarness({
      existingSnapshot: persistedSnapshot
    })

    await expect(
      repository.loadNode({ ...loadInput, modelProfileId: 'profile-2' })
    ).rejects.toThrow('Node context snapshot model conflict')
    expect(assembler.assemble).not.toHaveBeenCalled()
  })

  it('reuses the same-model snapshot that wins a concurrent insert', async () => {
    const harness = createHarness()
    harness.append.mockRejectedValueOnce(new Error('UNIQUE constraint failed'))
    harness.getByNodeRun
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(persistedSnapshot)

    await expect(harness.repository.loadNode(loadInput)).resolves.toMatchObject({
      prompt: persistedSnapshot.content,
      contextSnapshotId: persistedSnapshot.id
    })
  })
})
