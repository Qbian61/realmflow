import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConnector, updateConnector } from '../../../../domain/connector'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteConnectorRepository } from './connector-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteConnectorRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-connectors-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteConnectorRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteConnectorRepository', () => {
  it('atomically creates a connector with encrypted credentials and replays once', async () => {
    const input = saveInput()

    await expect(repository.save(input)).resolves.toMatchObject({
      status: 'applied',
      connector: { id: 'connector-docs', revision: 1 },
      hasCredential: true
    })
    await expect(repository.save(input)).resolves.toMatchObject({
      status: 'replayed',
      connector: { id: 'connector-docs', revision: 1 },
      hasCredential: true
    })
    await expect(repository.getCredential('connector-docs')).resolves.toEqual(
      encryptedCredential()
    )
    await expect(repository.list()).resolves.toMatchObject([
      {
        connector: { id: 'connector-docs', revision: 1 },
        hasCredential: true
      }
    ])
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM connector_events').get()
    ).toEqual({ count: 1 })
  })

  it('preserves credentials when an update omits a replacement', async () => {
    await repository.save(saveInput())
    const current = await repository.get('connector-docs')
    const connector = updateConnector(current!.connector, {
      name: 'Docs v2',
      type: 'http',
      baseUrl: 'https://docs.example.com/v2',
      authentication: { type: 'bearer' },
      enabled: true,
      timeoutMs: 45_000,
      maxRetries: 1,
      at: 200
    })

    await expect(
      repository.save({
        connector,
        expectedRevision: 1,
        eventId: 'event-2',
        eventOperation: 'updated',
        idempotencyKey: 'save-2',
        fingerprint: 'fingerprint-2',
        at: 200
      })
    ).resolves.toMatchObject({
      status: 'applied',
      connector: { name: 'Docs v2', revision: 2 },
      hasCredential: true
    })
    await expect(repository.getCredential('connector-docs')).resolves.toEqual(
      encryptedCredential()
    )
  })

  it('returns the current connector on revision conflict without changing credentials', async () => {
    await repository.save(saveInput())
    const attempted = {
      ...createConnector(connectorInput()),
      name: 'Stale update',
      revision: 2,
      updatedAt: 200
    }

    await expect(
      repository.save({
        connector: attempted,
        expectedRevision: 0,
        credential: {
          ...encryptedCredential(),
          encryptedValue: Uint8Array.from([9])
        },
        eventId: 'event-stale',
        eventOperation: 'updated',
        idempotencyKey: 'save-stale',
        fingerprint: 'fingerprint-stale',
        at: 200
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      connector: { name: 'Docs', revision: 1 }
    })
    await expect(repository.getCredential('connector-docs')).resolves.toEqual(
      encryptedCredential()
    )
  })

  it('rejects deletion while a workflow node references the connector', async () => {
    await repository.save(saveInput())
    const row = database
      .prepare(
        `SELECT id, config_json FROM workflow_nodes
         ORDER BY sort_order, id LIMIT 1`
      )
      .get() as { id: string; config_json: string }
    const configuration = JSON.parse(row.config_json) as {
      connectorIds?: string[]
    }
    database
      .prepare('UPDATE workflow_nodes SET config_json = ? WHERE id = ?')
      .run(
        JSON.stringify({
          ...configuration,
          connectorIds: ['connector-docs']
        }),
        row.id
      )

    await expect(
      repository.delete({
        id: 'connector-docs',
        expectedRevision: 1,
        eventId: 'event-delete',
        idempotencyKey: 'delete-1',
        fingerprint: 'delete-fingerprint',
        at: 300
      })
    ).resolves.toMatchObject({
      status: 'referenced',
      references: { workflowCount: 1 }
    })
    await expect(repository.get('connector-docs')).resolves.toBeDefined()
  })
})

function connectorInput() {
  return {
    id: 'connector-docs',
    name: 'Docs',
    type: 'http' as const,
    baseUrl: 'https://docs.example.com',
    authentication: { type: 'bearer' as const },
    enabled: true,
    timeoutMs: 30_000,
    maxRetries: 2,
    at: 100
  }
}

function encryptedCredential() {
  return {
    encryptedValue: Uint8Array.from([1, 2, 3]),
    nonce: Uint8Array.from([4, 5]),
    authTag: Uint8Array.from([6, 7]),
    keyVersion: 1,
    createdAt: 100,
    updatedAt: 100
  }
}

function saveInput() {
  return {
    connector: createConnector(connectorInput()),
    expectedRevision: 0,
    credential: encryptedCredential(),
    eventId: 'event-1',
    eventOperation: 'created' as const,
    idempotencyKey: 'save-1',
    fingerprint: 'fingerprint-1',
    at: 100
  }
}
