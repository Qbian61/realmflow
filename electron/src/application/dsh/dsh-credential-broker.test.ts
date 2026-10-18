import { describe, expect, it, vi } from 'vitest'
import type { DshRunManifestDraft } from '../../../../domain/dsh-run-manifest'
import { createDshRunManifest } from '../../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import {
  toDshCredentialLeasePersistenceSnapshot,
  type DshCredentialLease,
  type DshCredentialMaterial
} from '../../../../shared/dsh-credential-broker-contract'
import {
  DshCredentialBroker,
  type DshCredentialResolver
} from './dsh-credential-broker'

describe('DshCredentialBroker', () => {
  it('authenticates runtime, session, run, capability and operation before issuing a manifest-declared lease', async () => {
    const harness = createHarness()
    const manifest = credentialManifest('model')
    harness.broker.acceptRunManifest({
      runtimeInstanceId: 'runtime-1',
      manifest
    })

    await expect(
      harness.broker.issueLease(
        leaseRequest({
          manifestDigest: manifest.digest,
          purpose: 'model',
          credentialRef: 'credential-model',
          capabilityId: 'model:provider-openai',
          operation: 'model.invoke'
        })
      )
    ).resolves.toMatchObject({
      credentialRef: 'credential-model',
      purpose: 'model',
      runtimeInstanceId: 'runtime-1',
      sessionId: 'session-1',
      runId: 'run-1',
      capabilityId: 'model:provider-openai',
      operation: 'model.invoke',
      scopeDigest: '2'.repeat(64),
      effectDigest: '3'.repeat(64),
      expiresAt: 61_000,
      renewable: false
    })

    await expect(
      harness.broker.issueLease(
        leaseRequest({
          runtimeInstanceId: 'runtime-other',
          manifestDigest: manifest.digest,
          purpose: 'model',
          credentialRef: 'credential-model',
          capabilityId: 'model:provider-openai',
          operation: 'model.invoke'
        })
      )
    ).rejects.toThrow(/run binding/i)
    await expect(
      harness.broker.issueLease(
        leaseRequest({
          manifestDigest: manifest.digest,
          purpose: 'model',
          credentialRef: 'credential-undeclared',
          capabilityId: 'model:provider-openai',
          operation: 'model.invoke'
        })
      )
    ).rejects.toThrow(/credential reference/i)
    await expect(
      harness.broker.issueLease(
        leaseRequest({
          manifestDigest: manifest.digest,
          purpose: 'model',
          credentialRef: 'credential-model',
          capabilityId: 'connector-docs',
          operation: 'model.invoke'
        })
      )
    ).rejects.toThrow(/capability/i)
    await expect(
      harness.broker.issueLease(
        leaseRequest({
          manifestDigest: manifest.digest,
          purpose: 'model',
          credentialRef: 'credential-model',
          capabilityId: 'model:provider-openai',
          operation: 'connector.call'
        })
      )
    ).rejects.toThrow(/operation/i)
    expect(harness.resolver.resolve).not.toHaveBeenCalled()
  })

  it('mints a short-lived least-privilege lease and exchanges credential material once without persisting durable secrets', async () => {
    const harness = createHarness()
    const manifest = credentialManifest('model')
    harness.broker.acceptRunManifest({
      runtimeInstanceId: 'runtime-1',
      manifest
    })

    const lease = await harness.broker.issueLease(
      leaseRequest({
        manifestDigest: manifest.digest,
        purpose: 'model',
        credentialRef: 'credential-model',
        capabilityId: 'model:provider-openai',
        operation: 'model.invoke',
        requestedTtlMs: 300_000
      })
    )
    const serializedLease = JSON.stringify(lease)
    expect(serializedLease).not.toContain('sk-live-secret')
    expect(serializedLease).not.toContain('tenant-secret')
    expect(lease.expiresAt).toBe(61_000)
    expect(lease.exchangeToken).toBe('lease-token-1')
    expect(
      JSON.stringify(toDshCredentialLeasePersistenceSnapshot(lease))
    ).toEqual(expect.not.stringContaining('lease-token-1'))

    const material = await harness.broker.exchangeLease(
      exchangeRequest(lease)
    )

    expect(material).toEqual({
      schemaVersion: 1,
      leaseId: 'lease-1',
      credentialRef: 'credential-model',
      purpose: 'model',
      operation: 'model.invoke',
      material: {
        apiKey: 'sk-live-secret',
        customHeaders: {
          'X-Tenant': 'tenant-secret'
        }
      },
      expiresAt: 61_000
    } satisfies DshCredentialMaterial)
    expect(harness.resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialRef: 'credential-model',
        purpose: 'model',
        operation: 'model.invoke',
        capabilityId: 'model:provider-openai'
      })
    )
    await expect(
      harness.broker.exchangeLease(exchangeRequest(lease))
    ).rejects.toThrow(/consumed/i)
    expect(JSON.stringify(harness.auditEvents)).not.toContain('sk-live-secret')
    expect(JSON.stringify(harness.auditEvents)).not.toContain('tenant-secret')
  })

  it('supports provider, MCP, Connector, Web and product-service credential purposes through the same broker contract', async () => {
    const harness = createHarness()
    const manifest = createDshRunManifest({
      model: {
        kind: 'model',
        providerId: 'provider-openai',
        providerType: 'openai_responses',
        profileId: 'profile-openai',
        modelId: 'gpt-5',
        credentialRef: 'credential-model',
        options: {}
      },
      tools: [
        webTool(),
        {
          kind: 'tool',
          id: 'builtin.product.service',
          version: '1.0.0',
          definitionDigest: 'a'.repeat(64),
          package: {
            packageId: 'realmflow.builtin.product',
            version: '1.0.0',
            digest: 'b'.repeat(64)
          },
          entrypoint: {
            kind: 'builtin',
            handler: 'product.service',
            handlerVersion: '1.0.0'
          },
          capabilities: ['credential.use'],
          risk: 'medium'
        }
      ],
      mcpServers: [
        {
          kind: 'mcp-server',
          id: 'mcp.docs',
          identityDigest: '2'.repeat(64),
          transport: {
            kind: 'streamable_http',
            url: 'https://mcp.example.com'
          },
          credentialRefs: ['credential-mcp']
        }
      ],
      connectors: [
        {
          kind: 'connector',
          id: 'connector-docs',
          type: 'http',
          baseUrl: 'https://api.example.com',
          adapter: {
            adapterId: 'realmflow.http',
            version: '1.0.0',
            digest: '3'.repeat(64),
            entrypoint: 'connectors/http.js'
          },
          authentication: {
            kind: 'credential-reference',
            ref: 'credential-connector'
          }
        }
      ],
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-model',
          purpose: 'model'
        },
        {
          kind: 'credential-reference',
          ref: 'credential-mcp',
          purpose: 'mcp'
        },
        {
          kind: 'credential-reference',
          ref: 'credential-connector',
          purpose: 'connector'
        },
        {
          kind: 'credential-reference',
          ref: 'credential-web',
          purpose: 'web'
        },
        {
          kind: 'credential-reference',
          ref: 'credential-product',
          purpose: 'product-service'
        }
      ]
    } as Partial<DshRunManifestDraft>)
    harness.broker.acceptRunManifest({
      runtimeInstanceId: 'runtime-1',
      manifest
    })

    const cases = [
      ['model', 'credential-model', 'model:provider-openai', 'model.invoke'],
      ['mcp', 'credential-mcp', 'mcp.docs', 'mcp.connect'],
      ['connector', 'credential-connector', 'connector-docs', 'connector.call'],
      ['web', 'credential-web', 'builtin.web.search', 'web.search'],
      [
        'product-service',
        'credential-product',
        'builtin.product.service',
        'product-service.call'
      ]
    ] as const

    for (const [purpose, credentialRef, capabilityId, operation] of cases) {
      const lease = await harness.broker.issueLease(
        leaseRequest({
          manifestDigest: manifest.digest,
          purpose,
          credentialRef,
          capabilityId,
          operation
        })
      )
      await harness.broker.exchangeLease(exchangeRequest(lease))
    }

    expect(
      harness.resolver.resolve.mock.calls.map(([request]) => [
        request.purpose,
        request.credentialRef,
        request.capabilityId,
        request.operation
      ])
    ).toEqual(cases.map((item) => [...item]))
  })

  it('redacts resolver failures before returning errors or audit diagnostics', async () => {
    const harness = createHarness({
      material: async () => {
        throw new Error(
          'vault read failed with Authorization: Bearer sk-live-secret'
        )
      }
    })
    const manifest = credentialManifest('model')
    harness.broker.acceptRunManifest({
      runtimeInstanceId: 'runtime-1',
      manifest
    })
    const lease = await harness.broker.issueLease(
      leaseRequest({
        manifestDigest: manifest.digest,
        purpose: 'model',
        credentialRef: 'credential-model',
        capabilityId: 'model:provider-openai',
        operation: 'model.invoke'
      })
    )

    await expect(
      harness.broker.exchangeLease(exchangeRequest(lease))
    ).rejects.toThrow(/Authorization: \[redacted\]/)
    await expect(
      harness.broker.exchangeLease(exchangeRequest(lease))
    ).rejects.not.toThrow(/sk-live-secret/)
    expect(JSON.stringify(harness.auditEvents)).not.toContain('sk-live-secret')
  })

  it('revokes active leases on session, run, credential, and runtime teardown', async () => {
    const harness = createHarness()
    const manifest = credentialManifest('model')
    harness.broker.acceptRunManifest({
      runtimeInstanceId: 'runtime-1',
      manifest
    })
    const lease = await harness.broker.issueLease(
      leaseRequest({
        manifestDigest: manifest.digest,
        purpose: 'model',
        credentialRef: 'credential-model',
        capabilityId: 'model:provider-openai',
        operation: 'model.invoke'
      })
    )

    expect(
      harness.broker.revokeLeases({
        sessionId: 'session-1',
        reason: 'session_closed'
      })
    ).toBe(1)
    await expect(
      harness.broker.exchangeLease(exchangeRequest(lease))
    ).rejects.toThrow(/revoked/i)

    const leaseAfterSession = await harness.broker.issueLease(
      leaseRequest({
        manifestDigest: manifest.digest,
        purpose: 'model',
        credentialRef: 'credential-model',
        capabilityId: 'model:provider-openai',
        operation: 'model.invoke'
      })
    )
    expect(
      harness.broker.revokeLeases({
        runtimeInstanceId: 'runtime-1',
        runId: 'run-1',
        credentialRef: 'credential-model',
        reason: 'account_revoked'
      })
    ).toBe(1)
    await expect(
      harness.broker.exchangeLease(exchangeRequest(leaseAfterSession))
    ).rejects.toThrow(/revoked/i)
  })
})

