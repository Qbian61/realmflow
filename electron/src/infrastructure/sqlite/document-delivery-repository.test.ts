import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  completeDocumentDelivery,
  createDocumentDelivery,
  failDocumentDelivery,
  startDocumentDelivery
} from '../../../../domain/document-delivery'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteDocumentDeliveryRepository } from './document-delivery-repository'

const databases: RealmFlowDatabase[] = []
const directories: string[] = []

afterEach(async () => {
  for (const database of databases.splice(0)) database.close()
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('SqliteDocumentDeliveryRepository', () => {
  it('recovers a running operation after reopening SQLite', async () => {
    const { database, path } = await createDatabase()
    const repository = new SqliteDocumentDeliveryRepository(database)
    const requested = delivery('request-1')

    await repository.request({
      delivery: requested,
      scopeRoot: '/workspace'
    })
    await repository.markRunning('request-1', 20)
    database.close()
    databases.splice(databases.indexOf(database), 1)

    const reopenedDatabase = openRealmFlowDatabase(path)
    databases.push(reopenedDatabase)
    const reopened = new SqliteDocumentDeliveryRepository(reopenedDatabase)

    await expect(reopened.listPending()).resolves.toEqual([
      {
        delivery: startDocumentDelivery(requested, 20),
        scopeRoot: '/workspace'
      }
    ])
  })

  it('persists a terminal receipt, removes its journal, and replays it', async () => {
    const { database } = await createDatabase()
    const repository = new SqliteDocumentDeliveryRepository(database)
    const requested = delivery('request-1')
    await repository.request({
      delivery: requested,
      scopeRoot: '/workspace'
    })
    const running = startDocumentDelivery(requested, 20)
    await repository.markRunning(requested.requestId, 20)
    const completed = completeDocumentDelivery(running, {
      completedAt: 30,
      artifact: {
        path: 'report.pdf',
        format: 'pdf',
        byteSize: 100,
        checksum: checksum('a'),
        verified: true
      }
    })

    const stored = await repository.complete(completed)

    expect(stored.id).toBe('document-delivery-receipt:request-1')
    await expect(repository.listPending()).resolves.toEqual([])
    await expect(repository.request({
      delivery: requested,
      scopeRoot: '/workspace'
    })).resolves.toEqual({
      status: 'completed',
      receipt: completed.receipt,
      receiptId: stored.id
    })
    expect(
      database
        .prepare('SELECT COUNT(*) FROM document_delivery_operations')
        .pluck()
        .get()
    ).toBe(0)
  })

  it('rejects reuse of a request id with another fingerprint', async () => {
    const { database } = await createDatabase()
    const repository = new SqliteDocumentDeliveryRepository(database)
    await repository.request({
      delivery: delivery('request-1'),
      scopeRoot: '/workspace'
    })

    await expect(repository.request({
      delivery: createDocumentDelivery({
        requestId: 'request-1',
        input: {
          kind: 'verify',
          path: 'other.pdf',
          format: 'pdf'
        },
        requestedAt: 10
      }),
      scopeRoot: '/workspace'
    })).rejects.toThrow('Document delivery idempotency conflict')
  })

  it('cleans the journal after a terminal failure and replays the failure receipt', async () => {
    const { database } = await createDatabase()
    const repository = new SqliteDocumentDeliveryRepository(database)
    const requested = delivery('request-failed')
    await repository.request({
      delivery: requested,
      scopeRoot: '/workspace'
    })
    const running = startDocumentDelivery(requested, 20)
    await repository.markRunning(requested.requestId, 20)
    const failed = failDocumentDelivery(running, {
      completedAt: 30,
      errorCode: 'artifact_verification_failed',
      message: 'Artifact verification failed'
    })

    await repository.complete(failed)

    await expect(repository.listPending()).resolves.toEqual([])
    await expect(repository.request({
      delivery: requested,
      scopeRoot: '/workspace'
    })).resolves.toMatchObject({
      status: 'completed',
      receipt: {
        status: 'failed',
        errorCode: 'artifact_verification_failed'
      }
    })
  })
})

function delivery(requestId: string) {
  return createDocumentDelivery({
    requestId,
    input: {
      kind: 'verify',
      path: 'report.pdf',
      format: 'pdf'
    },
    requestedAt: 10
  })
}

function checksum(character: string): string {
  return `sha256:${character.repeat(64)}`
}

async function createDatabase(): Promise<{
  database: RealmFlowDatabase
  path: string
}> {
  const directory = await mkdtemp(join(tmpdir(), 'realmflow-delivery-db-'))
  directories.push(directory)
  const path = join(directory, 'realmflow.db')
  const database = openRealmFlowDatabase(path)
  databases.push(database)
  return { database, path }
}
