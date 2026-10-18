import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDshSessionBinding,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteDshSessionBindingRepository } from './dsh-session-binding-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteDshSessionBindingRepository

const owner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-session-binding-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteDshSessionBindingRepository(database)
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteDshSessionBindingRepository', () => {
  it('migrates durable DSH session bindings without legacy tool checkpoints', () => {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name)
    const migrations = database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => (row as { version: number }).version)

    expect(tables).toContain('dsh_session_bindings')
    expect(migrations).toEqual([116])
    expect(database.pragma('foreign_key_check')).toEqual([])
    expect(tables).not.toContain('agent_run_checkpoints')
  })

  it('persists and restores a DSH binding by owner or DSH session ID', () => {
    const binding = sessionBinding()

    repository.save(binding)

    expect(repository.getByOwner(owner)).toEqual(binding)
    expect(repository.getByDshSessionId('dsh-session-1')).toEqual(binding)

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteDshSessionBindingRepository(database)
    expect(repository.getByOwner(owner)).toEqual(binding)
  })

  it('rejects cross-owner DSH session reuse and owner rebinding without reset', () => {
    repository.save(sessionBinding())

    expect(() =>
      repository.save(sessionBinding({
        owner: {
          workspaceId: 'workspace-2',
          requirementId: 'requirement-2',
          nodeRunId: 'node-run-2'
        }
      }))
    ).toThrow(/cross-owner/)

    expect(() =>
      repository.save(sessionBinding({ dshSessionId: 'dsh-session-2' }))
    ).toThrow(/already bound/)
  })

  it('updates projection sequence and lifecycle status monotonically', () => {
    repository.save(sessionBinding())

    expect(repository.advanceProjection('dsh-session-1', 8, 20)).toMatchObject({
      lastProjectedSequence: 8,
      updatedAt: 20
    })
    expect(() => repository.advanceProjection('dsh-session-1', 7, 21)).toThrow(
      /projection sequence/
    )
    expect(repository.transition('dsh-session-1', 'closing', 30)).toMatchObject({
      lifecycleStatus: 'closing',
      updatedAt: 30
    })
    expect(repository.transition('dsh-session-1', 'paused', 40)).toMatchObject({
      lifecycleStatus: 'paused',
      updatedAt: 40
    })
  })

  it('rebonds the same owner session to the next manifest while keeping runtime build immutable', () => {
    repository.save(sessionBinding())

    repository.save(sessionBinding({
      runManifestDigest: 'c'.repeat(64),
      updatedAt: 20
    }))

    expect(repository.getByOwner(owner)).toMatchObject({
      dshSessionId: 'dsh-session-1',
      runManifestDigest: 'c'.repeat(64),
      runtimeBuildDigest: 'b'.repeat(64),
      updatedAt: 20
    })
    expect(() =>
      repository.save(sessionBinding({
        runtimeBuildDigest: 'd'.repeat(64),
        updatedAt: 30
      }))
    ).toThrow(/runtime identity/)
  })

  it('resets binding rows without touching product data or creating RealmFlow checkpoints', () => {
    insertWorkspace()
    repository.save(sessionBinding())

    repository.resetByOwner(owner)

    expect(repository.getByOwner(owner)).toBeUndefined()
    expect(database.prepare('SELECT COUNT(*) FROM workspaces').pluck().get()).toBe(1)
    expect(
      database
        .prepare(
          "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'agent_run_checkpoints'"
        )
        .pluck()
        .get()
    ).toBe(0)
  })
})

function sessionBinding(
  overrides: Partial<Parameters<typeof createDshSessionBinding>[0]> = {}
): DshSessionBinding {
  return createDshSessionBinding({
    owner,
    dshSessionId: 'dsh-session-1',
    runManifestDigest: 'a'.repeat(64),
    runtimeBuildDigest: 'b'.repeat(64),
    createdAt: 10,
    ...overrides
  })
}

function insertWorkspace(): void {
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at,
        updated_at
      ) VALUES (?, ?, ?, '', 0, 0, 1, 1)`
    )
    .run('workspace-1', '/workspace/one', 'Workspace One')
}
