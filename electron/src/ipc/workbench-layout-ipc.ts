import type { IpcMain } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { parseUpdateWorkbenchLayoutCommand } from '../../../shared/workbench-hub'
import type { WorkbenchLayoutService } from '../application/workbench-layout-service'
import { requireNoIpcPayload } from './runtime-validation'

export function registerWorkbenchLayoutIpc({
  service,
  ipcMain
}: {
  service: Pick<WorkbenchLayoutService, 'get' | 'update'>
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchLayoutGet,
    (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_QUERY_CHANNELS.workbenchLayoutGet
      )
      return service.get()
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchLayoutUpdate,
    async (_event, value) =>
      service.update(parseUpdateWorkbenchLayoutCommand(value))
  )
}
