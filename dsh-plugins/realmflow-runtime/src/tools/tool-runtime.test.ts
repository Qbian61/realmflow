import { describe, expect, it, vi } from 'vitest'
import type {
  DshRunManifest,
  DshRunManifestDraft,
  ExecutableToolManifest,
  ProductCommandGrant
} from '../../../../domain/dsh-run-manifest'
import { createDshRunManifest, createDshRunManifestDraft } from '../test-manifest-fixture'
import {
  DshToolRuntime,
  type DshToolHandler,
  type DshToolRuntimeEvent
} from './tool-runtime'

describe('DshToolRuntime', () => {
  it('executes only a manifest-declared DSH handler and emits lifecycle events', async () => {
    const manifest = createDshRunManifest()
    const events: DshToolRuntimeEvent[] = []
    const handler = vi.fn(async (input, context) => {
      expect(input).toEqual({ path: '/workspace/brief.md' })
      expect(context.tool).toBe(manifest.tools[0])
      expect(context.source).toBe('dsh-native')
      expect(context.signal.aborted).toBe(false)
      return { content: 'brief' }
    })
    const runtime = new DshToolRuntime({
      manifest,
      handlers: [
        dshHandler('builtin.files.read', handler, {
          inputSchema: objectSchema(['path']),
          outputSchema: objectSchema(['content'])
        })
      ],
      emitEvent: (event) => events.push(event)
    })

    const result = await runtime.execute({
      toolId: 'builtin.files.read',
      callId: 'call-1',
      idempotencyKey: 'idem-1',
      input: { path: '/workspace/brief.md' }
    })

    expect(result).toEqual({
      callId: 'call-1',
      toolId: 'builtin.files.read',
      output: { content: 'brief' },
      replayed: false
    })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.kind)).toEqual([
      'tool.started',
      'tool.succeeded'
    ])
    expect(events[0]).toMatchObject({
      manifestDigest: manifest.digest,
      runId: manifest.runId,
      sessionId: manifest.sessionId,
      toolId: 'builtin.files.read',
      callId: 'call-1'
    })
  })

  it('rejects undeclared tools before a handler can run', async () => {
    const manifest = createDshRunManifest()
    const handler = vi.fn(async () => ({ ok: true }))
    const events: DshToolRuntimeEvent[] = []
    const runtime = new DshToolRuntime({
      manifest,
      handlers: [dshHandler('builtin.files.write', handler)],
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.execute({
        toolId: 'builtin.files.write',
        callId: 'call-1',
        idempotencyKey: 'idem-1',
        input: { path: '/workspace/out.md' }
      })
    ).rejects.toThrow(/tool is not declared/i)

    expect(handler).not.toHaveBeenCalled()
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'tool.denied',
        toolId: 'builtin.files.write',
        reason: 'tool is not declared'
      })
    ])
  })

  it('enforces source-matrix ownership and rejects RealmFlow executor fallback handlers', async () => {
    const nativeManifest = createDshRunManifest()
    const nativeAsPlugin = new DshToolRuntime({
      manifest: nativeManifest,
      handlers: [
        {
          ...dshHandler('builtin.files.read', async () => ({ ok: true })),
          source: 'rf-dsh-plugin'
        }
      ]
    })

    await expect(
      nativeAsPlugin.execute({
        toolId: 'builtin.files.read',
        callId: 'call-1',
        idempotencyKey: 'idem-1',
        input: {}
      })
    ).rejects.toThrow(/already provided by DSH/i)

    const rfManifest = manifestWithTool({
      id: 'builtin.files.trash',
      capabilities: ['filesystem.delete'],
      risk: 'high'
    })
    const rfHandler = vi.fn(async () => ({ trashed: true }))
    const rfRuntime = new DshToolRuntime({
      manifest: rfManifest,
      handlers: [
        {
          ...dshHandler('builtin.files.trash', rfHandler),
          source: 'rf-dsh-plugin'
        }
      ]
    })

    await expect(
      rfRuntime.execute({
        toolId: 'builtin.files.trash',
        callId: 'call-2',
        idempotencyKey: 'idem-2',
        input: { path: '/workspace/old.md' }
      })
    ).resolves.toMatchObject({ output: { trashed: true } })

    const realmflowExecutor = new DshToolRuntime({
      manifest: rfManifest,
      handlers: [
        {
          ...dshHandler('builtin.files.trash', async () => ({ ok: true })),
          source: 'realmflow-executor'
        }
      ]
    })

    await expect(
      realmflowExecutor.execute({
        toolId: 'builtin.files.trash',
        callId: 'call-3',
        idempotencyKey: 'idem-3',
        input: {}
      })
    ).rejects.toThrow(/RealmFlow executor fallback is forbidden/i)
  })

  it('validates schemas, approval, credential leases, product commands, and idempotency', async () => {
    const command = productCommand('realmflow.node.todo.manage')
    const manifest = manifestWithTool(
      {
        id: 'builtin.realmflow.node.todo.manage',
        capabilities: ['realmflow.write'],
        risk: 'high'
      },
      {
        policy: {
          ...createDshRunManifestDraft().policy,
          approvalMode: 'manual'
        },
        productCommands: [command],
        credentialReferences: [
          {
            kind: 'credential-reference',
            ref: 'credential-product-command',
            purpose: 'product-command'
          }
        ]
      }
    )
    const interactionBridge = {
      requestPermission: vi.fn(async () => ({ decision: 'allow' as const }))
    }
    const credentialBroker = {
      resolve: vi.fn(async () => ({
        leaseId: 'lease-1',
        ref: 'credential-product-command',
        purpose: 'product-command' as const,
        expiresAt: 9_999
      }))
    }
    const productCommandClient = {
      execute: vi.fn(async () => ({ updated: true }))
    }
    const handler = vi.fn(async (input, context) => {
      expect(context.credentials.get('credential-product-command')).toMatchObject({
        leaseId: 'lease-1'
      })
      const mutation = await context.productCommands.execute(
        'realmflow.node.todo.manage',
        { todoId: (input as { todoId: string }).todoId }
      )
      return { ok: true, mutation }
    })
    const events: DshToolRuntimeEvent[] = []
    const runtime = new DshToolRuntime({
      manifest,
      handlers: [
        {
          ...dshHandler('builtin.realmflow.node.todo.manage', handler, {
            inputSchema: objectSchema(['todoId']),
            outputSchema: objectSchema(['ok', 'mutation'])
          }),
          source: 'rf-dsh-plugin',
          requiredCredentials: [
            {
              ref: 'credential-product-command',
              purpose: 'product-command'
            }
          ]
        }
      ],
      interactionBridge,
      credentialBroker,
      productCommandClient,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.execute({
        toolId: 'builtin.realmflow.node.todo.manage',
        callId: 'call-invalid',
        idempotencyKey: 'idem-invalid',
        input: {}
      })
    ).rejects.toThrow(/input schema/i)
    expect(handler).not.toHaveBeenCalled()

    const first = await runtime.execute({
      toolId: 'builtin.realmflow.node.todo.manage',
      callId: 'call-1',
      idempotencyKey: 'idem-1',
      input: { todoId: 'todo-1' }
    })
    const second = await runtime.execute({
      toolId: 'builtin.realmflow.node.todo.manage',
      callId: 'call-2',
      idempotencyKey: 'idem-1',
      input: { todoId: 'todo-1' }
    })

    expect(first.output).toEqual({
      ok: true,
      mutation: { updated: true }
    })
    expect(second).toMatchObject({
      output: first.output,
      replayed: true
    })
    expect(interactionBridge.requestPermission).toHaveBeenCalledTimes(1)
    expect(credentialBroker.resolve).toHaveBeenCalledTimes(1)
    expect(productCommandClient.execute).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.kind)).toContain('tool.replayed')
  })
})

