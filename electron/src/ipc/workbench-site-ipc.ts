import type { IpcMain } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import {
  parseCreateWorkbenchSiteCommand,
  parseCreateWorkbenchSiteGroupCommand,
  parseDeleteWorkbenchSiteCommand,
  parseDeleteWorkbenchSiteGroupCommand,
  parseUpdateWorkbenchSiteCommand,
  parseUpdateWorkbenchSiteGroupCommand
} from '../../../shared/workbench-sites'
import type { ManageWorkbenchSites } from '../application/workbench-hub/manage-workbench-sites'
import { requireNoIpcPayload } from './runtime-validation'

export function registerWorkbenchSiteIpc({
  service,
  ipcMain
}: {
  service: Pick<
    ManageWorkbenchSites,
    | 'getSnapshot'
    | 'createGroup'
    | 'updateGroup'
    | 'deleteGroup'
    | 'createSite'
    | 'updateSite'
    | 'deleteSite'
  >
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchSiteSnapshotGet,
    (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_QUERY_CHANNELS.workbenchSiteSnapshotGet
      )
      return service.getSnapshot()
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchSiteGroupCreate,
    (_event, value) =>
      service.createGroup(parseCreateWorkbenchSiteGroupCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchSiteGroupUpdate,
    (_event, value) =>
      service.updateGroup(parseUpdateWorkbenchSiteGroupCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchSiteGroupDelete,
    (_event, value) =>
      service.deleteGroup(parseDeleteWorkbenchSiteGroupCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchSiteCreate,
    (_event, value) =>
      service.createSite(parseCreateWorkbenchSiteCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchSiteUpdate,
    (_event, value) =>
      service.updateSite(parseUpdateWorkbenchSiteCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchSiteDelete,
    (_event, value) =>
      service.deleteSite(parseDeleteWorkbenchSiteCommand(value))
  )
}
