import type { IpcMain } from 'electron'
import { IPC_QUERY_CHANNELS } from '../../../shared/ipc-contract'
import { parseDashboardSnapshotQuery } from '../../../shared/workbench-dashboard'
import type { QueryDashboardSnapshot } from '../application/workbench-hub/query-dashboard-snapshot'

export function registerWorkbenchDashboardIpc({
  query,
  ipcMain
}: {
  query: Pick<QueryDashboardSnapshot, 'execute'>
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchDashboardGet,
    async (_event, value = {}) =>
      query.execute(parseDashboardSnapshotQuery(value))
  )
}
