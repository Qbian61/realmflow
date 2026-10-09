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

  it('starts a new repetition streak when the requested operation changes', () => {
    const initial = createInitialRunBudgetLedger(
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    const first = recordToolRequest(
      initial,
      canonicalToolCallFingerprint('files.read', '{"path":"a"}'),
      DEFAULT_AGENT_EXECUTION_POLICY
    )
    const changed = recordToolRequest(
      first.ledger,
      canonicalToolCallFingerprint('files.read', '{"path":"b"}'),
      DEFAULT_AGENT_EXECUTION_POLICY
    )

    expect(Object.values(changed.ledger.repeatedCallFingerprints)).toEqual([
      1
    ])
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
})
