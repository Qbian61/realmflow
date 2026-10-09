import type { IpcMain } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import {
  parseAttachmentId,
  parseAttachmentOwnerQuery,
  parseDeleteWorkbenchAttachmentCommand,
  parsePickWorkbenchAttachmentCommand
} from '../../../shared/workbench-attachments'
import type { ManageWorkbenchAttachments } from '../application/workbench-hub/manage-workbench-attachments'

export function registerWorkbenchAttachmentIpc({
  service,
  ipcMain
}: {
  service: Pick<
    ManageWorkbenchAttachments,
    'list' | 'pickAndAttach' | 'readImage' | 'open' | 'reveal' | 'delete'
  >
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchAttachmentList,
    async (_event, value) => {
      const query = parseAttachmentOwnerQuery(value)
      return service.list(query.ownerType, query.ownerId)
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchAttachmentReadImage,
    async (_event, value) => service.readImage(parseAttachmentId(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchAttachmentPick,
    async (_event, value) =>
      service.pickAndAttach(parsePickWorkbenchAttachmentCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchAttachmentOpen,
    async (_event, value) => service.open(parseAttachmentId(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchAttachmentReveal,
    async (_event, value) => service.reveal(parseAttachmentId(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchAttachmentDelete,
    async (_event, value) =>
      service.delete(parseDeleteWorkbenchAttachmentCommand(value))
  )
}
