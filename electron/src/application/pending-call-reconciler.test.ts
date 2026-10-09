import { vi } from 'vitest'
import type { CheckpointPendingCall } from '../../../domain/agent-run-recovery'
import type { ToolExecutionState } from '../../../domain/tool-execution'
import { PendingCallReconciler } from './pending-call-reconciler'

describe('PendingCallReconciler', () => {
  it('uses durable Tool projections to distinguish completed, not-started and unknown calls', async () => {
    const states = new Map<string, ToolExecutionState>([
      ['execution-completed', execution('execution-completed', 'succeeded')],
      ['execution-queued', execution('execution-queued', 'queued')],
      ['execution-running', execution('execution-running', 'running')],
      ['execution-failed', execution('execution-failed', 'failed')]
    ])
    const reconciler = new PendingCallReconciler({
      getExecution: vi.fn(async (executionId) => states.get(executionId))
    })

    await expect(
      reconciler.reconcile([
        pending('completed', {
          executionId: 'execution-completed',
          effect: 'external_write'
        }),
        pending('queued', {
          executionId: 'execution-queued',
          effect: 'local_write'
        }),
        pending('running', {
          executionId: 'execution-running',
          effect: 'external_write'
        }),
        pending('failed', {
          executionId: 'execution-failed',
          effect: 'external_write'
        }),
        pending('read-not-started', {
          effect: 'none',
          status: 'requested'
        }),
        pending('write-without-facts', {
          effect: 'external_write',
          status: 'requested'
        })
      ])
    ).resolves.toEqual([
      { callId: 'completed', outcome: 'completed' },
      { callId: 'queued', outcome: 'not_started' },
      { callId: 'running', outcome: 'unknown' },
      { callId: 'failed', outcome: 'completed' },
      { callId: 'read-not-started', outcome: 'not_started' },
      { callId: 'write-without-facts', outcome: 'unknown' }
    ])
  })

  it('treats a missing execution projection conservatively', async () => {
    const reconciler = new PendingCallReconciler({
      getExecution: vi.fn().mockResolvedValue(undefined)
    })

    await expect(
      reconciler.reconcile([
        pending('missing-read', {
          executionId: 'execution-missing-read',
          effect: 'none'
        }),
        pending('missing-write', {
          executionId: 'execution-missing-write',
          effect: 'external_write'
        })
      ])
    ).resolves.toEqual([
      { callId: 'missing-read', outcome: 'not_started' },
      { callId: 'missing-write', outcome: 'unknown' }
    ])
  })
})

function pending(
  callId: string,
  patch: Partial<CheckpointPendingCall>
): CheckpointPendingCall {
  return {
    callId,
    effect: 'none',
    idempotency: 'none',
    status: 'running',
    ...patch
  }
}

function execution(
  executionId: string,
  status: ToolExecutionState['status']
): ToolExecutionState {
  return {
    executionId,
    streamId: executionId,
    status,
    revision: 1,
    definition: {
      id: 'tool.test',
      version: '1.0.0',
      definitionDigest: 'a'.repeat(64)
    },
    requestedAt: 100,
    updatedAt: 100,
    argumentsValidated: true,
    attempts: [],
    outputBytes: 0,
    artifacts: []
  }
}
