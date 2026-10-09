import { createHash } from 'node:crypto'
import {
  access,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  truncate,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../infrastructure/sqlite/database'
import {
  sanitizeAttachmentFileName,
  WorkbenchAttachmentStore
} from './workbench-attachment-store'

let directory: string
let database: RealmFlowDatabase
let rootPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-attachments-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  rootPath = join(directory, 'user-data', 'workbench', 'attachments')
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('workbench attachment store', () => {
  it('sanitizes file names without allowing path traversal', () => {
    expect(sanitizeAttachmentFileName('../../release notes?.txt')).toBe(
      'release notes_.txt'
    )
    expect(sanitizeAttachmentFileName('..\\..\\CON')).toBe('_CON')
    expect(sanitizeAttachmentFileName('   ')).toBe('attachment')
  })

  it('copies a regular file through temp storage and records its checksum', async () => {
    const sourcePath = join(directory, 'release notes.txt')
    await writeFile(sourcePath, 'realmflow')
    const store = new WorkbenchAttachmentStore(database, rootPath, {
      createId: () => 'attachment-1',
      now: () => 123
    })

    const attachment = await store.importFromPath({
      sourcePath,
      ownerType: 'task_record',
      ownerId: 'record-1'
    })

    expect(attachment).toEqual({
      id: 'attachment-1',
      ownerType: 'task_record',
      ownerId: 'record-1',
      fileName: 'release notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 9,
      checksumSha256: createHash('sha256').update('realmflow').digest('hex'),
      createdAt: 123
    })
    expect(
      await readFile(
        join(rootPath, 'attachment-1', 'release notes.txt'),
        'utf8'
      )
    ).toBe('realmflow')
    await expect(access(join(rootPath, '.tmp', 'attachment-1.tmp'))).rejects.toThrow()
  })

  it('rejects symbolic links and stored paths that escape the root', async () => {
    const sourcePath = join(directory, 'source.txt')
    const linkPath = join(directory, 'source-link.txt')
    await writeFile(sourcePath, 'content')
    await symlink(sourcePath, linkPath)
    const store = new WorkbenchAttachmentStore(database, rootPath)

    await expect(
      store.importFromPath({
        sourcePath: linkPath,
        ownerType: 'memo',
        ownerId: 'memo-1'
      })
    ).rejects.toThrow('symbolic link')

    database
      .prepare(
        `INSERT INTO workbench_attachments (
          id, owner_type, owner_id, file_name, mime_type, size_bytes,
          checksum_sha256, relative_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'escaped',
        'memo',
        'memo-1',
        'outside.txt',
        'text/plain',
        1,
        '0'.repeat(64),
        '../outside.txt',
        1
      )
    await expect(store.resolveForReveal('escaped')).rejects.toThrow(
      'outside attachment root'
    )
  })

  it('enforces the 100MB file and 20MB image limits', async () => {
    const filePath = join(directory, 'large.bin')
    const imagePath = join(directory, 'large.png')
    await writeFile(filePath, '')
    await writeFile(imagePath, '')
    await truncate(filePath, 100 * 1024 * 1024 + 1)
    await truncate(imagePath, 20 * 1024 * 1024 + 1)
    const store = new WorkbenchAttachmentStore(database, rootPath)

    await expect(
      store.importFromPath({
        sourcePath: filePath,
        ownerType: 'memo',
        ownerId: 'memo-1'
      })
    ).rejects.toThrow('100MB')
    await expect(
      store.importFromPath({
        sourcePath: imagePath,
        ownerType: 'site_icon',
        ownerId: 'site-1',
        accept: 'image'
      })
    ).rejects.toThrow('20MB')
  })

  it('validates image MIME and blocks executable files from automatic open', async () => {
    const textPath = join(directory, 'not-an-image.txt')
    const executablePath = join(directory, 'run.command')
    await writeFile(textPath, 'text')
    await writeFile(executablePath, 'echo unsafe')
    const ids = ['attachment-text', 'attachment-executable']
    const store = new WorkbenchAttachmentStore(database, rootPath, {
      createId: () => ids.shift() ?? 'missing'
    })

    await expect(
      store.importFromPath({
        sourcePath: textPath,
        ownerType: 'site_icon',
        ownerId: 'site-1',
        accept: 'image'
      })
    ).rejects.toThrow('image')
    const executable = await store.importFromPath({
      sourcePath: executablePath,
      ownerType: 'memo',
      ownerId: 'memo-1'
    })
    await expect(store.resolveForOpen(executable.id)).rejects.toThrow(
      'executable'
    )
    await expect(store.resolveForReveal(executable.id)).resolves.toContain(
      'run.command'
    )
  })

  it('reads stored images as renderer-safe data URLs', async () => {
    const imagePath = join(directory, 'icon.png')
    await writeFile(imagePath, 'png')
    const store = new WorkbenchAttachmentStore(database, rootPath, {
      createId: () => 'image-1'
    })
    const image = await store.importFromPath({
      sourcePath: imagePath,
      ownerType: 'site_icon',
      ownerId: 'site-1',
      accept: 'image'
    })

    await expect(store.readImageDataUrl(image.id)).resolves.toBe(
      'data:image/png;base64,cG5n'
    )
  })

  it('removes the temporary file when the database insert fails', async () => {
    const sourcePath = join(directory, 'duplicate.txt')
    await writeFile(sourcePath, 'duplicate')
    database
      .prepare(
        `INSERT INTO workbench_attachments (
          id, owner_type, owner_id, file_name, mime_type, size_bytes,
          checksum_sha256, relative_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'duplicate-id',
        'memo',
        'memo-1',
        'existing.txt',
        'text/plain',
        1,
        '0'.repeat(64),
        'duplicate-id/existing.txt',
        1
      )
    const store = new WorkbenchAttachmentStore(database, rootPath, {
      createId: () => 'duplicate-id'
    })

    await expect(
      store.importFromPath({
        sourcePath,
        ownerType: 'memo',
        ownerId: 'memo-1'
      })
    ).rejects.toThrow()
    await expect(
      access(join(rootPath, '.tmp', 'duplicate-id.tmp'))
    ).rejects.toThrow()
  })

  it('rolls back the database row when final rename fails', async () => {
    const sourcePath = join(directory, 'rename.txt')
    await writeFile(sourcePath, 'rename')
    const rename = vi.fn().mockRejectedValue(new Error('rename failed'))
    const store = new WorkbenchAttachmentStore(database, rootPath, {
      createId: () => 'rename-failure',
      rename
    })

    await expect(
      store.importFromPath({
        sourcePath,
        ownerType: 'memo',
        ownerId: 'memo-1'
      })
    ).rejects.toThrow('rename failed')

    expect(
      database
        .prepare('SELECT COUNT(*) FROM workbench_attachments WHERE id = ?')
        .pluck()
        .get('rename-failure')
    ).toBe(0)
    expect(rename).toHaveBeenCalledOnce()
    await expect(
      access(join(rootPath, '.tmp', 'rename-failure.tmp'))
    ).rejects.toThrow()
  })

  it('rejects symbolic links found at a stored final path', async () => {
    const outsidePath = join(directory, 'outside.txt')
    await writeFile(outsidePath, 'outside')
    const attachmentDirectory = join(rootPath, 'linked')
    await mkdir(attachmentDirectory, { recursive: true })
    await symlink(outsidePath, join(attachmentDirectory, 'linked.txt'))
    database
      .prepare(
        `INSERT INTO workbench_attachments (
          id, owner_type, owner_id, file_name, mime_type, size_bytes,
          checksum_sha256, relative_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'linked',
        'memo',
        'memo-1',
        'linked.txt',
        'text/plain',
        7,
        '0'.repeat(64),
        'linked/linked.txt',
        1
      )
    const store = new WorkbenchAttachmentStore(database, rootPath)

    await expect(store.resolveForReveal('linked')).rejects.toThrow(
      'symbolic link'
    )
    expect((await lstat(join(attachmentDirectory, 'linked.txt'))).isSymbolicLink())
      .toBe(true)
  })

  it('recovers an interrupted import from its durable temp file', async () => {
    insertMemoOwner('memo-recovery')
    insertAttachmentRow({
      id: 'attachment-recovery',
      ownerType: 'memo',
      ownerId: 'memo-recovery',
      fileName: 'recovered.txt'
    })
    await mkdir(join(rootPath, '.tmp'), { recursive: true })
    await writeFile(
      join(rootPath, '.tmp', 'attachment-recovery.tmp'),
      'recovered'
    )
    const store = new WorkbenchAttachmentStore(database, rootPath)

    const report = await store.reconcile()

    expect(report).toMatchObject({ recoveredFiles: 1, removedRows: 0 })
    expect(
      await readFile(
        join(rootPath, 'attachment-recovery', 'recovered.txt'),
        'utf8'
      )
    ).toBe('recovered')
  })

  it('removes ownerless rows, missing-file rows, and untracked files idempotently', async () => {
    insertAttachmentRow({
      id: 'ownerless',
      ownerType: 'memo',
      ownerId: 'missing-memo',
      fileName: 'ownerless.txt'
    })
    await mkdir(join(rootPath, 'ownerless'), { recursive: true })
    await writeFile(join(rootPath, 'ownerless', 'ownerless.txt'), 'orphan')

    insertMemoOwner('memo-missing-file')
    insertAttachmentRow({
      id: 'missing-file',
      ownerType: 'memo',
      ownerId: 'memo-missing-file',
      fileName: 'missing.txt'
    })

    await mkdir(join(rootPath, 'untracked'), { recursive: true })
    await writeFile(join(rootPath, 'untracked', 'file.txt'), 'untracked')
    await mkdir(join(rootPath, '.tmp'), { recursive: true })
    await writeFile(join(rootPath, '.tmp', 'abandoned.tmp'), 'temporary')
    const store = new WorkbenchAttachmentStore(database, rootPath)

    const first = await store.reconcile()
    const second = await store.reconcile()

    expect(first).toMatchObject({
      removedRows: 2,
      removedDirectories: 2,
      removedTemporaryFiles: 1
    })
    expect(second).toEqual({
      recoveredFiles: 0,
      removedRows: 0,
      removedDirectories: 0,
      removedTemporaryFiles: 0
    })
    expect(
      database
        .prepare('SELECT COUNT(*) FROM workbench_attachments')
        .pluck()
        .get()
    ).toBe(0)
  })

  it('retries reconciliation after an interrupted recovery', async () => {
    insertMemoOwner('memo-interrupted')
    insertAttachmentRow({
      id: 'attachment-interrupted',
      ownerType: 'memo',
      ownerId: 'memo-interrupted',
      fileName: 'interrupted.txt'
    })
    await mkdir(join(rootPath, '.tmp'), { recursive: true })
    await writeFile(
      join(rootPath, '.tmp', 'attachment-interrupted.tmp'),
      'recover me'
    )
    const move = vi
      .fn<typeof rename>()
      .mockRejectedValueOnce(new Error('simulated interruption'))
      .mockImplementation(rename)
    const store = new WorkbenchAttachmentStore(database, rootPath, {
      rename: move
    })

    await expect(store.reconcile()).rejects.toThrow('simulated interruption')
    expect(
      database
        .prepare(
          'SELECT COUNT(*) FROM workbench_attachments WHERE id = ?'
        )
        .pluck()
        .get('attachment-interrupted')
    ).toBe(1)

    await expect(store.reconcile()).resolves.toMatchObject({
      recoveredFiles: 1,
      removedRows: 0
    })
    await expect(
      readFile(
        join(
          rootPath,
          'attachment-interrupted',
          'interrupted.txt'
        ),
        'utf8'
      )
    ).resolves.toBe('recover me')
  })
})

function insertMemoOwner(id: string): void {
  database
    .prepare(
      `INSERT INTO workbench_memos (
        id, title, document_json, plain_text, position, revision,
        created_at, updated_at
      ) VALUES (?, 'Memo', '{"type":"doc","content":[]}', '', 0, 0, 1, 1)`
    )
    .run(id)
}

function insertAttachmentRow(input: {
  id: string
  ownerType: 'task_record' | 'site_icon' | 'memo'
  ownerId: string
  fileName: string
}): void {
  database
    .prepare(
      `INSERT INTO workbench_attachments (
        id, owner_type, owner_id, file_name, mime_type, size_bytes,
        checksum_sha256, relative_path, created_at
      ) VALUES (?, ?, ?, ?, 'text/plain', 1, ?, ?, 1)`
    )
    .run(
      input.id,
      input.ownerType,
      input.ownerId,
      input.fileName,
      '0'.repeat(64),
      `${input.id}/${input.fileName}`
    )
}
