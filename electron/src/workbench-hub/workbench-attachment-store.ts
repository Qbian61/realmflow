import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  constants,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm
} from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  WorkbenchAttachment,
  WorkbenchAttachmentOwnerType
} from '../../../shared/workbench-attachments'

const MAX_FILE_SIZE = 100 * 1024 * 1024
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const COPY_BUFFER_SIZE = 64 * 1024

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip'
}

const EXECUTABLE_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.command',
  '.exe',
  '.js',
  '.jse',
  '.msi',
  '.ps1',
  '.sh',
  '.vbs',
  '.wsf'
])

type AttachmentRow = {
  id: string
  owner_type: WorkbenchAttachmentOwnerType
  owner_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  checksum_sha256: string
  relative_path: string
  created_at: number
  deleted_at: number | null
}

type AttachmentStoreDependencies = {
  createId: () => string
  now: () => number
  rename: typeof rename
}

export type ImportWorkbenchAttachmentInput = {
  sourcePath: string
  ownerType: WorkbenchAttachmentOwnerType
  ownerId: string
  accept?: 'any' | 'image'
}

export type WorkbenchAttachmentReconcileReport = {
  recoveredFiles: number
  removedRows: number
  removedDirectories: number
  removedTemporaryFiles: number
}

export class WorkbenchAttachmentStore {
  private readonly dependencies: AttachmentStoreDependencies

  constructor(
    private readonly database: Database.Database,
    private readonly rootPath: string,
    dependencies: Partial<AttachmentStoreDependencies> = {}
  ) {
    this.dependencies = {
      createId: dependencies.createId ?? randomUUID,
      now: dependencies.now ?? Date.now,
      rename: dependencies.rename ?? rename
    }
  }

