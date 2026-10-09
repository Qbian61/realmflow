import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  collectWorkbenchMemoAttachmentIds,
  extractWorkbenchMemoPlainText,
  sanitizeWorkbenchMemoDocument,
  type DeletedWorkbenchMemo,
  type WorkbenchMemo,
  type WorkbenchMemoDocument
} from '../../../../shared/workbench-memos'

export class WorkbenchMemoRevisionConflictError extends Error {
  readonly code = 'revision_conflict'

  constructor(readonly currentRevision: number) {
    super('Workbench memo revision conflict')
    this.name = 'WorkbenchMemoRevisionConflictError'
  }
}

type MemoRow = {
  id: string
  title: string
  document_json: string
  plain_text: string
  position: number
  revision: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export type WorkbenchMemoRepository = {
  getMemos(): Promise<WorkbenchMemo[]>
  getDeletedMemos(): Promise<DeletedWorkbenchMemo[]>
  getMemo(memoId: string): Promise<WorkbenchMemo>
  createMemo(input: {
    title: string
    document: WorkbenchMemoDocument
  }): Promise<WorkbenchMemo>
  updateMemo(input: {
    memoId: string
    expectedRevision: number
    title?: string
    document?: WorkbenchMemoDocument
    position?: number
  }): Promise<WorkbenchMemo>
  deleteMemo(input: {
    memoId: string
    expectedRevision: number
  }): Promise<void>
  restoreMemo(input: {
    memoId: string
    expectedRevision: number
  }): Promise<WorkbenchMemo>
}

export class SqliteWorkbenchMemoRepository
  implements WorkbenchMemoRepository
{
  constructor(private readonly database: Database.Database) {}

  async getMemos(): Promise<WorkbenchMemo[]> {
    return (
      this.database
        .prepare(
          `SELECT id, title, document_json, plain_text, position, revision,
                  created_at, updated_at, deleted_at
           FROM workbench_memos
           WHERE deleted_at IS NULL
           ORDER BY position, id`
        )
        .all() as MemoRow[]
    ).map(toMemo)
  }

  async getDeletedMemos(): Promise<DeletedWorkbenchMemo[]> {
    return (
      this.database
        .prepare(
          `SELECT id, title, document_json, plain_text, position, revision,
                  created_at, updated_at, deleted_at
           FROM workbench_memos
           WHERE deleted_at IS NOT NULL
           ORDER BY deleted_at DESC, id`
        )
        .all() as MemoRow[]
    ).map(toDeletedMemo)
  }

  async getMemo(memoId: string): Promise<WorkbenchMemo> {
    return toMemo(this.getRow(memoId))
  }

  async createMemo(input: {
    title: string
    document: WorkbenchMemoDocument
  }): Promise<WorkbenchMemo> {
    return this.database.transaction(() => {
      const id = randomUUID()
      const now = Date.now()
      const document = sanitizeWorkbenchMemoDocument(input.document)
      this.assertAttachments(id, document)
      this.database
        .prepare(
          `INSERT INTO workbench_memos (
            id, title, document_json, plain_text, position, revision,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          id,
          parseTitle(input.title),
          JSON.stringify(document),
          extractWorkbenchMemoPlainText(document),
          this.nextPosition(),
          now,
          now
        )
      return toMemo(this.getRow(id))
    })()
  }

  async updateMemo(input: {
    memoId: string
    expectedRevision: number
    title?: string
    document?: WorkbenchMemoDocument
    position?: number
  }): Promise<WorkbenchMemo> {
    return this.database.transaction(() => {
      const current = this.getRow(input.memoId)
      assertRevision(current.revision, input.expectedRevision)
      const document =
        input.document === undefined
          ? sanitizeWorkbenchMemoDocument(JSON.parse(current.document_json))
          : sanitizeWorkbenchMemoDocument(input.document)
      this.assertAttachments(input.memoId, document)
      const now = Date.now()
      const position =
        input.position === undefined
          ? current.position
          : this.moveMemoSync(
              input.memoId,
              parsePosition(input.position),
              now
            )
      this.database
        .prepare(
          `UPDATE workbench_memos
           SET title = ?, document_json = ?, plain_text = ?, position = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(
          input.title === undefined ? current.title : parseTitle(input.title),
          JSON.stringify(document),
          extractWorkbenchMemoPlainText(document),
          position,
          now,
          input.memoId
        )
      return toMemo(this.getRow(input.memoId))
    })()
  }

  async deleteMemo(input: {
    memoId: string
    expectedRevision: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getRow(input.memoId)
      assertRevision(current.revision, input.expectedRevision)
      const now = Date.now()
      this.database
        .prepare(
          `UPDATE workbench_memos
           SET deleted_at = ?, updated_at = ?, revision = revision + 1
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(now, now, input.memoId)
      this.database
        .prepare(
          `UPDATE workbench_attachments
           SET deleted_at = ?
           WHERE owner_type = 'memo' AND owner_id = ? AND deleted_at IS NULL`
        )
        .run(now, input.memoId)
    })()
  }

  async restoreMemo(input: {
    memoId: string
    expectedRevision: number
  }): Promise<WorkbenchMemo> {
    return this.database.transaction(() => {
      const current = this.getDeletedRow(input.memoId)
      assertRevision(current.revision, input.expectedRevision)
      const now = Date.now()
      this.database
        .prepare(
          `UPDATE workbench_memos
           SET deleted_at = NULL, updated_at = ?, revision = revision + 1
           WHERE id = ? AND deleted_at IS NOT NULL`
        )
        .run(now, input.memoId)
      this.database
        .prepare(
          `UPDATE workbench_attachments
           SET deleted_at = NULL
           WHERE owner_type = 'memo' AND owner_id = ? AND deleted_at = ?`
        )
        .run(input.memoId, current.deleted_at)
      return toMemo(this.getRow(input.memoId))
    })()
  }

  private getRow(memoId: string): MemoRow {
    const row = this.database
      .prepare(
        `SELECT id, title, document_json, plain_text, position, revision,
                created_at, updated_at, deleted_at
         FROM workbench_memos
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(memoId) as MemoRow | undefined
    if (!row) throw new Error('Workbench memo not found')
    return row
  }

  private moveMemoSync(
    memoId: string,
    targetIndex: number,
    updatedAt: number
  ): number {
    const memos = this.database
      .prepare(
        `SELECT id, title, document_json, plain_text, position, revision,
                created_at, updated_at, deleted_at
         FROM workbench_memos
         WHERE deleted_at IS NULL
         ORDER BY position, id`
      )
      .all() as MemoRow[]
    const sourceIndex = memos.findIndex(({ id }) => id === memoId)
    if (sourceIndex < 0) throw new Error('Workbench memo not found')
    const [moved] = memos.splice(sourceIndex, 1)
    const clampedTarget = Math.min(targetIndex, memos.length)
    memos.splice(clampedTarget, 0, moved)
    const update = this.database.prepare(
      `UPDATE workbench_memos
       SET position = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    for (const [index, memo] of memos.entries()) {
      const position = index * 10
      if (memo.id !== memoId && memo.position !== position) {
        update.run(position, updatedAt, memo.id)
      }
    }
    return clampedTarget * 10
  }

  private getDeletedRow(memoId: string): MemoRow {
    const row = this.database
      .prepare(
        `SELECT id, title, document_json, plain_text, position, revision,
                created_at, updated_at, deleted_at
         FROM workbench_memos
         WHERE id = ? AND deleted_at IS NOT NULL`
      )
      .get(memoId) as MemoRow | undefined
    if (!row) throw new Error('Deleted workbench memo not found')
    return row
  }

  private nextPosition(): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(MAX(position), 0) AS position
         FROM workbench_memos WHERE deleted_at IS NULL`
      )
      .get() as { position: number }
    return row.position + 10
  }

  private assertAttachments(
    memoId: string,
    document: WorkbenchMemoDocument
  ): void {
    const ids = collectWorkbenchMemoAttachmentIds(document)
    if (ids.length === 0) return
    const statement = this.database.prepare(
      `SELECT 1 FROM workbench_attachments
       WHERE id = ? AND owner_type = 'memo' AND owner_id = ?
         AND deleted_at IS NULL`
    )
    for (const id of ids) {
      if (!statement.get(id, memoId)) {
        throw new Error('Invalid workbench memo attachment')
      }
    }
  }
}

function toMemo(row: MemoRow): WorkbenchMemo {
  return {
    id: row.id,
    title: row.title,
    document: sanitizeWorkbenchMemoDocument(JSON.parse(row.document_json)),
    plainText: row.plain_text,
    position: row.position,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toDeletedMemo(row: MemoRow): DeletedWorkbenchMemo {
  if (row.deleted_at === null) {
    throw new Error('Workbench memo is not deleted')
  }
  return { ...toMemo(row), deletedAt: row.deleted_at }
}

function assertRevision(current: number, expected: number): void {
  if (current !== expected) {
    throw new WorkbenchMemoRevisionConflictError(current)
  }
}

function parseTitle(value: string): string {
  const title = value.trim()
  if (!title || title.length > 200) {
    throw new Error('Invalid workbench memo title')
  }
  return title
}

function parsePosition(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new Error('Invalid workbench memo position')
  }
  return value
}
