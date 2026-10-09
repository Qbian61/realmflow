import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuntimeEvaluation } from '../../../../domain/runtime-governance'
import { applyMigrations } from './migrations'
import { SqliteRuntimeGovernanceRepository } from './runtime-governance-repository'

const digest = (value: string) => value.repeat(64).slice(0, 64)

describe('SqliteRuntimeGovernanceRepository', () => {
  let database: Database.Database
  let repository: SqliteRuntimeGovernanceRepository

  beforeEach(() => {
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    applyMigrations(database)
    repository = new SqliteRuntimeGovernanceRepository(database)
  })

  afterEach(() => database.close())

  it('stores immutable evaluations idempotently and rejects conflicting facts', async () => {
    const evaluation = passingEvaluation()

    expect(await repository.recordEvaluation(evaluation)).toBe(true)
    expect(await repository.recordEvaluation(evaluation)).toBe(false)
    expect(await repository.getEvaluation(evaluation.id)).toEqual(evaluation)
    expect(await repository.listEvaluations(10)).toEqual([evaluation])

    await expect(
      repository.recordEvaluation({
        ...evaluation,
        candidateDigest: digest('f')
      })
    ).rejects.toThrow('Runtime evaluation conflicts with persisted fact')
    expect(() =>
      database
        .prepare(
          `UPDATE runtime_evaluation_runs
           SET candidate_digest = ? WHERE evaluation_id = ?`
        )
        .run(digest('e'), evaluation.id)
    ).toThrow(/immutable/)
  })

  it('publishes with compare-and-set revision and append-only audit', async () => {
    const evaluation = passingEvaluation()
    await repository.recordEvaluation(evaluation)

    expect(await repository.getRevision()).toBe(1)
    expect(
      await repository.release({
        eventId: 'event-release-1',
        evaluationId: evaluation.id,
        expectedRevision: 1,
        baselineOverallScore: 90,
        occurredAt: 200
      })
    ).toEqual({
      status: 'published',
      revision: 2,
      reasons: []
    })
    expect(await repository.getRevision()).toBe(2)
    expect(await repository.listEvents(10)).toEqual([
      expect.objectContaining({
        eventId: 'event-release-1',
        type: 'release.published',
        evaluationId: evaluation.id,
        revision: 2
      })
    ])

    await expect(
      repository.release({
        eventId: 'event-release-stale',
        evaluationId: evaluation.id,
        expectedRevision: 1,
        occurredAt: 201
      })
    ).rejects.toThrow('Runtime governance revision conflict')
    expect(() =>
      database.prepare('DELETE FROM runtime_governance_events').run()
    ).toThrow(/append-only/)
  })

  it('audits a blocked release without advancing revision', async () => {
    const evaluation = createRuntimeEvaluation({
      ...passingEvaluation(),
      id: 'evaluation-unsafe',
      candidateDigest: digest('c'),
      dimensions: {
        quality: { passed: 9, total: 10 },
        retrieval: { passed: 9, total: 10 },
        toolTrace: { passed: 9, total: 10 },
        safety: { passed: 9, total: 10 },
        recovery: { passed: 9, total: 10 }
      }
    })
    await repository.recordEvaluation(evaluation)

    expect(
      await repository.release({
        eventId: 'event-blocked-1',
        evaluationId: evaluation.id,
        expectedRevision: 1,
        occurredAt: 210
      })
    ).toEqual({
      status: 'blocked',
      revision: 1,
      reasons: ['safety_threshold']
    })
    expect(await repository.getRevision()).toBe(1)
    expect(await repository.listEvents(10)).toEqual([
      expect.objectContaining({
        type: 'release.blocked',
        revision: 1,
        reasons: ['safety_threshold']
      })
    ])
  })

  it('bounds evaluation and audit queries', async () => {
    await expect(repository.listEvaluations(0)).rejects.toThrow(
      'Runtime governance query limit is invalid'
    )
    await expect(repository.listEvents(101)).rejects.toThrow(
      'Runtime governance query limit is invalid'
    )
  })

  it('reads persisted observability policy and atomically counts dropped events', async () => {
    database
      .prepare(
        `UPDATE runtime_observability_state
         SET retention_days = 14, maximum_events = 1200
         WHERE singleton_id = 1`
      )
      .run()

    await repository.recordDroppedEvents(2)
    await repository.recordDroppedEvents(3)

    await expect(repository.getObservability()).resolves.toEqual({
      retentionDays: 14,
      maximumEvents: 1200,
      droppedEvents: 5,
      storedEvents: 0
    })
    await expect(repository.recordDroppedEvents(0)).rejects.toThrow(
      'Dropped Runtime event count is invalid'
    )
  })
})

function passingEvaluation() {
  return createRuntimeEvaluation({
    id: 'evaluation-pass',
    suiteVersion: 'builtin.runtime.v1',
    datasetDigest: digest('a'),
    candidateDigest: digest('b'),
    baselineDigest: digest('d'),
    seed: 42,
    dimensions: {
      quality: { passed: 9, total: 10 },
      retrieval: { passed: 9, total: 10 },
      toolTrace: { passed: 9, total: 10 },
      safety: { passed: 10, total: 10 },
      recovery: { passed: 9, total: 10 }
    },
    startedAt: 100,
    completedAt: 120
  })
}
