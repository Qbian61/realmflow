import type { IpcMain } from 'electron'
import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import type { PersistenceService } from './persistence-service'
import {
  requirePersistenceDataset,
  requireRevision
} from '../ipc/runtime-validation'

export function registerPersistenceIpc({
  persistence,
  ipcMain
}: {
  persistence: Pick<PersistenceService, 'load' | 'save'>
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
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.persistenceSave,
    (
      _event,
      dataset: unknown,
      value: unknown,
      expectedRevision: unknown
    ) =>
      persistence.save(
        requirePersistenceDataset(
          dataset,
          IPC_INVOKE_CHANNELS.persistenceSave
        ),
        value,
        requireRevision(
          expectedRevision,
          IPC_INVOKE_CHANNELS.persistenceSave
        )
      )
  )
}
