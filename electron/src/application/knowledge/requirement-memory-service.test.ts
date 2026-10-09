import { describe, expect, it, vi } from 'vitest'
import { RequirementMemoryService } from './requirement-memory-service'

function createHarness() {
  let completionVersion = 0
  const enqueueSnapshot = vi.fn().mockResolvedValue({
    status: 'enqueued',
    job: { id: 'job-1', generationId: 'generation-1', status: 'pending' }
  })
  const storeVersion = vi.fn(async (input) => ({
    ...input,
    completionVersion: ++completionVersion,
    revision: completionVersion
  }))
  const withdraw = vi.fn().mockResolvedValue(true)
  const dependencies = {
    requirements: {
      get: vi.fn().mockResolvedValue({
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Local knowledge',
        status: 'completed',
        revision: 5
      })
    },
    readRequirementBody: vi.fn().mockResolvedValue(`# Context
Local-only retrieval.

## Scope
- Workspace search
- Node context

## Acceptance Criteria
- No cloud index
- Stable answers
`),
    executions: {
      getLatestByRequirement: vi.fn().mockResolvedValue({
        id: 'execution-1'
      })
    },
    nodeRuns: {
      listLatestByExecution: vi.fn().mockResolvedValue([
        { id: 'run-2', nodeId: 'node-2' },
        { id: 'run-1', nodeId: 'node-1' }
      ])
    },
    questions: {
      listByNodeRun: vi.fn(async (nodeRunId: string) =>
        nodeRunId === 'run-1'
          ? [
              {
                id: 'question-1',
                nodeRunId,
                prompt: 'Storage?',
                answer: 'Local',
                status: 'answered',
                answeredAt: 10
              },
              {
                id: 'question-open',
                nodeRunId,
                prompt: 'Ignored?',
                status: 'open'
              }
            ]
          : [
              {
                id: 'question-2',
                nodeRunId,
                prompt: 'Model?',
                answer: 'GTE',
                status: 'answered',
                answeredAt: 20
              }
            ]
      )
    },
    artifacts: {
      listByRequirement: vi.fn().mockResolvedValue([
        {
          id: 'artifact-1',
          stageId: 'release',
          relativePath: 'artifacts/release.md',
          version: 2,
          checksum: `sha256:${'a'.repeat(64)}`,
          isPrimary: true,
          isValid: true
        },
        {
          id: 'artifact-old',
          stageId: 'release',
          relativePath: 'artifacts/old.md',
          version: 1,
          checksum: `sha256:${'b'.repeat(64)}`,
          isPrimary: false,
          isValid: true
        }
      ])
    },
    memories: { storeVersion, withdraw },
    coordinator: { enqueueSnapshot }
  }
  return {
    service: new RequirementMemoryService(dependencies, () => 100),
    dependencies,
    storeVersion,
    withdraw,
    enqueueSnapshot
  }
}

describe('RequirementMemoryService', () => {
  it('persists and enqueues a deterministic completed requirement projection', async () => {
    const { service, storeVersion, enqueueSnapshot } = createHarness()

    await expect(service.syncCompleted('requirement-1')).resolves.toEqual({
      status: 'enqueued',
      completionVersion: 1
    })

    expect(storeVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: 'requirement-1',
        workspaceId: 'workspace-1',
        requirementRevision: 5,
        title: 'Local knowledge',
        createdAt: 100
      })
    )
    const stored = storeVersion.mock.calls[0][0]
    expect(stored.content).toContain('- [node-1] Storage?')
    expect(stored.content).toContain('- [node-2] Model?')
    expect(stored.content).not.toContain('Ignored?')
    expect(stored.content).toContain('artifacts/release.md')
    expect(stored.content).not.toContain('artifacts/old.md')
    expect(enqueueSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKind: 'workspace',
        scopeId: 'workspace-1',
        sourceKind: 'requirement_memory',
        sourceId: 'requirement-1',
        sourceRevision: 1,
        sourceVersion: 'requirement-memory:1',
        documents: [
          expect.objectContaining({
            documentKey: 'requirement-memory.md',
            requirementId: 'requirement-1'
          })
        ]
      }),
      'source_event'
    )
  })

  it('creates a new immutable version when a requirement completes again', async () => {
    const { service, enqueueSnapshot } = createHarness()

    await service.syncCompleted('requirement-1')
    await expect(service.syncCompleted('requirement-1')).resolves.toEqual({
      status: 'enqueued',
      completionVersion: 2
    })

    expect(enqueueSnapshot.mock.calls[1][0]).toMatchObject({
      sourceRevision: 2,
      sourceVersion: 'requirement-memory:2'
    })
  })

  it('skips projection unless the requirement is completed', async () => {
    const { service, dependencies, storeVersion } = createHarness()
    dependencies.requirements.get.mockResolvedValue({
      id: 'requirement-1',
      workspaceId: 'workspace-1',
      title: 'Local knowledge',
      status: 'active',
      revision: 6
    })

    await expect(service.syncCompleted('requirement-1')).resolves.toEqual({
      status: 'skipped'
    })
    expect(storeVersion).not.toHaveBeenCalled()
  })

  it('withdraws the current memory and its current generation on rollback', async () => {
    const { service, withdraw } = createHarness()

    await expect(service.withdraw('requirement-1')).resolves.toEqual({
      status: 'withdrawn'
    })
    expect(withdraw).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      retiredAt: 100
    })
  })
})
