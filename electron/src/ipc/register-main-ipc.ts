import type { IpcMain } from 'electron'
import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import type { SidecarStatus } from '../../../shared/types'
import type { PersistenceApi } from '../../../shared/persistence'
import type { BusinessCommandHandlers } from '../../../shared/business'
import type {
  CancelAiRunUseCase
} from '../ai-run/application/generate-stage-artifact'
import type {
  GetAiRunUseCase,
  ListAiRunEventsUseCase
} from '../application/query-ai-runs'
import type { ExecuteWorkflowStageUseCase } from '../application/workflow/execute-workflow-stage'
import type { ExecuteWorkflowNodeUseCase } from '../application/workflow/execute-workflow-node'
import {
  registerAiRunIpc,
  type RunEventSubscriber
} from '../ai-run/ipc/ai-run-ipc'
import { registerNativeOverlayIpc } from '../overlay/native-overlay-ipc'
import type { NativeOverlayManager } from '../overlay/native-overlay-manager'
import { registerPersistenceIpc } from '../persistence/persistence-ipc'
import { registerTerminalIpc } from '../terminal/terminal-ipc'
import type { TerminalManager } from '../terminal/terminal-manager'
import type { WebWorkbenchManager } from '../workbench/web-workbench'
import { registerWebWorkbenchIpc } from '../workbench/web-workbench-ipc'
import { registerWorkspaceIpc } from '../workspace/workspace-ipc'
import type { WorkspaceService } from '../workspace/workspace-service'
import { registerBusinessIpc } from './business-ipc'

type RegisterMainIpcOptions = {
  sidecar: { getStatus: () => SidecarStatus }
  aiRuns: {
    executeNode: Pick<ExecuteWorkflowNodeUseCase, 'execute'>
    executeStage: Pick<ExecuteWorkflowStageUseCase, 'execute'>
    cancel: Pick<CancelAiRunUseCase, 'execute'>
    getRun: Pick<GetAiRunUseCase, 'execute'>
    listEvents: Pick<ListAiRunEventsUseCase, 'execute'>
    publisher: RunEventSubscriber
  }
  business: BusinessCommandHandlers
  quitApp: () => void
  persistence: Pick<PersistenceApi, 'load'>
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
  aiRuns,
  business,
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
  registerAiRunIpc({ ...aiRuns, ipcMain })
  registerBusinessIpc({ handlers: business, ipcMain })
  registerPersistenceIpc({ persistence, ipcMain })
  registerWorkspaceIpc({ workspace, ipcMain, dialog, shell })
  registerTerminalIpc({ manager: terminalManager, ipcMain })
  registerNativeOverlayIpc({ manager: nativeOverlayManager, ipcMain })
  registerWebWorkbenchIpc({ manager: webWorkbenchManager, ipcMain })
}
