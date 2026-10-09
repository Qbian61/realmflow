import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteConversationAttachmentRepository } from './conversation-attachment-repository'
import { SqliteChatSessionRepository } from './repositories'

describe('SqliteConversationAttachmentRepository', () => {
  let directory: string
  let database: RealmFlowDatabase
  let repository: SqliteConversationAttachmentRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-conversation-asset-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteConversationAttachmentRepository(database)
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('stores one immutable blob and multiple attachment ownership records', async () => {
    await repository.commitRegistration({
      blob: {
        checksumSha256: 'a'.repeat(64),
        relativePath: `blobs/${'a'.repeat(64)}`,
        sizeBytes: 4,
        createdAt: 10
      },
      attachment: {
        id: 'attachment-1',
        ownerId: 'draft-1',
        fileName: 'one.txt',
        mimeType: 'text/plain',
        mediaKind: 'document',
        sizeBytes: 4,
        checksumSha256: 'a'.repeat(64),
        source: 'picker',
        status: 'registered',
        createdAt: 10
      }
    })
    await repository.commitRegistration({
      blob: {
        checksumSha256: 'a'.repeat(64),
        relativePath: `blobs/${'a'.repeat(64)}`,
        sizeBytes: 4,
        createdAt: 11
      },
      attachment: {
        id: 'attachment-2',
        ownerId: 'draft-2',
        fileName: 'two.txt',
        mimeType: 'text/plain',
        mediaKind: 'document',
        sizeBytes: 4,
        checksumSha256: 'a'.repeat(64),
        source: 'drop',
        status: 'registered',
        createdAt: 11
      }
    })

    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM conversation_attachment_blobs')
        .get()
    ).toEqual({ count: 1 })
    await expect(repository.listByOwner('draft-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'attachment-1',
        checksumSha256: 'a'.repeat(64)
      })
    ])
    await expect(repository.resolveBlobPath('attachment-2')).resolves.toBe(
      `blobs/${'a'.repeat(64)}`
    )
  })

  it('atomically binds only attachments owned by the expected draft', async () => {
    await repository.commitRegistration({
      blob: {
        checksumSha256: 'b'.repeat(64),
        relativePath: `blobs/${'b'.repeat(64)}`,
        sizeBytes: 3,
        createdAt: 10
      },
      attachment: {
        id: 'attachment-1',
        ownerId: 'draft-1',
        fileName: 'one.txt',
        mimeType: 'text/plain',
        mediaKind: 'document',
        sizeBytes: 3,
        checksumSha256: 'b'.repeat(64),
        source: 'picker',
        status: 'registered',
        createdAt: 10
      }
    })

    await expect(
      repository.bindToMessage({
        attachmentIds: ['attachment-1'],
        draftOwnerId: 'another-draft',
        messageId: 'message-1'
      })
    ).rejects.toThrow('Attachment ownership conflict')

    await repository.bindToMessage({
      attachmentIds: ['attachment-1'],
      draftOwnerId: 'draft-1',
      messageId: 'message-1'
    })
    await expect(repository.listByOwner('message-1')).resolves.toEqual([
      expect.objectContaining({ id: 'attachment-1', ownerId: 'message-1' })
    ])
  })

  it('rolls back the conversation turn when attachment ownership conflicts', async () => {
    const sessions = new SqliteChatSessionRepository(database)
    await sessions.save(
      {
        id: 'conversation-1',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        title: 'Attachments',
        sortOrder: 0,
        messages: [],
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
    await repository.commitRegistration({
      blob: {
        checksumSha256: 'c'.repeat(64),
        relativePath: `blobs/${'c'.repeat(64)}`,
        sizeBytes: 3,
        createdAt: 10
      },
      attachment: {
        id: 'attachment-1',
        ownerId: 'draft-1',
        fileName: 'one.txt',
        mimeType: 'text/plain',
        mediaKind: 'document',
        sizeBytes: 3,
        checksumSha256: 'c'.repeat(64),
        source: 'picker',
        status: 'registered',
        createdAt: 10
      }
    })
    const session = await sessions.get('conversation-1')

    await expect(
      sessions.beginTurn({
        session: session!,
        expectedRevision: session!.revision,
        userMessageId: 'message-user',
        assistantMessageId: 'message-assistant',
        content: 'Analyze',
        attachmentBinding: {
          draftOwnerId: 'wrong-draft',
          attachmentIds: ['attachment-1']
        },
        createdAt: 20
      })
    ).rejects.toThrow('Attachment ownership conflict')

    expect((await sessions.get('conversation-1'))?.messages).toEqual([])
    await expect(repository.listByOwner('draft-1')).resolves.toHaveLength(1)

    await expect(
      sessions.beginTurn({
        session: session!,
        expectedRevision: session!.revision,
        userMessageId: 'message-user',
        assistantMessageId: 'message-assistant',
        content: 'Analyze',
        attachmentBinding: {
          draftOwnerId: 'draft-1',
          attachmentIds: ['attachment-1']
        },
        createdAt: 20
      })
    ).resolves.toMatchObject({ status: 'started' })
    await expect(repository.listByOwner('message-user')).resolves.toHaveLength(
      1
    )
  })

  it('returns persisted chunks only through their owning conversation', async () => {
    const sessions = new SqliteChatSessionRepository(database)
    await sessions.save(
      {
        id: 'conversation-1',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        title: 'Chunks',
        sortOrder: 0,
        messages: [],
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
    await repository.commitRegistration({
      blob: {
        checksumSha256: 'f'.repeat(64),
        relativePath: `blobs/${'f'.repeat(64)}`,
        sizeBytes: 160,
        createdAt: 10
      },
      attachment: {
        id: 'attachment-1',
        ownerId: 'draft-1',
        fileName: 'long.txt',
        mimeType: 'text/plain',
        mediaKind: 'document',
        sizeBytes: 160,
        checksumSha256: 'f'.repeat(64),
        source: 'picker',
        status: 'registered',
        createdAt: 10
      }
    })
    const session = await sessions.get('conversation-1')
    await sessions.beginTurn({
      session: session!,
      expectedRevision: session!.revision,
      userMessageId: 'message-user',
      assistantMessageId: 'message-assistant',
      content: 'Read the attachment',
      attachmentBinding: {
        draftOwnerId: 'draft-1',
        attachmentIds: ['attachment-1']
      },
      createdAt: 20
    })
    const chunk = {
      id: 'attachment-1:chunk:1',
      attachmentId: 'attachment-1',
      start: 0,
      end: 80,
      digest: 'a'.repeat(64),
      content: 'chunk content',
      summary: 'chunk'
    }
    await repository.replaceChunks('attachment-1', [chunk])

    await expect(
      repository.getChunkForConversation(chunk.id, 'conversation-1')
    ).resolves.toEqual(chunk)
    await expect(
      repository.getChunkForConversation(chunk.id, 'conversation-2')
    ).resolves.toBeUndefined()
  })

  it('expires abandoned drafts without hiding message-owned attachments', async () => {
    for (const [id, ownerId, checksum, createdAt] of [
      ['draft-attachment', 'draft-1', 'd'.repeat(64), 1],
      ['message-attachment', 'draft-2', 'e'.repeat(64), 1]
    ] as const) {
      await repository.commitRegistration({
        blob: {
          checksumSha256: checksum,
          relativePath: `blobs/${checksum}`,
          sizeBytes: 1,
          createdAt
        },
        attachment: {
          id,
          ownerId,
          fileName: `${id}.txt`,
          mimeType: 'text/plain',
          mediaKind: 'document',
          sizeBytes: 1,
          checksumSha256: checksum,
          source: 'picker',
          status: 'registered',
          createdAt
        }
      })
    }
    await repository.bindToMessage({
      attachmentIds: ['message-attachment'],
      draftOwnerId: 'draft-2',
      messageId: 'message-1'
    })

    await expect(repository.expireDrafts(10, 20)).resolves.toBe(1)
    await expect(repository.listByOwner('draft-1')).resolves.toEqual([])
    await expect(repository.listByOwner('message-1')).resolves.toHaveLength(1)
  })
})
