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
    getSidecarStatus: () =>
      invoke(IPC_INVOKE_CHANNELS.sidecarGetStatus),
    quitApp: () => invoke(IPC_INVOKE_CHANNELS.appQuit),
    persistence: {
      load: (dataset) =>
        invoke(IPC_INVOKE_CHANNELS.persistenceLoad, dataset),
      save: (dataset, value, expectedRevision) =>
        invoke(
          IPC_INVOKE_CHANNELS.persistenceSave,
          dataset,
          value,
          expectedRevision
        ),
      onChanged: (listener) =>
        subscribe(
          ipcRenderer,
          IPC_EVENT_CHANNELS.persistenceChanged,
          listener
        )
    },
    nativeOverlay: {
      show: (request) =>
        invoke(IPC_INVOKE_CHANNELS.nativeOverlayShow, request),
      hide: (kind) =>
        invoke(IPC_INVOKE_CHANNELS.nativeOverlayHide, kind),
      onEvent: (listener) =>
        subscribe(
          ipcRenderer,
          IPC_EVENT_CHANNELS.nativeOverlayEvent,
          listener
        )
    },
    workspace: {
      chooseFiles: () =>
        invoke(IPC_INVOKE_CHANNELS.workspaceChooseFiles),
      chooseFolder: () =>
        invoke(IPC_INVOKE_CHANNELS.workspaceChooseFolder),
      chooseDirectory: (requirementId) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceChooseDirectory,
          requirementId
        ),
      getBinding: (requirementId) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceGetBinding, requirementId),
      listDirectory: (requirementId, path) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceListDirectory,
          requirementId,
          path
        ),
      readFile: (requirementId, path) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceReadFile,
          requirementId,
          path
        ),
      writeFile: (input) =>
        invoke(IPC_INVOKE_CHANNELS.workspaceWriteFile, input),
      readManifest: (requirementId) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceReadManifest,
          requirementId
        ),
      writeManifest: (requirementId, manifest) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceWriteManifest,
          requirementId,
          manifest
        ),
      getPreviewUrl: (requirementId, path) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceGetPreviewUrl,
          requirementId,
          path
        ),
      showItem: (requirementId, path) =>
        invoke(
          IPC_INVOKE_CHANNELS.workspaceShowItem,
          requirementId,
          path
        )
    },
    webWorkbench: {
      create: (url) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchCreate, url),
      show: (id, bounds) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchShow, id, bounds),
      hideAll: () =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchHideAll),
      setBounds: (id, bounds) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchSetBounds, id, bounds),
      navigate: (id, url) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchNavigate, id, url),
      goBack: (id) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchGoBack, id),
      goForward: (id) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchGoForward, id),
      reload: (id) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchReload, id),
      destroy: (id) =>
        invoke(IPC_INVOKE_CHANNELS.webWorkbenchDestroy, id),
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
        invoke(
          IPC_INVOKE_CHANNELS.terminalCreate,
          workspaceId,
          dimensions
        ),
      write: (sessionId, data) =>
        invoke(IPC_INVOKE_CHANNELS.terminalWrite, sessionId, data),
      resize: (sessionId, dimensions) =>
        invoke(
          IPC_INVOKE_CHANNELS.terminalResize,
          sessionId,
          dimensions
        ),
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
