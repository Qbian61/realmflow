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
      repository: { softDelete: vi.fn() }
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
      repository: { softDelete }
    })

    await service.remove({
      requestId: 'request-2',
      draftId: 'draft-1',
      attachmentId: 'attachment-1'
    })

    expect(softDelete).toHaveBeenCalledWith('attachment-1', 'draft-1')
  })
})
