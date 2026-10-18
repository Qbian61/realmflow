import { describe, expect, it, vi } from 'vitest'
import {
  DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
  digestDshProductCommandInput,
  type DshProductCommandEnvelope
} from '../../../shared/dsh-product-command-contract'
import { DshProductCommandServer } from './dsh-product-command-server'

describe('DshProductCommandServer', () => {
  it('normalizes Product Command envelopes before delegating to the application registry', async () => {
    const execute = vi.fn(async () => ({
      schemaVersion: DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
      commandId: 'command-1',
      command: 'realmflow.node.answer_question',
      runtimeInstanceId: 'runtime-1',
      sessionId: 'session-1',
      runId: 'run-1',
      idempotencyKey: 'product-command-1',
      status: 'succeeded' as const,
      productVersion: 'node-v2',
      output: {
        answerId: 'answer-1'
      }
    }))
    const server = new DshProductCommandServer({
      registry: {
        execute
      }
    })
    const request = commandEnvelope()

    await expect(server.execute(request)).resolves.toMatchObject({
      status: 'succeeded',
      command: 'realmflow.node.answer_question',
      output: {
        answerId: 'answer-1'
      }
    })
    expect(execute).toHaveBeenCalledWith(request)
  })

  it('rejects unsafe generic payloads without leaking secrets in diagnostics', async () => {
    const execute = vi.fn()
    const server = new DshProductCommandServer({
      registry: {
        execute
      }
    })
    const request = commandEnvelope({
      payload: {
        method: 'dropEverything',
        apiKey: 'sk-live-secret'
      }
    })

    await expect(server.execute(request)).rejects.toThrow(/unsafe|forbidden|generic/i)
    await expect(server.execute(request)).rejects.not.toThrow(/sk-live-secret/)
    expect(execute).not.toHaveBeenCalled()
  })
})

function commandEnvelope(
  overrides: Partial<DshProductCommandEnvelope> & {
    payload?: Record<string, unknown>
  } = {}
): DshProductCommandEnvelope {
  const payload = overrides.payload ?? {
    nodeRunId: 'node-run-1',
    answer: 'Approved'
  }
  return {
    schemaVersion: DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
    runtimeInstanceId: 'runtime-1',
    sessionId: 'session-1',
    runId: 'run-1',
    manifestDigest: '1'.repeat(64),
    commandId: 'command-1',
    commandGrantId: 'grant-node-answer',
    scopeDigest: '2'.repeat(64),
    inputDigest: digestDshProductCommandInput(payload),
    idempotencyKey: 'product-command-1',
    expectedProductVersion: 'node-v1',
    payload,
    ...overrides
  }
}
