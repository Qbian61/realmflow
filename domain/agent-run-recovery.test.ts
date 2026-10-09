import {
  classifyAgentRunFailure,
  consumeCheckpointBudget,
  createRunCheckpoint,
  decideAgentRunRecovery,
  retryBackoffMs
} from './agent-run-recovery'

const digest = 'a'.repeat(64)

describe('Agent Run recovery', () => {
  it('creates an immutable checkpoint with a deterministic resume token', () => {
    const first = createRunCheckpoint(checkpointInput())
    const repeated = createRunCheckpoint(checkpointInput())

    expect(first).toMatchObject({
      schemaVersion: 1,
      runId: 'run-1',
      ordinal: 2,
      reason: 'tool_completed',
      snapshotDigest: digest,
      projectionCursor: 14,
      remainingBudgets: {
        toolCalls: 7,
        subagents: 2,
        retries: 3,
        timeoutMs: 20_000,
        tokens: 4_096
      },
      ledger: {
        segmentIndex: 1,
        agentTurns: 73,
        toolRequests: 9,
        toolExecutions: 8,
        permissionWaits: 1,
        sideEffects: 2,
        consecutiveFailures: 0,
        repeatedCallFingerprints: { 'files.read:abc': 1 },
        activeRuntimeMs: 12_000,
        remainingContinuationAttempts: 1
      }
    })
    expect(first.resumeToken).toBe(repeated.resumeToken)
    expect(first.resumeToken).toHaveLength(64)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.pendingCalls)).toBe(true)
  })

  it('does not freeze the mutable source used to create a checkpoint', () => {
    const input = checkpointInput()

    const checkpoint = createRunCheckpoint(input)
    input.messageWindow.push({
      id: 'message-2',
      role: 'assistant',
      content: 'Continue'
    })

    expect(input.messageWindow).toHaveLength(2)
    expect(checkpoint.messageWindow).toHaveLength(1)
    expect(Object.isFrozen(checkpoint.messageWindow)).toBe(true)
  })

  it('rejects a checkpoint whose pending calls or source mappings are unsafe', () => {
    expect(() =>
      createRunCheckpoint({
        ...checkpointInput(),
        pendingCalls: [
          {
            callId: 'call-1',
            effect: 'external_write',
            idempotency: 'unsupported',
            status: 'completed'
          }
        ]
      })
    ).toThrow('Completed pending call requires an execution id')

    expect(() =>
      createRunCheckpoint({
        ...checkpointInput(),
        compaction: {
          summary: {
            objective: 'Finish the task',
            constraints: ['Do not publish'],
            decisions: [],
            incompleteItems: ['Run tests'],
            artifacts: [],
            references: []
          },
          sourceMappings: [
            {
              section: 'objective',
              itemIndex: 0,
              sourceId: ''
            }
          ]
        }
      })
    ).toThrow('Invalid compaction source mapping')
  })

  it('rejects an invalid unified budget ledger', () => {
    expect(() =>
      createRunCheckpoint({
        ...checkpointInput(),
        ledger: {
          ...checkpointInput().ledger,
          remainingContinuationAttempts: -1
        }
      })
    ).toThrow('Invalid Agent Run budget ledger')
  })

  it('only allows remaining budgets to decrease', () => {
    const checkpoint = createRunCheckpoint(checkpointInput())

    expect(
      consumeCheckpointBudget(checkpoint, {
        toolCalls: 2,
        retries: 1,
        timeoutMs: 5_000,
        tokens: 1_024
      }).remainingBudgets
    ).toEqual({
      toolCalls: 5,
      subagents: 2,
      retries: 2,
      timeoutMs: 15_000,
      tokens: 3_072
    })
    expect(() =>
      consumeCheckpointBudget(checkpoint, { toolCalls: -1 })
    ).toThrow('Agent Run budget cannot increase')
  })

  it.each([
    ['provider_timeout', 'provider_transient', 'retry_with_backoff'],
    ['provider_rate_limited', 'rate_limited', 'retry_with_backoff'],
    ['provider_unavailable', 'network', 'retry_with_backoff'],
    ['tool_sandbox_unavailable', 'sandbox', 'block'],
    ['permission_required', 'permission', 'wait_for_permission'],
    ['invalid_tool_input', 'business_validation', 'fail'],
    ['request_cancelled', 'cancelled', 'fail']
  ] as const)(
    'classifies %s as %s with %s',
    (errorCode, classification, action) => {
      expect(classifyAgentRunFailure({ errorCode })).toEqual({
        classification,
        action,
        retryable:
          action === 'retry_with_backoff' ||
          action === 'retry_with_fallback'
      })
    }
  )

  it('requires reconciliation instead of replaying an unknown side effect', () => {
    expect(
      classifyAgentRunFailure({
        errorCode: 'tool_result_unknown',
        effect: 'external_write',
        idempotency: 'unsupported'
      })
    ).toEqual({
      classification: 'result_unknown',
      action: 'reconcile',
      retryable: false
    })
  })

  it('uses bounded deterministic retry backoff and honors a larger retry hint', () => {
    expect([0, 1, 2, 3, 8].map((attempt) => retryBackoffMs(attempt))).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      30_000
    ])
    expect(retryBackoffMs(1, 9_000)).toBe(9_000)
    expect(retryBackoffMs(8, 60_000)).toBe(30_000)
  })

  it('blocks recovery when fixed configuration is unavailable', () => {
    const decision = decideAgentRunRecovery({
      checkpoint: createRunCheckpoint(checkpointInput()),
      configuration: {
        profileAvailable: true,
        capabilitiesAvailable: false,
        modelAvailable: true,
        permissionValid: true,
        credentialAvailable: true
      },
      pendingCalls: []
    })

    expect(decision).toEqual({
      action: 'block',
      reason: 'capability_unavailable'
    })
  })

  it('resumes only after every pending side effect is reconciled', () => {
    const checkpoint = createRunCheckpoint({
      ...checkpointInput(),
      pendingCalls: [
        {
          callId: 'call-1',
          executionId: 'execution-1',
          effect: 'external_write',
          idempotency: 'supported',
          status: 'requested'
        }
      ]
    })

    expect(
      decideAgentRunRecovery({
        checkpoint,
        configuration: availableConfiguration(),
        pendingCalls: [
          {
            callId: 'call-1',
            outcome: 'unknown'
          }
        ]
      })
    ).toEqual({ action: 'block', reason: 'side_effect_unknown' })
    expect(
      decideAgentRunRecovery({
        checkpoint,
        configuration: availableConfiguration(),
        pendingCalls: [
          {
            callId: 'call-1',
            outcome: 'completed'
          }
        ]
      })
    ).toEqual({ action: 'resume' })
  })
})

