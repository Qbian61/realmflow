import { describe, expect, it, vi } from 'vitest'
import type { PersistedContextSnapshot } from './context-snapshot'
import {
  PrepareNodeContextSnapshotUseCase,
  PrepareNodeContextSnapshotError
} from './prepare-node-context-snapshot'

const snapshot: PersistedContextSnapshot = {
  id: 'snapshot-1',
  requirementId: 'requirement-1',
  nodeId: 'node-1',
  nodeRunId: 'node-run-1',
  providerId: 'provider-1',
  modelProfileId: 'profile-1',
  modelId: 'model-1',
  modelParameters: {
    timeoutMs: 60_000,
    maxRetries: 2,
    maxConcurrency: 1
  },
  policyVersion: 3,
  content: 'prepared context',
  sources: [],
  plan: {
    totalTokenBudget: 4,
    allocations: { fixed: 4, knowledge: 0 }
  },
  insufficientKnowledge: false,
  characterCount: 16,
  estimatedTokens: 4,
  checksum: 'sha256:test',
  createdAt: 10
}

const command = {
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1',
  expectedWorkflowRevision: 4,
  expectedExecutionRevision: 2,
  expectedNodeRunRevision: 3
}

function createHarness(overrides: {
  currentNodeId?: string
  nodeRunStatus?: 'ready' | 'running'
  routeOutcome?: 'selected' | 'unavailable'
  workflowRevision?: number
} = {}) {
  const workflow = {
    requirementId: 'requirement-1',
    templateVersionId: 'template-1',
    revision: overrides.workflowRevision ?? 4,
    maxParallelism: 1,
    nodes: [
      {
        id: 'node-1',
        type: 'ai_generate' as const,
        name: 'Analyze',
        description: '',
        order: 0,
        status: 'ready' as const,
        allowSkip: false,
        configuration: {
          input: {
            includeRequirementBody: true,
            predecessorArtifacts: 'direct' as const,
            includeSpaceKnowledge: true,
            attachments: []
          },
          prompt: 'Analyze.',
          model: { strategy: 'inherit' as const },
          connectorIds: [],
          permissions: [],
          artifact: {
            required: true,
            relativePath: 'artifacts/analysis.md',
            kind: 'markdown'
          },
          todos: [],
          completionGate: { requireApproval: false },
          retry: { maxAttempts: 1, backoffMs: 0 },
          skip: { allowed: false, requireReason: false }
        },
        executor: {
          kind: 'ai_generate' as const,
          prompt: 'Analyze.',
          artifact: {
            relativePath: 'artifacts/analysis.md',
            kind: 'markdown'
          }
        }
      }
    ],
    edges: []
  }
  const execution = {
    id: 'execution-1',
    requirementId: 'requirement-1',
    status: 'running' as const,
    currentNodeId: overrides.currentNodeId ?? 'node-1',
    revision: 2,
    createdAt: 1,
    updatedAt: 2
  }
  const nodeRun = {
    id: 'node-run-1',
    executionId: execution.id,
    nodeId: 'node-1',
    status: overrides.nodeRunStatus ?? ('ready' as const),
    attempt: 1,
    revision: 3,
    createdAt: 1,
    updatedAt: 2
  }
  const loadNode = vi.fn().mockResolvedValue({
    requirementId: 'requirement-1',
    requirementTitle: 'Requirement',
    nodeId: 'node-1',
    workspaceName: 'Workspace',
    prompt: snapshot.content,
    contextSnapshotId: snapshot.id,
    artifactPath: 'artifacts/analysis.md',
    existingArtifacts: []
  })
  const routeModel = vi.fn().mockResolvedValue(
    overrides.routeOutcome === 'unavailable'
      ? {
          outcome: 'unavailable',
          code: 'no_capability_match',
          message: 'No model'
        }
      : {
          outcome: 'selected',
          reason: 'capability',
          profile: { id: 'profile-1' },
          provider: { id: 'provider-1' }
        }
  )
  const useCase = new PrepareNodeContextSnapshotUseCase({
    workflows: { get: vi.fn().mockResolvedValue(workflow) },
    executions: {
      getLatestByRequirement: vi.fn().mockResolvedValue(execution)
    },
    nodeRuns: { get: vi.fn().mockResolvedValue(nodeRun) },
    models: { routeModel },
    contexts: { loadNode },
    snapshots: { get: vi.fn().mockResolvedValue(snapshot) }
  })
  return { useCase, loadNode, routeModel }
}

describe('PrepareNodeContextSnapshotUseCase', () => {
  it('routes the model and returns the committed snapshot for a ready current node', async () => {
    const { useCase, loadNode } = createHarness()

    await expect(useCase.execute(command)).resolves.toEqual(snapshot)
    expect(loadNode).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: 'requirement-1',
        nodeId: 'node-1',
        nodeRunId: 'node-run-1',
        modelProfileId: 'profile-1'
      })
    )
  })

  it('rejects stale revisions before routing or assembling', async () => {
    const { useCase, loadNode, routeModel } = createHarness({
      workflowRevision: 5
    })

    await expect(useCase.execute(command)).rejects.toMatchObject({
      code: 'revision_conflict'
    })
    expect(routeModel).not.toHaveBeenCalled()
    expect(loadNode).not.toHaveBeenCalled()
  })

  it('rejects a non-current or non-ready node without side effects', async () => {
    const nonCurrent = createHarness({ currentNodeId: 'node-2' })
    await expect(nonCurrent.useCase.execute(command)).rejects.toBeInstanceOf(
      PrepareNodeContextSnapshotError
    )
    expect(nonCurrent.routeModel).not.toHaveBeenCalled()

    const running = createHarness({ nodeRunStatus: 'running' })
    await expect(running.useCase.execute(command)).rejects.toMatchObject({
      code: 'invalid_state'
    })
    expect(running.routeModel).not.toHaveBeenCalled()
  })

  it('surfaces model routing unavailability without assembling', async () => {
    const { useCase, loadNode } = createHarness({
      routeOutcome: 'unavailable'
    })

    await expect(useCase.execute(command)).rejects.toMatchObject({
      code: 'model_unavailable'
    })
    expect(loadNode).not.toHaveBeenCalled()
  })
})
