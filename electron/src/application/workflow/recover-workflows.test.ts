import { describe, expect, it, vi } from 'vitest'
import type {
  NodeRunRecord,
  Revisioned,
  WorkflowExecutionRecord
} from '../ports/business-repositories'
import {
  RecoverInterruptedNodeRunsUseCase,
  RecoverPendingWorkflowRollbacksUseCase
} from './recover-workflows'
import {
  createRecoveryWorkflowDispatchId,
  parseRecoveryWorkflowDispatchId
} from './workflow-dispatch'

function execution(
  id: string,
  status: WorkflowExecutionRecord['status'],
  currentNodeId = `node-${id}`
): Revisioned<WorkflowExecutionRecord> {
  return {
    id,
    requirementId: `requirement-${id}`,
    status,
    currentNodeId,
    revision: 1,
    createdAt: 1,
    updatedAt: 1
  }
}

function nodeRun(
  id: string,
  executionId: string,
  status: NodeRunRecord['status'],
  revision = 2
): Revisioned<NodeRunRecord> {
  return {
    id,
    executionId,
    nodeId: `node-${executionId}`,
    status,
    attempt: 1,
    checkpoint: { modelProfileId: 'profile-1' },
    revision,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('RecoverInterruptedNodeRunsUseCase', () => {
  it('uses the interrupted node-run revision as the recovery idempotency key', () => {
    const id = createRecoveryWorkflowDispatchId(
      'execution-1',
      'node-run-1',
      3
    )

    expect(id).toBe('execution-1:recovery:node-run-1:r3')
    expect(parseRecoveryWorkflowDispatchId(id)).toEqual({
      expectedNodeRunRevision: 3
    })
    expect(
      parseRecoveryWorkflowDispatchId('execution-1:auto:node-run-1')
    ).toBeUndefined()
  })

  it('atomically interrupts running aggregates and enqueues recovery', async () => {
    const runningExecution = execution('running', 'running')
    const runningNodeRun = nodeRun(
      'node-run-running',
      runningExecution.id,
      'running'
    )
    const interruptNode = vi.fn().mockResolvedValue({
      workflow: {
        requirementId: runningExecution.requirementId,
        revision: 4,
        nodes: [
          {
            id: runningExecution.currentNodeId,
            type: 'ai_generate',
            status: 'interrupted'
          }
        ],
        edges: []
      },
      execution: { ...runningExecution, status: 'interrupted', revision: 2 },
      nodeRun: { ...runningNodeRun, status: 'interrupted', revision: 3 },
      dispatch: {
        id: createRecoveryWorkflowDispatchId(
          runningExecution.id,
          runningNodeRun.id,
          3
        )
      }
    })
    const useCase = new RecoverInterruptedNodeRunsUseCase({
      executions: {
        listByStatus: vi.fn(async (status) =>
          status === 'running' ? [runningExecution] : []
        ),
        get: vi.fn(async () => runningExecution)
      },
      workflows: {
        get: vi.fn(async () => ({
          requirementId: runningExecution.requirementId,
          templateVersionId: 'template-v1',
          revision: 3,
          maxParallelism: 1,
          nodes: [
            {
              id: runningExecution.currentNodeId!,
              type: 'ai_generate' as const,
              name: 'Running node',
              description: '',
              order: 0,
              status: 'running' as const,
              allowSkip: false
            }
          ],
          edges: []
        }))
      },
      nodeRuns: {
        getLatestByNode: vi.fn(async () => runningNodeRun),
        listInterrupted: vi.fn(async () => [])
      },
      dispatches: { enqueue: vi.fn() },
      manager: { interruptNode }
    })

    await expect(useCase.execute()).resolves.toEqual({
      interrupted: 1,
      enqueued: 1,
      failed: 0
    })
    expect(interruptNode).toHaveBeenCalledWith({
      requirementId: runningExecution.requirementId,
      nodeRunId: runningNodeRun.id,
      expectedWorkflowRevision: 3,
      expectedExecutionRevision: 1,
      expectedNodeRunRevision: 2
    })
  })

  it('interrupts every running branch instead of only the focused node', async () => {
    const runningExecution = {
      ...execution('running', 'running'),
      currentNodeId: 'node-a'
    }
    const runningNodeRuns = [
      {
        ...nodeRun('node-run-a', runningExecution.id, 'running'),
        nodeId: 'node-a'
      },
      {
        ...nodeRun('node-run-b', runningExecution.id, 'running'),
        nodeId: 'node-b'
      }
    ]
    const interruptNode = vi.fn().mockResolvedValue({})
    const useCase = new RecoverInterruptedNodeRunsUseCase({
      executions: {
        listByStatus: vi.fn(async () => [runningExecution]),
        get: vi.fn(async () => runningExecution)
      },
      workflows: {
        get: vi.fn(async () => ({
          requirementId: runningExecution.requirementId,
          templateVersionId: 'template-v1',
          revision: 3,
          maxParallelism: 2,
          nodes: [
            {
              id: 'node-a',
              type: 'ai_generate' as const,
              name: 'A',
              description: '',
              order: 0,
              status: 'running' as const,
              allowSkip: false
            },
            {
              id: 'node-b',
              type: 'ai_generate' as const,
              name: 'B',
              description: '',
              order: 1,
              status: 'running' as const,
              allowSkip: false
            }
          ],
          edges: []
        }))
      },
      nodeRuns: {
        getLatestByNode: vi.fn(async (_executionId, nodeId) =>
          runningNodeRuns.find((item) => item.nodeId === nodeId)
        ),
        listInterrupted: vi.fn(async () => [])
      },
      dispatches: { enqueue: vi.fn() },
      manager: { interruptNode }
    })

    await expect(useCase.execute()).resolves.toEqual({
      interrupted: 2,
      enqueued: 2,
      failed: 0
    })
    expect(interruptNode).toHaveBeenCalledTimes(2)
    expect(interruptNode).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ nodeRunId: 'node-run-b' })
    )
  })

  it('re-enqueues an existing consistent interrupted candidate exactly once', async () => {
    const interruptedExecution = execution('interrupted', 'interrupted')
    const interruptedNodeRun = nodeRun(
      'node-run-interrupted',
      interruptedExecution.id,
      'interrupted',
      5
    )
    const enqueue = vi.fn(async (record) => ({ ...record, revision: 1 }))
    const useCase = new RecoverInterruptedNodeRunsUseCase({
      executions: {
        listByStatus: vi.fn(async () => []),
        get: vi.fn(async () => interruptedExecution)
      },
      workflows: {
        get: vi.fn(async () => ({
          requirementId: interruptedExecution.requirementId,
          templateVersionId: 'template-v1',
          revision: 7,
          maxParallelism: 1,
          nodes: [
            {
              id: interruptedExecution.currentNodeId!,
              type: 'ai_generate' as const,
              name: 'Interrupted node',
              description: '',
              order: 0,
              status: 'interrupted' as const,
              allowSkip: false
            }
          ],
          edges: []
        }))
      },
      nodeRuns: {
        getLatestByNode: vi.fn(async () => interruptedNodeRun),
        listInterrupted: vi.fn(async () => [interruptedNodeRun])
      },
      dispatches: { enqueue },
      manager: { interruptNode: vi.fn() }
    })

    await expect(useCase.execute()).resolves.toEqual({
      interrupted: 0,
      enqueued: 1,
      failed: 0
    })
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: createRecoveryWorkflowDispatchId(
          interruptedExecution.id,
          interruptedNodeRun.id,
          interruptedNodeRun.revision
        ),
        executionId: interruptedExecution.id,
        requirementId: interruptedExecution.requirementId,
        nodeRunId: interruptedNodeRun.id,
        status: 'pending'
      }),
      'recovery'
    )
  })

  it('does not recover paused, waiting, blocked, cancelled, failed or completed work', async () => {
    const listByStatus = vi.fn(async () => [])
    const useCase = new RecoverInterruptedNodeRunsUseCase({
      executions: {
        listByStatus,
        get: vi.fn()
      },
      workflows: { get: vi.fn() },
      nodeRuns: {
        getLatestByNode: vi.fn(),
        listInterrupted: vi.fn(async () => [])
      },
      dispatches: { enqueue: vi.fn() },
      manager: { interruptNode: vi.fn() }
    })

    await expect(useCase.execute()).resolves.toEqual({
      interrupted: 0,
      enqueued: 0,
      failed: 0
    })
    expect(listByStatus).toHaveBeenCalledTimes(1)
    expect(listByStatus).toHaveBeenCalledWith('running')
  })
})

