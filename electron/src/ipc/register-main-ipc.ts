import type { IpcMain } from 'electron'
import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import type { SidecarStatus } from '../../../shared/types'
import { registerNativeOverlayIpc } from '../overlay/native-overlay-ipc'
import type { NativeOverlayManager } from '../overlay/native-overlay-manager'
import { registerPersistenceIpc } from '../persistence/persistence-ipc'
import type { PersistenceService } from '../persistence/persistence-service'
import { registerTerminalIpc } from '../terminal/terminal-ipc'
import type { TerminalManager } from '../terminal/terminal-manager'
import type { WebWorkbenchManager } from '../workbench/web-workbench'
import { registerWebWorkbenchIpc } from '../workbench/web-workbench-ipc'
import { registerWorkspaceIpc } from '../workspace/workspace-ipc'
import type { WorkspaceService } from '../workspace/workspace-service'

type RegisterMainIpcOptions = {
  sidecar: { getStatus: () => SidecarStatus }
  quitApp: () => void
  persistence: Pick<PersistenceService, 'load' | 'save'>
  workspace: WorkspaceService
  terminalManager: TerminalManager
  nativeOverlayManager: NativeOverlayManager
  webWorkbenchManager: WebWorkbenchManager
  ipcMain: Pick<IpcMain, 'handle' | 'on'>
  dialog: {
    showOpenDialog: (options: {
      properties: Array<
        'openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory'
      >
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
  shell: {
    showItemInFolder: (path: string) => void
  }
}

export function registerMainIpc({
  sidecar,
  quitApp,
  persistence,
  workspace,
  terminalManager,
  nativeOverlayManager,
  webWorkbenchManager,
  ipcMain,
  dialog,
  shell
}: RegisterMainIpcOptions): void {
  ipcMain.handle(IPC_INVOKE_CHANNELS.sidecarGetStatus, () =>
    sidecar.getStatus()
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.appQuit, () => quitApp())
  registerPersistenceIpc({ persistence, ipcMain })
  registerWorkspaceIpc({ workspace, ipcMain, dialog, shell })
  registerTerminalIpc({ manager: terminalManager, ipcMain })
  registerNativeOverlayIpc({ manager: nativeOverlayManager, ipcMain })
  registerWebWorkbenchIpc({ manager: webWorkbenchManager, ipcMain })
}
