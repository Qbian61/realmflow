import { vi } from 'vitest'
import { createDshRunManifest } from '../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY,
  type AgentRuntimeRun
} from '../../../domain/agent-runtime'
import type { DshRunManifest } from '../../../domain/dsh-run-manifest'
import {
  createDshSessionBinding,
  dshRunOwnerKey,
  type DshSessionBinding
} from '../../../domain/dsh-session-binding'
import type { AgentRuntimeRunRepository } from '../ai-run/application/ports'
import { AgentRunRecoveryActions } from './agent-run-recovery-actions'
import type { RecoveredRunActivation } from './recover-agent-runtime-runs'

describe('AgentRunRecoveryActions', () => {
  it('resumes through DSH history sync and starts the session after the running transition', async () => {
    const harness = createHarness()
    const start = vi.fn(() => {
      harness.order.push('start')
      expect(harness.transition).toHaveBeenCalledWith(
        harness.run.id,
        'running',
        500
      )
    })
    harness.historySync.mockImplementation(async () => {
      harness.order.push('history')
      return syncedHistory()
    })
    harness.resumeSession.mockImplementation(async () => {
      harness.order.push('resume')
      return { start }
    })

    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'resume' })
    ).resolves.toEqual({ status: 'resumed' })

    expect(harness.order).toEqual([
      'history',
      'retrying',
      'resume',
      'running',
      'start'
    ])
    expect(harness.historySync).toHaveBeenCalledWith({
      runtimeInstanceId: 'runtime-1',
      manifest: harness.manifest
    })
    expect(harness.resumeSession).toHaveBeenCalledWith(
      harness.run,
      harness.manifest,
      harness.binding
    )
  })

  it('blocks resume when Product Command history cannot be reconciled', async () => {
    const harness = createHarness()
    harness.historySync.mockRejectedValue(new Error('idempotency conflict'))

    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'resume' })
    ).resolves.toEqual({ status: 'blocked' })

    expect(harness.resumeSession).not.toHaveBeenCalled()
    expect(harness.transition).toHaveBeenCalledWith(
      harness.run.id,
      'recovery_blocked',
      500,
      'recovery_blocked:history_sync_failed'
    )
    expect(harness.projectRecoveryEvent).toHaveBeenCalledWith(
      harness.run,
      expect.objectContaining({
        type: 'run.recovery_blocked',
        data: expect.objectContaining({
          recoveryReason: 'history_sync_failed',
          recoveryActions: ['resume', 'cancel']
        })
      })
    )
  })

  it('cancels the DSH session and delegation tree before terminalizing the run', async () => {
    const harness = createHarness()

    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'cancel' })
    ).resolves.toEqual({ status: 'cancelled' })

    expect(harness.cancelDelegations).toHaveBeenCalledWith(harness.run.id)
    expect(harness.cancelSession).toHaveBeenCalledWith(
      harness.run,
      harness.manifest,
      harness.binding
    )
    expect(harness.transition).toHaveBeenCalledWith(
      harness.run.id,
      'cancelled',
      500
    )
  })

  it('does not branch without a legacy checkpoint recovery model', async () => {
    const harness = createHarness()

    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'branch' })
    ).resolves.toEqual({ status: 'blocked' })

    expect(harness.historySync).not.toHaveBeenCalled()
    expect(harness.resumeSession).not.toHaveBeenCalled()
    expect(harness.transition).not.toHaveBeenCalled()
  })
})

function createHarness() {
  const run = runtimeRun()
  const manifest = createDshRunManifest({
    manifestId: 'manifest-run-1',
    runId: run.id,
    sessionId: 'dsh-session-1',
    owner: { workspaceId: 'workspace-1' }
  })
  const binding = createDshSessionBinding({
    owner: manifest.owner,
    dshSessionId: manifest.sessionId,
    runManifestDigest: manifest.digest,
    runtimeBuildDigest: 'b'.repeat(64),
    lifecycleStatus: 'active',
    createdAt: 100
  })
  const transition = vi.fn(async (_id: string, status: string) => {
    if (status === 'retrying') order.push('retrying')
    if (status === 'running') order.push('running')
  })
  const order: string[] = []
  const runs: AgentRuntimeRunRepository = {
    getById: vi.fn(async () => run),
    create: vi.fn(),
    bindProviderRun: vi.fn(),
    transition,
    listByRootRunId: vi.fn(),
    listByParentRunId: vi.fn(),
    listUnfinished: vi.fn().mockResolvedValue([run])
  }
  const manifests = {
    getByRunId: vi.fn(async (runId: string) =>
      runId === run.id ? manifest : undefined
    )
  }
  const sessions = {
    getByOwner: vi.fn(async (owner: DshRunManifest['owner']) =>
      dshRunOwnerKey(owner) === binding.ownerKey ? binding : undefined
    )
  }
  const historySync = vi.fn(async () => syncedHistory())
  const resumeSession = vi.fn<
    (
      run: AgentRuntimeRun,
      manifest: DshRunManifest,
      binding: DshSessionBinding
    ) => Promise<void | RecoveredRunActivation>
  >(async () => undefined)
  const cancelSession = vi.fn(async () => undefined)
  const cancelDelegations = vi.fn()
  const projectRecoveryEvent = vi.fn(async () => undefined)
  return {
    run,
    manifest,
    binding,
    transition,
    historySync,
    resumeSession,
    cancelSession,
    cancelDelegations,
    projectRecoveryEvent,
    order,
    actions: new AgentRunRecoveryActions(
      {
        runtimeInstanceId: 'runtime-1',
        runs,
        manifests,
        sessions,
        historySync: { syncRun: historySync },
        resumeSession,
        cancelSession,
        cancelDelegations,
        projectRecoveryEvent
      },
      () => 500
    )
  }
}

function syncedHistory() {
  return {
    status: 'synced' as const,
    dshSessionId: 'dsh-session-1',
    fromSequence: 0,
    toSequence: 0,
    projectedEvents: 0,
    productCommandResultsReconciled: 0,
    hasMore: false
  }
}

function runtimeRun(): AgentRuntimeRun {
  return {
    id: 'run-1',
    status: 'recovery_blocked',
    snapshot: {
      schemaVersion: 1,
      approvalProfile: {
        schemaVersion: 1,
        id: 'protected',
        policyVersion: '1.0.0',
        digest: 'a'.repeat(64)
      },
      runId: 'run-1',
      rootRunId: 'run-1',
      delegationDepth: 0,
      delegationOrdinal: 0,
      scenarioId: 'general',
      pipelineVersion: 'builtin.general.v1',
      agentProfileId: 'builtin.general',
      agentProfileVersion: '1.0.0',
      agentProfileDigest: 'b'.repeat(64),
      promptDigest: 'c'.repeat(64),
      policyDigest: 'd'.repeat(64),
      capabilityCatalogDigest: 'e'.repeat(64),
      capabilityBindingDigest: 'f'.repeat(64),
      permissionSnapshotDigest: '1'.repeat(64),
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      executionPolicy: { ...DEFAULT_AGENT_EXECUTION_POLICY },
      budgetLedger: createInitialRunBudgetLedger(
        DEFAULT_AGENT_EXECUTION_POLICY
      ),
      budgets: {
        maxToolCalls: 8,
        maxSubagents: 0,
        timeoutMs: 900_000,
        maxRetries: 2
      },
      createdAt: 100
    },
    createdAt: 100,
    updatedAt: 100
  }
}
