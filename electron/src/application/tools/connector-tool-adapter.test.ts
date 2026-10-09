import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { EffectiveConnectorSnapshot } from '../connectors/connector-gateway'
import type {
  PreparedToolInvocation,
  ToolExecutionContext
} from './tool-adapter'
import { ConnectorToolAdapter } from './connector-tool-adapter'

describe('ConnectorToolAdapter', () => {
  it('binds an immutable scoped snapshot and executes it through the Gateway', async () => {
    const snapshot = connectorSnapshot()
    const gateway = {
      execute: vi.fn().mockResolvedValue({
        outcome: 'succeeded',
        output: { results: ['RealmFlow'] }
      })
    }
    const adapter = new ConnectorToolAdapter({
      snapshots: {
        resolve: vi.fn().mockResolvedValue(snapshot)
      },
      gateway
    })
    const binding = await adapter.resolve(definition(), context())

    await expect(adapter.prepare(binding, invocation())).resolves.toEqual({
      outcome: 'ready'
    })
    await expect(adapter.planEffects(binding, invocation())).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'external',
          capability: 'connector.use',
          resourceKey: `${snapshot.installationId}:${snapshot.action.id}`
        }
      ]
    })
    await expect(
      adapter.execute(
        binding,
        invocation(),
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toEqual({
      outcome: 'succeeded',
      output: { results: ['RealmFlow'] },
      metrics: { durationMs: expect.any(Number), outputBytes: 25 }
    })
    expect(gateway.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot,
        arguments: { query: 'realmflow' },
        idempotencyKey: 'execution-1',
        permissionGranted: true
      })
    )
  })

  it('rejects a stale or out-of-scope capability snapshot before dispatch', async () => {
    const gateway = { execute: vi.fn() }
    const adapter = new ConnectorToolAdapter({
      snapshots: {
        resolve: vi.fn().mockResolvedValue({
          ...connectorSnapshot(),
          capabilityDigest: 'f'.repeat(64)
        })
      },
      gateway
    })

    await expect(adapter.resolve(definition(), context())).rejects.toThrow(
      'Connector capability snapshot is unavailable'
    )
    expect(gateway.execute).not.toHaveBeenCalled()
  })

  it('maps permission waiting, unknown outcomes, and cancellation without leaking details', async () => {
    const gateway = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          outcome: 'permission_required',
          permission: {
            capability: 'connector.use',
            effect: 'external.write',
            actionId: 'search'
          }
        })
        .mockResolvedValueOnce({
          outcome: 'outcome_unknown',
          error: {
            code: 'connector_outcome_unknown',
            message: 'Connector write outcome is unknown',
            retryable: false
          }
        })
    }
    const adapter = new ConnectorToolAdapter({
      snapshots: { resolve: vi.fn().mockResolvedValue(connectorSnapshot()) },
      gateway
    })
    const binding = await adapter.resolve(definition(), context())

    await expect(
      adapter.execute(
        binding,
        invocation(),
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'connector_permission_required' }
    })
    await expect(
      adapter.execute(
        binding,
        invocation(),
        { emit: vi.fn() },
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'interrupted',
      error: { code: 'connector_outcome_unknown' }
    })

    const controller = new AbortController()
    controller.abort()
    await expect(
      adapter.execute(binding, invocation(), { emit: vi.fn() }, controller.signal)
    ).resolves.toMatchObject({
      outcome: 'cancelled',
      error: { code: 'tool_cancelled' }
    })
  })
})

function definition(): ToolDefinition {
  return {
    schemaVersion: 1,
    id: 'com.example.docs.search',
    version: '1.0.0',
    definitionDigest: 'd'.repeat(64),
    package: {
      packageId: 'com.example.docs',
      packageVersion: '1.0.0',
      packageDigest: 'a'.repeat(64)
    },
    origin: 'local_upload',
    name: 'Search docs',
    description: 'Search documentation.',
    tags: ['connector', 'http'],
    executor: {
      kind: 'connector',
      capabilityId: 'com.example.docs',
      capabilityVersion: '1.0.0',
      capabilityDigest: 'b'.repeat(64),
      actionId: 'search'
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['connector.use', 'network.connect'],
    effects: ['external.read'],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'none',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 5_000,
      maxOutputBytes: 16_384,
      maxAttempts: 1
    },
    discovery: {
      intents: ['Search docs'],
      contexts: ['general', 'space', 'requirement', 'workflow']
    }
  }
}

function connectorSnapshot(): EffectiveConnectorSnapshot {
  return {
    capabilityId: 'com.example.docs',
    capabilityVersion: '1.0.0',
    capabilityDigest: 'b'.repeat(64),
    installationId: 'installation.docs',
    scope: { kind: 'workspace', workspaceId: 'workspace-1' },
    action: {
      id: 'search',
      name: 'Search docs',
      description: 'Search documentation.',
      operation: 'read',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'low',
      effects: ['external.read'],
      timeoutMs: 5_000,
      maxOutputBytes: 16_384,
      protocol: {
        kind: 'http',
        baseUrl: 'https://docs.example.com',
        method: 'GET',
        pathTemplate: '/search',
        authentication: { type: 'none' },
        allowedRedirectOrigins: []
      }
    },
    credentialHandles: {},
    permissionCeiling: {
      capabilities: ['connector.use', 'network.connect'],
      maximumRisk: 'low',
      pathPrefixes: [],
      networkTargets: ['https://docs.example.com']
    }
  }
}

function context(): ToolExecutionContext {
  return {
    owner: { type: 'conversation', id: 'conversation-1' },
    workspaceId: 'workspace-1',
    conversationId: 'conversation-1',
    correlationId: 'correlation-1',
    causationId: 'causation-1'
  }
}

function invocation(): PreparedToolInvocation {
  return {
    executionId: 'execution-1',
    idempotencyKey: 'request-1',
    attemptId: 'attempt-1',
    attempt: 1,
    requestedBy: { type: 'model', id: 'model-1' },
    arguments: { query: 'realmflow' },
    scopeRoots: [],
    connectorGrants: []
  }
}