function createHarness(
  options: {
    material?: () => Promise<DshCredentialMaterial['material']>
  } = {}
) {
  const auditEvents: unknown[] = []
  const resolve = vi.fn<DshCredentialResolver['resolve']>(async () => ({
    apiKey: 'sk-live-secret',
    customHeaders: {
      'X-Tenant': 'tenant-secret'
    },
    ...(options.material ? await options.material() : {})
  }))
  const resolver = {
    resolve
  }
  const broker = new DshCredentialBroker({
    resolver,
    audit: {
      record: vi.fn(async (event) => {
        auditEvents.push(event)
      })
    },
    now: () => 1_000,
    createLeaseId: () => `lease-${auditEvents.length + 1}`,
    createExchangeToken: () => `lease-token-${auditEvents.length + 1}`,
    maxLeaseTtlMs: 60_000
  })
  return {
    auditEvents,
    broker,
    resolver
  }
}

function credentialManifest(purpose: 'model') {
  return createDshRunManifest({
    model: {
      kind: 'model',
      providerId: 'provider-openai',
      providerType: 'openai_responses',
      profileId: 'profile-openai',
      modelId: 'gpt-5',
      credentialRef: 'credential-model',
      options: {}
    },
    credentialReferences: [
      {
        kind: 'credential-reference',
        ref: 'credential-model',
        purpose
      }
    ]
  })
}

