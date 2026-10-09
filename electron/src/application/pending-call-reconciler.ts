import type { CheckpointPendingCall } from '../../../domain/agent-run-recovery'
import type { ToolExecutionState } from '../../../domain/tool-execution'

type ToolExecutionReader = {
  getExecution(executionId: string): Promise<ToolExecutionState | undefined>
}

export type ReconciledPendingCall = {
  callId: string
  outcome: 'completed' | 'not_started' | 'unknown'
}

const COMPLETED_STATUSES = new Set<ToolExecutionState['status']>([
  'succeeded',
  'failed',
  'cancelled',
  'interrupted'
])

const NOT_STARTED_STATUSES = new Set<ToolExecutionState['status']>([
  'requested',
  'awaiting_permission',
  'queued'
])

export class PendingCallReconciler {
  constructor(private readonly executions: ToolExecutionReader) {}

  async reconcile(
    calls: readonly CheckpointPendingCall[]
  ): Promise<ReconciledPendingCall[]> {
    return Promise.all(calls.map((call) => this.reconcileCall(call)))
  }

  private async reconcileCall(
    call: CheckpointPendingCall
  ): Promise<ReconciledPendingCall> {
    if (call.status === 'completed') {
      return { callId: call.callId, outcome: 'completed' }
    }
    if (!call.executionId) {
      return {
        callId: call.callId,
        outcome: call.effect === 'none' ? 'not_started' : 'unknown'
      }
    }
    const execution = await this.executions.getExecution(call.executionId)
    if (!execution) {
      return {
        callId: call.callId,
        outcome: call.effect === 'none' ? 'not_started' : 'unknown'
      }
    }
    if (COMPLETED_STATUSES.has(execution.status)) {
      return { callId: call.callId, outcome: 'completed' }
    }
    if (NOT_STARTED_STATUSES.has(execution.status)) {
      return { callId: call.callId, outcome: 'not_started' }
    }
    return { callId: call.callId, outcome: 'unknown' }
  }
}
