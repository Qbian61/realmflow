import { describe, expect, it } from 'vitest'
import {
  reopenCompletedWorkflowExecution,
  transitionWorkflowExecution,
  type WorkflowExecutionState,
  type WorkflowExecutionStatus
} from './workflow-execution'

const allowedTransitions: Record<
  WorkflowExecutionStatus,
  WorkflowExecutionStatus[]
> = {
  created: ['running', 'failed', 'cancelled'],
  running: [
    'waiting_user',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ],
  waiting_user: [
    'running',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ],
  paused: ['running', 'cancelled'],
  completed: [],
  failed: ['running', 'cancelled'],
  cancelled: ['running'],
  interrupted: ['running', 'cancelled']
}

function execution(
  status: WorkflowExecutionStatus,
  overrides: Partial<WorkflowExecutionState> = {}
): WorkflowExecutionState {
  return {
    status,
    updatedAt: 10,
    ...(status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
      ? { completedAt: 10 }
      : {}),
    ...overrides
  }
}

describe('workflow execution state machine', () => {
  it('accepts every defined transition and maintains completion timestamps', () => {
    for (const [fromStatus, targets] of Object.entries(
      allowedTransitions
    ) as Array<[WorkflowExecutionStatus, WorkflowExecutionStatus[]]>) {
      for (const toStatus of targets) {
        const result = transitionWorkflowExecution(
          execution(fromStatus),
          toStatus,
          {
            reason: 'test_transition',
            triggerSource: 'system',
            transitionedAt: 20
          }
        )

        expect(result.changed).toBe(true)
        expect(result.state.status).toBe(toStatus)
        expect(result.state.updatedAt).toBe(20)
        expect(result.state.completedAt).toBe(
          ['completed', 'failed', 'cancelled'].includes(toStatus)
            ? 20
            : undefined
        )
      }
    }
  })

  it('rejects every transition outside the defined matrix', () => {
    const statuses = Object.keys(
      allowedTransitions
    ) as WorkflowExecutionStatus[]

    for (const fromStatus of statuses) {
      for (const toStatus of statuses) {
        if (
          fromStatus === toStatus ||
          allowedTransitions[fromStatus].includes(toStatus)
        ) {
          continue
        }
        expect(() =>
          transitionWorkflowExecution(execution(fromStatus), toStatus, {
            reason: 'invalid_transition',
            triggerSource: 'system',
            transitionedAt: 20
          })
        ).toThrow(`Workflow execution cannot transition from ${fromStatus}`)
      }
    }
  })

  it('treats an identical target state as an idempotent replay', () => {
    const current = execution('running')
    const result = transitionWorkflowExecution(current, 'running', {
      reason: 'node_started',
      triggerSource: 'system',
      transitionedAt: 20
    })

    expect(result).toEqual({ changed: false, state: current })
  })

  it('rejects invalid metadata before changing state', () => {
    expect(() =>
      transitionWorkflowExecution(execution('created'), 'running', {
        reason: '  ',
        triggerSource: 'system',
        transitionedAt: 20
      })
    ).toThrow('Workflow execution transition reason is required')

    expect(() =>
      transitionWorkflowExecution(execution('created'), 'running', {
        reason: 'node_started',
        triggerSource: 'external' as never,
        transitionedAt: 20
      })
    ).toThrow('Invalid workflow execution transition source')

    expect(() =>
      transitionWorkflowExecution(execution('created'), 'running', {
        reason: 'node_started',
        triggerSource: 'system',
        transitionedAt: 9
      })
    ).toThrow('Workflow execution transition time cannot move backwards')
  })

  it('reopens a completed execution only through the rollback transition', () => {
    expect(
      reopenCompletedWorkflowExecution(execution('completed'), {
        reason: 'workflow_rolled_back',
        triggerSource: 'user',
        transitionedAt: 20
      })
    ).toEqual({
      changed: true,
      state: {
        status: 'running',
        updatedAt: 20,
        completedAt: undefined
      }
    })

    expect(() =>
      reopenCompletedWorkflowExecution(execution('running'), {
        reason: 'workflow_rolled_back',
        triggerSource: 'user',
        transitionedAt: 20
      })
    ).toThrow('Only a completed workflow execution can be reopened')
  })
})