function dshHandler(
  toolId: string,
  execute: DshToolHandler['execute'],
  overrides: Partial<DshToolHandler> = {}
): DshToolHandler {
  return {
    toolId,
    source: 'dsh-native',
    inputSchema: true,
    outputSchema: true,
    execute,
    ...overrides
  }
}

function objectSchema(required: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties: Object.fromEntries(
      required.map((property) => [property, {}])
    )
  }
}

function manifestWithTool(
  tool: {
    id: string
    capabilities: ExecutableToolManifest['capabilities']
    risk: ExecutableToolManifest['risk']
  },
  overrides: Partial<DshRunManifestDraft> = {}
): DshRunManifest {
  const draft = createDshRunManifestDraft()
  return createDshRunManifest({
    tools: [
      {
        ...draft.tools[0],
        id: tool.id,
        definitionDigest: '9'.repeat(64),
        package: {
          packageId: `realmflow.${tool.id.replaceAll('.', '-')}`,
          version: '1.0.0',
          digest: 'b'.repeat(64)
        },
        capabilities: tool.capabilities,
        risk: tool.risk
      }
    ],
    policy: {
      ...draft.policy,
      maximumRisk: 'critical'
    },
    ...overrides
  })
}

function productCommand(command: string): ProductCommandGrant {
  return {
    kind: 'product-command',
    grantId: `grant-${command.replaceAll('.', '-')}`,
    command,
    scope: {
      kind: 'workspace',
      workspaceId: 'workspace-1'
    },
    inputSchemaDigest: '8'.repeat(64),
    maxInvocations: 8
  }
}
