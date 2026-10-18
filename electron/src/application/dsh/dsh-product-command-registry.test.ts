import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import {
  DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
  digestDshProductCommandInput,
  digestDshProductCommandScope,
  type DshProductCommandAdapter,
  type DshProductCommandEnvelope
} from '../../../../shared/dsh-product-command-contract'
import { DshProductCommandRegistry } from './dsh-product-command-registry'

describe('DshProductCommandRegistry', () => {
  it('executes one registered adapter only after manifest grant, scope, input digest, and version checks pass', async () => {
    const harness = createHarness({
      productVersion: 'node-v1'
    })
    const command = productCommandEnvelope(harness, {
      expectedProductVersion: 'node-v1'
    })

    const result = await harness.registry.execute(command)

    expect(result).toEqual({
      schemaVersion: DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
      commandId: 'command-1',
      command: 'realmflow.node.answer_question',
      runtimeInstanceId: 'runtime-1',
      sessionId: harness.manifest.sessionId,
      runId: harness.manifest.runId,
      idempotencyKey: 'product-command-1',
      status: 'succeeded',
      productVersion: 'node-v2',
      output: {
        answerId: 'answer-1',
        revision: 2
      }
    })
    expect(harness.adapter.execute).toHaveBeenCalledTimes(1)
    expect(harness.adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'command-1',
        command: 'realmflow.node.answer_question',
        commandGrantId: 'grant-node-answer',
        runtimeInstanceId: 'runtime-1',
        sessionId: harness.manifest.sessionId,
        runId: harness.manifest.runId,
        manifestDigest: harness.manifest.digest,
        idempotencyKey: 'product-command-1',
        expectedProductVersion: 'node-v1',
        scope: harness.commandGrant.scope,
        payload: {
          nodeRunId: 'node-run-1',
          answer: 'Approved'
        }
      })
    )
    expect(harness.auditEvents).toEqual([
      expect.objectContaining({
        type: 'product_command_executed',
        command: 'realmflow.node.answer_question',
        commandGrantId: 'grant-node-answer',
        runId: harness.manifest.runId
      })
    ])
  })

  it('replays the same idempotency key without duplicating mutation and rejects conflicting reuse', async () => {
    const harness = createHarness()
    const command = productCommandEnvelope(harness)

    const first = await harness.registry.execute(command)
    const replay = await harness.registry.execute(command)

    expect(replay).toEqual(first)
    expect(harness.adapter.execute).toHaveBeenCalledTimes(1)

    await expect(
      harness.registry.execute(
        productCommandEnvelope(harness, {
          payload: {
            nodeRunId: 'node-run-1',
            answer: 'Different answer'
          },
          idempotencyKey: 'product-command-1'
        })
      )
    ).rejects.toThrow(/idempotency/i)
    expect(harness.adapter.execute).toHaveBeenCalledTimes(1)
  })

  it('rejects undeclared grants, mismatched scope, mismatched input digest, and stale product versions before mutation', async () => {
    const harness = createHarness({
      productVersion: 'node-v1'
    })

    await expect(
      harness.registry.execute(
        productCommandEnvelope(harness, {
          commandGrantId: 'grant-missing'
        })
      )
    ).rejects.toThrow(/grant/i)

    await expect(
      harness.registry.execute(
        productCommandEnvelope(harness, {
          scopeDigest: '9'.repeat(64)
        })
      )
    ).rejects.toThrow(/scope/i)

    await expect(
      harness.registry.execute(
        productCommandEnvelope(harness, {
          inputDigest: '7'.repeat(64)
        })
      )
    ).rejects.toThrow(/input digest/i)

    await expect(
      harness.registry.execute(
        productCommandEnvelope(harness, {
          expectedProductVersion: 'node-v0'
        })
      )
    ).rejects.toThrow(/version/i)

    expect(harness.adapter.execute).not.toHaveBeenCalled()
  })

  it('rejects generic repository, SQL, file path, URL, and method invocation payloads', async () => {
    const harness = createHarness()

    for (const payload of [
      { repository: 'requirements', id: 'requirement-1' },
      { sql: 'drop table requirements' },
      { filePath: '/tmp/realmflow.db' },
      { url: 'https://example.com/mutate' },
      { method: 'deleteRequirement' }
    ]) {
      await expect(
        harness.registry.execute(
          productCommandEnvelope(harness, {
            idempotencyKey: `unsafe-${Object.keys(payload)[0]}`,
            payload
          })
        )
      ).rejects.toThrow(/unsafe|forbidden|generic/i)
    }
    expect(harness.adapter.execute).not.toHaveBeenCalled()
  })

  it('enforces product-command grant invocation limits', async () => {
    const harness = createHarness({
      maxInvocations: 1
    })

    await harness.registry.execute(
      productCommandEnvelope(harness, {
        idempotencyKey: 'first-command',
        commandId: 'command-1'
      })
    )

    await expect(
      harness.registry.execute(
        productCommandEnvelope(harness, {
          idempotencyKey: 'second-command',
          commandId: 'command-2'
        })
      )
    ).rejects.toThrow(/invocation/i)
    expect(harness.adapter.execute).toHaveBeenCalledTimes(1)
  })
})

function createHarness(
  options: {
    productVersion?: string
    maxInvocations?: number
  } = {}
) {
  const commandGrant = {
    kind: 'product-command' as const,
    grantId: 'grant-node-answer',
    command: 'realmflow.node.answer_question',
    scope: {
      kind: 'requirement-node' as const,
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1'
    },
    inputSchemaDigest: 'a'.repeat(64),
    maxInvocations: options.maxInvocations ?? 8
  }
  const manifest = createDshRunManifest({
    runId: 'run-1',
    sessionId: 'session-1',
    productCommands: [commandGrant]
  })
  const auditEvents: unknown[] = []
  const adapter: DshProductCommandAdapter = {
    command: 'realmflow.node.answer_question',
    inputSchemaDigest: 'a'.repeat(64),
    expectedProductVersion: 'required',
    getCurrentProductVersion: vi.fn(async () => options.productVersion ?? 'node-v1'),
    execute: vi.fn(async () => ({
      productVersion: 'node-v2',
      output: {
        answerId: 'answer-1',
        revision: 2
      }
    }))
  }
  const registry = new DshProductCommandRegistry({
    audit: {
      record: (event) => {
        auditEvents.push(event)
      }
    },
    now: () => 1_000
  })
  registry.registerAdapter(adapter)
  registry.acceptRunManifest({
    runtimeInstanceId: 'runtime-1',
    manifest
  })
  return {
    adapter,
    auditEvents,
    commandGrant,
    manifest,
    registry
  }
}

function productCommandEnvelope(
  harness: ReturnType<typeof createHarness>,
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
    sessionId: harness.manifest.sessionId,
    runId: harness.manifest.runId,
    manifestDigest: harness.manifest.digest,
    commandId: 'command-1',
    commandGrantId: harness.commandGrant.grantId,
    scopeDigest: digestDshProductCommandScope(harness.commandGrant.scope),
    inputDigest: digestDshProductCommandInput(payload),
    idempotencyKey: 'product-command-1',
    expectedProductVersion: 'node-v1',
    payload,
    ...overrides
  }
}
