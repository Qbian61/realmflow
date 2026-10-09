import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import {
  SqliteWorkbenchSiteRepository,
  WorkbenchSiteRevisionConflictError
} from './workbench-site-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteWorkbenchSiteRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-workbench-sites-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteWorkbenchSiteRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite workbench site repository', () => {
  it('reorders site groups transactionally by target index', async () => {
    const first = await repository.createGroup({ name: '一组' })
    const second = await repository.createGroup({ name: '二组' })
    const third = await repository.createGroup({ name: '三组' })

    await repository.updateGroup({
      groupId: third.id,
      expectedRevision: 0,
      position: 1
    })

    expect(
      (await repository.getSnapshot()).groups.map(
        ({ id, position, revision }) => ({ id, position, revision })
      )
    ).toEqual([
      { id: first.id, position: 0, revision: 0 },
      { id: third.id, position: 10, revision: 1 },
      { id: second.id, position: 20, revision: 1 }
    ])
  })

  it('allows the first group to participate in manual ordering', async () => {
    const first = await repository.createGroup({ name: '一组' })
    const second = await repository.createGroup({ name: '二组' })

    await repository.updateGroup({
      groupId: first.id,
      expectedRevision: 0,
      position: 1
    })

    expect(
      (await repository.getSnapshot()).groups.map(({ id, position }) => ({
        id,
        position
      }))
    ).toEqual([
      { id: second.id, position: 0 },
      { id: first.id, position: 10 }
    ])
  })

  it('creates, renames, and reorders groups', async () => {
    const first = await repository.createGroup({ name: '产品' })
    const created = await repository.createGroup({ name: '研发' })
    const updated = await repository.updateGroup({
      groupId: created.id,
      expectedRevision: 0,
      name: '工程',
      position: 0
    })

    expect(updated).toMatchObject({
      id: created.id,
      name: '工程',
      position: 0,
      revision: 1
    })
    const snapshot = await repository.getSnapshot()
    expect(snapshot.groups.map(({ id }) => id)).toEqual([created.id, first.id])
  })

  it('deletes the only group, its sites, and icon attachments atomically', async () => {
    const group = await repository.createGroup({ name: '文档' })
    const site = await repository.createSite({
      groupId: group.id,
      name: 'RealmFlow',
      url: 'https://realmflow.dev/',
      openMode: 'embedded'
    })
    database
      .prepare(
        `INSERT INTO workbench_attachments (
          id, owner_type, owner_id, file_name, mime_type, size_bytes,
          checksum_sha256, relative_path, created_at
        ) VALUES (?, 'site_icon', ?, 'icon.png', 'image/png', 1, ?, ?, 1)`
      )
      .run('icon-1', site.id, '0'.repeat(64), 'icon-1/icon.png')

    await repository.deleteGroup({
      groupId: group.id,
      expectedRevision: group.revision
    })

    const snapshot = await repository.getSnapshot()
    expect(snapshot.groups).toEqual([])
    expect(snapshot.sites).toEqual([])
    expect(
      database
        .prepare(
          `SELECT deleted_at FROM workbench_attachments WHERE id = 'icon-1'`
        )
        .get()
    ).toEqual({ deleted_at: expect.any(Number) })
  })

  it('does not partially delete a group when its revision is stale', async () => {
    const group = await repository.createGroup({ name: '常用' })
    const site = await repository.createSite({
      groupId: group.id,
      name: 'RealmFlow',
      url: 'https://realmflow.dev/',
      openMode: 'embedded'
    })
    await repository.updateGroup({
      groupId: group.id,
      expectedRevision: 0,
      name: '已更新'
    })

    await expect(
      repository.deleteGroup({
        groupId: group.id,
        expectedRevision: 0
      })
    ).rejects.toEqual(new WorkbenchSiteRevisionConflictError(1))

    const snapshot = await repository.getSnapshot()
    expect(snapshot.groups).toEqual([
      expect.objectContaining({ id: group.id, name: '已更新' })
    ])
    expect(snapshot.sites).toEqual([expect.objectContaining({ id: site.id })])
  })

  it('creates, edits, moves, reorders, and soft deletes sites', async () => {
    const group = await repository.createGroup({ name: '产品' })
    const site = await repository.createSite({
      groupId: group.id,
      name: 'RealmFlow',
      url: 'https://realmflow.dev/',
      openMode: 'embedded'
    })
    const updated = await repository.updateSite({
      siteId: site.id,
      expectedRevision: 0,
      groupId: group.id,
      name: 'RealmFlow Docs',
      url: 'https://realmflow.dev/docs',
      openMode: 'external',
      position: 30
    })

    expect(updated).toMatchObject({
      groupId: group.id,
      name: 'RealmFlow Docs',
      url: 'https://realmflow.dev/docs',
      openMode: 'external',
      position: 30,
      revision: 1
    })
    await repository.deleteSite({
      siteId: site.id,
      expectedRevision: 1
    })
    expect((await repository.getSnapshot()).sites).toEqual([])
  })

  it('rejects stale revisions and icon attachments owned by another site', async () => {
    const group = await repository.createGroup({ name: '产品' })
    const site = await repository.createSite({
      groupId: group.id,
      name: 'RealmFlow',
      url: 'https://realmflow.dev/',
      openMode: 'embedded'
    })
    await repository.updateSite({
      siteId: site.id,
      expectedRevision: 0,
      name: 'Updated'
    })
    await expect(
      repository.updateSite({
        siteId: site.id,
        expectedRevision: 0,
        name: 'Stale'
      })
    ).rejects.toEqual(new WorkbenchSiteRevisionConflictError(1))

    database
      .prepare(
        `INSERT INTO workbench_attachments (
          id, owner_type, owner_id, file_name, mime_type, size_bytes,
          checksum_sha256, relative_path, created_at
        ) VALUES (?, 'site_icon', ?, 'icon.png', 'image/png', 1, ?, ?, 1)`
      )
      .run(
        'icon-1',
        'another-site',
        '0'.repeat(64),
        'icon-1/icon.png'
      )
    await expect(
      repository.updateSite({
        siteId: site.id,
        expectedRevision: 1,
        iconAttachmentId: 'icon-1'
      })
    ).rejects.toThrow('icon attachment')
  })
})
