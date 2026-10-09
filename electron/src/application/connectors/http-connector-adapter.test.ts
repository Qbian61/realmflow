import { describe, expect, it, vi } from 'vitest'
import type { EffectiveConnectorSnapshot } from './connector-gateway'
import { HttpConnectorAdapter } from './http-connector-adapter'

describe('HttpConnectorAdapter', () => {
  it('calls only the fixed origin and method with path/query parameters', async () => {
    const requestConnector = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: new TextEncoder().encode('{"items":[{"id":"doc-1"}]}'),
      retryCount: 0
    }))
    const adapter = new HttpConnectorAdapter({
      network: { requestConnector },
      resolveCredential: async () => 'secret-token'
    })

    const result = await adapter.invoke({
      snapshot: snapshot(),
      arguments: { collection: 'guides', query: 'runtime safety' },
      correlationId: 'run-1',
      causationId: 'call-1'
    })

    expect(requestConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'installation-http',
        url: 'https://docs.example.com/v1/guides?query=runtime+safety',
        method: 'GET',
        authentication: { type: 'bearer', credential: 'secret-token' }
      })
    )
    expect(result.output).toEqual({ items: [{ id: 'doc-1' }] })
  })

  it('rejects a target outside the effective network allowlist', async () => {
    const requestConnector = vi.fn()
    const value = snapshot()
    value.permissionCeiling.networkTargets = ['https://other.example.com']
    const adapter = new HttpConnectorAdapter({
      network: { requestConnector },
      resolveCredential: async () => 'secret-token'
    })

    await expect(
      adapter.invoke({
        snapshot: value,
        arguments: { collection: 'guides' },
        correlationId: 'run-1',
        causationId: 'call-1'
      })
    ).rejects.toMatchObject({ code: 'connector_target_denied' })
    expect(requestConnector).not.toHaveBeenCalled()
  })
})

function snapshot(): EffectiveConnectorSnapshot {
  return {
    capabilityId: 'connector.http',
    capabilityVersion: '1.0.0',
    capabilityDigest: 'a'.repeat(64),
    installationId: 'installation-http',
    scope: { kind: 'workspace', workspaceId: 'workspace-1' },
    credentialHandles: { token: 'vault-token' },
    permissionCeiling: {
      capabilities: ['connector.use', 'credential.use', 'network.connect'],
      maximumRisk: 'low',
      pathPrefixes: [],
      networkTargets: ['https://docs.example.com']
    },
    action: {
      id: 'search',
      name: 'Search',
      description: 'Search docs.',
      operation: 'read',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'low',
      effects: ['external.read'],
      timeoutMs: 2_000,
      maxOutputBytes: 4_096,
      protocol: {
        kind: 'http',
        baseUrl: 'https://docs.example.com',
        method: 'GET',
        pathTemplate: '/v1/{collection}',
        authentication: { type: 'bearer', credentialRef: 'token' },
        allowedRedirectOrigins: []
      }
    }
  }
}
