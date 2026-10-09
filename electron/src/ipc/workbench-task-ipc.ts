import type { IpcMain } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import {
  parseBulkDeleteTaskRecordsCommand,
  parseCreateTaskFieldCommand,
  parseCreateTaskRecordCommand,
  parseCreateTaskTableCommand,
  parseDeleteTaskFieldCommand,
  parseDeleteTaskTableCommand,
  parseDuplicateTaskTableCommand,
  parseTaskTableIdQuery,
  parseUpdateTaskFieldCommand,
  parseUpdateTaskRecordCommand,
  parseUpdateTaskTableCommand
} from '../../../shared/workbench-task-commands'
import type { ManageWorkbenchTasks } from '../application/workbench-hub/manage-task-tables'
import { requireNoIpcPayload } from './runtime-validation'

type WorkbenchTaskService = Pick<
  ManageWorkbenchTasks,
  | 'listTables'
  | 'getTable'
  | 'createTable'
  | 'updateTable'
  | 'deleteTable'
  | 'duplicateTable'
  | 'createField'
  | 'updateField'
  | 'deleteField'
  | 'createRecord'
  | 'updateRecord'
  | 'bulkDeleteRecords'
>

export function registerWorkbenchTaskIpc({
  service,
  ipcMain
}: {
  service: WorkbenchTaskService
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchTaskTableList,
    (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_QUERY_CHANNELS.workbenchTaskTableList
      )
      return service.listTables()
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workbenchTaskTableGet,
    async (_event, value) => {
      const { tableId, query } = parseTaskTableIdQuery(value)
      return service.getTable(tableId, query)
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskTableCreate,
    async (_event, value) =>
      service.createTable(parseCreateTaskTableCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskTableUpdate,
    async (_event, value) =>
      service.updateTable(parseUpdateTaskTableCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskTableDelete,
    async (_event, value) =>
      service.deleteTable(parseDeleteTaskTableCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskTableDuplicate,
    async (_event, value) =>
      service.duplicateTable(parseDuplicateTaskTableCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskFieldCreate,
    async (_event, value) =>
      service.createField(parseCreateTaskFieldCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskFieldUpdate,
    async (_event, value) =>
      service.updateField(parseUpdateTaskFieldCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskFieldDelete,
    async (_event, value) =>
      service.deleteField(parseDeleteTaskFieldCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskRecordCreate,
    async (_event, value) =>
      service.createRecord(parseCreateTaskRecordCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskRecordUpdate,
    async (_event, value) =>
      service.updateRecord(parseUpdateTaskRecordCommand(value))
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workbenchTaskRecordBulkDelete,
    async (_event, value) =>
      service.bulkDeleteRecords(parseBulkDeleteTaskRecordsCommand(value))
  )
}
