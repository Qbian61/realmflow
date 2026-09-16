import type { IpcMain } from 'electron'
import {
  IPC_INVOKE_CHANNELS,
  IPC_SEND_CHANNELS
} from '../../../shared/ipc-contract'
import {
  requireNativeOverlayKind,
  requireNativeOverlayRequest,
  requireWorkbenchAction
} from '../ipc/runtime-validation'
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
    IPC_INVOKE_CHANNELS.nativeOverlayShow,
    (event, request: unknown) =>
      manager.show(
        event.sender.id,
        requireNativeOverlayRequest(
          request,
          IPC_INVOKE_CHANNELS.nativeOverlayShow
        )
      )
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.nativeOverlayHide,
    (event, kind: unknown) =>
      manager.hide(
        event.sender.id,
        requireNativeOverlayKind(
          kind,
          IPC_INVOKE_CHANNELS.nativeOverlayHide
        )
      )
  )
  ipcMain.on(
    IPC_SEND_CHANNELS.nativeOverlaySelect,
    (event, action: unknown) =>
      manager.select(
        event.sender.id,
        requireWorkbenchAction(
          action,
          IPC_SEND_CHANNELS.nativeOverlaySelect
        )
      )
  )
  ipcMain.on(IPC_SEND_CHANNELS.nativeOverlayClose, (event) => {
    manager.close(event.sender.id)
  })
}
