import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteConversationAttachmentRepository } from '../../infrastructure/sqlite/conversation-attachment-repository'
import { ConversationAttachmentRegistry } from './conversation-attachment-registry'

describe('ConversationAttachmentRegistry', () => {
  let directory: string
  let rootPath: string
  let database: RealmFlowDatabase
  let repository: SqliteConversationAttachmentRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-conversation-input-'))
    rootPath = join(directory, 'managed')
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteConversationAttachmentRepository(database)
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('deduplicates managed bytes while retaining stable attachment records', async () => {
    const first = join(directory, 'first.txt')
    const second = join(directory, 'second.txt')
    await writeFile(first, 'same bytes')
    await writeFile(second, 'same bytes')
    const ids = ['attachment-1', 'attachment-2']
    const registry = new ConversationAttachmentRegistry(repository, rootPath, {
      createId: () => ids.shift()!,
      now: () => 100
    })

    const result = await registry.registerFiles({
      ownerId: 'draft-1',
      source: 'picker',
      paths: [first, second]
    })

    expect(result.rejected).toEqual([])
    expect(result.accepted.map(({ id }) => id)).toEqual([
      'attachment-1',
      'attachment-2'
    ])
    expect(result.accepted[0].checksumSha256).toBe(
      result.accepted[1].checksumSha256
    )
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM conversation_attachment_blobs')
        .get()
    ).toEqual({ count: 1 })
    const relativePath = await repository.resolveBlobPath('attachment-1')
    expect(await readFile(join(rootPath, relativePath), 'utf8')).toBe(
      'same bytes'
    )
  })

  it('reports invalid files individually without dropping valid attachments', async () => {
    const valid = join(directory, 'valid.md')
    const disguised = join(directory, 'disguised.png')
    const target = join(directory, 'target.txt')
    const link = join(directory, 'link.txt')
    await writeFile(valid, '# Valid')
    await writeFile(disguised, 'plain text')
    await writeFile(target, 'target')
    await symlink(target, link)
    const registry = new ConversationAttachmentRegistry(repository, rootPath, {
      createId: () => 'attachment-valid',
      now: () => 100
    })

    const result = await registry.registerFiles({
      ownerId: 'draft-1',
      source: 'drop',
      paths: [disguised, valid, link]
    })

    expect(result.accepted).toEqual([
      expect.objectContaining({
        id: 'attachment-valid',
        fileName: 'valid.md',
        status: 'registered'
      })
    ])
    expect(result.rejected).toEqual([
      expect.objectContaining({
        path: disguised,
        code: 'mime_mismatch'
      }),
      expect.objectContaining({
        path: link,
        code: 'invalid_source'
      })
    ])
  })

  it('accepts a real DOCX container and rejects a generic ZIP with a DOCX name', async () => {
    const valid = join(directory, 'valid.docx')
    const invalid = join(directory, 'invalid.docx')
    const validZip = new JSZip()
    validZip.file(
      '[Content_Types].xml',
      '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    )
    validZip.file('word/document.xml', '<w:document/>')
    await writeFile(valid, await validZip.generateAsync({ type: 'nodebuffer' }))
    const invalidZip = new JSZip()
    invalidZip.file('payload.txt', 'not a Word document')
    await writeFile(
      invalid,
      await invalidZip.generateAsync({ type: 'nodebuffer' })
    )
    const registry = new ConversationAttachmentRegistry(repository, rootPath, {
      createId: () => 'attachment-docx',
      now: () => 100
    })

    const result = await registry.registerFiles({
      ownerId: 'draft-1',
      source: 'picker',
      paths: [invalid, valid]
    })

    expect(result.accepted).toEqual([
      expect.objectContaining({
        id: 'attachment-docx',
        fileName: 'valid.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
    ])
    expect(result.rejected).toEqual([
      expect.objectContaining({
        path: invalid,
        code: 'mime_mismatch'
      })
    ])
  })

  it('removes staged bytes when registration persistence fails', async () => {
    const source = join(directory, 'valid.txt')
    await writeFile(source, 'content')
    const registry = new ConversationAttachmentRegistry(
      {
        ...repository,
        findBlobByChecksum: repository.findBlobByChecksum.bind(repository),
        commitRegistration: async () => {
          throw new Error('database unavailable')
        }
      },
      rootPath,
      {
        createId: () => 'attachment-1',
        now: () => 100
      }
    )

    const result = await registry.registerFiles({
      ownerId: 'draft-1',
      source: 'picker',
      paths: [source]
    })

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([
      expect.objectContaining({
        path: source,
        code: 'registration_failed',
        message: 'database unavailable'
      })
    ])
    await expect(
      access(join(rootPath, '.tmp', 'attachment-1.tmp'))
    ).rejects.toThrow()
  })
})
