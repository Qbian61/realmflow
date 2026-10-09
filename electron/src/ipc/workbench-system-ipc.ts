import type { IpcMain } from 'electron'
import { IPC_QUERY_CHANNELS } from '../../../shared/ipc-contract'
import type { QuerySystemStatus } from '../application/workbench-hub/query-system-status'
import { requireNoIpcPayload } from './runtime-validation'

export function registerWorkbenchSystemIpc({
  query,
  ipcMain
}: {
  query: Pick<QuerySystemStatus, 'execute'>
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchSystemGet,
    (_event, ...values) => {
      requireNoIpcPayload(values, IPC_QUERY_CHANNELS.workbenchSystemGet)
      return query.execute()
    }
  )
}
