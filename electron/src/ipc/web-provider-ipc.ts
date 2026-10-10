import type { IpcMain } from 'electron'
import { IPC_COMMAND_CHANNELS, IPC_QUERY_CHANNELS } from '../../../shared/ipc-contract'
import type { WebProviderConfigurationService } from '../application/web/web-provider-configuration-service'
import { requireNoIpcPayload } from './runtime-validation'

export function registerWebProviderIpc({ service, ipcMain }: {
  service: Pick<WebProviderConfigurationService, 'get' | 'save'>
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  ipcMain.handle(IPC_QUERY_CHANNELS.webProviderGet, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.webProviderGet)
    return service.get()
  })
  ipcMain.handle(IPC_COMMAND_CHANNELS.webProviderSave, (_event, ...values) => {
    if (values.length !== 1) throw new Error('web_configuration_invalid')
    // The Main application service validates the complete command before any write.
    return service.save(values[0])
  })
}
