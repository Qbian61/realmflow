import { readFile as readManagedFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ConversationAttachmentDescriptor } from '../../../../domain/conversation-input'
import type {
  ConversationAttachmentPickerResult,
  PickConversationAttachmentsCommand,
  RemoveConversationAttachmentCommand
} from '../../../../shared/conversation-attachments'
import type { OpenedSessionFiles } from '../../../../shared/workspace'
import type { ConversationAttachmentRegistrationResult } from './conversation-attachment-registry'

type Dependencies = {
  picker: {
    showOpenDialog(options: {
      properties: ['openFile', 'multiSelections']
      filters: Array<{ name: string; extensions: string[] }>
    }): Promise<{ canceled: boolean; filePaths: string[] }>
  }
  registry: {
    registerFiles(input: {
      ownerId: string
      source: 'picker'
      paths: readonly string[]
    }): Promise<ConversationAttachmentRegistrationResult>
    resolveManagedPath?(
      repository: {
        resolveBlobPath(attachmentId: string): Promise<string>
      },
      attachmentId: string
    ): Promise<string>
  }
  repository: {
    softDelete(id: string, ownerId: string): Promise<void>
    get?(id: string): Promise<ConversationAttachmentDescriptor | undefined>
    resolveBlobPath?(attachmentId: string): Promise<string>
  }
  workspace: {
    openSessionFiles(
      paths: string[],
      displayNames?: string[]
    ): Promise<OpenedSessionFiles>
  }
  readFile?: (path: string) => Promise<Buffer>
}

export class ManageConversationAttachments {
  private readonly requests = new Map<string, Promise<unknown>>()

  constructor(private readonly dependencies: Dependencies) {}

  pick(
    command: PickConversationAttachmentsCommand
  ): Promise<ConversationAttachmentPickerResult> {
    return this.once('pick', command.requestId, async () => {
      const selection = await this.dependencies.picker.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Supported files',
            extensions: [
              'csv',
              'docx',
              'gif',
              'jpeg',
              'jpg',
              'json',
              'md',
              'markdown',
              'pdf',
              'png',
              'txt',
              'xml',
              'yaml',
              'yml',
              'webp'
            ]
          }
        ]
      })
      if (selection.canceled || selection.filePaths.length === 0) {
        return { accepted: [], rejected: [] }
      }
      const result = await this.dependencies.registry.registerFiles({
        ownerId: command.draftId,
        source: 'picker',
        paths: selection.filePaths
      })
      return {
        accepted: result.accepted,
        rejected: result.rejected.map(({ path, code, message }) => ({
          fileName: basename(path),
          code,
          message
        }))
      }
    })
  }

  remove(command: RemoveConversationAttachmentCommand): Promise<void> {
    return this.once('remove', command.requestId, () =>
      this.dependencies.repository.softDelete(
        command.attachmentId,
        command.draftId
      )
    )
  }

  async readImage(attachmentId: string): Promise<string> {
    const { registry, repository } = this.dependencies
    if (
      !registry.resolveManagedPath ||
      !repository.get ||
      !repository.resolveBlobPath
    ) {
      throw unavailableImage()
    }
    try {
      const attachment = await repository.get(attachmentId)
      if (
        !attachment ||
        attachment.mediaKind !== 'image' ||
        attachment.status !== 'ready' ||
        !attachment.mimeType.startsWith('image/')
      ) {
        throw unavailableImage()
      }
      const path = await registry.resolveManagedPath(
        { resolveBlobPath: repository.resolveBlobPath.bind(repository) },
        attachmentId
      )
      const content = await (this.dependencies.readFile ?? readManagedFile)(path)
      return `data:${attachment.mimeType};base64,${content.toString('base64')}`
    } catch {
      throw unavailableImage()
    }
  }

  async open(attachmentId: string): Promise<OpenedSessionFiles> {
    const { registry, repository, workspace } = this.dependencies
    if (
      !registry.resolveManagedPath ||
      !repository.get ||
      !repository.resolveBlobPath
    ) {
      throw unavailableAttachment()
    }
    try {
      const attachment = await repository.get(attachmentId)
      if (!attachment || attachment.status !== 'ready') {
        throw unavailableAttachment()
      }
      const path = await registry.resolveManagedPath(
        { resolveBlobPath: repository.resolveBlobPath.bind(repository) },
        attachmentId
      )
      const selection = await workspace.openSessionFiles(
        [path],
        [attachment.fileName]
      )
      if (selection.files.length !== 1) throw unavailableAttachment()
      return {
        binding: {
          ...selection.binding,
          rootName: attachment.fileName
        },
        files: selection.files.map((file, index) =>
          index === 0 ? { ...file, name: attachment.fileName } : file
        )
      }
    } catch {
      throw unavailableAttachment()
    }
  }

  private once<T>(
    operation: string,
    requestId: string,
    execute: () => Promise<T>
  ): Promise<T> {
    const key = `${operation}:${requestId}`
    const existing = this.requests.get(key)
    if (existing) return existing as Promise<T>
    const result = execute()
    this.requests.set(key, result)
    return result.finally(() => {
      if (this.requests.get(key) === result) this.requests.delete(key)
    })
  }
}

function unavailableImage(): Error {
  return new Error('Conversation image attachment is unavailable')
}

function unavailableAttachment(): Error {
  return new Error('Conversation attachment is unavailable')
}
