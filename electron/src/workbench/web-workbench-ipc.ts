import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import {
  requireString,
  requireWorkbenchBounds
} from '../ipc/runtime-validation'
import type { WebWorkbenchManager } from './web-workbench'

type WebWorkbenchCommands = Pick<
  WebWorkbenchManager,
  | 'create'
  | 'show'
  | 'hideAll'
  | 'setBounds'
  | 'navigate'
  | 'goBack'
  | 'goForward'
  | 'reload'
  | 'destroy'
  | 'openExternal'
>

type WebWorkbenchIpcDependencies = {
  manager: WebWorkbenchCommands
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: any[]) => unknown
    ) => void
  }
}

export function registerWebWorkbenchIpc({
  manager,
  ipcMain
}: WebWorkbenchIpcDependencies): void {
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.webWorkbenchCreate,
    (_event, url: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.webWorkbenchCreate
      return manager.create(requireString(url, channel, 'url'))
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.webWorkbenchShow,
    (_event, id: unknown, bounds: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.webWorkbenchShow
      return manager.show(
        requireString(id, channel, 'id'),
        requireWorkbenchBounds(bounds, channel)
      )
    }
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.webWorkbenchHideAll, () =>
    manager.hideAll()
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.webWorkbenchSetBounds,
    (_event, id: unknown, bounds: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.webWorkbenchSetBounds
      return manager.setBounds(
        requireString(id, channel, 'id'),
        requireWorkbenchBounds(bounds, channel)
      )
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.webWorkbenchNavigate,
    (_event, id: unknown, url: unknown) => {
      const channel = IPC_INVOKE_CHANNELS.webWorkbenchNavigate
      return manager.navigate(
        requireString(id, channel, 'id'),
        requireString(url, channel, 'url')
      )
    }
  )
  registerStringCommand(
    ipcMain,
    IPC_INVOKE_CHANNELS.webWorkbenchGoBack,
    'id',
    manager.goBack.bind(manager)
  )
  registerStringCommand(
    ipcMain,
    IPC_INVOKE_CHANNELS.webWorkbenchGoForward,
    'id',
    manager.goForward.bind(manager)
  )
  registerStringCommand(
    ipcMain,
    IPC_INVOKE_CHANNELS.webWorkbenchReload,
    'id',
    manager.reload.bind(manager)
  )
  registerStringCommand(
    ipcMain,
    IPC_INVOKE_CHANNELS.webWorkbenchDestroy,
    'id',
    manager.destroy.bind(manager)
  )
  registerStringCommand(
    ipcMain,
    IPC_INVOKE_CHANNELS.webWorkbenchOpenExternal,
    'url',
    manager.openExternal.bind(manager)
  )
}

function registerStringCommand(
  ipcMain: WebWorkbenchIpcDependencies['ipcMain'],
  channel: string,
  field: string,
  command: (value: string) => unknown
): void {
  ipcMain.handle(channel, (_event, value: unknown) =>
    command(requireString(value, channel, field))
  )
}
