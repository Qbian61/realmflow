import type Database from 'better-sqlite3'
import type {
  ConversationAttachmentDescriptor,
  LongTextChunk
} from '../../../../domain/conversation-input'

export type ConversationAttachmentBlob = {
  checksumSha256: string
  relativePath: string
  sizeBytes: number
  createdAt: number
}

export type ConversationAttachmentRegistration = {
  blob: ConversationAttachmentBlob
  attachment: ConversationAttachmentDescriptor
}

export interface ConversationAttachmentRepository {
  findBlobByChecksum(
    checksumSha256: string
  ): Promise<ConversationAttachmentBlob | undefined>
  commitRegistration(
    input: ConversationAttachmentRegistration
  ): Promise<ConversationAttachmentDescriptor>
  listByOwner(ownerId: string): Promise<ConversationAttachmentDescriptor[]>
  get(id: string): Promise<ConversationAttachmentDescriptor | undefined>
  resolveBlobPath(attachmentId: string): Promise<string>
  bindToMessage(input: {
    attachmentIds: string[]
    draftOwnerId: string
    messageId: string
  }): Promise<void>
  updateStatus(input: {
    id: string
    status: 'ready' | 'failed'
    errorCode?: string
    errorMessage?: string
  }): Promise<void>
  replaceChunks(
    attachmentId: string,
    chunks: LongTextChunk[]
  ): Promise<void>
  getChunkForConversation(
    chunkId: string,
    conversationId: string
  ): Promise<LongTextChunk | undefined>
  softDelete(id: string, ownerId: string): Promise<void>
  expireDrafts(before: number, deletedAt: number): Promise<number>
}

type AttachmentRow = {
  id: string
  owner_id: string
  file_name: string
  mime_type: string
  media_kind: ConversationAttachmentDescriptor['mediaKind']
  size_bytes: number
  checksum_sha256: string
  source: ConversationAttachmentDescriptor['source']
  status: ConversationAttachmentDescriptor['status']
  error_code: string | null
  error_message: string | null
  created_at: number
}

type BlobRow = {
  checksum_sha256: string
  relative_path: string
  size_bytes: number
  created_at: number
}

type ChunkRow = {
  chunk_id: string
  attachment_id: string
  start_offset: number
  end_offset: number
  digest: string
  content: string
  summary: string
}

