import type { IpcMain } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import type { SidecarStatus } from '../../../shared/types'
import type { PersistenceApi } from '../../../shared/persistence'
import type { BusinessHandlers } from '../../../shared/business'
import type { CancelAiRunUseCase } from '../ai-run/application/generate-stage-artifact'
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
import { registerCodeSnippetIpc } from '../code-snippet/code-snippet-ipc'
import type { CodeSnippetService } from '../code-snippet/code-snippet-service'
import { registerBusinessIpc } from './business-ipc'
import {
  invalidIpcPayload,
  requireNoIpcPayload
} from './runtime-validation'
import { registerWorkbenchLayoutIpc } from './workbench-layout-ipc'
import type { WorkbenchLayoutService } from '../application/workbench-layout-service'
import { registerWorkbenchDashboardIpc } from './workbench-dashboard-ipc'
import type { QueryDashboardSnapshot } from '../application/workbench-hub/query-dashboard-snapshot'
import { registerWorkbenchSystemIpc } from './workbench-system-ipc'
import type { QuerySystemStatus } from '../application/workbench-hub/query-system-status'
import { registerWorkbenchTaskIpc } from './workbench-task-ipc'
import type { ManageWorkbenchTasks } from '../application/workbench-hub/manage-task-tables'
import { registerWorkbenchAttachmentIpc } from './workbench-attachment-ipc'
import type { ManageWorkbenchAttachments } from '../application/workbench-hub/manage-workbench-attachments'
import { registerWorkbenchSiteIpc } from './workbench-site-ipc'
import type { ManageWorkbenchSites } from '../application/workbench-hub/manage-workbench-sites'
import { registerWorkbenchMemoIpc } from './workbench-memo-ipc'
import type { ManageWorkbenchMemos } from '../application/workbench-hub/manage-workbench-memos'
import { registerToolCatalogIpc } from './tool-catalog-ipc'
import { registerCapabilityCatalogIpc } from './capability-catalog-ipc'
import { registerCapabilityBuilderIpc } from './capability-builder-ipc'
import { registerConversationAttachmentIpc } from './conversation-attachment-ipc'
import type { ManageConversationAttachments } from '../application/conversation/manage-conversation-attachments'
import { registerRuntimeGovernanceIpc } from './runtime-governance-ipc'
import { registerToolPermissionIpc } from './tool-permission-ipc'

