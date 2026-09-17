import { describe, expect, it, vi } from 'vitest'
import type {
  Revisioned,
  WorkflowDispatchRecord
} from '../ports/business-repositories'
import { AdvanceWorkflowUseCase } from './advance-workflow'

const dispatch: Revisioned<WorkflowDispatchRecord> = {
  id: 'execution-1:trigger-run:design',
  executionId: 'execution-1',
  requirementId: 'requirement-1',
  nodeId: 'design',
  nodeRunId: 'node-run-design',
  triggerNodeRunId: 'trigger-run',
  status: 'pending',
  attempts: 0,
  revision: 1,
  createdAt: 1,
  updatedAt: 1
}

function createHarness(options: {
  nodeRunStatus?: 'ready' | 'running'
  executeFails?: boolean
}) {
  let current = structuredClone(dispatch)
  const execute = options.executeFails
    ? vi.fn().mockRejectedValue(new Error('provider unavailable'))
    : vi.fn().mockResolvedValue({
        runId: 'ai-run-2',
        completion: Promise.resolve()
      })
  const useCase = new AdvanceWorkflowUseCase(
    {
      dispatches: {
        listDispatchable: vi.fn().mockResolvedValue([structuredClone(current)]),
        claim: vi.fn().mockImplementation(async (_id, revision, updatedAt) => {
          if (current.revision !== revision) {
            return { status: 'conflict', entity: structuredClone(current) }
          }
          current = {
            ...current,
            status: 'processing',
            attempts: current.attempts + 1,
            revision: current.revision + 1,
            updatedAt
          }
          return { status: 'saved', entity: structuredClone(current) }
        }),
        save: vi.fn().mockImplementation(async (entity, revision) => {
          if (current.revision !== revision) {
            return { status: 'conflict', entity: structuredClone(current) }
          }
          current = {
            ...structuredClone(entity),
            revision: current.revision + 1
          }
          return { status: 'saved', entity: structuredClone(current) }
        })
      },
      executions: {
        getActiveByRequirement: vi.fn().mockResolvedValue({
          id: 'execution-1',
          requirementId: 'requirement-1',
          status: 'running'
        })
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
        get: vi.fn().mockResolvedValue({
          id: 'node-run-design',
          executionId: 'execution-1',
          nodeId: 'design',
          status: options.nodeRunStatus ?? 'ready'
        })
      },
      executeNode: { execute }
    },
    () => 100
  )
  return { execute, getDispatch: () => current, useCase }
}

describe('AdvanceWorkflowUseCase', () => {
  it('claims and completes a dispatch after starting its ready node', async () => {
    const { execute, getDispatch, useCase } = createHarness({})

    await expect(useCase.drain()).resolves.toEqual({
      completed: 1,
      failed: 0,
      skipped: 0
    })

    expect(execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'design',
      nodeRunId: 'node-run-design'
    })
    expect(getDispatch()).toMatchObject({
      status: 'completed',
      attempts: 1,
      completedAt: 100,
      revision: 3
    })
  })

  it('records a retryable failure without rejecting the drain', async () => {
    const { getDispatch, useCase } = createHarness({ executeFails: true })

    await expect(useCase.drain()).resolves.toEqual({
      completed: 0,
      failed: 1,
      skipped: 0
    })
    expect(getDispatch()).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'provider unavailable',
      revision: 3
    })
  })

  it('completes a recovered processing dispatch when the node is running', async () => {
    const { execute, getDispatch, useCase } = createHarness({
      nodeRunStatus: 'running'
    })

    await useCase.drain()

    expect(execute).not.toHaveBeenCalled()
    expect(getDispatch()).toMatchObject({
      status: 'completed',
      attempts: 1,
      revision: 3
    })
  })

  it('runs another pass when completion enqueues work during an active drain', async () => {
    let useCase: AdvanceWorkflowUseCase
    const listDispatchable = vi
      .fn()
      .mockResolvedValueOnce([structuredClone(dispatch)])
      .mockResolvedValueOnce([])
    useCase = new AdvanceWorkflowUseCase({
      dispatches: {
        listDispatchable,
        claim: vi.fn().mockResolvedValue({
          status: 'saved',
          entity: {
            ...dispatch,
            status: 'processing',
            attempts: 1,
            revision: 2
          }
        }),
        save: vi.fn().mockImplementation(async (entity) => ({
          status: 'saved',
          entity: { ...entity, revision: 3 }
        }))
      },
      executions: {
        getActiveByRequirement: vi.fn().mockResolvedValue({
          id: 'execution-1',
          status: 'running'
        })
      },
      workflows: {
        get: vi.fn().mockResolvedValue({
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
        get: vi.fn().mockResolvedValue({
          id: 'node-run-design',
          nodeId: 'design',
          status: 'ready'
        })
      },
      executeNode: {
        execute: vi.fn().mockImplementation(async () => {
          void useCase.drain()
          return { runId: 'ai-run-2', completion: Promise.resolve() }
        })
      }
    })

    await useCase.drain()

    expect(listDispatchable).toHaveBeenCalledTimes(2)
  })
})
