import type { IpcMain } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import {
  parseCreateWorkbenchMemoCommand,
  parseDeleteWorkbenchMemoCommand,
  parseRestoreWorkbenchMemoCommand,
  parseUpdateWorkbenchMemoCommand
} from '../../../shared/workbench-memos'
import type { ManageWorkbenchMemos } from '../application/workbench-hub/manage-workbench-memos'
import { requireNoIpcPayload } from './runtime-validation'

export function registerWorkbenchMemoIpc({
  service,
  ipcMain
}: {
  service: Pick<
    ManageWorkbenchMemos,
    | 'getMemos'
    | 'getDeletedMemos'
    | 'createMemo'
    | 'updateMemo'
    | 'deleteMemo'
    | 'restoreMemo'
  >
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchMemoDeletedList,
    (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_QUERY_CHANNELS.workbenchMemoDeletedList
      )
      return service.getDeletedMemos()
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchMemoList,
    (_event, ...values) => {
      requireNoIpcPayload(values, IPC_QUERY_CHANNELS.workbenchMemoList)
      return service.getMemos()
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchMemoCreate,
    (_event, value) =>
      service.createMemo(parseCreateWorkbenchMemoCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchMemoUpdate,
    (_event, value) =>
      service.updateMemo(parseUpdateWorkbenchMemoCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchMemoDelete,
    (_event, value) =>
      service.deleteMemo(parseDeleteWorkbenchMemoCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchMemoRestore,
    (_event, value) =>
      service.restoreMemo(parseRestoreWorkbenchMemoCommand(value))
  )
}
