import { describe, expect, it } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import * as resultModule from './delegated-run-result'

const event = (type: AiRunEvent['type'], data: AiRunEvent['data'] = {}): AiRunEvent =>
  ({ id: type, runId: 'child', sequence: 1, type, data, timestamp: new Date(0).toISOString() })

describe('delegated run result collection', () => {
  it('preserves a completed result when parent cancellation arrives as the stream closes', async () => {
    const controller = new AbortController()
    const result = await resultModule.collectDelegatedRunResult('task', (async function* () {
      try {
        yield event('answer.delta', { delta: 'Finished' })
        yield event('run.completed')
      } finally {
        controller.abort()
      }
    })(), controller.signal)
    expect(result).toMatchObject({ status: 'completed', summary: 'Finished' })
  })

  it('includes the checkpoint answer and resumed deltas in the persisted result', async () => {
    expect(resultModule.collectDelegatedRunResult).toBeTypeOf('function')
    const result = await resultModule.collectDelegatedRunResult('task', (async function* () {
      yield event('answer.delta', { delta: ' continued' })
      yield event('run.completed')
    })(), new AbortController().signal, 'Saved answer')
    expect(result).toMatchObject({ status: 'completed', summary: 'Saved answer continued' })
  })

  it('preserves truthful failure after stream loss and redacts local data', async () => {
    expect(resultModule.collectDelegatedRunResult).toBeTypeOf('function')
    const result = await resultModule.collectDelegatedRunResult('task', (async function* () {
      yield event('answer.delta', { delta: 'Incomplete' })
      throw new Error('Failed /Users/private/file token=abc')
    })(), new AbortController().signal)
    expect(result.status).toBe('failed')
    expect(result.summary).not.toContain('/Users/private')
    expect(result.summary).not.toContain('abc')
    expect(result.unresolved).toEqual([result.summary])
  })
})
