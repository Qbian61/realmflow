import { vi } from 'vitest'
import { createConnector } from '../../../../domain/connector'
import { ConnectorRequestError } from '../../network/network-gateway'
import type {
  ConnectorStore,
  StoredConnectorCredential
} from './connector-store'
import { ConnectorService } from './connector-service'

describe('ConnectorService', () => {
  it('resolves every declared Skill service exactly once without credentials', async () => {
    const current = connectorRecord({
      connector: {
        ...connectorRecord().connector,
        validation: {
          status: 'available',
          checkedAt: 90,
          message: 'Connector is available'
        }
      }
    })
    const store = storeMock({ current })
    const vault = vaultMock()
    const service = createService({ store, vault })

    await expect(
      service.resolveSkillBindings({
        services: ['docs'],
        bindings: [{ service: 'docs', connectorId: 'connector-docs' }]
      })
    ).resolves.toEqual([
      {
        service: 'docs',
        connectorId: 'connector-docs',
        connectorRevision: 1
      }
    ])
    await expect(
      service.resolveSkillBindings({
        services: ['docs'],
        bindings: [
          { service: 'docs', connectorId: 'connector-docs' },
          { service: 'docs', connectorId: 'connector-other' }
        ]
      })
    ).rejects.toThrow('Skill Connector bindings are invalid')
    expect(store.getCredential).not.toHaveBeenCalled()
    expect(vault.decrypt).not.toHaveBeenCalled()
  })

  it.each([
    {
      enabled: false,
      validation: {
        status: 'available' as const,
        checkedAt: 90,
        message: 'Connector is available'
      }
    },
    {
      enabled: true,
      validation: {
        status: 'unavailable' as const,
        checkedAt: 90,
        message: 'Connector is unavailable'
      }
    }
  ])(
    'rejects disabled or unavailable Skill Connector bindings',
    async ({ enabled, validation }) => {
      const current = connectorRecord({
        connector: {
          ...connectorRecord().connector,
          enabled,
          validation
        }
      })
      const store = storeMock({ current })
      const vault = vaultMock()
      const service = createService({ store, vault })

      await expect(
        service.resolveSkillBindings({
          services: ['docs'],
          bindings: [
            { service: 'docs', connectorId: 'connector-docs' }
          ]
        })
      ).rejects.toThrow(/Connector is (disabled|unavailable)/)
      expect(store.getCredential).not.toHaveBeenCalled()
      expect(vault.decrypt).not.toHaveBeenCalled()
    }
  )

  it('authorizes a stable available Connector without decrypting until forwarding', async () => {
    const current = connectorRecord({
      connector: {
        ...connectorRecord().connector,
        validation: {
          status: 'available',
          checkedAt: 90,
          message: 'Connector is available'
        }
      }
    })
    const store = storeMock({ current })
    const vault = vaultMock()
    const network = networkMock()
    network.authorizeSkillConnector.mockImplementation((input) => ({
      service: input.service,
      url: 'http://127.0.0.1:43210/v1/skills/connectors/docs',
      token: 'skill-connector-grant'
    }))
    const service = createService({ store, vault, network })

    const grant = await service.authorizeSkillService({
      executionId: 'execution-1',
      service: 'docs',
      connectorId: 'connector-docs',
      allowedConnectorIds: ['connector-docs'],
      expectedRevision: 1,
      owner: { type: 'requirement', id: 'requirement-1' },
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1'
    })

    expect(grant).toEqual({
      service: 'docs',
      url: 'http://127.0.0.1:43210/v1/skills/connectors/docs',
      token: 'skill-connector-grant'
    })
    expect(store.getCredential).not.toHaveBeenCalled()
    expect(vault.decrypt).not.toHaveBeenCalled()

    const authorizeInput =
      network.authorizeSkillConnector.mock.calls[0]?.[0]
    await authorizeInput?.invoke({
      path: '/document/1',
      method: 'GET',
      idempotencyKey: 'skill-proxy-1',
      signal: new AbortController().signal
    })

    expect(store.get).toHaveBeenLastCalledWith('connector-docs')
    expect(store.getCredential).toHaveBeenCalledWith('connector-docs')
    expect(network.requestConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document/1',
        owner: { type: 'requirement', id: 'requirement-1' },
        callType: 'connector',
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1'
      })
    )
  })

  it('revokes a Skill Connector grant through the network gateway', () => {
    const network = networkMock()
    const service = createService({ network })
    const grant = {
      service: 'docs',
      url: 'http://127.0.0.1:43210/v1/skills/connectors/docs',
      token: 'skill-connector-grant'
    }

    service.revokeSkillConnector(grant)

    expect(network.revokeSkillConnector).toHaveBeenCalledWith(grant)
  })

  it('gets a secret-free connector record without reading credentials', async () => {
    const current = connectorRecord()
    const store = storeMock({ current })
    const vault = vaultMock()
    const service = createService({ store, vault })

    await expect(service.get('connector-docs')).resolves.toEqual(current)
    expect(store.getCredential).not.toHaveBeenCalled()
    expect(vault.decrypt).not.toHaveBeenCalled()
  })

  it('rejects a missing connector lookup without reading credentials', async () => {
    const store = storeMock()
    const vault = vaultMock()
    const service = createService({ store, vault })

    await expect(service.get('missing')).rejects.toThrow('Connector not found')
    expect(store.getCredential).not.toHaveBeenCalled()
    expect(vault.decrypt).not.toHaveBeenCalled()
  })

  it('normalizes configuration and encrypts a new credential before saving', async () => {
    const store = storeMock()
    const vault = vaultMock()
    const service = createService({ store, vault })

    const result = await service.save({
      id: 'connector-docs',
      name: ' Docs ',
      type: 'http',
      baseUrl: 'https://docs.example.com/api/',
      authentication: { type: 'bearer' },
      enabled: true,
      timeoutMs: 5000,
      maxRetries: 1,
      credential: 'bearer-secret',
      expectedRevision: 0,
      idempotencyKey: 'save-1'
    })

    expect(vault.encrypt).toHaveBeenCalledWith('bearer-secret')
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: expect.objectContaining({
          id: 'connector-docs',
          name: 'Docs',
          baseUrl: 'https://docs.example.com/api',
          revision: 1
        }),
        expectedRevision: 0,
        credential: expect.objectContaining({
          encryptedValue: new Uint8Array([1, 2, 3]),
          createdAt: 100,
          updatedAt: 100
        })
      })
    )
    expect(JSON.stringify(store.save.mock.calls)).not.toContain(
      'bearer-secret'
    )
    expect(result.hasCredential).toBe(true)
  })

  it('preserves an existing credential when an update omits it', async () => {
    const current = connectorRecord()
    const store = storeMock({ current })
    const vault = vaultMock()
    const service = createService({ store, vault })

    await service.save({
      ...configuration(),
      id: current.connector.id,
      name: 'Renamed',
      expectedRevision: 1,
      idempotencyKey: 'save-2'
    })

    expect(vault.encrypt).not.toHaveBeenCalled()
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        credential: undefined,
        connector: expect.objectContaining({
          name: 'Renamed',
          revision: 2
        })
      })
    )
  })

  it('removes a stored credential when authentication changes to none', async () => {
    const store = storeMock({ current: connectorRecord() })
    const service = createService({ store })

    await service.save({
      ...configuration(),
      id: 'connector-docs',
      authentication: { type: 'none' },
      expectedRevision: 1,
      idempotencyKey: 'save-3'
    })

    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ credential: null })
    )
  })

  it('rejects an unauthorized invocation before reading or decrypting credentials', async () => {
    const store = storeMock({ current: connectorRecord() })
    const vault = vaultMock()
    const network = networkMock()
    const service = createService({ store, vault, network })

    await expect(
      service.invoke({
        connectorId: 'connector-docs',
        allowedConnectorIds: [],
        purpose: 'online_document',
        path: '/document/1',
        method: 'GET',
        idempotencyKey: 'invoke-1',
        owner: { type: 'knowledge_source', id: 'source-1' }
      })
    ).rejects.toThrow('Connector is not allowed')
    expect(store.getCredential).not.toHaveBeenCalled()
    expect(vault.decrypt).not.toHaveBeenCalled()
    expect(network.requestConnector).not.toHaveBeenCalled()
  })

  it('rejects disabled connectors before decrypting credentials', async () => {
    const store = storeMock({
      current: connectorRecord({
        connector: { ...connectorRecord().connector, enabled: false }
      })
    })
    const vault = vaultMock()
    const network = networkMock()
    const service = createService({ store, vault, network })

    await expect(
      service.invoke(invokeCommand())
    ).rejects.toThrow('Connector is disabled')
    expect(store.getCredential).not.toHaveBeenCalled()
    expect(vault.decrypt).not.toHaveBeenCalled()
    expect(network.requestConnector).not.toHaveBeenCalled()
  })

  it('decrypts only after gates and invokes the connector through its network port', async () => {
    const store = storeMock({ current: connectorRecord() })
    const vault = vaultMock()
    const network = networkMock()
    const service = createService({ store, vault, network })

    await service.invoke(invokeCommand())

    expect(store.getCredential).toHaveBeenCalledWith('connector-docs')
    expect(vault.decrypt).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValue: new Uint8Array([4, 5, 6]) })
    )
    expect(network.requestConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'connector-docs',
        url: 'https://docs.example.com/api/document/1',
        authentication: {
          type: 'bearer',
          credential: 'decrypted-secret'
        },
        callType: 'online_document'
      })
    )
  })

  it('requires a credential for authenticated connectors', async () => {
    const store = storeMock({
      current: { ...connectorRecord(), hasCredential: false },
      credential: undefined
    })
    const network = networkMock()
    const service = createService({ store, network })

    await expect(service.invoke(invokeCommand())).rejects.toThrow(
      'Connector credential is unavailable'
    )
    expect(network.requestConnector).not.toHaveBeenCalled()
  })

  it('maps network validation failures and persists the validation result', async () => {
    const store = storeMock({ current: connectorRecord() })
    const network = networkMock()
    network.requestConnector.mockRejectedValue(
      new ConnectorRequestError('authentication_error', 0)
    )
    const service = createService({ store, network })

    const result = await service.validate({
      connectorId: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'validate-1'
    })

    expect(result.connector.validation).toEqual({
      status: 'authentication_error',
      checkedAt: 100,
      message: 'Connector authentication failed'
    })
    expect(store.saveValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'connector-docs',
        expectedRevision: 1,
        validation: result.connector.validation
      })
    )
  })

  it('validates with HEAD and falls back to GET when HEAD is unsupported', async () => {
    const store = storeMock({ current: connectorRecord() })
    const network = networkMock()
    network.requestConnector
      .mockRejectedValueOnce(
        Object.assign(new ConnectorRequestError('protocol_error', 0), {
          status: 405
        })
      )
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: new Uint8Array(),
        retryCount: 0
      })
    const service = createService({ store, network })

    const result = await service.validate({
      connectorId: 'connector-docs',
      expectedRevision: 1,
      idempotencyKey: 'validate-fallback'
    })

    expect(network.requestConnector).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'HEAD',
        idempotencyKey: 'validate-fallback:head'
      })
    )
    expect(network.requestConnector).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'GET',
        idempotencyKey: 'validate-fallback:get'
      })
    )
    expect(result.connector.validation).toMatchObject({
      status: 'available',
      message: 'Connector is available'
    })
  })

  it('returns reference details instead of deleting a connector in use', async () => {
    const store = storeMock({ current: connectorRecord() })
    store.delete.mockResolvedValue({
      status: 'referenced',
      references: { workflowCount: 1, requirementCount: 2, runCount: 0 }
    })
    const service = createService({ store })

    await expect(
      service.delete({
        id: 'connector-docs',
        expectedRevision: 1,
        idempotencyKey: 'delete-1'
      })
    ).resolves.toEqual({
      status: 'referenced',
      references: { workflowCount: 1, requirementCount: 2, runCount: 0 }
    })
  })
})

