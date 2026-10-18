import { describe, expect, it, vi } from 'vitest'
import { ManageConversationAttachments } from './manage-conversation-attachments'

describe('ManageConversationAttachments', () => {
  it('registers all native picker selections without returning local paths', async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/private/valid.txt', '/private/secret/disguised.png']
    })
    const registerFiles = vi.fn().mockResolvedValue({
      accepted: [
        {
          id: 'attachment-1',
          ownerId: 'draft-1',
          fileName: 'valid.txt',
          mimeType: 'text/plain',
          mediaKind: 'document',
          sizeBytes: 5,
          checksumSha256: 'a'.repeat(64),
          source: 'picker',
          status: 'registered',
          createdAt: 1
        }
      ],
      rejected: [
        {
          path: '/private/secret/disguised.png',
          code: 'mime_mismatch',
          message: '文件内容与扩展名不一致'
        }
      ]
    })
    const service = new ManageConversationAttachments({
      picker: { showOpenDialog },
      registry: { registerFiles },
      repository: { softDelete: vi.fn() },
      workspace: { openSessionFiles: vi.fn() }
    })

    const result = await service.pick({
      requestId: 'request-1',
      draftId: 'draft-1'
    })

    expect(registerFiles).toHaveBeenCalledWith({
      ownerId: 'draft-1',
      source: 'picker',
      paths: ['/private/valid.txt', '/private/secret/disguised.png']
    })
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Supported files',
          extensions: expect.arrayContaining([
            'docx',
            'markdown',
            'xml',
            'yaml',
            'yml'
          ])
        }
      ]
    })
    expect(result).toEqual({
      accepted: [expect.objectContaining({ id: 'attachment-1' })],
      rejected: [
        {
          fileName: 'disguised.png',
          code: 'mime_mismatch',
          message: '文件内容与扩展名不一致'
        }
      ]
    })
    expect(JSON.stringify(result)).not.toContain('/private/')
  })

  it('removes only an attachment owned by the matching draft', async () => {
    const softDelete = vi.fn().mockResolvedValue(undefined)
    const service = new ManageConversationAttachments({
      picker: {
        showOpenDialog: vi.fn()
      },
      registry: { registerFiles: vi.fn() },
      repository: { softDelete },
      workspace: { openSessionFiles: vi.fn() }
    })

    await service.remove({
      requestId: 'request-2',
      draftId: 'draft-1',
      attachmentId: 'attachment-1'
    })

    expect(softDelete).toHaveBeenCalledWith('attachment-1', 'draft-1')
  })

  it('reads only a managed image as a data URL for message previews', async () => {
    const resolveManagedPath = vi
      .fn()
      .mockResolvedValue('/managed/attachment.png')
    const readFile = vi.fn().mockResolvedValue(Buffer.from('png'))
    const get = vi.fn(async (id: string) =>
      id === 'image-1'
        ? {
            id,
            ownerId: 'message-1',
            fileName: 'attachment.png',
            mimeType: 'image/png',
            mediaKind: 'image' as const,
            sizeBytes: 3,
            checksumSha256: 'a'.repeat(64),
            source: 'picker' as const,
            status: 'ready' as const,
            createdAt: 1
          }
        : {
            id,
            ownerId: 'message-1',
            fileName: 'notes.txt',
            mimeType: 'text/plain',
            mediaKind: 'document' as const,
            sizeBytes: 3,
            checksumSha256: 'b'.repeat(64),
            source: 'picker' as const,
            status: 'ready' as const,
            createdAt: 2
          }
    )
    const service = new ManageConversationAttachments({
      picker: { showOpenDialog: vi.fn() },
      registry: {
        registerFiles: vi.fn(),
        resolveManagedPath
      },
      repository: {
        softDelete: vi.fn(),
        get,
        resolveBlobPath: vi.fn()
      },
      readFile
    } as never)
    const previewService = service as unknown as {
      readImage(attachmentId: string): Promise<string>
    }

    await expect(previewService.readImage('image-1')).resolves.toBe(
      'data:image/png;base64,cG5n'
    )
    await expect(previewService.readImage('document-1')).rejects.toThrow(
      'Conversation image attachment is unavailable'
    )
    expect(resolveManagedPath).toHaveBeenCalledOnce()
    expect(readFile).toHaveBeenCalledWith('/managed/attachment.png')
  })

  it('opens only a ready managed attachment in an isolated workspace selection', async () => {
    const resolveManagedPath = vi
      .fn()
      .mockResolvedValue('/managed/blobs/attachment-digest')
    const openSessionFiles = vi.fn().mockResolvedValue({
      binding: {
        requirementId: 'session-1',
        rootName: 'blobs',
        rootPath: '/managed/blobs'
      },
      files: [
        {
          name: 'attachment-digest',
          path: 'attachment-digest',
          content: '',
          kind: 'binary',
          language: 'binary',
          size: 2_048,
          modifiedAt: 1,
          version: '1:2048'
        }
      ]
    })
    const get = vi.fn(async (id: string) =>
      id === 'document-1'
        ? {
            id,
            ownerId: 'message-1',
            fileName: 'requirements.pdf',
            mimeType: 'application/pdf',
            mediaKind: 'document' as const,
            sizeBytes: 2_048,
            checksumSha256: 'a'.repeat(64),
            source: 'picker' as const,
            status: 'ready' as const,
            createdAt: 1
          }
        : {
            id,
            ownerId: 'message-1',
            fileName: 'failed.png',
            mimeType: 'image/png',
            mediaKind: 'image' as const,
            sizeBytes: 512,
            checksumSha256: 'b'.repeat(64),
            source: 'picker' as const,
            status: 'failed' as const,
            errorCode: 'parse_failed',
            errorMessage: 'Image OCR failed',
            createdAt: 2
          }
    )
    const service = new ManageConversationAttachments({
      picker: { showOpenDialog: vi.fn() },
      registry: {
        registerFiles: vi.fn(),
        resolveManagedPath
      },
      repository: {
        softDelete: vi.fn(),
        get,
        resolveBlobPath: vi.fn()
      },
      workspace: { openSessionFiles }
    } as never)

    await expect(service.open('document-1')).resolves.toEqual({
      binding: {
        requirementId: 'session-1',
        rootName: 'requirements.pdf',
        rootPath: '/managed/blobs'
      },
      files: [
        expect.objectContaining({
          name: 'requirements.pdf',
          path: 'attachment-digest'
        })
      ]
    })
    await expect(service.open('failed-1')).rejects.toThrow(
      'Conversation attachment is unavailable'
    )
    expect(resolveManagedPath).toHaveBeenCalledOnce()
    expect(openSessionFiles).toHaveBeenCalledWith(
      ['/managed/blobs/attachment-digest'],
      ['requirements.pdf']
    )
  })
})
