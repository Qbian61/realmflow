import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../infrastructure/sqlite/database'
import { SqlitePersistenceService } from './sqlite-persistence-service'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-sqlite-persistence-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

const navigation = {
  version: 1,
  spaces: [
    {
      path: '/spaces/one',
      label: 'One',
      description: 'Workspace one'
    }
  ],
  requirementsBySpace: {
    '/spaces/one': [
      {
        id: 'requirement-1',
        title: 'Requirement',
        stage: 'analysis',
        status: 'active',
        updatedAt: 10
      }
    ]
  }
}

describe('SqlitePersistenceService', () => {
  it('hydrates empty datasets from SQLite without localStorage fallback', async () => {
    const service = new SqlitePersistenceService(database, vi.fn())

    await expect(service.load('workspaceNavigation')).resolves.toEqual({
      status: 'loaded',
      snapshot: {
        revision: 0,
        value: { version: 1, spaces: [], requirementsBySpace: {} }
      }
    })
    await expect(service.load('chatSessions')).resolves.toEqual({
      status: 'loaded',
      snapshot: {
        revision: 0,
        value: { version: 4, sessions: [] }
      }
    })
    await expect(service.load('spaceResources')).resolves.toEqual({
      status: 'loaded',
      snapshot: {
        revision: 0,
        value: { version: 1, resourcesBySpace: {} }
      }
    })
  })

  it('normalizes aggregate saves and returns the latest snapshot on conflict', async () => {
    const onChanged = vi.fn()
    const service = new SqlitePersistenceService(database, onChanged)

    await expect(
      service.save('workspaceNavigation', navigation, 0)
    ).resolves.toMatchObject({
      status: 'saved',
      snapshot: { revision: 1, value: navigation }
    })
    const [first, second] = await Promise.all([
      service.save(
        'workspaceNavigation',
        {
          ...navigation,
          spaces: [{ ...navigation.spaces[0], label: 'First' }]
        },
        1
      ),
      service.save(
        'workspaceNavigation',
        {
          ...navigation,
          spaces: [{ ...navigation.spaces[0], label: 'Second' }]
        },
        1
      )
    ])

    expect([first.status, second.status].sort()).toEqual([
      'conflict',
      'saved'
    ])
    const conflict = first.status === 'conflict' ? first : second
    if (conflict.status === 'unavailable') {
      throw new Error('Unexpected unavailable result')
    }
    expect(conflict.snapshot.revision).toBe(2)
    expect(
      (
        conflict.snapshot.value as {
          spaces: Array<{ label: string }>
        }
      ).spaces[0].label
    ).toMatch(/First|Second/)
    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('persists chat and resource aggregates against workspace foreign keys', async () => {
    const service = new SqlitePersistenceService(database, vi.fn())
    await service.save('workspaceNavigation', navigation, 0)

    await expect(
      service.save(
        'chatSessions',
        {
          version: 4,
          sessions: [
            {
              id: 'session-1',
              title: 'Chat',
              spacePath: '/spaces/one',
              messages: [
                {
                  id: 'message-1',
                  role: 'user',
                  content: 'Hello',
                  createdAt: 10
                }
              ],
              createdAt: 10,
              updatedAt: 10
            }
          ]
        },
        0
      )
    ).resolves.toMatchObject({ status: 'saved' })
    await expect(
      service.save(
        'spaceResources',
        {
          version: 1,
          resourcesBySpace: {
            '/spaces/one': [
              {
                id: 'resource-1',
                name: 'Source',
                type: 'repository',
                locator: 'https://example.com/repo.git',
                detail: '',
                updatedAt: 10
              }
            ]
          }
        },
        0
      )
    ).resolves.toMatchObject({ status: 'saved' })

    await expect(service.load('chatSessions')).resolves.toMatchObject({
      snapshot: {
        revision: 1,
        value: {
          sessions: [
            {
              id: 'session-1',
              spacePath: '/spaces/one',
              messages: [{ id: 'message-1' }]
            }
          ]
        }
      }
    })
    await expect(service.load('spaceResources')).resolves.toMatchObject({
      snapshot: {
        revision: 1,
        value: {
          resourcesBySpace: {
            '/spaces/one': [{ id: 'resource-1' }]
          }
        }
      }
    })
  })

  it('rejects invalid payloads before executing SQL', async () => {
    const service = new SqlitePersistenceService(database, vi.fn())

    await expect(
      service.save(
        'workspaceNavigation',
        { ...navigation, spaces: [{ path: '../escape' }] },
        0
      )
    ).rejects.toThrow('Invalid workspaceNavigation payload')
    expect(
      database.prepare('SELECT COUNT(*) FROM workspaces').pluck().get()
    ).toBe(0)
  })
})
