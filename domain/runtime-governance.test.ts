import { describe, expect, it } from 'vitest'
import {
  classifyRuntimeFailure,
  createRuntimeEvaluation,
  evaluateRuntimeRelease,
  redactDiagnosticValue
} from './runtime-governance'

const digest = (value: string) => value.repeat(64).slice(0, 64)

describe('runtime governance', () => {
  it('creates a deterministic weighted evaluation from bounded dimensions', () => {
    const input = {
      id: 'evaluation-1',
      suiteVersion: 'builtin.runtime.v1',
      datasetDigest: digest('a'),
      candidateDigest: digest('b'),
      seed: 42,
      dimensions: {
        quality: { passed: 9, total: 10 },
        retrieval: { passed: 8, total: 10 },
        toolTrace: { passed: 4, total: 5 },
        safety: { passed: 5, total: 5 },
        recovery: { passed: 3, total: 4 }
      },
      startedAt: 100,
      completedAt: 120
    } as const

    const first = createRuntimeEvaluation(input)
    const second = createRuntimeEvaluation(input)

    expect(first).toEqual(second)
    expect(first.scores).toEqual({
      quality: 90,
      retrieval: 80,
      toolTrace: 80,
      safety: 100,
      recovery: 75,
      overall: 86
    })
    expect(first.reproducibilityDigest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('blocks unsafe, low-quality and regressed candidates without a revision change', () => {
    const unsafe = createRuntimeEvaluation({
      id: 'evaluation-unsafe',
      suiteVersion: 'builtin.runtime.v1',
      datasetDigest: digest('a'),
      candidateDigest: digest('c'),
      seed: 7,
      dimensions: {
        quality: { passed: 9, total: 10 },
        retrieval: { passed: 9, total: 10 },
        toolTrace: { passed: 9, total: 10 },
        safety: { passed: 9, total: 10 },
        recovery: { passed: 9, total: 10 }
      },
      startedAt: 100,
      completedAt: 110
    })

    expect(
      evaluateRuntimeRelease({
        evaluation: unsafe,
        currentRevision: 4,
        expectedRevision: 4
      })
    ).toEqual({
      status: 'blocked',
      revision: 4,
      reasons: ['safety_threshold']
    })

    const regressed = createRuntimeEvaluation({
      ...unsafe,
      id: 'evaluation-regressed',
      candidateDigest: digest('d'),
      dimensions: {
        quality: { passed: 8, total: 10 },
        retrieval: { passed: 8, total: 10 },
        toolTrace: { passed: 8, total: 10 },
        safety: { passed: 10, total: 10 },
        recovery: { passed: 8, total: 10 }
      }
    })
    expect(
      evaluateRuntimeRelease({
        evaluation: regressed,
        baselineOverallScore: 90,
        currentRevision: 4,
        expectedRevision: 4
      })
    ).toEqual({
      status: 'blocked',
      revision: 4,
      reasons: ['baseline_regression']
    })
  })

  it('publishes a passing candidate with compare-and-set revision semantics', () => {
    const evaluation = createRuntimeEvaluation({
      id: 'evaluation-pass',
      suiteVersion: 'builtin.runtime.v1',
      datasetDigest: digest('a'),
      candidateDigest: digest('e'),
      seed: 8,
      dimensions: {
        quality: { passed: 9, total: 10 },
        retrieval: { passed: 9, total: 10 },
        toolTrace: { passed: 9, total: 10 },
        safety: { passed: 10, total: 10 },
        recovery: { passed: 9, total: 10 }
      },
      startedAt: 100,
      completedAt: 110
    })

    expect(
      evaluateRuntimeRelease({
        evaluation,
        baselineOverallScore: 90,
        currentRevision: 4,
        expectedRevision: 4
      })
    ).toEqual({
      status: 'published',
      revision: 5,
      reasons: []
    })
    expect(() =>
      evaluateRuntimeRelease({
        evaluation,
        currentRevision: 5,
        expectedRevision: 4
      })
    ).toThrow('Runtime governance revision conflict')
  })

  it('normalizes runtime failures to stable public error codes and stages', () => {
    expect(
      classifyRuntimeFailure({
        lifecycleStatus: 'recovery_blocked',
        eventType: 'run.recovery_blocked',
        message: '/Users/alice/project/.env was unavailable'
      })
    ).toEqual({
      stage: 'recovery',
      errorCode: 'recovery_blocked',
      summary: 'Run recovery requires attention'
    })
    expect(
      classifyRuntimeFailure({
        lifecycleStatus: 'failed',
        eventType: 'tool.call.failed',
        eventErrorCode: 'permission_denied',
        message: 'token=secret'
      })
    ).toEqual({
      stage: 'capability',
      errorCode: 'permission_denied',
      summary: 'Capability permission was denied'
    })
  })

  it('redacts content, credentials, raw tool arguments and absolute paths by default', () => {
    expect(
      redactDiagnosticValue({
        runId: 'run-1',
        messageContent: 'private request',
        credential: 'token-value',
        toolArguments: { path: '/Users/alice/project/private.txt' },
        error: 'Failed at /Users/alice/project/private.txt',
        nested: {
          systemPrompt: 'secret prompt',
          relativePath: 'artifacts/report.md',
          digest: digest('f')
        }
      })
    ).toEqual({
      runId: 'run-1',
      messageContent: '[REDACTED]',
      credential: '[REDACTED]',
      toolArguments: '[REDACTED]',
      error: 'Failed at [LOCAL_PATH]',
      nested: {
        systemPrompt: '[REDACTED]',
        relativePath: 'artifacts/report.md',
        digest: digest('f')
      }
    })
  })
})
