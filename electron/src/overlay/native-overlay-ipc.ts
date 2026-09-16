import type { IpcMain } from 'electron'
import type {
  NativeOverlayKind,
  NativeOverlayRequest,
  WorkbenchActionId
} from '../../../shared/native-overlay'
import type { NativeOverlayManager } from './native-overlay-manager'

type RegisterNativeOverlayIpcOptions = {
  manager: NativeOverlayManager
  ipcMain: Pick<IpcMain, 'handle' | 'on'>
}

export function registerNativeOverlayIpc({
  manager,
  ipcMain
}: RegisterNativeOverlayIpcOptions): void {
  ipcMain.handle(
    'native-overlay:show',
    (event, request: NativeOverlayRequest) =>
      manager.show(event.sender.id, request)
  )
  ipcMain.handle(
    'native-overlay:hide',
    (event, kind: NativeOverlayKind) =>
      manager.hide(event.sender.id, kind)
  )
  ipcMain.on(
    'native-overlay:select',
    (event, action: WorkbenchActionId) =>
      manager.select(event.sender.id, action)
  )
  ipcMain.on('native-overlay:close', (event) => {
    manager.close(event.sender.id)
  })
}
