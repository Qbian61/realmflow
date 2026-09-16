import { contextBridge, ipcRenderer } from 'electron'
import { IPC_SEND_CHANNELS } from '../../../shared/ipc-contract'
import type { WorkbenchActionId } from '../../../shared/native-overlay'

contextBridge.exposeInMainWorld('nativeOverlayMenu', {
select: (action: WorkbenchActionId) => {
    ipcRenderer.send(IPC_SEND_CHANNELS.nativeOverlaySelect, action)
  },
  close: () => {
    ipcRenderer.send(IPC_SEND_CHANNELS.nativeOverlayClose)
  }
})
