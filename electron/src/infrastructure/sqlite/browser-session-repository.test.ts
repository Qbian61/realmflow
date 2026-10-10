import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteBrowserSessionRepository } from './browser-session-repository'
import type { BrowserSession } from '../../application/browser/browser-runtime-port'

let database: RealmFlowDatabase
let directory: string
afterEach(async () => {
  database?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-browser-test-'))
  database = openRealmFlowDatabase(join(directory, 'runtime.db'))
  return new SqliteBrowserSessionRepository(database)
}
const session: BrowserSession = {
  id: 'browser-one', profileId: 'browser-profile', ownerKey: 'conversation:a',
  status: 'active', revision: 1, executionId: 'execution-1', createdAt: 10, updatedAt: 10
}

describe('SQLite browser sessions', () => {
  it('persists the session and transition lineage across restart', async () => {
    const repository = await fixture()
    repository.insert(session)
    repository.update({ ...session, status: 'interrupted', revision: 2, updatedAt: 20 }, 1)
    database.close()
    database = openRealmFlowDatabase(join(directory, 'runtime.db'))
    const restored = new SqliteBrowserSessionRepository(database)
    expect(restored.get(session.id)).toEqual({ ...session, status: 'interrupted', revision: 2, updatedAt: 20 })
    expect(database.prepare('SELECT status, execution_id FROM browser_session_events ORDER BY revision').all())
      .toEqual([
        { status: 'active', execution_id: 'execution-1' },
        { status: 'interrupted', execution_id: 'execution-1' }
      ])
  })

  it('rolls back state when its transition event cannot be saved', async () => {
    const repository = await fixture()
    repository.insert(session)
    database.exec(`CREATE TRIGGER fail_browser_event BEFORE INSERT ON browser_session_events
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END`)
    expect(() => repository.update({ ...session, status: 'closed', revision: 2 }, 1)).toThrow('disk failure')
    expect(repository.get(session.id)).toEqual(session)
    expect(() => repository.insert({ ...session, id: 'browser-two', profileId: 'profile-two' })).toThrow()
    expect(repository.list()).toEqual([session])
  })

  it('rejects stale revisions, owner changes and duplicate live profiles', async () => {
    const repository = await fixture()
    repository.insert(session)
    expect(() => repository.insert({ ...session, id: 'browser-two' })).toThrow()
    expect(() => repository.update({ ...session, status: 'closed', revision: 2 }, 0)).toThrow()
    expect(() => repository.update({ ...session, ownerKey: 'other', revision: 2 }, 1)).toThrow()
    expect(repository.get(session.id)).toEqual(session)
  })
})
