import { contextBridge, ipcRenderer } from 'electron'
import type { WorkbenchActionId } from '../../../shared/native-overlay'

contextBridge.exposeInMainWorld('nativeOverlayMenu', {
  select: (action: WorkbenchActionId): void => {
    ipcRenderer.send('native-overlay:select', action)
  },
  close: (): void => {
    ipcRenderer.send('native-overlay:close')
  }
})
