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
    async (_event, value) => {
      const command = parseUpdateWorkbenchLayoutCommand(value)
      // #region debug-point A:ipc-update
      void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'workbench-layout-conflict', runId: 'post-fix', hypothesisId: 'A', location: 'workbench-layout-ipc:update', msg: '[DEBUG] Main received layout update', data: { requestId: command.requestId, expectedRevision: command.expectedRevision }, ts: Date.now() }) }).catch(() => {})
      // #endregion
      return service.update(command)
    }
  )
}