type RegisterMainIpcOptions = {
  sidecar: { getStatus: () => SidecarStatus }
  aiRuns: {
    executeNode: Pick<ExecuteWorkflowNodeUseCase, 'execute'>
    executeStage: Pick<ExecuteWorkflowStageUseCase, 'execute'>
    cancel: Pick<CancelAiRunUseCase, 'execute'>
    getRun: Pick<GetAiRunUseCase, 'execute'>
    listEvents: Pick<ListAiRunEventsUseCase, 'execute'>
    publisher: RunEventSubscriber
    recovery: Parameters<typeof registerAiRunIpc>[0]['recovery']
  }
  business: BusinessHandlers
  toolCatalog: Omit<
    Parameters<typeof registerToolCatalogIpc>[0],
    'ipcMain' | 'dialog'
  >
  toolPermissions: Omit<
    Parameters<typeof registerToolPermissionIpc>[0],
    'ipcMain'
  >
  capabilityCatalog?: Omit<
    Parameters<typeof registerCapabilityCatalogIpc>[0],
    'ipcMain' | 'dialog'
  >
  capabilityBuilder?: Omit<
    Parameters<typeof registerCapabilityBuilderIpc>[0],
    'ipcMain'
  >
  runtimeGovernance?: Omit<
    Parameters<typeof registerRuntimeGovernanceIpc>[0],
    'ipcMain' | 'dialog'
  >
  workbenchLayout: Pick<WorkbenchLayoutService, 'get' | 'update'>
  workbenchDashboard: Pick<QueryDashboardSnapshot, 'execute'>
  workbenchSystem: Pick<QuerySystemStatus, 'execute'>
  workbenchTasks: ManageWorkbenchTasks
  workbenchAttachments: ManageWorkbenchAttachments
  conversationAttachments: ManageConversationAttachments
  workbenchSites: ManageWorkbenchSites
  workbenchMemos: ManageWorkbenchMemos
  backup: NonNullable<
    Parameters<typeof registerBusinessIpc>[0]['backup']
  >
  quitApp: () => void
  respondToCloseRequest: (approved: boolean) => void
  persistence: Pick<PersistenceApi, 'load'>
  workspace: WorkspaceService
  terminalManager: TerminalManager
  codeSnippetService: CodeSnippetService
  nativeOverlayManager: NativeOverlayManager
  webWorkbenchManager: WebWorkbenchManager
  ipcMain: Pick<IpcMain, 'handle' | 'on'>
  dialog: {
    showOpenDialog: (options: {
      properties: Array<
        'openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory'
      >
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
    showSaveDialog: (options: {
      defaultPath: string
      filters: Array<{ name: string; extensions: string[] }>
      properties: Array<'createDirectory' | 'showOverwriteConfirmation'>
    }) => Promise<{ canceled: boolean; filePath?: string }>
  }
  shell: {
    showItemInFolder: (path: string) => void
  }
}

export function registerMainIpc({
  sidecar,
  aiRuns,
  business,
  toolCatalog,
  toolPermissions,
  capabilityCatalog,
  capabilityBuilder,
  runtimeGovernance,
  workbenchLayout,
  workbenchDashboard,
  workbenchSystem,
  workbenchTasks,
  workbenchAttachments,
  conversationAttachments,
  workbenchSites,
  workbenchMemos,
  backup,
  quitApp,
  respondToCloseRequest,
  persistence,
  workspace,
  terminalManager,
  codeSnippetService,
  nativeOverlayManager,
  webWorkbenchManager,
  ipcMain,
  dialog,
  shell
}: RegisterMainIpcOptions): void {
  ipcMain.handle(IPC_QUERY_CHANNELS.sidecarGetStatus, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.sidecarGetStatus)
    return sidecar.getStatus()
  })
  ipcMain.handle(IPC_COMMAND_CHANNELS.appQuit, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_COMMAND_CHANNELS.appQuit)
    return quitApp()
  })
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.appCloseRespond,
    (_event, ...values) => {
      const command = values[0]
      if (
        values.length !== 1 ||
        typeof command !== 'object' ||
        command === null ||
        Array.isArray(command)
      ) {
        invalidIpcPayload(
          IPC_COMMAND_CHANNELS.appCloseRespond,
          'payload'
        )
      }
      const approved = (command as { approved?: unknown }).approved
      if (typeof approved !== 'boolean') {
        invalidIpcPayload(
          IPC_COMMAND_CHANNELS.appCloseRespond,
          'approved'
        )
      }
      return respondToCloseRequest(approved)
    }
  )
  registerAiRunIpc({ ...aiRuns, ipcMain })
  registerWorkbenchLayoutIpc({ service: workbenchLayout, ipcMain })
  registerWorkbenchDashboardIpc({ query: workbenchDashboard, ipcMain })
  registerWorkbenchSystemIpc({ query: workbenchSystem, ipcMain })
  registerWorkbenchTaskIpc({ service: workbenchTasks, ipcMain })
  registerWorkbenchAttachmentIpc({
    service: workbenchAttachments,
    ipcMain
  })
  registerConversationAttachmentIpc({
    service: conversationAttachments,
    ipcMain
  })
  registerWorkbenchSiteIpc({ service: workbenchSites, ipcMain })
  registerWorkbenchMemoIpc({ service: workbenchMemos, ipcMain })
  registerBusinessIpc({ handlers: business, backup, ipcMain, dialog })
  registerToolCatalogIpc({ ...toolCatalog, ipcMain, dialog })
  registerToolPermissionIpc({ ...toolPermissions, ipcMain })
  if (capabilityCatalog) {
    registerCapabilityCatalogIpc({
      ...capabilityCatalog,
      ipcMain,
      dialog
    })
  }
  if (capabilityBuilder) {
    registerCapabilityBuilderIpc({
      ...capabilityBuilder,
      ipcMain
    })
  }
  if (runtimeGovernance) {
    registerRuntimeGovernanceIpc({
      ...runtimeGovernance,
      ipcMain,
      dialog
    })
  }
  registerPersistenceIpc({ persistence, ipcMain })
  registerWorkspaceIpc({ workspace, ipcMain, dialog, shell })
  registerTerminalIpc({ manager: terminalManager, ipcMain })
  registerCodeSnippetIpc({ service: codeSnippetService, ipcMain })
  registerNativeOverlayIpc({ manager: nativeOverlayManager, ipcMain })
  registerWebWorkbenchIpc({ manager: webWorkbenchManager, ipcMain })
}
