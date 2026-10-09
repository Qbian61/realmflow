import {
  decideAgentRunRecovery,
  type RunCheckpoint
} from '../../../domain/agent-run-recovery'
import type { AgentRuntimeRun } from '../../../domain/agent-runtime'
import type {
  AgentRunCheckpointRepository,
  AgentRuntimeRunRepository
} from '../ai-run/application/ports'

type RecoveryConfiguration = {
  profileAvailable: boolean
  capabilitiesAvailable: boolean
  modelAvailable: boolean
  permissionValid: boolean
  credentialAvailable: boolean
}

type RecoveryDependencies = {
  runs: AgentRuntimeRunRepository
  checkpoints: AgentRunCheckpointRepository
  validateConfiguration(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint
  ): Promise<RecoveryConfiguration>
  reconcilePendingCalls(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint
  ): Promise<
    Array<{
      callId: string
      outcome: 'completed' | 'not_started' | 'unknown'
    }>
  >
  resume(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint
  ): Promise<void>
  projectRecoveryEvent(
    run: AgentRuntimeRun,
    event:
      | {
          type: 'run.retrying'
          data: {
            retryCount: number
            errorCode: 'interrupted'
          }
        }
      | { type: 'run.resumed'; data: Record<string, never> }
      | {
          type: 'run.recovery_blocked'
          data: {
            recoveryReason: string
            recoveryActions: Array<'resume' | 'branch' | 'cancel'>
          }
        }
  ): Promise<void>
}

export class RecoverAgentRuntimeRunsUseCase {
  constructor(
    private readonly dependencies: RecoveryDependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(): Promise<{
    resumed: number
    blocked: number
    preserved: number
  }> {
    const unfinished = await this.dependencies.runs.listUnfinished()
    const result = { resumed: 0, blocked: 0, preserved: 0 }
    for (const run of unfinished) {
      if (run.status === 'waiting_input' || run.status === 'paused') {
        result.preserved += 1
        continue
      }
      const checkpoint =
        await this.dependencies.checkpoints.getLatest(run.id)
      if (!checkpoint) {
        await this.block(run, 'checkpoint_unavailable')
        result.blocked += 1
        continue
      }
      const [configuration, pendingCalls] = await Promise.all([
        this.dependencies.validateConfiguration(run, checkpoint),
        this.dependencies.reconcilePendingCalls(run, checkpoint)
      ])
      const decision = decideAgentRunRecovery({
        checkpoint,
        configuration,
        pendingCalls
      })
      if (decision.action === 'block') {
        await this.block(run, decision.reason)
        result.blocked += 1
        continue
      }
      await this.dependencies.runs.transition(
        run.id,
        'retrying',
        this.now()
      )
      await this.dependencies.projectRecoveryEvent(run, {
        type: 'run.retrying',
        data: {
          retryCount:
            run.snapshot.budgets.maxRetries -
            checkpoint.remainingBudgets.retries +
            1,
          errorCode: 'interrupted'
        }
      })
      try {
        await this.dependencies.resume(run, checkpoint)
        await this.dependencies.runs.transition(
          run.id,
          'running',
          this.now()
        )
        await this.dependencies.projectRecoveryEvent(run, {
          type: 'run.resumed',
          data: {}
        })
        result.resumed += 1
      } catch {
        await this.block(run, 'resume_unavailable')
        result.blocked += 1
      }
    }
    return result
  }

  private block(run: AgentRuntimeRun, reason: string): Promise<void> {
    return Promise.all([
      this.dependencies.runs.transition(
        run.id,
        'recovery_blocked',
        this.now(),
        `recovery_blocked:${reason}`
      ),
      this.dependencies.projectRecoveryEvent(run, {
        type: 'run.recovery_blocked',
        data: {
          recoveryReason: reason,
          recoveryActions: ['resume', 'branch', 'cancel']
        }
      })
    ]).then(() => undefined)
  }
}
