import { vi } from 'vitest'
import { createRunCheckpoint } from '../../../domain/agent-run-recovery'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY,
  type AgentRunLifecycleStatus,
  type AgentRuntimeRun
} from '../../../domain/agent-runtime'
import type {
  AgentRunCheckpointRepository,
  AgentRuntimeRunRepository
} from '../ai-run/application/ports'
import { RecoverAgentRuntimeRunsUseCase } from './recover-agent-runtime-runs'

describe('RecoverAgentRuntimeRunsUseCase', () => {
  it('preserves blocked runs for explicit recovery without preventing other runs from resuming', async () => {
    const blocked = runtimeRun('blocked', 'recovery_blocked')
    const running = runtimeRun('running', 'running')
    const resume = vi.fn()
    const transition = vi.fn(async (id: string, status: string) => {
      if (id === blocked.id && status === 'retrying') throw new Error('invalid_transition')
    })
    expect(await recoveryUseCase({
      runs: repository([blocked, running], transition),
      checkpointByRun: new Map([[blocked.id, checkpoint(blocked.id)], [running.id, checkpoint(running.id)]]),
      resume
    }).execute()).toEqual({ resumed: 1, blocked: 0, preserved: 1 })
    expect(resume).toHaveBeenCalledOnce()
    expect(resume).toHaveBeenCalledWith(running, expect.anything())
  })

  it.each(['validation', 'attachment'] as const)('preserves cancellation during recovery %s', async (stage) => {
    const run = runtimeRun('run-cancelled', 'running')
    let current = run
    const transition = vi.fn(async (_id: string, status: AgentRunLifecycleStatus) => {
      current = { ...current, status }
    })
    const runs = { ...repository([run], transition), getById: vi.fn(async () => current) }
    const start = vi.fn()
    const cancel = vi.fn()
    const resume = vi.fn(async () => {
      if (stage === 'attachment') current = { ...current, status: 'cancelled' }
      return { start, cancel }
    })
    const result = await recoveryUseCase({
      runs, checkpointByRun: new Map([[run.id, checkpoint(run.id)]]), resume,
      reconcile: async () => {
        if (stage === 'validation') current = { ...current, status: 'cancelled' }
        return []
      }
    }).execute()
    expect(result).toEqual({ resumed: 0, blocked: 0, preserved: 1 })
    expect(current.status).toBe('cancelled')
    expect(start).not.toHaveBeenCalled()
    if (stage === 'validation') expect(resume).not.toHaveBeenCalled()
    else expect(cancel).toHaveBeenCalledOnce()
  })

  it('preserves terminal status when attaching recovery fails after cancellation', async () => {
    const run = runtimeRun('run-cancelled', 'running')
    let current = run
    const transition = vi.fn(async (_id: string, status: AgentRunLifecycleStatus) => {
      current = { ...current, status }
    })
    const runs = { ...repository([run], transition), getById: vi.fn(async () => current) }
    const result = await recoveryUseCase({
      runs, checkpointByRun: new Map([[run.id, checkpoint(run.id)]]),
      resume: async () => { current = { ...current, status: 'cancelled' }; throw new Error('request_cancelled') }
    }).execute()
    expect(current.status).toBe('cancelled')
    expect(result).toEqual({ resumed: 0, blocked: 0, preserved: 1 })
  })

  it('does not recover a descendant cancelled while its ancestor was being recovered', async () => {
    const parent = runtimeRun('parent', 'running')
    const child = runtimeRun('child', 'running')
    const transition = vi.fn()
    const runs = {
      ...repository([parent, child], transition),
      getById: vi.fn(async (id: string) => id === 'child' ? { ...child, status: 'cancelled' as const } : parent)
    }
    const resume = vi.fn()
    await recoveryUseCase({ runs, checkpointByRun: new Map([
      [parent.id, checkpoint(parent.id)], [child.id, checkpoint(child.id)]
    ]), resume }).execute()
    expect(resume).toHaveBeenCalledOnce()
    expect(resume).toHaveBeenCalledWith(parent, expect.anything())
  })

  it('activates the recovered stream only after committing the running lifecycle', async () => {
    const running = runtimeRun('run-running', 'running')
    const order: string[] = []
    const transition = vi.fn(async (_id: string, status: string) => { order.push(status) })
    const start = vi.fn(() => { order.push('consume') })
    const useCase = recoveryUseCase({
      runs: repository([running], transition),
      checkpointByRun: new Map([[running.id, checkpoint(running.id)]]),
      resume: vi.fn(async () => ({ start }))
    })
    await useCase.execute()
    expect(order).toEqual(['retrying', 'running', 'consume'])
  })

  it('resumes a running Run from its last safe checkpoint', async () => {
    const running = runtimeRun('run-running', 'running')
    const transition = vi.fn().mockResolvedValue(undefined)
    const resume = vi.fn().mockResolvedValue(undefined)
    const useCase = recoveryUseCase({
      runs: repository([running], transition),
      checkpointByRun: new Map([
        [running.id, checkpoint(running.id)]
      ]),
      resume
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 1,
      blocked: 0,
      preserved: 0
    })
    expect(transition.mock.calls).toEqual([
      ['run-running', 'retrying', 500],
      ['run-running', 'running', 500]
    ])
    expect(resume).toHaveBeenCalledWith(
      running,
      expect.objectContaining({
        runId: running.id,
        resumeToken: expect.any(String)
      })
    )
  })

  it('preserves waiting input and paused Runs without provider work', async () => {
    const waitingInput = runtimeRun('run-input', 'waiting_input')
    const paused = runtimeRun('run-paused', 'paused')
    const transition = vi.fn()
    const resume = vi.fn()
    const useCase = recoveryUseCase({
      runs: repository([waitingInput, paused], transition),
      checkpointByRun: new Map([
        [waitingInput.id, checkpoint(waitingInput.id)],
        [paused.id, checkpoint(paused.id)]
      ]),
      resume
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      blocked: 0,
      preserved: 2
    })
    expect(transition).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('resumes a waiting permission Run so its pending Tool Call can finish', async () => {
    const waitingPermission = runtimeRun(
      'run-waiting-permission',
      'waiting_permission'
    )
    const transition = vi.fn().mockResolvedValue(undefined)
    const resume = vi.fn().mockResolvedValue(undefined)
    const useCase = recoveryUseCase({
      runs: repository([waitingPermission], transition),
      checkpointByRun: new Map([
        [
          waitingPermission.id,
          checkpoint(waitingPermission.id, [
            {
              callId: 'call-pending',
              toolName: 'files.write',
              executionId: 'execution-pending',
              requestId: 'permission-pending',
              effect: 'local_write',
              idempotency: 'required',
              status: 'permission_required'
            }
          ])
        ]
      ]),
      reconcile: vi.fn().mockResolvedValue([
        { callId: 'call-pending', outcome: 'not_started' }
      ]),
      resume
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 1,
      blocked: 0,
      preserved: 0
    })
    expect(transition.mock.calls).toEqual([
      ['run-waiting-permission', 'retrying', 500],
      ['run-waiting-permission', 'running', 500]
    ])
    expect(resume).toHaveBeenCalledWith(
      waitingPermission,
      expect.objectContaining({
        pendingCalls: [
          expect.objectContaining({
            callId: 'call-pending',
            requestId: 'permission-pending'
          })
        ]
      })
    )
  })

  it.each([
    [
      'profile_unavailable',
      {
        profileAvailable: false,
        capabilitiesAvailable: true,
        modelAvailable: true,
        permissionValid: true,
        credentialAvailable: true
      }
    ],
    [
      'capability_unavailable',
      {
        profileAvailable: true,
        capabilitiesAvailable: false,
        modelAvailable: true,
        permissionValid: true,
        credentialAvailable: true
      }
    ],
    [
      'model_unavailable',
      {
        profileAvailable: true,
        capabilitiesAvailable: true,
        modelAvailable: false,
        permissionValid: true,
        credentialAvailable: true
      }
    ],
    [
      'permission_expired',
      {
        profileAvailable: true,
        capabilitiesAvailable: true,
        modelAvailable: true,
        permissionValid: false,
        credentialAvailable: true
      }
    ],
    [
      'credential_unavailable',
      {
        profileAvailable: true,
        capabilitiesAvailable: true,
        modelAvailable: true,
        permissionValid: true,
        credentialAvailable: false
      }
    ]
  ] as const)(
    'blocks recovery with stable reason %s',
    async (reason, availability) => {
      const run = runtimeRun('run-blocked', 'running')
      const transition = vi.fn().mockResolvedValue(undefined)
      const useCase = recoveryUseCase({
        runs: repository([run], transition),
        checkpointByRun: new Map([[run.id, checkpoint(run.id)]]),
        availability
      })

      await expect(useCase.execute()).resolves.toEqual({
        resumed: 0,
        blocked: 1,
        preserved: 0
      })
      expect(transition).toHaveBeenCalledWith(
        run.id,
        'recovery_blocked',
        500,
        `recovery_blocked:${reason}`
      )
    }
  )

  it('blocks a Run with an unknown external side effect instead of replaying it', async () => {
    const run = runtimeRun('run-unknown', 'running')
    const transition = vi.fn().mockResolvedValue(undefined)
    const resume = vi.fn()
    const useCase = recoveryUseCase({
      runs: repository([run], transition),
      checkpointByRun: new Map([
        [
          run.id,
          checkpoint(run.id, [
            {
              callId: 'call-1',
              executionId: 'execution-1',
              effect: 'external_write',
              idempotency: 'none',
              status: 'running'
            }
          ])
        ]
      ]),
      reconcile: vi.fn().mockResolvedValue([
        { callId: 'call-1', outcome: 'unknown' }
      ]),
      resume
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      blocked: 1,
      preserved: 0
    })
    expect(transition).toHaveBeenCalledWith(
      run.id,
      'recovery_blocked',
      500,
      'recovery_blocked:side_effect_unknown'
    )
    expect(resume).not.toHaveBeenCalled()
  })

  it('blocks a new Runtime Run that has no durable checkpoint', async () => {
    const run = runtimeRun('run-missing', 'preparing')
    const transition = vi.fn().mockResolvedValue(undefined)
    const useCase = recoveryUseCase({
      runs: repository([run], transition),
      checkpointByRun: new Map()
    })

    await expect(useCase.execute()).resolves.toEqual({
      resumed: 0,
      blocked: 1,
      preserved: 0
    })
    expect(transition).toHaveBeenCalledWith(
      run.id,
      'recovery_blocked',
      500,
      'recovery_blocked:checkpoint_unavailable'
    )
  })
})

function recoveryUseCase(input: {
  runs: AgentRuntimeRunRepository
  checkpointByRun: Map<string, ReturnType<typeof checkpoint>>
  availability?: {
    profileAvailable: boolean
    capabilitiesAvailable: boolean
    modelAvailable: boolean
    permissionValid: boolean
    credentialAvailable: boolean
  }
  reconcile?: (
    run: AgentRuntimeRun
  ) => Promise<
    Array<{
      callId: string
      outcome: 'completed' | 'not_started' | 'unknown'
    }>
  >
  resume?: (
    run: AgentRuntimeRun,
    value: ReturnType<typeof checkpoint>
  ) => Promise<void | { start(): void }>
}) {
  const checkpoints = {
    save: vi.fn(),
    getLatest: vi.fn(async (runId: string) =>
      input.checkpointByRun.get(runId)
    ),
    list: vi.fn()
  } satisfies AgentRunCheckpointRepository
  return new RecoverAgentRuntimeRunsUseCase(
    {
      runs: input.runs,
      checkpoints,
      validateConfiguration: vi.fn().mockResolvedValue(
        input.availability ?? {
          profileAvailable: true,
          capabilitiesAvailable: true,
          modelAvailable: true,
          permissionValid: true,
          credentialAvailable: true
        }
      ),
      reconcilePendingCalls:
        input.reconcile ?? vi.fn().mockResolvedValue([]),
      resume: input.resume ?? vi.fn().mockResolvedValue(undefined),
      projectRecoveryEvent: vi.fn().mockResolvedValue(undefined)
    },
    () => 500
  )
}

function repository(
  runs: AgentRuntimeRun[],
  transition: ReturnType<typeof vi.fn>
): AgentRuntimeRunRepository {
  return {
    create: vi.fn(),
    bindProviderRun: vi.fn(),
    transition,
    getByProviderRunId: vi.fn(),
    listByRootRunId: vi.fn(),
    listByParentRunId: vi.fn(),
    listUnfinished: vi.fn().mockResolvedValue(runs)
  }
}

function checkpoint(
  runId: string,
  pendingCalls: Parameters<typeof createRunCheckpoint>[0]['pendingCalls'] = []
) {
  return createRunCheckpoint({
    runId,
    ordinal: 1,
    reason: 'tool_completed',
    snapshotDigest: 'a'.repeat(64),
    configurationDigests: {
      agentProfile: 'b'.repeat(64),
      prompt: 'c'.repeat(64),
      policy: 'd'.repeat(64),
      capabilityCatalog: 'e'.repeat(64),
      capabilityBinding: 'f'.repeat(64)
    },
    messageWindow: [
      { id: 'message-1', role: 'user', content: 'Continue' }
    ],
    pendingCalls,
    remainingBudgets: {
      toolCalls: 7,
      subagents: 0,
      retries: 2,
      timeoutMs: 800_000,
      tokens: 4_096
    },
    projectionCursor: 4,
    createdAt: 100
  })
}

function runtimeRun(
  id: string,
  status: AgentRunLifecycleStatus
): AgentRuntimeRun {
  return {
    id,
    status,
    snapshot: {
      schemaVersion: 1,
      runId: id,
      rootRunId: id,
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