function leaseRequest(
  overrides: Partial<Parameters<DshCredentialBroker['issueLease']>[0]> = {}
): Parameters<DshCredentialBroker['issueLease']>[0] {
  return {
    schemaVersion: 1,
    runtimeInstanceId: 'runtime-1',
    sessionId: 'session-1',
    runId: 'run-1',
    manifestDigest: '1'.repeat(64),
    credentialRef: 'credential-model',
    purpose: 'model',
    capabilityId: 'model:provider-openai',
    operation: 'model.invoke',
    scopeDigest: '2'.repeat(64),
    effectDigest: '3'.repeat(64),
    ...overrides
  }
}

function exchangeRequest(
  lease: DshCredentialLease
): Parameters<DshCredentialBroker['exchangeLease']>[0] {
  return {
    schemaVersion: 1,
    runtimeInstanceId: lease.runtimeInstanceId,
    sessionId: lease.sessionId,
    runId: lease.runId,
    manifestDigest: lease.manifestDigest,
    leaseId: lease.leaseId,
    exchangeToken: lease.exchangeToken,
    credentialRef: lease.credentialRef,
    purpose: lease.purpose,
    capabilityId: lease.capabilityId,
    operation: lease.operation,
    scopeDigest: lease.scopeDigest,
    effectDigest: lease.effectDigest
  }
}

function webTool() {
  return {
    kind: 'tool' as const,
    id: 'builtin.web.search',
    version: '1.0.0',
    definitionDigest: 'c'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.web',
      version: '1.0.0',
      digest: 'd'.repeat(64)
    },
    entrypoint: {
      kind: 'builtin' as const,
      handler: 'web.search',
      handlerVersion: '1.0.0'
    },
    capabilities: ['network.connect' as const, 'credential.use' as const],
    risk: 'medium' as const
  }
}