export class SqliteConversationAttachmentRepository
  implements ConversationAttachmentRepository
{
  constructor(private readonly database: Database.Database) {}

  async findBlobByChecksum(
    checksumSha256: string
  ): Promise<ConversationAttachmentBlob | undefined> {
    const row = this.database
      .prepare(
        `SELECT checksum_sha256, relative_path, size_bytes, created_at
         FROM conversation_attachment_blobs
         WHERE checksum_sha256 = ?`
      )
      .get(checksumSha256) as BlobRow | undefined
    return row ? mapBlob(row) : undefined
  }

  async commitRegistration(
    input: ConversationAttachmentRegistration
  ): Promise<ConversationAttachmentDescriptor> {
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT OR IGNORE INTO conversation_attachment_blobs (
             checksum_sha256, relative_path, size_bytes, created_at
           ) VALUES (?, ?, ?, ?)`
        )
        .run(
          input.blob.checksumSha256,
          input.blob.relativePath,
          input.blob.sizeBytes,
          input.blob.createdAt
        )
      this.database
        .prepare(
          `INSERT INTO conversation_attachments (
             id, owner_type, owner_id, file_name, mime_type, media_kind, size_bytes,
             checksum_sha256, source, status, error_code, error_message,
             created_at
           ) VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.attachment.id,
          input.attachment.ownerId,
          input.attachment.fileName,
          input.attachment.mimeType,
          input.attachment.mediaKind,
          input.attachment.sizeBytes,
          input.attachment.checksumSha256,
          input.attachment.source,
          input.attachment.status,
          input.attachment.errorCode ?? null,
          input.attachment.errorMessage ?? null,
          input.attachment.createdAt
        )
    })()
    return input.attachment
  }

  async listByOwner(
    ownerId: string
  ): Promise<ConversationAttachmentDescriptor[]> {
    return (
      this.database
        .prepare(
          `SELECT id, owner_id, file_name, mime_type, media_kind, size_bytes,
                  checksum_sha256, source, status, error_code, error_message,
                  created_at
           FROM conversation_attachments
           WHERE owner_id = ? AND deleted_at IS NULL
           ORDER BY created_at, id`
        )
        .all(ownerId) as AttachmentRow[]
    ).map(mapAttachment)
  }

  async get(
    id: string
  ): Promise<ConversationAttachmentDescriptor | undefined> {
    const row = this.database
      .prepare(
        `SELECT id, owner_id, file_name, mime_type, media_kind, size_bytes,
                checksum_sha256, source, status, error_code, error_message,
                created_at
         FROM conversation_attachments
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as AttachmentRow | undefined
    return row ? mapAttachment(row) : undefined
  }

  async resolveBlobPath(attachmentId: string): Promise<string> {
    const row = this.database
      .prepare(
        `SELECT blob.relative_path
         FROM conversation_attachments attachment
         JOIN conversation_attachment_blobs blob
           ON blob.checksum_sha256 = attachment.checksum_sha256
         WHERE attachment.id = ? AND attachment.deleted_at IS NULL`
      )
      .get(attachmentId) as { relative_path: string } | undefined
    if (!row) throw new Error(`Conversation attachment not found: ${attachmentId}`)
    return row.relative_path
  }

  async bindToMessage(input: {
    attachmentIds: string[]
    draftOwnerId: string
    messageId: string
  }): Promise<void> {
    if (input.attachmentIds.length === 0) return
    const uniqueIds = [...new Set(input.attachmentIds)]
    this.database.transaction(() => {
      const placeholders = uniqueIds.map(() => '?').join(', ')
      const count = this.database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM conversation_attachments
           WHERE id IN (${placeholders})
             AND owner_id = ?
             AND owner_type = 'draft'
             AND deleted_at IS NULL`
        )
        .get(...uniqueIds, input.draftOwnerId) as { count: number }
      if (count.count !== uniqueIds.length) {
        throw new Error('Attachment ownership conflict')
      }
      this.database
        .prepare(
          `UPDATE conversation_attachments
           SET owner_type = 'message', owner_id = ?
           WHERE id IN (${placeholders})`
        )
        .run(input.messageId, ...uniqueIds)
    })()
  }

  async updateStatus(input: {
    id: string
    status: 'ready' | 'failed'
    errorCode?: string
    errorMessage?: string
  }): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE conversation_attachments
         SET status = ?, error_code = ?, error_message = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(
        input.status,
        input.status === 'failed' ? input.errorCode ?? 'parse_failed' : null,
        input.status === 'failed'
          ? input.errorMessage ?? '附件处理失败'
          : null,
        input.id
      )
    if (result.changes !== 1) {
      throw new Error(`Conversation attachment not found: ${input.id}`)
}
  }

  async replaceChunks(
    attachmentId: string,
    chunks: LongTextChunk[]
  ): Promise<void> {
    this.database.transaction(() => {
      this.database
        .prepare(
          `DELETE FROM conversation_attachment_chunks
           WHERE attachment_id = ?`
        )
        .run(attachmentId)
      const insert = this.database.prepare(
        `INSERT INTO conversation_attachment_chunks (
          chunk_id, attachment_id, start_offset, end_offset, digest,
          content, summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      for (const chunk of chunks) {
        if (
          chunk.attachmentId !== attachmentId ||
          !chunk.id.startsWith(`${attachmentId}:chunk:`)
        ) {
          throw new Error('Conversation attachment chunk identity is invalid')
        }
        insert.run(
          chunk.id,
          attachmentId,
          chunk.start,
          chunk.end,
          chunk.digest,
          chunk.content,
          chunk.summary
        )
      }
    })()
  }

  async getChunkForConversation(
    chunkId: string,
    conversationId: string
  ): Promise<LongTextChunk | undefined> {
    const row = this.database
      .prepare(
        `SELECT chunk.chunk_id, chunk.attachment_id, chunk.start_offset,
                chunk.end_offset, chunk.digest, chunk.content, chunk.summary
         FROM conversation_attachment_chunks chunk
         JOIN conversation_attachments attachment
           ON attachment.id = chunk.attachment_id
         JOIN chat_messages message
           ON attachment.owner_type = 'message'
          AND attachment.owner_id = message.id
         WHERE chunk.chunk_id = ?
           AND message.session_id = ?
           AND attachment.deleted_at IS NULL`
      )
      .get(chunkId, conversationId) as ChunkRow | undefined
    return row
      ? {
          id: row.chunk_id,
          attachmentId: row.attachment_id,
          start: row.start_offset,
          end: row.end_offset,
          digest: row.digest,
          content: row.content,
          summary: row.summary
        }
      : undefined
  }


  async softDelete(id: string, ownerId: string): Promise<void> {
    const result = this.database
      .prepare(
        `UPDATE conversation_attachments
         SET deleted_at = ?
         WHERE id = ? AND owner_type = 'draft' AND owner_id = ?
           AND deleted_at IS NULL`
      )
      .run(Date.now(), id, ownerId)
    if (result.changes !== 1) {
      throw new Error('Attachment ownership conflict')
    }
  }

  async expireDrafts(before: number, deletedAt: number): Promise<number> {
    const result = this.database
      .prepare(
        `UPDATE conversation_attachments
         SET deleted_at = ?
         WHERE owner_type = 'draft'
           AND deleted_at IS NULL
           AND created_at < ?`
      )
      .run(deletedAt, before)
    return result.changes
  }
}

function mapAttachment(
  row: AttachmentRow
): ConversationAttachmentDescriptor {
  return {
    id: row.id,
    ownerId: row.owner_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    mediaKind: row.media_kind,
    sizeBytes: row.size_bytes,
    checksumSha256: row.checksum_sha256,
    source: row.source,
    status: row.status,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: row.created_at
  }
}

function mapBlob(row: BlobRow): ConversationAttachmentBlob {
  return {
    checksumSha256: row.checksum_sha256,
    relativePath: row.relative_path,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  }
}
