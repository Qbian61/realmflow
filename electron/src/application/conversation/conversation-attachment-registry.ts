import { createHash, randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import JSZip from 'jszip'
import {
  probeConversationAttachment,
  type ConversationAttachmentDescriptor
} from '../../../../domain/conversation-input'
import type {
  ConversationAttachmentRepository,
  ConversationAttachmentBlob
} from '../../infrastructure/sqlite/conversation-attachment-repository'

type RegistryRepository = Pick<
  ConversationAttachmentRepository,
  'findBlobByChecksum' | 'commitRegistration'
>

export type ConversationAttachmentRegistrationResult = {
  accepted: ConversationAttachmentDescriptor[]
  rejected: Array<{
    path: string
    code:
      | 'invalid_source'
      | 'unsupported_type'
      | 'unsupported_archive'
      | 'mime_mismatch'
      | 'size_limit_exceeded'
      | 'registration_failed'
    message: string
  }>
}

export class ConversationAttachmentRegistry {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(
    private readonly repository: RegistryRepository,
    private readonly rootPath: string,
    dependencies: {
      createId?: () => string
      now?: () => number
    } = {}
  ) {
    this.createId = dependencies.createId ?? randomUUID
    this.now = dependencies.now ?? Date.now
  }

  async registerFiles(input: {
    ownerId: string
    source: ConversationAttachmentDescriptor['source']
    paths: readonly string[]
  }): Promise<ConversationAttachmentRegistrationResult> {
    const accepted: ConversationAttachmentDescriptor[] = []
    const rejected: ConversationAttachmentRegistrationResult['rejected'] = []
    for (const path of input.paths) {
      try {
        accepted.push(
          await this.registerFile({
            path,
            ownerId: input.ownerId,
            source: input.source
          })
        )
      } catch (error) {
        rejected.push({
          path,
          code: registrationErrorCode(error),
          message: errorMessage(error)
        })
      }
    }
    return { accepted, rejected }
  }

  async resolveManagedPath(
    repository: Pick<ConversationAttachmentRepository, 'resolveBlobPath'>,
    attachmentId: string
  ): Promise<string> {
    const relativePath = await repository.resolveBlobPath(attachmentId)
    const absolutePath = resolve(this.rootPath, relativePath)
    if (!isWithinRoot(this.rootPath, absolutePath)) {
      throw new Error('Conversation attachment path escapes managed root')
    }
    return absolutePath
  }

  private async registerFile(input: {
    path: string
    ownerId: string
    source: ConversationAttachmentDescriptor['source']
  }): Promise<ConversationAttachmentDescriptor> {
    const stat = await lstat(input.path).catch(() => undefined)
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
      throw new AttachmentRegistrationError(
        'invalid_source',
        '附件必须是普通文件，且不能是符号链接'
      )
    }
    const handle = await open(input.path, 'r')
    let prefix: Buffer
    try {
      prefix = Buffer.alloc(Math.min(stat.size, 4_096))
      await handle.read(prefix, 0, prefix.length, 0)
    } finally {
      await handle.close()
    }
    const probe = probeConversationAttachment({
      fileName: input.path,
      sizeBytes: stat.size,
      prefix
    })
    if (probe.outcome === 'rejected') {
      throw new AttachmentRegistrationError(probe.code, probe.message)
    }

    const id = safeSegment(this.createId())
    const fileName = sanitizeFileName(basename(input.path))
    const temporaryDirectory = resolve(this.rootPath, '.tmp')
    const temporaryPath = resolve(temporaryDirectory, `${id}.tmp`)
    await mkdir(temporaryDirectory, { recursive: true })

    let createdBlobPath: string | undefined
    try {
      const content = await readFile(input.path)
      await assertValidDocumentContainer(input.path, content)
      const checksumSha256 = createHash('sha256').update(content).digest('hex')
      await writeFile(temporaryPath, content, { flag: 'wx' })
      const existingBlob =
        await this.repository.findBlobByChecksum(checksumSha256)
      const blob =
        existingBlob ??
        (await this.installBlob({
          checksumSha256,
          temporaryPath,
          sizeBytes: stat.size,
          createdAt: this.now()
        }))
      if (existingBlob) await rm(temporaryPath, { force: true })
      else createdBlobPath = resolve(this.rootPath, blob.relativePath)

      const descriptor: ConversationAttachmentDescriptor = {
        id,
        ownerId: input.ownerId,
        fileName,
        mimeType: probe.mimeType,
        mediaKind: probe.mediaKind,
        sizeBytes: stat.size,
        checksumSha256,
        source: input.source,
        status: 'registered',
        createdAt: this.now()
      }
      return await this.repository.commitRegistration({
        blob,
        attachment: descriptor
      })
    } catch (error) {
      await rm(temporaryPath, { force: true })
      if (createdBlobPath) await rm(createdBlobPath, { force: true })
      if (error instanceof AttachmentRegistrationError) throw error
      throw new AttachmentRegistrationError(
        'registration_failed',
        errorMessage(error)
      )
    }
  }

  private async installBlob(input: {
    checksumSha256: string
    temporaryPath: string
    sizeBytes: number
    createdAt: number
  }): Promise<ConversationAttachmentBlob> {
    const relativePath = `blobs/${input.checksumSha256}`
    const destination = resolve(this.rootPath, relativePath)
    await mkdir(resolve(this.rootPath, 'blobs'), { recursive: true })
    await rename(input.temporaryPath, destination)
    return {
      checksumSha256: input.checksumSha256,
      relativePath,
      sizeBytes: input.sizeBytes,
      createdAt: input.createdAt
    }
  }
}

async function assertValidDocumentContainer(
  path: string,
  content: Uint8Array
): Promise<void> {
  if (extname(path).toLowerCase() !== '.docx') return
  try {
    const archive = await JSZip.loadAsync(content)
    const contentTypes = archive.file('[Content_Types].xml')
    if (!contentTypes || !archive.file('word/document.xml')) {
      throw new Error('missing DOCX parts')
    }
    const declaration = await contentTypes.async('text')
    if (
      !declaration.includes(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
      )
    ) {
      throw new Error('missing DOCX content type')
    }
  } catch {
    throw new AttachmentRegistrationError(
      'mime_mismatch',
      '文件内容与扩展名不一致'
    )
  }
}

class AttachmentRegistrationError extends Error {
  constructor(
    readonly code: ConversationAttachmentRegistrationResult['rejected'][number]['code'],
    message: string
  ) {
    super(message)
  }
}

function registrationErrorCode(
  error: unknown
): ConversationAttachmentRegistrationResult['rejected'][number]['code'] {
  return error instanceof AttachmentRegistrationError
    ? error.code
    : 'registration_failed'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sanitizeFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
  return sanitized || 'attachment'
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new AttachmentRegistrationError(
      'registration_failed',
      '附件 ID 不安全'
    )
  }
  return value
}

function isWithinRoot(rootPath: string, candidate: string): boolean {
  const root = resolve(rootPath)
  return candidate === root || candidate.startsWith(`${root}/`)
}