describe('RecoverPendingWorkflowRollbacksUseCase', () => {
  it('coordinates every pending rollback during startup recovery', async () => {
    const pending = [
      {
        id: 'rollback-1',
        requestId: 'request-1',
        requirementId: 'requirement-1',
        executionId: 'execution-1',
        targetNodeId: 'node-1',
        affectedNodeIds: ['node-1'],
        createdNodeRunIds: ['node-run-2'],
        pendingAiRunIds: ['ai-run-1'],
        knowledgeSyncPending: true,
        status: 'coordination_pending' as const,
        revision: 2,
        createdAt: 1,
        updatedAt: 2
      },
      {
        id: 'rollback-2',
        requestId: 'request-2',
        requirementId: 'requirement-2',
        executionId: 'execution-2',
        targetNodeId: 'node-2',
        affectedNodeIds: ['node-2'],
        createdNodeRunIds: ['node-run-4'],
        pendingAiRunIds: [],
        knowledgeSyncPending: true,
        status: 'committed' as const,
        revision: 1,
        createdAt: 3,
        updatedAt: 3
      }
    ]
    const coordinate = vi.fn().mockResolvedValue({
      operation: pending[0],
      warnings: []
    })
    const useCase = new RecoverPendingWorkflowRollbacksUseCase({
      workflowRollbacks: { listPending: vi.fn(async () => pending) },
      coordinator: { execute: coordinate }
    })

    await expect(useCase.execute()).resolves.toEqual({
      coordinated: 2,
      failed: 0
    })
    expect(coordinate).toHaveBeenCalledTimes(2)
    expect(coordinate).toHaveBeenNthCalledWith(1, pending[0])
    expect(coordinate).toHaveBeenNthCalledWith(2, pending[1])
  })
})
