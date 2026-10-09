import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CredentialVault } from '../../models/credential-vault'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteMcpServerRepository } from '../../infrastructure/sqlite/mcp-server-repository'
import { McpServerService } from './mcp-server-service'

let database: RealmFlowDatabase
let directory: string
let repository: SqliteMcpServerRepository
let vault: CredentialVault

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-mcp-service-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteMcpServerRepository(database)
  vault = await CredentialVault.open(join(directory, 'credentials.key'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('McpServerService', () => {
  it('encrypts new credentials and preserves omitted values on update', async () => {
    const service = createService()

    const created = await service.save({
      id: 'search',
      name: 'Search',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        credentialNames: ['Authorization']
      },
      credentialValues: { Authorization: 'bearer-sensitive' },
      expectedRevision: 0,
      idempotencyKey: 'save-search-1'
    })
    const updated = await service.save({
      id: 'search',
      name: 'Search Updated',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        credentialNames: ['Authorization']
      },
      credentialValues: {},
      expectedRevision: 1,
      idempotencyKey: 'save-search-2'
    })

    expect(created.revision).toBe(1)
    expect(updated).toMatchObject({
      revision: 2,
      configuration: { name: 'Search Updated' },
      hasCredentials: { Authorization: true }
    })
    expect(JSON.stringify(await service.list())).not.toContain(
      'bearer-sensitive'
    )
    await expect(
      service.resolveCredential(
        updated.configuration.transport.kind === 'streamable_http'
          ? updated.configuration.transport.headerCredentialIds.Authorization
          : ''
      )
    ).resolves.toBe('bearer-sensitive')
  })

  it('persists an unavailable validation result without throwing connection details', async () => {
    const connection = {
      serverIdentity: {
        name: 'search',
        version: '1.0.0',
        protocolVersion: '2025-11-25'
      },
      listTools: vi.fn(),
      callTool: vi.fn(),
      cancel: vi.fn(),
      ping: vi.fn().mockRejectedValue(new Error('socket secret detail')),
      close: vi.fn().mockResolvedValue(undefined)
    }
    const service = createService({
      connect: vi.fn().mockResolvedValue(connection)
    })
    await saveWithoutCredentials(service)

    await expect(
      service.testConnection({ id: 'search', expectedRevision: 1 })
    ).resolves.toMatchObject({
      validation: {
        status: 'unavailable',
        message: 'MCP Server is unavailable'
      }
    })
    expect(connection.close).toHaveBeenCalledOnce()
  })

  it('discovers tools from the persisted server configuration', async () => {
    const discoverAndPublish = vi.fn().mockResolvedValue({
      package: { manifest: { packageId: 'mcp.search' } },
      tools: [],
      skills: []
    })
    const service = createService(undefined, discoverAndPublish)
    await saveWithoutCredentials(service)

    await service.discover({
      id: 'search',
      idempotencyKey: 'discover-search-1'
    })

    expect(discoverAndPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'search',
        identity: expect.stringMatching(/^[a-f0-9]{64}$/)
      }),
      'discover-search-1'
    )
  })
})

function createService(
  clients = {
    connect: vi.fn().mockRejectedValue(new Error('not used'))
  },
  discoverAndPublish = vi.fn()
) {
  return new McpServerService({
    store: repository,
    vault,
    clients,
    discovery: { discoverAndPublish },
    now: () => 100,
    createId: () => 'fixed-id'
  })
}

async function saveWithoutCredentials(service: McpServerService) {
  return service.save({
    id: 'search',
    name: 'Search',
    enabled: true,
    transport: {
      kind: 'streamable_http',
      url: 'https://mcp.example.com/rpc',
      credentialNames: []
    },
    credentialValues: {},
    expectedRevision: 0,
    idempotencyKey: 'save-search'
  })
}
