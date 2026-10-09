import { describe, expect, it, vi } from 'vitest'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  Revisioned,
  WorkflowDispatchRecord,
  WorkflowExecutionRecord
} from '../ports/business-repositories'
import {
  SetWorkflowParallelismUseCase
} from './set-workflow-parallelism'

function createHarness(options: {
  maxParallelism?: number
  statuses?: RequirementWorkflow['nodes'][number]['status'][]
  duplicateArtifactPath?: boolean
} = {}) {
  let workflow: RequirementWorkflow = {
    requirementId: 'requirement-1',
    templateVersionId: 'template-v1',
    revision: 3,
    maxParallelism: options.maxParallelism ?? 1,
    nodes: ['a', 'b', 'c'].map((id, order) => ({
      id,
      type: 'ai_generate' as const,
      name: id,
      description: '',
      order,
      status: options.statuses?.[order] ?? (order === 0 ? 'ready' : 'pending'),
      allowSkip: false,
      executor: {
        kind: 'ai_generate' as const,
        prompt: `Run ${id}`,
        artifact: {
          relativePath:
            options.duplicateArtifactPath && order < 2
              ? 'artifacts/shared.md'
              : `artifacts/${id}.md`,
          kind: 'markdown'
        }
      }
    })),
    edges: []
  }
  let execution: Revisioned<WorkflowExecutionRecord> = {
    id: 'execution-1',
    requirementId: workflow.requirementId,
    status: 'running',
    currentNodeId: 'a',
    revision: 2,
    createdAt: 1,
    updatedAt: 1
  }
  const nodeRuns = new Map<string, Revisioned<NodeRunRecord>>(
    workflow.nodes.map((node) => [
      node.id,
      {
        id: `node-run-${node.id}`,
        executionId: execution.id,
        nodeId: node.id,
        status: node.status,
        attempt: 1,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ])
  )
  const dispatches: Array<Revisioned<WorkflowDispatchRecord>> = []

  const useCase = new SetWorkflowParallelismUseCase(
    {
      workflows: {
        get: vi.fn(async () => structuredClone(workflow)),
        save: vi.fn(async (entity, expectedRevision) => {
          if (workflow.revision !== expectedRevision) {
            return { status: 'conflict' as const, entity: workflow }
          }
          workflow = { ...structuredClone(entity), revision: expectedRevision + 1 }
          return { status: 'saved' as const, entity: structuredClone(workflow) }
        })
      },
      executions: {
        getActiveByRequirement: vi.fn(async () => structuredClone(execution)),
        transition: vi.fn(async (input) => {
          execution = {
            ...execution,
            status: input.status,
            currentNodeId: input.currentNodeId,
            updatedAt: input.transitionedAt,
            revision: execution.revision + 1
          }
          return { status: 'saved' as const, entity: structuredClone(execution) }
        }),
        updateCurrentNode: vi.fn(async (input) => {
          execution = {
            ...execution,
            currentNodeId: input.currentNodeId,
            updatedAt: input.updatedAt,
            revision: execution.revision + 1
          }
          return { status: 'saved' as const, entity: structuredClone(execution) }
        })
      },
      nodeRuns: {
        getLatestByNode: vi.fn(async (_executionId, nodeId) => {
          const record = nodeRuns.get(nodeId)
          return record ? structuredClone(record) : undefined
        }),
        transition: vi.fn(async (input) => {
          const current = [...nodeRuns.values()].find(
            (record) => record.id === input.nodeRunId
          )
          if (!current) throw new Error(`Node run not found: ${input.nodeRunId}`)
          const saved = {
            ...current,
            status: input.status,
            updatedAt: input.transitionedAt,
            revision: current.revision + 1
          }
          nodeRuns.set(saved.nodeId, saved)
          return { status: 'saved' as const, entity: structuredClone(saved) }
        })
      },
      dispatches: {
        enqueue: vi.fn(async (record) => {
          const existing = dispatches.find((item) => item.id === record.id)
          if (existing) return structuredClone(existing)
          const saved = { ...structuredClone(record), revision: 1 }
          dispatches.push(saved)
          return saved
        })
      },
      unitOfWork: {
        execute: async (operation) => operation()
      }
    },
    () => 100
  )

  return {
    useCase,
    getState: () => ({ workflow, execution, nodeRuns, dispatches })
  }
}

describe('SetWorkflowParallelismUseCase', () => {
  it.each([0, 9, 1.5, Number.NaN])(
    'rejects invalid parallelism %s before persistence',
    async (maxParallelism) => {
      const { useCase } = createHarness()

      await expect(
        useCase.execute({
          requirementId: 'requirement-1',
          maxParallelism,
          expectedWorkflowRevision: 3,
          expectedExecutionRevision: 2
        })
      ).rejects.toMatchObject({
        code: 'invalid_parallelism'
      })
    }
  )

  it('returns an idempotent replay without changing revisions', async () => {
    const { useCase, getState } = createHarness()

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        maxParallelism: 1,
        expectedWorkflowRevision: 0,
        expectedExecutionRevision: 0
      })
    ).resolves.toMatchObject({
      outcome: 'idempotent',
      workflow: { revision: 3 },
      execution: { revision: 2 },
      activatedNodeRuns: [],
      dispatches: []
    })
    expect(getState().dispatches).toEqual([])
  })

  it('rejects stale workflow or execution revisions with latest values', async () => {
    const { useCase } = createHarness()

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        maxParallelism: 2,
        expectedWorkflowRevision: 2,
        expectedExecutionRevision: 2
      })
    ).rejects.toMatchObject({
      code: 'revision_conflict',
      latestWorkflowRevision: 3,
      latestExecutionRevision: 2
    })
  })

  it('rejects duplicate formal artifact paths before writing', async () => {
    const { useCase, getState } = createHarness({
      duplicateArtifactPath: true
    })

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        maxParallelism: 2,
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 2
      })
    ).rejects.toMatchObject({
      code: 'artifact_path_conflict',
      conflictingNodeIds: ['a', 'b']
    })
    expect(getState().workflow).toMatchObject({
      revision: 3,
      maxParallelism: 1
    })
  })

  it('atomically admits a stable batch and creates deterministic dispatches', async () => {
    const { useCase } = createHarness()

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        maxParallelism: 2,
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 2
      })
    ).resolves.toMatchObject({
      outcome: 'applied',
      workflow: {
        revision: 4,
        maxParallelism: 2,
        nodes: [
          { id: 'a', status: 'ready' },
          { id: 'b', status: 'ready' },
          { id: 'c', status: 'pending' }
        ]
      },
      execution: {
        currentNodeId: 'a',
        status: 'running',
        revision: 2
      },
      activatedNodeRuns: [{ id: 'node-run-b', status: 'ready', revision: 2 }],
      dispatches: [
        {
          id: 'execution-1:auto:node-run-b',
          nodeId: 'b',
          nodeRunId: 'node-run-b'
        }
      ]
    })
  })

  it('does not cancel active nodes or admit replacements when lowering the limit', async () => {
    const { useCase } = createHarness({
      maxParallelism: 2,
      statuses: ['running', 'waiting_user', 'pending']
    })

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        maxParallelism: 1,
        expectedWorkflowRevision: 3,
        expectedExecutionRevision: 2
      })
    ).resolves.toMatchObject({
      outcome: 'applied',
      workflow: {
        maxParallelism: 1,
        nodes: [
          { id: 'a', status: 'running' },
          { id: 'b', status: 'waiting_user' },
          { id: 'c', status: 'pending' }
        ]
      },
      activatedNodeRuns: [],
      dispatches: []
    })
  })
})
