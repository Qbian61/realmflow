import { describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_INDEX_JOB_PRIORITY,
  decideKnowledgeIndexJobRetry,
  transitionKnowledgeIndexJob,
  type KnowledgeIndexJobStatus
} from './knowledge-index-job'

describe('knowledge index job state machine', () => {
  it.each([
    ['pending', 'running'],
    ['pending', 'cancelled'],
    ['running', 'qdrant_written'],
    ['running', 'failed'],
    ['running', 'interrupted'],
    ['qdrant_written', 'completed'],
    ['qdrant_written', 'failed'],
    ['qdrant_written', 'interrupted'],
    ['failed', 'pending'],
    ['interrupted', 'pending']
  ] satisfies Array<[KnowledgeIndexJobStatus, KnowledgeIndexJobStatus]>)(
    'allows %s -> %s',
    (current, next) => {
      expect(transitionKnowledgeIndexJob(current, next)).toBe(next)
    }
  )

  it.each([
    ['pending', 'completed'],
    ['running', 'completed'],
    ['completed', 'pending'],
    ['cancelled', 'running']
  ] satisfies Array<[KnowledgeIndexJobStatus, KnowledgeIndexJobStatus]>)(
    'rejects %s -> %s',
    (current, next) => {
      expect(() => transitionKnowledgeIndexJob(current, next)).toThrow(
        `Invalid knowledge index job transition: ${current} -> ${next}`
      )
    }
  )

  it('orders manual work before event, schedule and recovery work', () => {
    expect(KNOWLEDGE_INDEX_JOB_PRIORITY).toEqual({
      manual: 100,
      source_event: 75,
      scheduled: 50,
      startup_recovery: 25
    })
  })

  it.each([
    [1, 60_000],
    [2, 300_000],
    [3, 900_000],
    [4, 3_600_000]
  ])('schedules retry attempt %s after %sms', (attempt, delayMs) => {
    expect(
      decideKnowledgeIndexJobRetry({
        attempt,
        errorCode: 'qdrant_unavailable',
        now: 1_000
      })
    ).toEqual({
      decision: 'retry',
      nextAttemptAt: 1_000 + delayMs
    })
  })

  it('stops retrying after four automatic attempts', () => {
    expect(
      decideKnowledgeIndexJobRetry({
        attempt: 5,
        errorCode: 'qdrant_unavailable',
        now: 1_000
      })
    ).toEqual({ decision: 'fail' })
  })

  it.each([
    'permission_denied',
    'format_unsupported',
    'model_assets_invalid',
    'qdrant_schema_incompatible'
  ] as const)('does not retry permanent error %s', (errorCode) => {
    expect(
      decideKnowledgeIndexJobRetry({
        attempt: 1,
        errorCode,
        now: 1_000
      })
    ).toEqual({ decision: 'fail' })
  })
})
