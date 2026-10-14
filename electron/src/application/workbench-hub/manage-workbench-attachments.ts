import type {
  DeleteWorkbenchAttachmentCommand,
  PickWorkbenchAttachmentCommand,
  ReadWorkbenchAttachmentContentQuery,
  WorkbenchAttachment,
  WorkbenchAttachmentMutationResult,
  WorkbenchAttachmentOwnerType,
  WorkbenchExtractedContent
} from '../../../../shared/workbench-attachments'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'

type AttachmentStore = {
  importFromPath(input: {
    sourcePath: string
    ownerType: WorkbenchAttachmentOwnerType
    ownerId: string
    accept?: 'any' | 'image'
  }): Promise<WorkbenchAttachment>
  list(
    ownerType: WorkbenchAttachmentOwnerType,
    ownerId: string
  ): Promise<WorkbenchAttachment[]>
  resolveForOpen(attachmentId: string): Promise<string>
  resolveForReveal(attachmentId: string): Promise<string>
  readImageDataUrl(attachmentId: string): Promise<string>
  readForExtraction(attachmentId: string): Promise<{
    bytes: Uint8Array
    fileName: string
    mimeType: string
    sourceChecksum: string
    version: number
  }>
  softDelete(attachmentId: string): Promise<void>
}

type AttachmentPicker = {
  showOpenDialog(options: {
    properties: ['openFile']
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<{ canceled: boolean; filePaths: string[] }>
}

type AttachmentShell = {
  openPath(path: string): Promise<string>
  showItemInFolder(path: string): void
}

export class ManageWorkbenchAttachments {
  private readonly results = new Map<string, Promise<unknown>>()

  constructor(
    private readonly dependencies: {
      store: AttachmentStore
      picker: AttachmentPicker
      shell: AttachmentShell
      contentExtractor: Pick<LocalContentExtractionService, 'extract'>
    }
  ) {}

  list(
    ownerType: WorkbenchAttachmentOwnerType,
    ownerId: string
  ): Promise<WorkbenchAttachment[]> {
    return this.dependencies.store.list(ownerType, ownerId)
  }

  pickAndAttach(
    command: PickWorkbenchAttachmentCommand
  ): Promise<WorkbenchAttachment | undefined> {
    return this.once('pickAndAttach', command.requestId, async () => {
      const selection = await this.dependencies.picker.showOpenDialog({
        properties: ['openFile'],
        ...(command.accept === 'image'
          ? {
              filters: [
                {
                  name: 'Images',
                  extensions: [
                    'avif',
                    'bmp',
                    'gif',
                    'heic',
                    'jpeg',
                    'jpg',
                    'png',
                    'svg',
                    'webp'
                  ]
                }
              ]
            }
          : {})
      })
      const sourcePath = selection.filePaths[0]
      if (selection.canceled || !sourcePath) return undefined
      return this.dependencies.store.importFromPath({
        sourcePath,
        ownerType: command.ownerType,
        ownerId: command.ownerId,
        accept: command.accept
      })
    })
  }

  async open(attachmentId: string): Promise<void> {
    const path = await this.dependencies.store.resolveForOpen(attachmentId)
    const error = await this.dependencies.shell.openPath(path)
    if (error) throw new Error(`Unable to open attachment: ${error}`)
  }

  readImage(attachmentId: string): Promise<string> {
    return this.dependencies.store.readImageDataUrl(attachmentId)
  }

  async readExtracted(
    query: ReadWorkbenchAttachmentContentQuery
  ): Promise<WorkbenchExtractedContent> {
    const source = await this.dependencies.store.readForExtraction(
      query.attachmentId
    )
    const preview = query.purpose === 'preview'
    const bundle = await this.dependencies.contentExtractor.extract({
      bytes: source.bytes,
      fileName: source.fileName,
      mimeType: source.mimeType,
      sourceChecksum: source.sourceChecksum,
      signal: new AbortController().signal,
      depth: 0,
      policy: {
        consumer: 'workbench',
        allowLocalOcr: true,
        allowLocalConversion: true,
        maxCharacters: preview ? 100_000 : 200_000,
        maxUnits: preview ? 100 : 1_000
      }
    })
    return {
      format: bundle.format,
      extractorVersion: bundle.extractorVersion,
      units: bundle.units.map((unit) => ({
        ...unit,
        ...(unit.metadata ? { metadata: { ...unit.metadata } } : {})
      }))
    }
  }

  async reveal(attachmentId: string): Promise<void> {
    const path = await this.dependencies.store.resolveForReveal(attachmentId)
    this.dependencies.shell.showItemInFolder(path)
  }

  delete(
    command: DeleteWorkbenchAttachmentCommand
  ): Promise<WorkbenchAttachmentMutationResult> {
    return this.once('delete', command.requestId, async () => {
      await this.dependencies.store.softDelete(command.attachmentId)
      return { attachmentId: command.attachmentId }
    })
  }

  private once<T>(
    operation: string,
    requestId: string,
    execute: () => Promise<T>
  ): Promise<T> {
    const key = `${operation}:${requestId}`
    const current = this.results.get(key)
    if (current) return current as Promise<T>
    const result = execute().catch((error) => {
      this.results.delete(key)
      throw error
    })
    this.results.set(key, result)
    return result
  }
}
