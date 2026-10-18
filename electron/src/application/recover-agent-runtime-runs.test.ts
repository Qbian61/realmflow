import { vi } from 'vitest'
import { createDshRunManifest } from '../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY,
  type AgentRunLifecycleStatus,
  type AgentRuntimeRun
} from '../../../domain/agent-runtime'
import type { DshRunManifest } from '../../../domain/dsh-run-manifest'
import {
  createDshSessionBinding,
  dshRunOwnerKey,
  type DshSessionBinding
} from '../../../domain/dsh-session-binding'
import type {
  AgentRuntimeRunRepository
} from '../ai-run/application/ports'
import { RecoverAgentRuntimeRunsUseCase } from './recover-agent-runtime-runs'

describe('RecoverAgentRuntimeRunsUseCase', () => {
  it('syncs DSH history before resuming an active interrupted session', async () => {
    const running = runtimeRun('run-running', 'running', 'workflow-node')
    const order: string[] = []
    const manifest = manifestForRun(running)
    const binding = bindingForManifest(manifest, { lastProjectedSequence: 4 })
    const transition = vi.fn(async (_id: string, status: string) => {
      order.push(status)
    })
    const start = vi.fn(() => { order.push('consume') })
    const useCase = recoveryUseCase({
      runs: repository([running], transition),
      manifestByRun: new Map([[running.id, manifest]]),
      bindingByOwner: new Map([[binding.ownerKey, binding]]),
      historySync: vi.fn(async () => {
        order.push('history')
        return {
          status: 'synced' as const,
          dshSessionId: manifest.sessionId,
          fromSequence: 4,
          toSequence: 7,
          projectedEvents: 3,
          productCommandResultsReconciled: 1,
          hasMore: false
        }
      }),
      resumeSession: vi.fn(async () => {
        order.push('resume')
        return { start }
      })
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 1,
      interrupted: 0,
      blocked: 0,
      preserved: 0,
      syncedEvents: 3,
      reconciledProductCommands: 1
    })
    expect(order).toEqual(['history', 'retrying', 'resume', 'running', 'consume'])
    expect(transition.mock.calls).toEqual([
      ['run-running', 'retrying', 500],
      ['run-running', 'running', 500]
    ])
    expect(useCase.dependenciesForTest.historySync).toHaveBeenCalledWith({
      runtimeInstanceId: 'runtime-1',
      manifest
    })
    expect(useCase.dependenciesForTest.resumeSession).toHaveBeenCalledWith(
      running,
      manifest,
      binding
    )
  })

  it('interrupts a conversation run whose scenario policy forbids automatic resume', async () => {
    const running = runtimeRun('run-conversation', 'running', 'general')
    const transition = vi.fn().mockResolvedValue(undefined)
    const manifest = manifestForRun(running)
    const binding = bindingForManifest(manifest)
    const resumeSession = vi.fn()
    const useCase = recoveryUseCase({
      runs: repository([running], transition),
      manifestByRun: new Map([[running.id, manifest]]),
      bindingByOwner: new Map([[binding.ownerKey, binding]]),
      resumeSession
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      interrupted: 1,
      blocked: 0,
      preserved: 0,
      syncedEvents: 0,
      reconciledProductCommands: 0
    })
    expect(resumeSession).not.toHaveBeenCalled()
    expect(transition).toHaveBeenCalledWith(
      running.id,
      'failed',
      500,
      'interrupted:application_restart'
    )
    expect(useCase.dependenciesForTest.projectRecoveryEvent)
      .toHaveBeenCalledWith(running, {
        type: 'run.failed',
        data: {
          errorCode: 'interrupted',
          message: 'Application restarted before the run completed'
        }
      })
  })

  it('preserves waiting input, paused, and recovery-blocked runs without DSH work', async () => {
    const waitingInput = runtimeRun('run-input', 'waiting_input')
    const paused = runtimeRun('run-paused', 'paused')
    const blocked = runtimeRun('run-blocked', 'recovery_blocked')
    const transition = vi.fn()
    const historySync = vi.fn()
    const resumeSession = vi.fn()
    const useCase = recoveryUseCase({
      runs: repository([waitingInput, paused, blocked], transition),
      historySync,
      resumeSession
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      interrupted: 0,
      blocked: 0,
      preserved: 3,
      syncedEvents: 0,
      reconciledProductCommands: 0
    })
    expect(transition).not.toHaveBeenCalled()
    expect(historySync).not.toHaveBeenCalled()
    expect(resumeSession).not.toHaveBeenCalled()
  })

  it('blocks a run without a DSH session binding instead of requiring a legacy checkpoint', async () => {
    const run = runtimeRun('run-missing-binding', 'running')
    const transition = vi.fn().mockResolvedValue(undefined)
    const manifest = manifestForRun(run)
    const useCase = recoveryUseCase({
      runs: repository([run], transition),
      manifestByRun: new Map([[run.id, manifest]])
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      interrupted: 0,
      blocked: 1,
      preserved: 0,
      syncedEvents: 0,
      reconciledProductCommands: 0
    })
    expect(transition).toHaveBeenCalledWith(
      run.id,
      'recovery_blocked',
      500,
      'recovery_blocked:dsh_session_unavailable'
    )
    expect(useCase.dependenciesForTest.projectRecoveryEvent).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        type: 'run.recovery_blocked',
        data: expect.objectContaining({
          recoveryReason: 'dsh_session_unavailable',
          recoveryActions: ['resume', 'cancel']
        })
      })
    )
  })

  it('blocks a run whose Product Command result history cannot be reconciled', async () => {
    const run = runtimeRun('run-product-command-conflict', 'running')
    const transition = vi.fn().mockResolvedValue(undefined)
    const manifest = manifestForRun(run)
    const binding = bindingForManifest(manifest)
    const useCase = recoveryUseCase({
      runs: repository([run], transition),
      manifestByRun: new Map([[run.id, manifest]]),
      bindingByOwner: new Map([[binding.ownerKey, binding]]),
      historySync: vi.fn(async () => {
        throw new Error('Product command idempotency key conflicts')
      })
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      interrupted: 0,
      blocked: 1,
      preserved: 0,
      syncedEvents: 0,
      reconciledProductCommands: 0
    })
    expect(transition).toHaveBeenCalledWith(
      run.id,
      'recovery_blocked',
      500,
      'recovery_blocked:history_sync_failed'
    )
  })
})

