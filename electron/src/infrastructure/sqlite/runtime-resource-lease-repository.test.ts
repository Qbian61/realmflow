import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteRuntimeResourceLeaseRepository } from './runtime-resource-lease-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteRuntimeResourceLeaseRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-runtime-lease-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteRuntimeResourceLeaseRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteRuntimeResourceLeaseRepository', () => {
  it('allocates a monotonic epoch for each run and resource type', () => {
    const first = repository.acquire({
      id: 'lease-1',
      resourceType: 'browser_session',
      resourceId: 'browser-1',
      conversationId: 'conversation-1',
      ownerRunId: 'run-1',
      authorityDigest: 'a'.repeat(64),
      createdAt: 10
    })
    expect(first.epoch).toBe(1)

    repository.transition({
      id: first.id,
      epoch: first.epoch,
      status: 'released',
      updatedAt: 11
    })
    const second = repository.acquire({
      id: 'lease-2',
      resourceType: 'browser_session',
      resourceId: 'browser-2',
      conversationId: 'conversation-1',
      ownerRunId: 'run-1',
      authorityDigest: 'a'.repeat(64),
      createdAt: 12
    })

    expect(second.epoch).toBe(2)
    expect(repository.getCurrent('run-1', 'browser_session')).toEqual(
      second
    )
  })

  it('prevents two active leases for the same run and type', () => {
    repository.acquire({
      id: 'lease-1',
      resourceType: 'browser_session',
      resourceId: 'browser-1',
      ownerRunId: 'run-1',
      authorityDigest: 'a'.repeat(64),
      createdAt: 10
    })

    expect(() =>
      repository.acquire({
        id: 'lease-2',
        resourceType: 'browser_session',
        resourceId: 'browser-2',
        ownerRunId: 'run-1',
        authorityDigest: 'a'.repeat(64),
        createdAt: 11
      })
    ).toThrow()
  })

  it('interrupts active leases on startup without restoring them', () => {
    const active = repository.acquire({
      id: 'lease-active',
      resourceType: 'browser_session',
      resourceId: 'browser-active',
      ownerRunId: 'run-active',
      authorityDigest: 'a'.repeat(64),
      createdAt: 10
    })

    expect(repository.interruptAllActive(20)).toBe(1)
    expect(repository.getById(active.id)?.status).toBe('interrupted')
    expect(
      repository.getCurrent('run-active', 'browser_session')
    ).toBeUndefined()
  })
})
