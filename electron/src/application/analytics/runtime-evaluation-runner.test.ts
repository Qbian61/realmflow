import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations } from '../../infrastructure/sqlite/migrations'
import {
  BuiltinRuntimeEvaluationRunner,
  type RuntimeEvaluationCase
} from './runtime-evaluation-runner'

describe('BuiltinRuntimeEvaluationRunner', () => {
  let database: Database.Database

  beforeEach(() => {
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    applyMigrations(database)
  })

  afterEach(() => database.close())

  it('executes the isolated fixed task, retrieval, trace, safety, and recovery suites deterministically', async () => {
    const runner = new BuiltinRuntimeEvaluationRunner({ database })

    const first = await runner.run()
    const replay = await runner.run()

    expect(first).toEqual(replay)
    expect(first).toMatchObject({
      suiteVersion: 'builtin.runtime.v2',
      seed: 42,
      dimensions: {
        quality: { passed: 2, total: 2 },
        retrieval: { passed: 2, total: 2 },
        toolTrace: { passed: 2, total: 2 },
        safety: { passed: 2, total: 2 },
        recovery: { passed: 2, total: 2 }
      }
    })
    expect(first.datasetDigest).toHaveLength(64)
    expect(first.candidateDigest).toHaveLength(64)
  })

  it('counts a thrown fault-injection case as failed without skipping the remaining dimensions', async () => {
    const cases: RuntimeEvaluationCase[] = [
      evaluationCase('quality', 'quality-pass', () => true),
      evaluationCase('retrieval', 'retrieval-pass', () => true),
      evaluationCase('toolTrace', 'trace-pass', () => true),
      evaluationCase('safety', 'safety-fault', () => {
        throw new Error('simulated unauthorized access')
      }),
      evaluationCase('recovery', 'recovery-pass', () => true)
    ]
    const result = await new BuiltinRuntimeEvaluationRunner({
      database,
      cases
    }).run()

    expect(result.dimensions).toEqual({
      quality: { passed: 1, total: 1 },
      retrieval: { passed: 1, total: 1 },
      toolTrace: { passed: 1, total: 1 },
      safety: { passed: 0, total: 1 },
      recovery: { passed: 1, total: 1 }
    })
  })
})

function evaluationCase(
  dimension: RuntimeEvaluationCase['dimension'],
  id: string,
  execute: RuntimeEvaluationCase['execute']
): RuntimeEvaluationCase {
  return { dimension, id, execute }
}
