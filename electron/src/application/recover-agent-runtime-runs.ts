import type { AgentRuntimeRun } from '../../../domain/agent-runtime'
import type { DshRunManifest } from '../../../domain/dsh-run-manifest'
import type { DshSessionBinding } from '../../../domain/dsh-session-binding'
import type { AgentRuntimeRunRepository } from '../ai-run/application/ports'
import type { DshHistorySyncRunResult } from './dsh/dsh-history-sync'

export type RecoveredRunActivation = { start(): void; cancel?(): void }

type RecoveryDependencies = {
  runtimeInstanceId: string
  runs: AgentRuntimeRunRepository
  manifests: {
    getByRunId(
      runId: string
    ): Promise<DshRunManifest | undefined> | DshRunManifest | undefined
  }
  sessions: {
    getByOwner(
      owner: DshRunManifest['owner']
    ): Promise<DshSessionBinding | undefined> | DshSessionBinding | undefined
  }
  historySync: {
    syncRun(input: {
      runtimeInstanceId: string
      manifest: DshRunManifest
    }): Promise<DshHistorySyncRunResult> | DshHistorySyncRunResult
  }
  resumeSession(
    run: AgentRuntimeRun,
    manifest: DshRunManifest,
    binding: DshSessionBinding
  ): Promise<void | RecoveredRunActivation>
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
          type: 'run.failed'
          data: {
            errorCode: 'interrupted'
            message: string
          }
        }
      | {
          type: 'run.recovery_blocked'
          data: {
            recoveryReason: string
            recoveryActions: Array<'resume' | 'cancel'>
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
    interrupted: number
    blocked: number
    preserved: number
    syncedEvents: number
    reconciledProductCommands: number
  }> {
    const unfinished = await this.dependencies.runs.listUnfinished()
    const result = {
      resumed: 0,
      interrupted: 0,
      blocked: 0,
      preserved: 0,
      syncedEvents: 0,
      reconciledProductCommands: 0
    }
    for (const candidate of unfinished) {
      const run = this.dependencies.runs.getById
        ? await this.dependencies.runs.getById(candidate.id) : candidate
      if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) {
        result.preserved += 1
        continue
      }
      if (
        run.status === 'waiting_input' ||
        run.status === 'waiting_permission' ||
        run.status === 'paused' ||
        run.status === 'recovery_blocked'
      ) {
        result.preserved += 1
        continue
      }
      const manifest = await this.dependencies.manifests.getByRunId(run.id)
      if (!manifest) {
        await this.block(run, 'dsh_manifest_unavailable')
        result.blocked += 1
        continue
      }
      const binding = await this.dependencies.sessions.getByOwner(
        manifest.owner
      )
      if (!binding) {
        await this.block(run, 'dsh_session_unavailable')
        result.blocked += 1
        continue
      }
      let synced: DshHistorySyncRunResult
      try {
        synced = await this.dependencies.historySync.syncRun({
          runtimeInstanceId: this.dependencies.runtimeInstanceId,
          manifest
        })
      } catch {
        await this.block(run, 'history_sync_failed')
        result.blocked += 1
        continue
      }
      result.syncedEvents += synced.projectedEvents
      result.reconciledProductCommands +=
        synced.productCommandResultsReconciled
      if (await this.stopped(run.id)) {
        result.preserved += 1
        continue
      }
      if (!canAutomaticallyResume(run)) {
        await Promise.all([
          this.dependencies.runs.transition(
            run.id,
            'failed',
            this.now(),
            'interrupted:application_restart'
          ),
          this.dependencies.projectRecoveryEvent(run, {
            type: 'run.failed',
            data: {
              errorCode: 'interrupted',
              message: 'Application restarted before the run completed'
            }
          })
        ])
        result.interrupted += 1
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
          retryCount: 1,
          errorCode: 'interrupted'
        }
      })
      let activation: void | RecoveredRunActivation = undefined
      try {
        if (await this.stopped(run.id)) {
          result.preserved += 1
          continue
        }
        activation = await this.dependencies.resumeSession(
          run,
          manifest,
          binding
        )
        if (await this.stopped(run.id)) {
          activation?.cancel?.()
          result.preserved += 1
          continue
        }
        await this.dependencies.runs.transition(
          run.id,
          'running',
          this.now()
        )
        await this.dependencies.projectRecoveryEvent(run, {
          type: 'run.resumed',
          data: {}
        })
        activation?.start()
        result.resumed += 1
      } catch {
        activation?.cancel?.()
        if (await this.stopped(run.id)) {
          result.preserved += 1
          continue
        }
        await this.block(run, 'resume_unavailable')
        result.blocked += 1
      }
    }
    return result
  }

  private async stopped(runId: string): Promise<boolean> {
    if (!this.dependencies.runs.getById) return false
    const current = await this.dependencies.runs.getById(runId)
    return !current || [
      'completed',
      'failed',
      'cancelled',
      'paused',
      'waiting_input',
      'waiting_permission'
    ].includes(current.status)
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
          recoveryActions: ['resume', 'cancel']
        }
      })
    ]).then(() => undefined)
  }
}

function canAutomaticallyResume(run: AgentRuntimeRun): boolean {
  return run.snapshot.scenarioId === 'workflow-node' ||
    run.snapshot.scenarioId === 'scheduled'
}