function recoveryUseCase(input: {
  runs: AgentRuntimeRunRepository
  manifestByRun?: Map<string, DshRunManifest>
  bindingByOwner?: Map<string, DshSessionBinding>
  historySync?: (input: {
    runtimeInstanceId: string
    manifest: DshRunManifest
  }) => Promise<{
    status: 'synced'
    dshSessionId: string
    fromSequence: number
    toSequence: number
    projectedEvents: number
    productCommandResultsReconciled: number
    hasMore: boolean
  }>
  resumeSession?: (
    run: AgentRuntimeRun,
    manifest: DshRunManifest,
    binding: DshSessionBinding
  ) => Promise<void | { start(): void }>
}) {
  const dependencies = {
    runtimeInstanceId: 'runtime-1',
    runs: input.runs,
    manifests: {
      getByRunId: vi.fn(async (runId: string) =>
        input.manifestByRun?.get(runId)
      )
    },
    sessions: {
      getByOwner: vi.fn(async (owner) =>
        input.bindingByOwner?.get(dshRunOwnerKey(owner))
      )
    },
    historySync: {
      syncRun:
        input.historySync ??
        vi.fn(async ({ manifest }) => ({
          status: 'synced' as const,
          dshSessionId: manifest.sessionId,
          fromSequence: 0,
          toSequence: 0,
          projectedEvents: 0,
          productCommandResultsReconciled: 0,
          hasMore: false
        }))
    },
    resumeSession: input.resumeSession ?? vi.fn().mockResolvedValue(undefined),
    projectRecoveryEvent: vi.fn().mockResolvedValue(undefined)
  }
  const useCase = new RecoverAgentRuntimeRunsUseCase(
    {
      ...dependencies
    },
    () => 500
  )
  return Object.assign(useCase, {
    dependenciesForTest: {
      historySync: dependencies.historySync.syncRun,
      resumeSession: dependencies.resumeSession,
      projectRecoveryEvent: dependencies.projectRecoveryEvent
    }
  })
}

function repository(
  runs: AgentRuntimeRun[],
  transition: ReturnType<typeof vi.fn>
): AgentRuntimeRunRepository {
  return {
    create: vi.fn(),
    bindProviderRun: vi.fn(),
    transition,
    listByRootRunId: vi.fn(),
    listByParentRunId: vi.fn(),
    listUnfinished: vi.fn().mockResolvedValue(runs)
  }
}

function runtimeRun(
  id: string,
  status: AgentRunLifecycleStatus,
  scenarioId: AgentRuntimeRun['snapshot']['scenarioId'] = 'general'
): AgentRuntimeRun {
  return {
    id,
    status,
    snapshot: {
      schemaVersion: 1,
      approvalProfile: { schemaVersion: 1, id: 'protected', policyVersion: '1.0.0', digest: 'a'.repeat(64) },
      runId: id,
      rootRunId: id,
      delegationDepth: 0,
      delegationOrdinal: 0,
      scenarioId,
      pipelineVersion: `builtin.${scenarioId}.v1`,
      agentProfileId: `builtin.${scenarioId}`,
      agentProfileVersion: '1.0.0',
      agentProfileDigest: 'b'.repeat(64),
      promptDigest: 'c'.repeat(64),
      policyDigest: 'd'.repeat(64),
      capabilityCatalogDigest: 'e'.repeat(64),
      capabilityBindingDigest: 'f'.repeat(64),
      permissionSnapshotDigest: '1'.repeat(64),
      scope: { kind: 'global' },
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

function manifestForRun(run: AgentRuntimeRun): DshRunManifest {
  return createDshRunManifest({
    runId: run.id,
    sessionId: `session-${run.id}`,
    owner: run.snapshot.scope.kind === 'workspace'
      ? { workspaceId: run.snapshot.scope.workspaceId }
      : { conversationId: run.snapshot.conversationId ?? run.id }
  })
}

function bindingForManifest(
  manifest: DshRunManifest,
  overrides: Partial<Parameters<typeof createDshSessionBinding>[0]> = {}
): DshSessionBinding {
  return createDshSessionBinding({
    owner: manifest.owner,
    dshSessionId: manifest.sessionId,
    runManifestDigest: manifest.digest,
    runtimeBuildDigest: 'b'.repeat(64),
    lastProjectedSequence: 0,
    createdAt: 100,
    ...overrides
  })
}
