import { describe, expect, it, vi } from 'vitest'
import { ReconcileWorkflowDispatchesUseCase } from './reconcile-workflow-dispatches'

describe('ReconcileWorkflowDispatchesUseCase', () => {
  it('enqueues missing dispatches only for running ready automatic nodes', async () => {
    const enqueue = vi.fn().mockImplementation(async (record) => ({
      ...record,
      revision: 1
    }))
    const drain = vi.fn().mockResolvedValue({
      completed: 1,
      failed: 0,
      skipped: 0
    })
    const executions = {
      listByStatus: vi.fn().mockResolvedValue([
        {
          id: 'execution-running',
          requirementId: 'requirement-1',
          status: 'running',
          currentNodeId: 'design'
        }
      ])
    }
    const useCase = new ReconcileWorkflowDispatchesUseCase(
      {
        executions,
        workflows: {
          get: vi.fn().mockResolvedValue({
            requirementId: 'requirement-1',
            nodes: [
              {
                id: 'design',
                type: 'ai_generate',
                status: 'ready',
                executor: { kind: 'ai_generate' }
              },
              {
                id: 'approval',
                type: 'approval',
                status: 'ready'
              }
            ]
          })
        },
        nodeRuns: {
          getLatestByNode: vi.fn().mockResolvedValue({
            id: 'node-run-design',
            executionId: 'execution-running',
            nodeId: 'design',
            status: 'ready'
          })
        },
        dispatches: { enqueue },
        worker: { drain }
      },
      () => 100
    )

    await expect(useCase.execute()).resolves.toEqual({
      enqueued: 1,
      drain: { completed: 1, failed: 0, skipped: 0 }
    })

    expect(executions.listByStatus).toHaveBeenCalledWith('running')
    expect(enqueue).toHaveBeenCalledWith({
      id: 'execution-running:reconcile:node-run-design',
      executionId: 'execution-running',
      requirementId: 'requirement-1',
      nodeId: 'design',
      nodeRunId: 'node-run-design',
      triggerNodeRunId: 'node-run-design',
      status: 'pending',
      attempts: 0,
      createdAt: 100,
      updatedAt: 100
    })
    expect(drain).toHaveBeenCalledOnce()
  })

  it('does not enqueue when workflow and node-run readiness disagree', async () => {
    const enqueue = vi.fn()
    const drain = vi.fn().mockResolvedValue({
      completed: 0,
      failed: 0,
      skipped: 0
    })
    const useCase = new ReconcileWorkflowDispatchesUseCase({
      executions: {
        listByStatus: vi.fn().mockResolvedValue([
          {
            id: 'execution-running',
            requirementId: 'requirement-1',
            status: 'running'
          }
        ])
      },
      workflows: {
        get: vi.fn().mockResolvedValue({
          requirementId: 'requirement-1',
          nodes: [
            {
              id: 'design',
              type: 'ai_generate',
              status: 'ready',
              executor: { kind: 'ai_generate' }
            }
          ]
        })
      },
      nodeRuns: {
        getLatestByNode: vi.fn().mockResolvedValue({
          id: 'node-run-design',
          status: 'pending'
        })
      },
      dispatches: { enqueue },
      worker: { drain }
    })

    await useCase.execute()

    expect(enqueue).not.toHaveBeenCalled()
    expect(drain).toHaveBeenCalledOnce()
  })
})
