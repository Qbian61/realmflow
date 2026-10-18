import type { IpcMain } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import {
  parseConversationAttachmentId,
  parsePickConversationAttachmentsCommand,
  parseRemoveConversationAttachmentCommand
} from '../../../shared/conversation-attachments'
import type { ManageConversationAttachments } from '../application/conversation/manage-conversation-attachments'

export function registerConversationAttachmentIpc(input: {
  service: Pick<
    ManageConversationAttachments,
    'pick' | 'remove' | 'readImage' | 'open'
  >
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  input.ipcMain.handle(
    IPC_QUERY_CHANNELS.conversationAttachmentReadImage,
    (_event, value) =>
      input.service.readImage(parseConversationAttachmentId(value))
  )
  input.ipcMain.handle(
    IPC_COMMAND_CHANNELS.conversationAttachmentPick,
    (_event, value) =>
      input.service.pick(parsePickConversationAttachmentsCommand(value))
  )
  input.ipcMain.handle(
    IPC_COMMAND_CHANNELS.conversationAttachmentRemove,
    (_event, value) =>
      input.service.remove(parseRemoveConversationAttachmentCommand(value))
  )
  input.ipcMain.handle(
    IPC_COMMAND_CHANNELS.conversationAttachmentOpen,
    (_event, value) =>
      input.service.open(parseConversationAttachmentId(value))
  )
}
