import type { IpcMain } from 'electron'
import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import type { PersistenceApi } from '../../../shared/persistence'
import { requirePersistenceDataset } from '../ipc/runtime-validation'

export function registerPersistenceIpc({
  persistence,
  ipcMain
}: {
  persistence: Pick<PersistenceApi, 'load'>
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.persistenceLoad,
    (_event, dataset: unknown) =>
      persistence.load(
        requirePersistenceDataset(
          dataset,
          IPC_INVOKE_CHANNELS.persistenceLoad
        )
      )
  )
}