function checkpointInput(): Parameters<typeof createRunCheckpoint>[0] {
  return {
    runId: 'run-1',
    ordinal: 2,
    reason: 'tool_completed',
    snapshotDigest: digest,
    configurationDigests: {
      agentProfile: 'b'.repeat(64),
      prompt: 'c'.repeat(64),
      policy: 'd'.repeat(64),
      capabilityCatalog: 'e'.repeat(64),
      capabilityBinding: 'f'.repeat(64)
    },
    messageWindow: [
      { id: 'message-1', role: 'user', content: 'Finish the task' }
    ],
    pendingCalls: [],
    remainingBudgets: {
      toolCalls: 7,
      subagents: 2,
      retries: 3,
      timeoutMs: 20_000,
      tokens: 4_096
    },
    ledger: {
      segmentIndex: 1,
      agentTurns: 73,
      toolRequests: 9,
      toolExecutions: 8,
      permissionWaits: 1,
      sideEffects: 2,
      consecutiveFailures: 0,
      repeatedCallFingerprints: { 'files.read:abc': 1 },
      activeRuntimeMs: 12_000,
      remainingContinuationAttempts: 1
    },
    projectionCursor: 14,
    createdAt: 100
  }
}

function availableConfiguration() {
  return {
    profileAvailable: true,
    capabilitiesAvailable: true,
    modelAvailable: true,
    permissionValid: true,
    credentialAvailable: true
  }
}
