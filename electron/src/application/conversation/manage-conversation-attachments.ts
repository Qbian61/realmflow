import { basename } from 'node:path'
import type {
  ConversationAttachmentPickerResult,
  PickConversationAttachmentsCommand,
  RemoveConversationAttachmentCommand
} from '../../../../shared/conversation-attachments'
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
  }
  repository: {
    softDelete(id: string, ownerId: string): Promise<void>
  }
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
