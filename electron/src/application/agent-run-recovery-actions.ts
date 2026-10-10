import {
  decideAgentRunRecovery,
  type RunCheckpoint
} from '../../../domain/agent-run-recovery'
import type { AgentRuntimeRun } from '../../../domain/agent-runtime'
import type {
  AgentRunCheckpointRepository,
  AgentRuntimeRunRepository
} from '../ai-run/application/ports'
import type { RecoveredRunActivation } from './recover-agent-runtime-runs'

type RecoveryConfiguration = {
  profileAvailable: boolean
  capabilitiesAvailable: boolean
  modelAvailable: boolean
  permissionValid: boolean
  credentialAvailable: boolean
}

type RecoveryActionDependencies = {
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
  resume(run: AgentRuntimeRun, checkpoint: RunCheckpoint): Promise<void | RecoveredRunActivation>
  branch(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint
  ): Promise<{ runId: string }>
  cancelProvider(providerRunId: string): Promise<void>
  cancelDelegations?(runId: string): void
}

export type AgentRunRecoveryActionResult =
  | { status: 'resumed' | 'cancelled' | 'blocked' }
  | { status: 'branched'; runId: string }

export class AgentRunRecoveryActions {
  constructor(
    private readonly dependencies: RecoveryActionDependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    runId: string
    action: 'resume' | 'branch' | 'cancel'
  }): Promise<AgentRunRecoveryActionResult> {
    const run = (await this.dependencies.runs.listUnfinished()).find(
      (candidate) => candidate.id === input.runId
    )
    if (!run) return { status: 'blocked' }
    if (input.action === 'cancel') return this.cancel(run)
    const checkpoint = await this.dependencies.checkpoints.getLatest(run.id)
    if (!checkpoint) return { status: 'blocked' }
    if (input.action === 'branch') {
      try {
        const pendingCalls =
          await this.dependencies.reconcilePendingCalls(run, checkpoint)
        if (
          decideAgentRunRecovery({
            checkpoint,
            configuration: AVAILABLE_BRANCH_CONFIGURATION,
            pendingCalls
          }).action !== 'resume'
        ) {
          return { status: 'blocked' }
        }
        const branch = await this.dependencies.branch(run, checkpoint)
        return { status: 'branched', runId: branch.runId }
      } catch {
        return { status: 'blocked' }
      }
    }
    const [configuration, pendingCalls] = await Promise.all([
      this.dependencies.validateConfiguration(run, checkpoint),
      this.dependencies.reconcilePendingCalls(run, checkpoint)
    ])
    if (
      decideAgentRunRecovery({
        checkpoint,
        configuration,
        pendingCalls
      }).action !== 'resume'
    ) {
      return { status: 'blocked' }
    }
    let activation: void | RecoveredRunActivation = undefined
    try {
      activation = await this.dependencies.resume(run, checkpoint)
      await this.dependencies.runs.transition(run.id, 'running', this.now())
      activation?.start()
      return { status: 'resumed' }
    } catch {
      activation?.cancel?.()
      return { status: 'blocked' }
    }
  }

  private async cancel(
    run: AgentRuntimeRun
  ): Promise<AgentRunRecoveryActionResult> {
    this.dependencies.cancelDelegations?.(run.id)
    if (run.providerRunId) {
      await this.dependencies
        .cancelProvider(run.providerRunId)
        .catch(() => undefined)
    }
    await this.dependencies.runs.transition(run.id, 'cancelled', this.now())
    return { status: 'cancelled' }
  }
}

const AVAILABLE_BRANCH_CONFIGURATION: RecoveryConfiguration = {
  profileAvailable: true,
  capabilitiesAvailable: true,
  modelAvailable: true,
  permissionValid: true,
  credentialAvailable: true
}
