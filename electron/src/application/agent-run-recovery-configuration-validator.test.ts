import { vi } from 'vitest'
import { createRunCheckpoint } from '../../../domain/agent-run-recovery'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY,
  type AgentRuntimeRun
} from '../../../domain/agent-runtime'
import { AgentRunRecoveryConfigurationValidator } from './agent-run-recovery-configuration-validator'

describe('AgentRunRecoveryConfigurationValidator', () => {
  it('accepts only an exact immutable runtime configuration', async () => {
    const run = runtimeRun()
    const inspect = vi.fn().mockResolvedValue({
      profileAvailable: true,
      capabilitiesAvailable: true,
      permissionValid: true,
    })
    const resolveExecution = vi.fn().mockResolvedValue({})
    const validator = new AgentRunRecoveryConfigurationValidator({
      runtime: { inspectRecoveryConfiguration: inspect },
      models: { resolveExecution },
    })

    await expect(validator.validate(run, checkpoint(run))).resolves.toEqual({
      profileAvailable: true,
      capabilitiesAvailable: true,
      modelAvailable: true,
      permissionValid: true,
      credentialAvailable: true,
    })
    expect(inspect).toHaveBeenCalledOnce()
    expect(resolveExecution).toHaveBeenCalledWith('model-1')
  })

  it('rejects a changed checkpoint digest before consulting current services', async () => {
    const run = runtimeRun()
    const inspect = vi.fn()
    const validator = new AgentRunRecoveryConfigurationValidator({
      runtime: { inspectRecoveryConfiguration: inspect },
      models: { resolveExecution: vi.fn() },
    })
    const changed = {
      ...checkpoint(run),
      configurationDigests: {
        ...checkpoint(run).configurationDigests,
        capabilityBinding: '0'.repeat(64),
      },
    }

    await expect(validator.validate(run, changed)).resolves.toEqual(
      expect.objectContaining({ capabilitiesAvailable: false }),
    )
    expect(inspect).not.toHaveBeenCalled()
  })

  it('requires a fresh authorization for a permission-blocked Run', async () => {
    const run = { ...runtimeRun(), status: 'waiting_permission' as const }
    const validator = new AgentRunRecoveryConfigurationValidator({
      runtime: {
        inspectRecoveryConfiguration: vi.fn().mockResolvedValue({
          profileAvailable: true,
          capabilitiesAvailable: true,
          permissionValid: true,
        }),
      },
      models: { resolveExecution: vi.fn().mockResolvedValue({}) },
    })

    await expect(validator.validate(run, checkpoint(run))).resolves.toEqual(
      expect.objectContaining({ permissionValid: false }),
    )
  })

  it('distinguishes a missing model profile from unavailable credentials', async () => {
    const run = runtimeRun()
    const runtime = {
      inspectRecoveryConfiguration: vi.fn().mockResolvedValue({
        profileAvailable: true,
        capabilitiesAvailable: true,
        permissionValid: true,
      }),
    }
    const modelMissing = new AgentRunRecoveryConfigurationValidator({
      runtime,
      models: {
        resolveExecution: vi
          .fn()
          .mockRejectedValue(new Error('Enabled model profile not found')),
      },
    })
    const credentialMissing = new AgentRunRecoveryConfigurationValidator({
      runtime,
      models: {
        resolveExecution: vi
          .fn()
          .mockRejectedValue(new Error('Model credential not found')),
      },
    })

    await expect(
      modelMissing.validate(run, checkpoint(run)),
    ).resolves.toEqual(
      expect.objectContaining({
        modelAvailable: false,
        credentialAvailable: true,
      }),
    )
    await expect(
      credentialMissing.validate(run, checkpoint(run)),
    ).resolves.toEqual(
      expect.objectContaining({
        modelAvailable: true,
        credentialAvailable: false,
      }),
    )
  })
})

function runtimeRun(): AgentRuntimeRun {
  return {
    id: 'run-1',
    status: 'running',
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
      agentProfileDigest: 'a'.repeat(64),
      promptDigest: 'b'.repeat(64),
      policyDigest: 'c'.repeat(64),
      capabilityCatalogDigest: 'd'.repeat(64),
      capabilityBindingDigest: 'e'.repeat(64),
      permissionSnapshotDigest: 'f'.repeat(64),
      modelProfileId: 'model-1',
      scope: { kind: 'global' },
      executionPolicy: { ...DEFAULT_AGENT_EXECUTION_POLICY },
      budgetLedger: createInitialRunBudgetLedger(
        DEFAULT_AGENT_EXECUTION_POLICY
      ),
      budgets: {
        maxToolCalls: 8,
        maxSubagents: 0,
        timeoutMs: 900_000,
        maxRetries: 2,
      },
      createdAt: 100,
    },
    createdAt: 100,
    updatedAt: 100,
  }
}

function checkpoint(run: AgentRuntimeRun) {
  return createRunCheckpoint({
    runId: run.id,
    ordinal: 1,
    reason: 'tool_completed',
    snapshotDigest: '1'.repeat(64),
    configurationDigests: {
      agentProfile: run.snapshot.agentProfileDigest,
      prompt: run.snapshot.promptDigest,
      policy: run.snapshot.policyDigest,
      capabilityCatalog: run.snapshot.capabilityCatalogDigest,
      capabilityBinding: run.snapshot.capabilityBindingDigest,
    },
    messageWindow: [],
    pendingCalls: [],
    remainingBudgets: {
      toolCalls: 8,
      subagents: 0,
      retries: 2,
      timeoutMs: 900_000,
      tokens: 0,
    },
    projectionCursor: 1,
    createdAt: 100,
  })
}