  async importFromPath(
    input: ImportWorkbenchAttachmentInput
  ): Promise<WorkbenchAttachment> {
    const source = await lstat(input.sourcePath)
    if (source.isSymbolicLink()) {
      throw new Error('Attachment source cannot be a symbolic link')
    }
    if (!source.isFile()) {
      throw new Error('Attachment source must be a regular file')
    }

    const id = safePathSegment(this.dependencies.createId(), 'attachment id')
    const fileName = sanitizeAttachmentFileName(basename(input.sourcePath))
    const mimeType = inferMimeType(fileName)
    const isImage = mimeType.startsWith('image/')
    if ((input.accept ?? 'any') === 'image' && !isImage) {
      throw new Error('Selected attachment must be an image')
    }
    const limit = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE
    if (source.size > limit) {
      throw new Error(
        `Attachment exceeds the ${isImage ? '20MB' : '100MB'} limit`
      )
    }

    const temporaryDirectory = resolve(this.rootPath, '.tmp')
    const temporaryPath = resolve(temporaryDirectory, `${id}.tmp`)
    const relativePath = `${id}/${fileName}`
    const finalDirectory = resolve(this.rootPath, id)
    const finalPath = resolve(finalDirectory, fileName)
    await mkdir(temporaryDirectory, { recursive: true })

    let inserted = false
    try {
      const checksumSha256 = await copyAndHash(
        input.sourcePath,
        temporaryPath,
        limit
      )
      const now = this.dependencies.now()
      this.database.transaction(() => {
        this.database
          .prepare(
            `INSERT INTO workbench_attachments (
              id, owner_type, owner_id, file_name, mime_type, size_bytes,
              checksum_sha256, relative_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            input.ownerType,
            input.ownerId,
            fileName,
            mimeType,
            source.size,
            checksumSha256,
            relativePath,
            now
          )
      })()
      inserted = true

      await mkdir(finalDirectory, { recursive: false })
      await this.dependencies.rename(temporaryPath, finalPath)
      return {
        id,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        fileName,
        mimeType,
        sizeBytes: source.size,
        checksumSha256,
        createdAt: now
      }
    } catch (error) {
      if (inserted) {
        this.database.transaction(() => {
          this.database
            .prepare('DELETE FROM workbench_attachments WHERE id = ?')
            .run(id)
        })()
      }
      await rm(temporaryPath, { force: true })
      await rm(finalDirectory, { recursive: true, force: true })
      throw error
    }
  }

  async list(
    ownerType: WorkbenchAttachmentOwnerType,
    ownerId: string
  ): Promise<WorkbenchAttachment[]> {
    const rows = this.database
      .prepare(
        `SELECT *
         FROM workbench_attachments
         WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL
         ORDER BY created_at, id`
      )
      .all(ownerType, ownerId) as AttachmentRow[]
    return rows.map(toAttachment)
  }

  async resolveForOpen(attachmentId: string): Promise<string> {
    const row = this.getRow(attachmentId)
    if (EXECUTABLE_EXTENSIONS.has(extname(row.file_name).toLowerCase())) {
      throw new Error('executable attachments cannot be opened automatically')
    }
    return this.resolveStoredPath(row.relative_path)
  }

  async resolveForReveal(attachmentId: string): Promise<string> {
    return this.resolveStoredPath(this.getRow(attachmentId).relative_path)
  }

  async readImageDataUrl(attachmentId: string): Promise<string> {
    const row = this.getRow(attachmentId)
    if (!row.mime_type.startsWith('image/')) {
      throw new Error('Attachment is not an image')
    }
    const path = await this.resolveStoredPath(row.relative_path)
    const content = await readFile(path)
    return `data:${row.mime_type};base64,${content.toString('base64')}`
  }

  async softDelete(attachmentId: string): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE workbench_attachments
         SET deleted_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(this.dependencies.now(), attachmentId)
    if (result.changes !== 1) {
      throw new Error(`Workbench attachment not found: ${attachmentId}`)
    }
  }

  async reconcile(): Promise<WorkbenchAttachmentReconcileReport> {
    await mkdir(this.rootPath, { recursive: true })
    const temporaryDirectory = resolve(this.rootPath, '.tmp')
    await mkdir(temporaryDirectory, { recursive: true })
    const report: WorkbenchAttachmentReconcileReport = {
      recoveredFiles: 0,
      removedRows: 0,
      removedDirectories: 0,
      removedTemporaryFiles: 0
    }
    const rows = this.database
      .prepare('SELECT * FROM workbench_attachments ORDER BY id')
      .all() as AttachmentRow[]

    for (const row of rows) {
      let safeId: string
      try {
        safeId = safePathSegment(row.id, 'attachment id')
      } catch {
        this.hardDeleteRow(row.id)
        report.removedRows += 1
        continue
      }
      const finalDirectory = resolve(this.rootPath, safeId)
      const finalPath = resolve(this.rootPath, row.relative_path)
      const temporaryPath = resolve(temporaryDirectory, `${safeId}.tmp`)
      if (
        row.file_name !== sanitizeAttachmentFileName(row.file_name) ||
        row.relative_path !== `${safeId}/${row.file_name}`
      ) {
        this.hardDeleteRow(row.id)
        report.removedRows += 1
        if (await removeIfPresent(finalDirectory, true)) {
          report.removedDirectories += 1
        }
        if (await removeIfPresent(temporaryPath, false)) {
          report.removedTemporaryFiles += 1
        }
        continue
      }
      if (!this.ownerExists(row.owner_type, row.owner_id)) {
        this.hardDeleteRow(row.id)
        report.removedRows += 1
        if (await removeIfPresent(finalDirectory, true)) {
          report.removedDirectories += 1
        }
        if (await removeIfPresent(temporaryPath, false)) {
          report.removedTemporaryFiles += 1
        }
        continue
      }

      const finalInfo = await lstatIfPresent(finalPath)
      if (finalInfo?.isFile() && !finalInfo.isSymbolicLink()) continue

      const temporaryInfo = await lstatIfPresent(temporaryPath)
      if (
        !finalInfo &&
        temporaryInfo?.isFile() &&
        !temporaryInfo.isSymbolicLink()
      ) {
        await mkdir(finalDirectory, { recursive: true })
        await this.dependencies.rename(temporaryPath, finalPath)
        report.recoveredFiles += 1
        continue
      }

      this.hardDeleteRow(row.id)
      report.removedRows += 1
      if (await removeIfPresent(finalDirectory, true)) {
        report.removedDirectories += 1
      }
      if (await removeIfPresent(temporaryPath, false)) {
        report.removedTemporaryFiles += 1
      }
    }

    const trackedIds = new Set(
      (
        this.database
          .prepare('SELECT id FROM workbench_attachments')
          .all() as Array<{ id: string }>
      ).map(({ id }) => id)
    )
    for (const entry of await readdir(this.rootPath, { withFileTypes: true })) {
      if (entry.name === '.tmp' || trackedIds.has(entry.name)) continue
      if (
        await removeIfPresent(
          resolve(this.rootPath, entry.name),
          entry.isDirectory()
        )
      ) {
        report.removedDirectories += 1
      }
    }
    for (const entry of await readdir(temporaryDirectory)) {
      if (await removeIfPresent(resolve(temporaryDirectory, entry), true)) {
        report.removedTemporaryFiles += 1
      }
    }
    return report
  }

  private getRow(attachmentId: string): AttachmentRow {
    const row = this.database
      .prepare(
        `SELECT *
         FROM workbench_attachments
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(attachmentId) as AttachmentRow | undefined
    if (!row) {
      throw new Error(`Workbench attachment not found: ${attachmentId}`)
    }
    return row
  }

  private ownerExists(
    ownerType: WorkbenchAttachmentOwnerType,
    ownerId: string
  ): boolean {
    const table = {
      memo: 'workbench_memos',
      site_icon: 'workbench_sites',
      task_record: 'workbench_task_records'
    }[ownerType]
    return Boolean(
      this.database
        .prepare(`SELECT 1 FROM ${table} WHERE id = ?`)
        .get(ownerId)
    )
  }

  private hardDeleteRow(attachmentId: string): void {
    this.database
      .prepare('DELETE FROM workbench_attachments WHERE id = ?')
      .run(attachmentId)
  }

  private async resolveStoredPath(relativePath: string): Promise<string> {
    if (isAbsolute(relativePath)) {
      throw new Error('Attachment path is outside attachment root')
    }
    const targetPath = resolve(this.rootPath, relativePath)
    const pathFromRoot = relative(resolve(this.rootPath), targetPath)
    if (
      pathFromRoot === '..' ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) {
      throw new Error('Attachment path is outside attachment root')
    }

    const parentPath = resolve(targetPath, '..')
    const [parentInfo, targetInfo] = await Promise.all([
      lstat(parentPath),
      lstat(targetPath)
    ])
    if (parentInfo.isSymbolicLink() || targetInfo.isSymbolicLink()) {
      throw new Error('Attachment path cannot contain a symbolic link')
    }
    const [realRoot, realTarget] = await Promise.all([
      realpath(this.rootPath),
      realpath(targetPath)
    ])
    if (
      realTarget !== realRoot &&
      !realTarget.startsWith(`${realRoot}${sep}`)
    ) {
      throw new Error('Attachment path is outside attachment root')
    }
    await access(realTarget, constants.R_OK)
    return realTarget
  }
}

async function lstatIfPresent(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

async function removeIfPresent(
  path: string,
  recursive: boolean
): Promise<boolean> {
  try {
    await lstat(path)
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
  await rm(path, { recursive, force: true })
  return true
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

export function sanitizeAttachmentFileName(value: string): string {
  const leaf = value.replaceAll('\\', '/').split('/').at(-1) ?? ''
  let result = leaf
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '')
  if (!result || result === '.' || result === '..') result = 'attachment'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) {
    result = `_${result}`
  }
  return result.slice(0, 180) || 'attachment'
}

async function copyAndHash(
  sourcePath: string,
  destinationPath: string,
  maxSize: number
): Promise<string> {
  const source = await open(
    sourcePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  )
  const destination = await open(destinationPath, 'wx', 0o600)
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_SIZE)
  let total = 0
  try {
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > maxSize) {
        throw new Error(
          `Attachment exceeds the ${maxSize === MAX_IMAGE_SIZE ? '20MB' : '100MB'} limit`
        )
      }
      const chunk = buffer.subarray(0, bytesRead)
      hash.update(chunk)
      await destination.write(chunk)
    }
    await destination.sync()
    return hash.digest('hex')
  } finally {
    await Promise.allSettled([source.close(), destination.close()])
  }
}

function inferMimeType(fileName: string): string {
  return (
    MIME_BY_EXTENSION[extname(fileName).toLowerCase()] ??
    'application/octet-stream'
  )
}

function safePathSegment(value: string, label: string): string {
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
  ) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function toAttachment(row: AttachmentRow): WorkbenchAttachment {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    checksumSha256: row.checksum_sha256,
    createdAt: row.created_at
  }
}
