import type { AgentRuntimeRun } from '../../../domain/agent-runtime'
import type { DshRunManifest } from '../../../domain/dsh-run-manifest'
import type { DshSessionBinding } from '../../../domain/dsh-session-binding'
import type { AgentRunRecoveryResult } from '../../../shared/ai-run'
import type { AgentRuntimeRunRepository } from '../ai-run/application/ports'
import type { DshHistorySyncRunResult } from './dsh/dsh-history-sync'
import type { RecoveredRunActivation } from './recover-agent-runtime-runs'

type RecoveryEvent =
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
        recoveryActions: Array<'resume' | 'cancel'>
      }
    }

type RecoveryActionDependencies = {
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
  cancelSession?(
    run: AgentRuntimeRun,
    manifest: DshRunManifest,
    binding: DshSessionBinding
  ): Promise<void>
  cancelDelegations?(runId: string): void
  projectRecoveryEvent?(
    run: AgentRuntimeRun,
    event: RecoveryEvent
  ): Promise<void>
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

export class AgentRunRecoveryActions {
  constructor(
    private readonly dependencies: RecoveryActionDependencies,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    runId: string
    action: 'resume' | 'branch' | 'cancel'
  }): Promise<AgentRunRecoveryResult> {
    const run = await this.findRun(input.runId)
    if (!run || TERMINAL.has(run.status)) return { status: 'blocked' }
    if (input.action === 'branch') return { status: 'blocked' }
    if (input.action === 'cancel') return this.cancel(run)
    return this.resume(run)
  }

  private async resume(
    run: AgentRuntimeRun
  ): Promise<AgentRunRecoveryResult> {
    const session = await this.resolveDshSession(run)
    if (!session) {
      await this.block(run, 'dsh_session_unavailable')
      return { status: 'blocked' }
    }
    const { manifest, binding } = session
    try {
      await this.dependencies.historySync.syncRun({
        runtimeInstanceId: this.dependencies.runtimeInstanceId,
        manifest
      })
    } catch {
      await this.block(run, 'history_sync_failed')
      return { status: 'blocked' }
    }
    await this.dependencies.runs.transition(run.id, 'retrying', this.now())
    await this.project(run, {
      type: 'run.retrying',
      data: {
        retryCount: 1,
        errorCode: 'interrupted'
      }
    })
    let activation: void | RecoveredRunActivation = undefined
    try {
      activation = await this.dependencies.resumeSession(
        run,
        manifest,
        binding
      )
      await this.dependencies.runs.transition(run.id, 'running', this.now())
      await this.project(run, { type: 'run.resumed', data: {} })
      activation?.start()
      return { status: 'resumed' }
    } catch {
      activation?.cancel?.()
      await this.block(run, 'resume_unavailable')
      return { status: 'blocked' }
    }
  }

  private async cancel(
    run: AgentRuntimeRun
  ): Promise<AgentRunRecoveryResult> {
    this.dependencies.cancelDelegations?.(run.id)
    const session = await this.resolveDshSession(run)
    if (session) {
      await this.dependencies
        .cancelSession?.(run, session.manifest, session.binding)
        .catch(() => undefined)
    }
    await this.dependencies.runs.transition(run.id, 'cancelled', this.now())
    return { status: 'cancelled' }
  }

  private async resolveDshSession(
    run: AgentRuntimeRun
  ): Promise<
    | {
        manifest: DshRunManifest
        binding: DshSessionBinding
      }
    | undefined
  > {
    const manifest = await this.dependencies.manifests.getByRunId(run.id)
    if (!manifest) return undefined
    const binding = await this.dependencies.sessions.getByOwner(manifest.owner)
    if (!binding) return undefined
    return { manifest, binding }
  }

  private async findRun(
    runId: string
  ): Promise<AgentRuntimeRun | undefined> {
    if (this.dependencies.runs.getById) {
      return this.dependencies.runs.getById(runId)
    }
    return (await this.dependencies.runs.listUnfinished()).find(
      (candidate) => candidate.id === runId
    )
  }

  private async block(
    run: AgentRuntimeRun,
    reason: string
  ): Promise<void> {
    await this.dependencies.runs.transition(
      run.id,
      'recovery_blocked',
      this.now(),
      `recovery_blocked:${reason}`
    )
    await this.project(run, {
      type: 'run.recovery_blocked',
      data: {
        recoveryReason: reason,
        recoveryActions: ['resume', 'cancel']
      }
    })
  }

  private async project(
    run: AgentRuntimeRun,
    event: RecoveryEvent
  ): Promise<void> {
    await this.dependencies.projectRecoveryEvent?.(run, event)
  }
}