function configuration() {
  return {
    name: 'Docs',
    type: 'http' as const,
    baseUrl: 'https://docs.example.com/api',
    authentication: { type: 'bearer' as const },
    enabled: true,
    timeoutMs: 5000,
    maxRetries: 1
  }
}

function connectorRecord(
  overrides: Partial<ReturnType<typeof connectorRecordBase>> = {}
) {
  return { ...connectorRecordBase(), ...overrides }
}

function connectorRecordBase() {
  return {
    connector: createConnector({
      id: 'connector-docs',
      ...configuration(),
      at: 50
    }),
    hasCredential: true
  }
}

function storedCredential(): StoredConnectorCredential {
  return {
    encryptedValue: new Uint8Array([4, 5, 6]),
    nonce: new Uint8Array(12),
    authTag: new Uint8Array(16),
    keyVersion: 1,
    createdAt: 50,
    updatedAt: 50
  }
}

function storeMock(options: {
  current?: ReturnType<typeof connectorRecord>
  credential?: StoredConnectorCredential
} = {}) {
  const current = options.current
  const credential =
    'credential' in options ? options.credential : storedCredential()
  return {
    list: vi.fn().mockResolvedValue(current ? [current] : []),
    get: vi.fn().mockResolvedValue(current),
    getCredential: vi.fn().mockResolvedValue(credential),
    save: vi.fn().mockImplementation(async ({ connector, credential: next }) => ({
      status: 'applied',
      connector,
      hasCredential:
        next === null ? false : Boolean(next) || current?.hasCredential === true
    })),
    delete: vi.fn(),
    saveValidation: vi
      .fn()
      .mockImplementation(async ({ validation }) => ({
        status: 'applied',
        connector: { ...current?.connector, validation },
        hasCredential: current?.hasCredential ?? false
      }))
  }
}

