import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type {
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolAdapter,
  ToolExecutionContext
} from './tool-adapter'
import { ToolAdapterRegistry } from './tool-adapter-registry'

const context: ToolExecutionContext = {
  owner: { type: 'application', id: 'realmflow' },
  correlationId: 'correlation-1',
  causationId: 'command-1'
}

const invocation: PreparedToolInvocation = {
  executionId: 'execution-1',
  idempotencyKey: 'request-1',
  attemptId: 'attempt-1',
  attempt: 1,
  requestedBy: { type: 'user', id: 'local-user' },
  arguments: { path: 'README.md' },
  scopeRoots: ['/workspace'],
  connectorGrants: []
}

describe('ToolAdapterRegistry', () => {
  it('routes the full adapter lifecycle by definition and binding kind', async () => {
    const adapter = createAdapter('builtin')
    const registry = new ToolAdapterRegistry([adapter])
    const definition = definitionFor('builtin')
    const binding = await registry.resolve(definition, context)
    const sink = { emit: vi.fn().mockResolvedValue(undefined) }
    const signal = new AbortController().signal

    await expect(registry.prepare(binding, invocation)).resolves.toEqual({
      outcome: 'ready'
    })
    await expect(registry.planEffects(binding, invocation)).resolves.toEqual({
      outcome: 'planned',
      effects: []
    })
    await expect(
      registry.execute(binding, invocation, sink, signal)
    ).resolves.toMatchObject({ outcome: 'succeeded' })
    await expect(registry.health('builtin')).resolves.toEqual({
      status: 'ready'
    })
    await expect(
      registry.cancel(binding, invocation.attemptId)
    ).resolves.toBe(true)

    expect(adapter.resolve).toHaveBeenCalledWith(definition, context)
    expect(adapter.prepare).toHaveBeenCalledWith(binding, invocation)
    expect(adapter.planEffects).toHaveBeenCalledWith(binding, invocation)
    expect(adapter.execute).toHaveBeenCalledWith(
      binding,
      invocation,
      sink,
      signal
    )
    expect(adapter.cancel).toHaveBeenCalledWith(binding, 'attempt-1')
  })

  it('reports false when an adapter does not support cancellation', async () => {
    const adapter = createAdapter('sandbox')
    delete (adapter as Partial<ToolAdapter>).cancel
    const registry = new ToolAdapterRegistry([adapter])

    await expect(
      registry.cancel(bindingFor('sandbox'), 'attempt-1')
    ).resolves.toBe(false)
  })

  it('fails closed when an adapter has no effect planner', async () => {
    const adapter = createAdapter('sandbox')
    delete (adapter as Partial<ToolAdapter>).planEffects
    const registry = new ToolAdapterRegistry([adapter])

    await expect(
      registry.planEffects(bindingFor('sandbox'), invocation)
    ).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message: 'Tool effects could not be resolved',
        retryable: false
      }
    })
  })

  it('rejects duplicate adapter kinds', () => {
    expect(
      () =>
        new ToolAdapterRegistry([
          createAdapter('builtin'),
          createAdapter('builtin')
        ])
    ).toThrow('Tool adapter kind is already registered: builtin')
  })

  it('rejects definitions and bindings without a registered adapter', async () => {
    const registry = new ToolAdapterRegistry()

    await expect(
      registry.resolve(definitionFor('computer'), context)
    ).rejects.toThrow('Tool adapter is not registered: computer')
    await expect(
      registry.prepare(bindingFor('mcp'), invocation)
    ).rejects.toThrow('Tool adapter is not registered: mcp')
  })

  it('closes every lifecycle-aware adapter even when one close fails', async () => {
    const first = {
      ...createAdapter('builtin'),
      close: vi.fn().mockRejectedValue(new Error('close failed'))
    }
    const second = {
      ...createAdapter('sandbox'),
      close: vi.fn().mockResolvedValue(undefined)
    }
    const registry = new ToolAdapterRegistry([first, second])

    await expect(registry.close()).rejects.toThrow('close failed')
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
  })
})

function createAdapter(kind: ToolAdapter['kind']) {
  const binding = bindingFor(kind)
  return {
    kind,
    resolve: vi.fn().mockResolvedValue(binding),
    prepare: vi.fn().mockResolvedValue({ outcome: 'ready' }),
    planEffects: vi.fn().mockResolvedValue({
      outcome: 'planned',
      effects: []
    }),
    execute: vi.fn().mockResolvedValue({
      outcome: 'succeeded',
      output: { ok: true },
      metrics: { durationMs: 1, outputBytes: 11 }
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ status: 'ready' })
  } satisfies ToolAdapter
}

function bindingFor(kind: ToolAdapter['kind']): ResolvedToolBinding {
  return {
    definitionId: `example.${kind}`,
    definitionVersion: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    adapterKind: kind,
    bindingId: `binding-${kind}`,
    opaqueRuntimeHandle: {}
  }
}

function definitionFor(
  kind: ToolAdapter['kind']
): ToolDefinition {
  const executor: ToolDefinition['executor'] =
    kind === 'builtin'
      ? {
          kind,
          handler: 'files.read',
          handlerVersion: '1.0.0'
        }
      : kind === 'sandbox'
        ? { kind, runtime: 'python', entryPath: 'main.py' }
        : kind === 'mcp'
          ? {
              kind,
              serverRef: 'server.local',
              remoteToolName: 'search',
              protocolVersion: '2026-01-01'
            }
          : kind === 'connector'
            ? {
                kind,
                capabilityId: 'example.connector',
                capabilityVersion: '1.0.0',
                capabilityDigest: 'c'.repeat(64),
                actionId: 'search'
              }
          : {
              kind,
              actionSet: 'desktop',
              actionSetVersion: '1.0.0'
            }
  return {
    schemaVersion: 1,
    id: `example.${kind}`,
    version: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    package: {
      packageId: 'example.package',
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64)
    },
    origin: 'builtin',
    name: 'Example',
    description: '',
    tags: [],
    executor,
    inputSchema: {},
    outputSchema: {},
    capabilities: [],
    effects: [],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
      maxAttempts: 1
    },
    discovery: { intents: [], contexts: ['general'] }
  }
}
