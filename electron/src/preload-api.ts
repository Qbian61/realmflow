import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS
} from '../../shared/ipc-contract'
import type { RealmFlowApi } from '../../shared/types'

type IpcRendererBridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (
    channel: string,
    listener: (event: unknown, payload: unknown) => void
  ) => void
  removeListener: (
    channel: string,
    listener: (event: unknown, payload: unknown) => void
  ) => void
}

export function createRealmFlowApi(
  ipcRenderer: IpcRendererBridge,
  platform: NodeJS.Platform
): RealmFlowApi {
  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>

  return {
    platform,
    getSidecarStatus: () => invoke(IPC_INVOKE_CHANNELS.sidecarGetStatus),
    aiRuns: {
      start: (input) => invoke(IPC_INVOKE_CHANNELS.aiRunStart, input),
      cancel: (runId) => invoke(IPC_INVOKE_CHANNELS.aiRunCancel, { runId }),
      get: (runId) => invoke(IPC_INVOKE_CHANNELS.aiRunGet, { runId }),
      attach: (runId) => invoke(IPC_INVOKE_CHANNELS.aiRunAttach, { runId }),
      listEvents: (runId) =>
        invoke(IPC_INVOKE_CHANNELS.aiRunListEvents, { runId }),
      onEvent: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.aiRunEvent, listener)
    },
    business: {
      selectWorkRoot: (command) =>
        invoke(IPC_INVOKE_CHANNELS.settingsSelectWorkRoot, command),
      listWorkRoots: () => invoke(IPC_INVOKE_CHANNELS.settingsListWorkRoots),
      createSpace: (command) =>
        invoke(IPC_INVOKE_CHANNELS.spaceCreate, command),
      listSpaces: () => invoke(IPC_INVOKE_CHANNELS.spaceList),
      updateSpace: (command) =>
        invoke(IPC_INVOKE_CHANNELS.spaceUpdate, command),
      deleteSpace: (command) =>
        invoke(IPC_INVOKE_CHANNELS.spaceDelete, command),
      restoreSpace: (command) =>
        invoke(IPC_INVOKE_CHANNELS.spaceRestore, command),
      createRequirement: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementCreate, command),
      listRequirements: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementList, command),
      updateRequirement: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementUpdate, command),
      deleteRequirement: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementDelete, command),
      restoreRequirement: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementRestore, command),
      listWorkflowTemplates: () =>
        invoke(IPC_INVOKE_CHANNELS.workflowTemplateList),
      getRequirementWorkflow: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementWorkflowGet, command),
      insertWorkflowNode: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementWorkflowInsertNode, command),
      removeWorkflowNode: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementWorkflowRemoveNode, command),
      updateWorkflowEdge: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementWorkflowUpdateEdge, command),
      reorderWorkflowNodes: (command) =>
        invoke(IPC_INVOKE_CHANNELS.requirementWorkflowReorder, command),
      getWorkflowNodeExecution: (command) =>
        invoke(IPC_INVOKE_CHANNELS.workflowNodeExecutionGet, command),
      pauseWorkflowNode: (command) =>
        invoke(IPC_INVOKE_CHANNELS.workflowNodePause, command),
      resumeWorkflowNode: (command) =>
        invoke(IPC_INVOKE_CHANNELS.workflowNodeResume, command),
      resolveWorkflowNodeGate: (command) =>
        invoke(IPC_INVOKE_CHANNELS.workflowNodeResolveGate, command),
      listRecentConversations: () =>
        invoke(IPC_INVOKE_CHANNELS.conversationListRecent),
      listWorkspaceConversations: (command) =>
        invoke(IPC_INVOKE_CHANNELS.conversationListByWorkspace, command),
      getConversation: (command) =>
        invoke(IPC_INVOKE_CHANNELS.conversationGet, command),
      createConversation: (command) =>
        invoke(IPC_INVOKE_CHANNELS.conversationCreate, command),
      appendConversationMessage: (command) =>
        invoke(IPC_INVOKE_CHANNELS.conversationAppendMessage, command),
      listSpaceResources: (command) =>
        invoke(IPC_INVOKE_CHANNELS.spaceResourceList, command),
      saveSpaceResource: (command) =>
        invoke(IPC_INVOKE_CHANNELS.spaceResourceSave, command),
      deleteSpaceResource: (command) =>
        invoke(IPC_INVOKE_CHANNELS.spaceResourceDelete, command),
      listNodeTodos: (command) =>
        invoke(IPC_INVOKE_CHANNELS.nodeTodoList, command),
      saveNodeTodo: (command) =>
        invoke(IPC_INVOKE_CHANNELS.nodeTodoSave, command),
      listNodeQuestions: (command) =>
        invoke(IPC_INVOKE_CHANNELS.nodeQuestionList, command),
      answerNodeQuestion: (command) =>
        invoke(IPC_INVOKE_CHANNELS.nodeQuestionAnswer, command),
      listModels: () => invoke(IPC_INVOKE_CHANNELS.modelList),
      saveModelProvider: (command) =>
        invoke(IPC_INVOKE_CHANNELS.modelProviderSave, command),
      saveModelProfile: (command) =>
        invoke(IPC_INVOKE_CHANNELS.modelProfileSave, command),
      setModelCredential: (command) =>
        invoke(IPC_INVOKE_CHANNELS.modelCredentialSet, command),
      listModelMetrics: (filters) =>
        invoke(IPC_INVOKE_CHANNELS.modelMetricList, filters)
    },
    quitApp: () => invoke(IPC_INVOKE_CHANNELS.appQuit),
    persistence: {
      load: (dataset) => invoke(IPC_INVOKE_CHANNELS.persistenceLoad, dataset),
      onChanged: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.persistenceChanged, listener)
    },
    nativeOverlay: {
      show: (request) => invoke(IPC_INVOKE_CHANNELS.nativeOverlayShow, request),
      hide: (kind) => invoke(IPC_INVOKE_CHANNELS.nativeOverlayHide, kind),
      onEvent: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.nativeOverlayEvent, listener)
    },
    workspace: {
      chooseFiles: () => invoke(IPC_INVOKE_CHANNELS.workspaceChooseFiles),
      chooseFolder: () => invoke(IPC_INVOKE_CHANNELS.workspaceChooseFolder),
      chooseDirectory: (requirementId) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceChooseDirectory, requirementId),
      getBinding: (requirementId) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceGetBinding, requirementId),
      listDirectory: (requirementId, path) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceListDirectory, requirementId, path),
      readFile: (requirementId, path) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceReadFile, requirementId, path),
      writeFile: (input) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceWriteFile, input),
      readManifest: (requirementId) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceReadManifest, requirementId),
      writeManifest: (requirementId, manifest) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceWriteManifest,
          requirementId,
          manifest
        ),
      getPreviewUrl: (requirementId, path) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceGetPreviewUrl, requirementId, path),
      showItem: (requirementId, path) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceShowItem, requirementId, path)
    },
    webWorkbench: {
      create: (url) => invoke(IPC_INVOKE_CHANNELS.webWorkbenchCreate, url),
      show: (id, bounds) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchShow, id, bounds),
      hideAll: () => invoke(IPC_INVOKE_CHANNELS.webWorkbenchHideAll),
      setBounds: (id, bounds) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchSetBounds, id, bounds),
      navigate: (id, url) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchNavigate, id, url),
      goBack: (id) => invoke(IPC_INVOKE_CHANNELS.webWorkbenchGoBack, id),
      goForward: (id) => invoke(IPC_INVOKE_CHANNELS.webWorkbenchGoForward, id),
      reload: (id) => invoke(IPC_INVOKE_CHANNELS.webWorkbenchReload, id),
      destroy: (id) => invoke(IPC_INVOKE_CHANNELS.webWorkbenchDestroy, id),
      openExternal: (url) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchOpenExternal, url),
      onStateChange: (listener) =>
        subscribe(
          ipcRenderer,
          IPC_EVENT_CHANNELS.webWorkbenchStateChanged,
          listener
        )
    },
    terminal: {
      create: (workspaceId, dimensions) =>
        invoke(IPC_INVOKE_CHANNELS.terminalCreate, workspaceId, dimensions),
      write: (sessionId, data) =>
        invoke(IPC_INVOKE_CHANNELS.terminalWrite, sessionId, data),
      resize: (sessionId, dimensions) =>
        invoke(IPC_INVOKE_CHANNELS.terminalResize, sessionId, dimensions),
      destroy: (sessionId) =>
        invoke(IPC_INVOKE_CHANNELS.terminalDestroy, sessionId),
      onEvent: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.terminalEvent, listener)
    }
  }
}

function subscribe<T>(
  ipcRenderer: IpcRendererBridge,
  channel: string,
  listener: (payload: T) => void
): () => void {
  const handler = (_event: unknown, payload: unknown): void =>
    listener(payload as T)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
