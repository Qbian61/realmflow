import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeMcpServerConfiguration } from '../../../../domain/mcp-server'
import { CredentialVault } from '../../models/credential-vault'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteMcpServerRepository } from './mcp-server-repository'

let database: RealmFlowDatabase
let directory: string
let vault: CredentialVault

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-mcp-server-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  vault = await CredentialVault.open(join(directory, 'credentials.key'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteMcpServerRepository', () => {
  it('atomically stores a normalized server and encrypted credentials', async () => {
    const repository = new SqliteMcpServerRepository(database)
    const configuration = serverConfiguration()
    const encrypted = vault.encrypt('bearer-sensitive')

    await expect(
      repository.save({
        configuration,
        expectedRevision: 0,
        credentials: [
          {
            id: 'credential-search-authorization',
            serverId: configuration.id,
            bindingName: 'Authorization',
            ...encrypted,
            createdAt: 100,
            updatedAt: 100
          }
        ],
        idempotencyKey: 'save-search-1',
        fingerprint: 'fingerprint-1',
        at: 100
      })
    ).resolves.toMatchObject({
      status: 'applied',
      record: {
        configuration,
        revision: 1,
        hasCredentials: { Authorization: true }
      }
    })

    const bytes = database.serialize().toString('utf8')
    expect(bytes).not.toContain('bearer-sensitive')
    const stored = await repository.getCredential(
      'credential-search-authorization'
    )
    expect(stored && vault.decrypt(stored)).toBe('bearer-sensitive')
  })

  it('rolls back the server when a referenced credential is missing', async () => {
    const repository = new SqliteMcpServerRepository(database)

    await expect(
      repository.save({
        configuration: serverConfiguration(),
        expectedRevision: 0,
        credentials: [],
        idempotencyKey: 'save-search-missing',
        fingerprint: 'fingerprint-missing',
        at: 100
      })
    ).rejects.toThrow('MCP Server credential is unavailable')

    await expect(repository.list()).resolves.toEqual([])
  })

  it('deletes server configuration and credentials in one transaction', async () => {
    const repository = new SqliteMcpServerRepository(database)
    const configuration = serverConfiguration()
    const encrypted = vault.encrypt('bearer-sensitive')
    await repository.save({
      configuration,
      expectedRevision: 0,
      credentials: [
        {
          id: 'credential-search-authorization',
          serverId: configuration.id,
          bindingName: 'Authorization',
          ...encrypted,
          createdAt: 100,
          updatedAt: 100
        }
      ],
      idempotencyKey: 'save-search-delete',
      fingerprint: 'fingerprint-delete',
      at: 100
    })

    await expect(
      repository.delete({
        id: configuration.id,
        expectedRevision: 1,
        idempotencyKey: 'delete-search-1',
        fingerprint: 'delete-fingerprint',
        at: 200
      })
    ).resolves.toEqual({ status: 'applied', id: configuration.id })
    await expect(
      repository.getCredential('credential-search-authorization')
    ).resolves.toBeUndefined()
  })
})

function serverConfiguration() {
  return normalizeMcpServerConfiguration({
    id: 'search',
    name: 'Search',
    enabled: true,
    transport: {
      kind: 'streamable_http',
      url: 'https://mcp.example.com/rpc',
      headerCredentialIds: {
        Authorization: 'credential-search-authorization'
      }
    }
  })
}
