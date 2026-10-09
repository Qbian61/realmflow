import { describe, expect, it } from 'vitest'
import {
  createDefaultKnowledgeRefreshPolicy,
  decideKnowledgeRefreshRetry,
  updateKnowledgeRefreshPolicy
} from './knowledge-refresh'

describe('knowledge refresh policy', () => {
  it.each([
    ['file', '5m', '*/5 * * * *'],
    ['repository', '5m', '*/5 * * * *'],
    ['document', '30m', '*/30 * * * *']
  ] as const)('uses the default %s refresh cadence', (sourceType, preset, cron) => {
    expect(
      createDefaultKnowledgeRefreshPolicy({
        sourceId: 'source-1',
        sourceType,
        timeZone: 'Asia/Shanghai',
        at: 10
      })
    ).toEqual({
      sourceId: 'source-1',
      enabled: true,
      preset,
      cronExpression: cron,
      timeZone: 'Asia/Shanghai',
      revision: 1,
      createdAt: 10,
      updatedAt: 10
    })
  })

  it('maps manual to a disabled policy and increments revision', () => {
    const current = createDefaultKnowledgeRefreshPolicy({
      sourceId: 'source-1',
      sourceType: 'file',
      timeZone: 'UTC',
      at: 10
    })

    expect(
      updateKnowledgeRefreshPolicy(current, {
        preset: 'manual',
        expectedRevision: 1,
        at: 20
      })
    ).toEqual({
      ...current,
      enabled: false,
      preset: 'manual',
      revision: 2,
      updatedAt: 20
    })
  })

  it('rejects a stale policy revision', () => {
    const current = createDefaultKnowledgeRefreshPolicy({
      sourceId: 'source-1',
      sourceType: 'file',
      timeZone: 'UTC',
      at: 10
    })

    expect(() =>
      updateKnowledgeRefreshPolicy(current, {
        preset: '1h',
        expectedRevision: 2,
        at: 20
      })
    ).toThrow('Knowledge refresh policy revision conflict')
  })
})

describe('knowledge refresh retry', () => {
  it.each([
    [1, 60_000],
    [2, 300_000],
    [3, 900_000],
    [4, 3_600_000]
  ])('backs off retry attempt %s by %sms', (attempt, delay) => {
    expect(
      decideKnowledgeRefreshRetry({
        attempt,
        errorCode: 'source_temporarily_unavailable',
        now: 1_000
      })
    ).toEqual({
      decision: 'retry',
      nextAttemptAt: 1_000 + delay
    })
  })

  it.each([
    'permission_denied',
    'unsupported_format',
    'model_assets_invalid',
    'qdrant_schema_incompatible'
  ] as const)('does not retry permanent error %s', (errorCode) => {
    expect(
      decideKnowledgeRefreshRetry({
        attempt: 1,
        errorCode,
        now: 1_000
      })
    ).toEqual({ decision: 'fail' })
  })
})
