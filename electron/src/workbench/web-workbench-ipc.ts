import type { WorkbenchBounds } from '../../../shared/workbench'
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
  ipcMain.handle('web-workbench:create', (_event, url: string) =>
    manager.create(url)
  )
  ipcMain.handle(
    'web-workbench:show',
    (_event, id: string, bounds: WorkbenchBounds) => manager.show(id, bounds)
  )
  ipcMain.handle('web-workbench:hide-all', () => manager.hideAll())
  ipcMain.handle(
    'web-workbench:set-bounds',
    (_event, id: string, bounds: WorkbenchBounds) =>
      manager.setBounds(id, bounds)
  )
  ipcMain.handle(
    'web-workbench:navigate',
    (_event, id: string, url: string) => manager.navigate(id, url)
  )
  ipcMain.handle('web-workbench:go-back', (_event, id: string) =>
    manager.goBack(id)
  )
  ipcMain.handle('web-workbench:go-forward', (_event, id: string) =>
    manager.goForward(id)
  )
  ipcMain.handle('web-workbench:reload', (_event, id: string) =>
    manager.reload(id)
  )
  ipcMain.handle('web-workbench:destroy', (_event, id: string) =>
    manager.destroy(id)
  )
  ipcMain.handle('web-workbench:open-external', (_event, url: string) =>
    manager.openExternal(url)
  )
}
