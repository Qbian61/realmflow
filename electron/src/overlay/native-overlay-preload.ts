import { contextBridge, ipcRenderer } from 'electron'
import type { WorkbenchActionId } from '../../../shared/native-overlay'
import { NATIVE_OVERLAY_SEND_CHANNELS } from './native-overlay-channels'

contextBridge.exposeInMainWorld('nativeOverlayMenu', {
  select: (action: WorkbenchActionId) => {
    ipcRenderer.send(NATIVE_OVERLAY_SEND_CHANNELS.select, action)
  },
  close: () => {
    ipcRenderer.send(NATIVE_OVERLAY_SEND_CHANNELS.close)
  }
})
