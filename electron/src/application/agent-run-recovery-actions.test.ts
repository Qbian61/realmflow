import { vi } from 'vitest'
import { createRunCheckpoint } from '../../../domain/agent-run-recovery'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY,
  type AgentRuntimeRun
} from '../../../domain/agent-runtime'
import type {
  AgentRunCheckpointRepository,
  AgentRuntimeRunRepository
} from '../ai-run/application/ports'
import { AgentRunRecoveryActions } from './agent-run-recovery-actions'

describe('AgentRunRecoveryActions', () => {
  it('resumes only after current configuration and pending calls are safe', async () => {
    const harness = createHarness()
    harness.reconcile.mockResolvedValue([
      { callId: 'call-1', outcome: 'unknown' }
    ])

    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'resume' })
    ).resolves.toEqual({ status: 'blocked' })
    expect(harness.resume).not.toHaveBeenCalled()

    harness.reconcile.mockResolvedValue([
      { callId: 'call-1', outcome: 'completed' }
    ])
    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'resume' })
    ).resolves.toEqual({ status: 'resumed' })
    expect(harness.resume).toHaveBeenCalledWith(
      harness.run,
      harness.checkpoint
    )
    expect(harness.transition).toHaveBeenCalledWith(
      harness.run.id,
      'running',
      500
    )
  })

  it('creates a new-config branch only after pending side effects are reconciled', async () => {
    const harness = createHarness()
    harness.reconcile.mockResolvedValue([
      { callId: 'call-1', outcome: 'unknown' }
    ])

    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'branch' })
    ).resolves.toEqual({ status: 'blocked' })
    expect(harness.branch).not.toHaveBeenCalled()
    expect(harness.validateConfiguration).not.toHaveBeenCalled()

    harness.reconcile.mockResolvedValue([
      { callId: 'call-1', outcome: 'completed' }
    ])
    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'branch' })
    ).resolves.toEqual({ status: 'branched', runId: 'run-branch' })
    expect(harness.branch).toHaveBeenCalledWith(
      harness.run,
      harness.checkpoint
    )
    expect(harness.transition).not.toHaveBeenCalled()
  })

  it('cancels provider work before terminalizing the Runtime Run', async () => {
    const harness = createHarness()

    await expect(
      harness.actions.execute({ runId: harness.run.id, action: 'cancel' })
    ).resolves.toEqual({ status: 'cancelled' })
    expect(harness.cancelProvider).toHaveBeenCalledWith('provider-run-1')
    expect(harness.transition).toHaveBeenCalledWith(
      harness.run.id,
      'cancelled',
      500
    )
  })
})

function createHarness() {
  const run = runtimeRun()
  const checkpoint = createRunCheckpoint({
    runId: run.id,
    ordinal: 3,
    reason: 'tool_completed',
    snapshotDigest: 'a'.repeat(64),
    configurationDigests: {
      agentProfile: run.snapshot.agentProfileDigest,
      prompt: run.snapshot.promptDigest,
      policy: run.snapshot.policyDigest,
      capabilityCatalog: run.snapshot.capabilityCatalogDigest,
      capabilityBinding: run.snapshot.capabilityBindingDigest
    },
    messageWindow: [{ id: 'message-1', role: 'user', content: 'Continue' }],
    pendingCalls: [
      {
        callId: 'call-1',
        executionId: 'execution-1',
        effect: 'external_write',
        idempotency: 'supported',
        status: 'running'
      }
    ],
    remainingBudgets: {
      toolCalls: 4,
      subagents: 0,
      retries: 1,
      timeoutMs: 100_000,
      tokens: 2_048
    },
    projectionCursor: 8,
    createdAt: 100
  })
  const transition = vi.fn().mockResolvedValue(undefined)
  const runs: AgentRuntimeRunRepository = {
    create: vi.fn(),
    bindProviderRun: vi.fn(),
    transition,
    getByProviderRunId: vi.fn(),
    listByRootRunId: vi.fn(),
    listByParentRunId: vi.fn(),
    listUnfinished: vi.fn().mockResolvedValue([run])
  }
  const checkpoints: AgentRunCheckpointRepository = {
    save: vi.fn(),
    getLatest: vi.fn().mockResolvedValue(checkpoint),
    list: vi.fn()
  }
  const reconcile = vi.fn().mockResolvedValue([
    { callId: 'call-1', outcome: 'completed' }
  ])
  const resume = vi.fn().mockResolvedValue(undefined)
  const branch = vi.fn().mockResolvedValue({ runId: 'run-branch' })
  const cancelProvider = vi.fn().mockResolvedValue(undefined)
  const validateConfiguration = vi.fn().mockResolvedValue({
    profileAvailable: true,
    capabilitiesAvailable: true,
    modelAvailable: true,
    permissionValid: true,
    credentialAvailable: true
  })
  return {
    run,
    checkpoint,
    transition,
    reconcile,
    resume,
    branch,
    cancelProvider,
    validateConfiguration,
    actions: new AgentRunRecoveryActions(
      {
        runs,
        checkpoints,
        validateConfiguration,
        reconcilePendingCalls: reconcile,
        resume,
        branch,
        cancelProvider
      },
      () => 500
    )
  }
}

function runtimeRun(): AgentRuntimeRun {
  return {
    id: 'run-1',
    providerRunId: 'provider-run-1',
    status: 'recovery_blocked',
    snapshot: {
      schemaVersion: 1,
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
