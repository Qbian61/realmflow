import {
  canonicalToolCallFingerprint,
  recordConsecutiveToolFailure,
  recordSuccessfulToolExecution,
  recordToolRequest
} from './agent-progress-detector'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY
} from './agent-runtime'

describe('Agent progress detector', () => {
  it('treats equivalent JSON arguments as the same Tool call', () => {
    expect(
      canonicalToolCallFingerprint('files.read', '{"path":"a","limit":10}')
    ).toBe(
      canonicalToolCallFingerprint(
        'files.read',
        '{"limit":10,"path":"a"}'
      )
    )
  })

  it('blocks the third consecutive equivalent Tool request', () => {
    let ledger = createInitialRunBudgetLedger(
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    const fingerprint = canonicalToolCallFingerprint(
      'files.read',
      '{"path":"a"}'
    )

    const first = recordToolRequest(
      ledger,
      fingerprint,
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    ledger = first.ledger
    const second = recordToolRequest(
      ledger,
      fingerprint,
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    ledger = second.ledger
    const third = recordToolRequest(
      ledger,
      fingerprint,
      DEFAULT_AGENT_EXECUTION_POLICY
    )

    expect(first.blocked).toBe(false)
    expect(second.blocked).toBe(false)
    expect(third).toMatchObject({
      blocked: true,
      reason: 'repeated_tool_call'
    })
    expect(third.ledger.repeatedCallFingerprints[fingerprint]).toBe(3)
  })

  it('keeps a bounded repetition window when the requested operation changes', () => {
    const initial = createInitialRunBudgetLedger(
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    const firstFingerprint = canonicalToolCallFingerprint(
      'files.read',
      '{"path":"a"}'
    )
    const secondFingerprint = canonicalToolCallFingerprint(
      'files.read',
      '{"path":"b"}'
    )
    const first = recordToolRequest(
      initial,
      firstFingerprint,
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    const changed = recordToolRequest(
      first.ledger,
      secondFingerprint,
      DEFAULT_AGENT_EXECUTION_POLICY
    )

    expect(changed.ledger.repeatedCallFingerprints).toMatchObject({
      [firstFingerprint]: 1,
      [secondFingerprint]: 1
    })
    expect(changed.blocked).toBe(false)
  })

  it('blocks five consecutive failures and resets after success', () => {
    let ledger = createInitialRunBudgetLedger(
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    for (let index = 0; index < 4; index += 1) {
      const result = recordConsecutiveToolFailure(
        ledger,
        DEFAULT_AGENT_EXECUTION_POLICY
      )
      expect(result.blocked).toBe(false)
      ledger = result.ledger
    }
    const fifth = recordConsecutiveToolFailure(
      ledger,
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    expect(fifth).toMatchObject({
      blocked: true,
      reason: 'consecutive_tool_failures'
    })
    expect(recordSuccessfulToolExecution(fifth.ledger)).toMatchObject({
      consecutiveFailures: 0
    })
  })

  it('blocks the second deterministic failure with the same root even when argument values change', () => {
    let ledger = createInitialRunBudgetLedger(
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    const recordFailure = recordConsecutiveToolFailure as unknown as (
      current: typeof ledger,
      policy: typeof DEFAULT_AGENT_EXECUTION_POLICY,
      failure: {
        toolName: string
        errorCode: string
        targetScope: string
        serializedArguments: string
        retryable: boolean
      }
    ) => ReturnType<typeof recordConsecutiveToolFailure>

    const first = recordFailure(ledger, DEFAULT_AGENT_EXECUTION_POLICY, {
      toolName: 'knowledge.search',
      errorCode: 'tool_arguments_invalid',
      targetScope: 'workspace:space-1',
      serializedArguments: '{"query":"first","sourceKinds":["code"]}',
      retryable: false
    })
    ledger = first.ledger
    const second = recordFailure(ledger, DEFAULT_AGENT_EXECUTION_POLICY, {
      toolName: 'knowledge.search',
      errorCode: 'tool_arguments_invalid',
      targetScope: 'workspace:space-1',
      serializedArguments: '{"query":"second","sourceKinds":["code"]}',
      retryable: false
    })

    expect(first.blocked).toBe(false)
    expect(second).toMatchObject({
      blocked: true,
      reason: 'deterministic_tool_failure'
    })
  })

  it('keeps deterministic failure signatures across unrelated success and clears them after matching success', () => {
    let ledger = createInitialRunBudgetLedger(
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    const recordFailure = recordConsecutiveToolFailure as unknown as (
      current: typeof ledger,
      policy: typeof DEFAULT_AGENT_EXECUTION_POLICY,
      failure: {
        toolName: string
        errorCode: string
        targetScope: string
        serializedArguments: string
        retryable: boolean
      }
    ) => ReturnType<typeof recordConsecutiveToolFailure>
    const recordSuccess = recordSuccessfulToolExecution as unknown as (
      current: typeof ledger,
      success?: {
        toolName: string
        targetScope: string
        serializedArguments: string
      }
    ) => typeof ledger

    ledger = recordFailure(ledger, DEFAULT_AGENT_EXECUTION_POLICY, {
      toolName: 'knowledge.search',
      errorCode: 'tool_arguments_invalid',
      targetScope: 'workspace:space-1',
      serializedArguments: '{"query":"first","sourceKinds":["code"]}',
      retryable: false
    }).ledger
    ledger = recordSuccess(ledger, {
      toolName: 'files.read',
      targetScope: 'workspace:space-1',
      serializedArguments: '{"path":"notes.md"}'
    })
    const second = recordFailure(ledger, DEFAULT_AGENT_EXECUTION_POLICY, {
      toolName: 'knowledge.search',
      errorCode: 'tool_arguments_invalid',
      targetScope: 'workspace:space-1',
      serializedArguments: '{"query":"second","sourceKinds":["code"]}',
      retryable: false
    })

    expect(second).toMatchObject({
      blocked: true,
      reason: 'deterministic_tool_failure'
    })

    const cleared = recordSuccess(second.ledger, {
      toolName: 'knowledge.search',
      targetScope: 'workspace:space-1',
      serializedArguments: '{"query":"fixed","sourceKinds":["repository"]}'
    })

    expect(cleared).toMatchObject({
      consecutiveFailures: 0,
      deterministicFailureFingerprints: {}
    })
  })

  it('treats non-retryable public scope categories as deterministic failures', () => {
    let ledger = createInitialRunBudgetLedger(
      DEFAULT_AGENT_EXECUTION_POLICY
    )

    const first = recordConsecutiveToolFailure(
      ledger,
      DEFAULT_AGENT_EXECUTION_POLICY,
      {
        toolName: 'files.read',
        errorCode: 'tool_policy_denied',
        targetScope: 'workspace:space-1',
        serializedArguments: '{"path":"private.md"}',
        retryable: false,
        category: 'scope'
      }
    )
    ledger = first.ledger
    const second = recordConsecutiveToolFailure(
      ledger,
      DEFAULT_AGENT_EXECUTION_POLICY,
      {
        toolName: 'files.read',
        errorCode: 'tool_policy_denied',
        targetScope: 'workspace:space-1',
        serializedArguments: '{"path":"other-private.md"}',
        retryable: false,
        category: 'scope'
      }
    )

    expect(first.blocked).toBe(false)
    expect(second).toMatchObject({
      blocked: true,
      reason: 'deterministic_tool_failure'
    })
  })
})
