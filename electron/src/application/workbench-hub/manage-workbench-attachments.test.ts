import { describe, expect, it, vi } from 'vitest'
import { ManageWorkbenchAttachments } from './manage-workbench-attachments'

const attachment = {
  id: 'attachment-1',
  ownerType: 'task_record' as const,
  ownerId: 'record-1',
  fileName: 'brief.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  checksumSha256: '0'.repeat(64),
  createdAt: 1
}

describe('manage workbench attachments', () => {
  it('returns undefined when the Main-owned picker is canceled', async () => {
    const store = createStore()
    const service = new ManageWorkbenchAttachments({
      store,
      picker: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: true,
          filePaths: []
        })
      },
      shell: createShell(),
      contentExtractor: createContentExtractor()
    })

    await expect(
      service.pickAndAttach({
        requestId: 'request-1',
        ownerType: 'task_record',
        ownerId: 'record-1',
        accept: 'any'
      })
    ).resolves.toBeUndefined()
    expect(store.importFromPath).not.toHaveBeenCalled()
  })

  it('imports a selected file once for duplicate request ids', async () => {
    const store = createStore()
    const picker = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['/selected/brief.pdf']
      })
    }
    const service = new ManageWorkbenchAttachments({
      store,
      picker,
      shell: createShell(),
      contentExtractor: createContentExtractor()
    })
    const command = {
      requestId: 'request-1',
      ownerType: 'task_record' as const,
      ownerId: 'record-1',
      accept: 'any' as const
    }

    const first = service.pickAndAttach(command)
    const second = service.pickAndAttach(command)

    await expect(first).resolves.toEqual(attachment)
    await expect(second).resolves.toEqual(attachment)
    expect(picker.showOpenDialog).toHaveBeenCalledOnce()
    expect(store.importFromPath).toHaveBeenCalledWith({
      sourcePath: '/selected/brief.pdf',
      ownerType: 'task_record',
      ownerId: 'record-1',
      accept: 'any'
    })
  })

  it('delegates list, open, reveal, and soft delete operations', async () => {
    const store = createStore()
    const shell = createShell()
    const service = new ManageWorkbenchAttachments({
      store,
      picker: {
        showOpenDialog: vi.fn()
      },
      shell,
      contentExtractor: createContentExtractor()
    })

    await expect(service.list('task_record', 'record-1')).resolves.toEqual([
      attachment
    ])
    await expect(service.readImage('attachment-1')).resolves.toBe(
      'data:image/png;base64,eA=='
    )
    await service.open('attachment-1')
    await service.reveal('attachment-1')
    await expect(
      service.delete({
        requestId: 'request-delete',
        attachmentId: 'attachment-1'
      })
    ).resolves.toEqual({ attachmentId: 'attachment-1' })

    expect(shell.openPath).toHaveBeenCalledWith('/stored/brief.pdf')
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/stored/brief.pdf')
    expect(store.softDelete).toHaveBeenCalledWith('attachment-1')
  })

  it('extracts a renderer-safe local preview through the shared service', async () => {
    const store = createStore()
    const contentExtractor = {
      extract: vi.fn().mockResolvedValue({
        sourceChecksum: `sha256:${'0'.repeat(64)}`,
        format: 'pdf',
        extractorVersion: 'pdf-v1',
        units: [
          {
            key: 'page/000001',
            title: 'Page 1',
            text: 'Local preview text',
            checksum: `sha256:${'1'.repeat(64)}`,
            byteSize: 18
          }
        ]
      })
    }
    const service = new ManageWorkbenchAttachments({
      store,
      picker: { showOpenDialog: vi.fn() },
      shell: createShell(),
      contentExtractor
    })

    await expect(
      service.readExtracted({
        attachmentId: 'attachment-1',
        purpose: 'preview'
      })
    ).resolves.toEqual({
      format: 'pdf',
      extractorVersion: 'pdf-v1',
      units: [
        {
          key: 'page/000001',
          title: 'Page 1',
          text: 'Local preview text',
          checksum: `sha256:${'1'.repeat(64)}`,
          byteSize: 18
        }
      ]
    })
    expect(contentExtractor.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'brief.pdf',
        sourceChecksum: `sha256:${'0'.repeat(64)}`,
        policy: {
          consumer: 'workbench',
          allowLocalOcr: true,
          allowLocalConversion: true,
          maxCharacters: 100_000,
          maxUnits: 100
        }
      })
    )
    expect(JSON.stringify(await service.readExtracted({
      attachmentId: 'attachment-1',
      purpose: 'preview'
    }))).not.toContain('/stored')
  })
})

function createStore() {
  return {
    importFromPath: vi.fn().mockResolvedValue(attachment),
    list: vi.fn().mockResolvedValue([attachment]),
    resolveForOpen: vi.fn().mockResolvedValue('/stored/brief.pdf'),
    resolveForReveal: vi.fn().mockResolvedValue('/stored/brief.pdf'),
    readForExtraction: vi.fn().mockResolvedValue({
      bytes: Uint8Array.from(Buffer.from('%PDF-1.7')),
      fileName: 'brief.pdf',
      mimeType: 'application/pdf',
      sourceChecksum: `sha256:${'0'.repeat(64)}`,
      version: 1
    }),
    readImageDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,eA=='),
    softDelete: vi.fn().mockResolvedValue(undefined)
  }
}

function createShell() {
  return {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn()
  }
}

function createContentExtractor() {
  return {
    extract: vi.fn().mockRejectedValue(new Error('Unexpected extraction'))
  }
}
