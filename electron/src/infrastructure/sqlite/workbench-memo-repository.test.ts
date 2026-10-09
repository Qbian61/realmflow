import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyWorkbenchMemoDocument } from '../../../../shared/workbench-memos'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import {
  SqliteWorkbenchMemoRepository,
  WorkbenchMemoRevisionConflictError
} from './workbench-memo-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteWorkbenchMemoRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-workbench-memos-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteWorkbenchMemoRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite workbench memo repository', () => {
  it('reorders memos transactionally by target index', async () => {
    const first = await repository.createMemo({
      title: '一',
      document: createEmptyWorkbenchMemoDocument()
    })
    const second = await repository.createMemo({
      title: '二',
      document: createEmptyWorkbenchMemoDocument()
    })
    const third = await repository.createMemo({
      title: '三',
      document: createEmptyWorkbenchMemoDocument()
    })

    await repository.updateMemo({
      memoId: first.id,
      expectedRevision: 0,
      position: 2
    })

    expect(
      (await repository.getMemos()).map(({ id, position, revision }) => ({
        id,
        position,
        revision
      }))
    ).toEqual([
      { id: second.id, position: 0, revision: 1 },
      { id: third.id, position: 10, revision: 1 },
      { id: first.id, position: 20, revision: 1 }
    ])
  })

  it('creates, renames, reorders, updates documents, and soft deletes memos', async () => {
    const created = await repository.createMemo({
      title: '计划',
      document: createEmptyWorkbenchMemoDocument()
    })
    const updated = await repository.updateMemo({
      memoId: created.id,
      expectedRevision: 0,
      title: '发布计划',
      position: 30,
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '完成发布' }]
          }
        ]
      }
    })

    expect(updated).toMatchObject({
      id: created.id,
      title: '发布计划',
      plainText: '完成发布',
      position: 0,
      revision: 1
    })
    await repository.deleteMemo({
      memoId: created.id,
      expectedRevision: 1
    })
    expect(await repository.getMemos()).toEqual([])

    const deleted = await repository.getDeletedMemos()
    expect(deleted).toMatchObject([
      {
        id: created.id,
        title: '发布计划',
        revision: 2,
        deletedAt: expect.any(Number)
      }
    ])

    const restored = await repository.restoreMemo({
      memoId: created.id,
      expectedRevision: 2
    })
    expect(restored).toMatchObject({
      id: created.id,
      title: '发布计划',
      revision: 3
    })
    expect(await repository.getDeletedMemos()).toEqual([])
  })

  it('restores soft-deleted memo attachments in the same transaction', async () => {
    const memo = await repository.createMemo({
      title: '附件',
      document: createEmptyWorkbenchMemoDocument()
    })
    database
      .prepare(
        `INSERT INTO workbench_attachments (
          id, owner_type, owner_id, file_name, mime_type, size_bytes,
          checksum_sha256, relative_path, created_at
        ) VALUES (?, 'memo', ?, 'file.pdf', 'application/pdf', 1, ?, ?, 1)`
      )
      .run('attachment-restore', memo.id, '0'.repeat(64), 'a/file.pdf')

    await repository.deleteMemo({ memoId: memo.id, expectedRevision: 0 })
    await repository.restoreMemo({ memoId: memo.id, expectedRevision: 1 })

    expect(
      database
        .prepare(
          `SELECT deleted_at FROM workbench_attachments WHERE id = ?`
        )
        .get('attachment-restore')
    ).toEqual({ deleted_at: null })
  })

  it('rejects stale revisions without overwriting newer content', async () => {
    const memo = await repository.createMemo({
      title: '计划',
      document: createEmptyWorkbenchMemoDocument()
    })
    await repository.updateMemo({
      memoId: memo.id,
      expectedRevision: 0,
      title: '新计划'
    })

    await expect(
      repository.updateMemo({
        memoId: memo.id,
        expectedRevision: 0,
        title: '旧计划'
      })
    ).rejects.toEqual(new WorkbenchMemoRevisionConflictError(1))
    expect((await repository.getMemo(memo.id)).title).toBe('新计划')
  })

  it('accepts document attachment nodes only when owned by the memo', async () => {
    const memo = await repository.createMemo({
      title: '附件',
      document: createEmptyWorkbenchMemoDocument()
    })
    database
      .prepare(
        `INSERT INTO workbench_attachments (
          id, owner_type, owner_id, file_name, mime_type, size_bytes,
          checksum_sha256, relative_path, created_at
        ) VALUES (?, 'memo', ?, 'file.pdf', 'application/pdf', 1, ?, ?, 1)`
      )
      .run('attachment-1', 'another-memo', '0'.repeat(64), 'a/file.pdf')

    await expect(
      repository.updateMemo({
        memoId: memo.id,
        expectedRevision: 0,
        document: {
          type: 'doc',
          content: [
            {
              type: 'fileAttachment',
              attrs: { attachmentId: 'attachment-1' }
            }
          ]
        }
      })
    ).rejects.toThrow('attachment')
  })

  it('keeps large memo and multi-image reads within a bounded heap budget', async () => {
    const memo = await repository.createMemo({
      title: 'Large memo',
      document: createEmptyWorkbenchMemoDocument()
    })
    const insert = database.prepare(
      `INSERT INTO workbench_attachments (
        id, owner_type, owner_id, file_name, mime_type, size_bytes,
        checksum_sha256, relative_path, created_at
      ) VALUES (?, 'memo', ?, ?, 'image/png', 1, ?, ?, 1)`
    )
    database.transaction(() => {
      for (let index = 0; index < 100; index += 1) {
        const id = `image-${index}`
        insert.run(
          id,
          memo.id,
          `${id}.png`,
          '0'.repeat(64),
          `${id}/${id}.png`
        )
      }
    })()
    await repository.updateMemo({
      memoId: memo.id,
      expectedRevision: 0,
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x'.repeat(800_000) }]
          },
          ...Array.from({ length: 100 }, (_, index) => ({
            type: 'image' as const,
            attrs: { attachmentId: `image-${index}` }
          }))
        ]
      }
    })
    const before = process.memoryUsage().heapUsed
    const retained = []

    for (let index = 0; index < 20; index += 1) {
      retained.push(await repository.getMemos())
    }
    const growth = process.memoryUsage().heapUsed - before

    expect(retained.at(-1)?.[0].document.content).toHaveLength(101)
    expect(growth).toBeLessThan(64 * 1024 * 1024)
  })
})