function vaultMock() {
  return {
    encrypt: vi.fn().mockReturnValue({
      encryptedValue: new Uint8Array([1, 2, 3]),
      nonce: new Uint8Array(12),
      authTag: new Uint8Array(16),
      keyVersion: 1
    }),
    decrypt: vi.fn().mockReturnValue('decrypted-secret')
  }
}

function networkMock() {
  return {
    authorizeSkillConnector: vi.fn(),
    revokeSkillConnector: vi.fn(),
    requestConnector: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: new Uint8Array(),
      retryCount: 0
    })
  }
}

function createService(overrides: {
  store?: ReturnType<typeof storeMock>
  vault?: ReturnType<typeof vaultMock>
  network?: ReturnType<typeof networkMock>
} = {}) {
  return new ConnectorService({
    store: (overrides.store ?? storeMock()) as unknown as ConnectorStore,
    vault: overrides.vault ?? vaultMock(),
    network: overrides.network ?? networkMock(),
    now: () => 100,
    createId: () => 'connector-event-1'
  })
}

function invokeCommand() {
  return {
    connectorId: 'connector-docs',
    allowedConnectorIds: ['connector-docs'],
    purpose: 'online_document' as const,
    path: '/document/1',
    method: 'GET',
    idempotencyKey: 'invoke-1',
    owner: { type: 'knowledge_source' as const, id: 'source-1' }
  }
}
