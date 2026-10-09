import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteComputerAuthorization } from './computer-authorization'

let database: RealmFlowDatabase
let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-computer-auth-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteComputerAuthorization', () => {
  it('authorizes only active computer grants for the exact bundle ID', async () => {
    database
      .prepare(
        `INSERT INTO tool_permission_grant_projections (
          grant_id, status, projection_json, revision, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        'grant-1',
        'active',
        JSON.stringify({
          capabilities: ['computer.observe', 'computer.control'],
          resource: {
            kind: 'application_bundle',
            bundleId: 'com.example.Editor'
          }
        }),
        1,
        1
      )
    const authorization = new SqliteComputerAuthorization(database)

    await expect(
      authorization.isApplicationAuthorized('com.example.Editor')
    ).resolves.toBe(true)
    await expect(
      authorization.isApplicationAuthorized('com.other.App')
    ).resolves.toBe(false)
  })

  it('requires an approved request for the exact execution and semantic action', async () => {
    database
      .prepare(
        `INSERT INTO tool_permission_request_projections (
          request_id, status, projection_json, revision, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        'request-1',
        'approved',
        JSON.stringify({
          executionId: 'execution-1',
          bundleId: 'com.example.Editor',
          semantic: 'submit'
        }),
        1,
        1
      )
    const authorization = new SqliteComputerAuthorization(database)

    await expect(
      authorization.isApproved({
        executionId: 'execution-1',
        bundleId: 'com.example.Editor',
        semantic: 'submit'
      })
    ).resolves.toBe(true)
    await expect(
      authorization.isApproved({
        executionId: 'execution-1',
        bundleId: 'com.example.Editor',
        semantic: 'delete'
      })
    ).resolves.toBe(false)
  })
})
