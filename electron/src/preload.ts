import { contextBridge, ipcRenderer } from 'electron'
import type { RealmFlowApi } from '../../shared/types'

const api: RealmFlowApi = {
  platform: process.platform,
  getSidecarStatus: () => ipcRenderer.invoke('sidecar:get-status'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  nativeOverlay: {
    show: (request) => ipcRenderer.invoke('native-overlay:show', request),
    hide: (kind) => ipcRenderer.invoke('native-overlay:hide', kind),
    onEvent: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        overlayEvent: Parameters<typeof listener>[0]
      ): void => {
        listener(overlayEvent)
      }
      ipcRenderer.on('native-overlay:event', handler)
      return () => ipcRenderer.removeListener('native-overlay:event', handler)
    }
  },
  workspace: {
    chooseFiles: () => ipcRenderer.invoke('workspace:choose-files'),
    chooseFolder: () => ipcRenderer.invoke('workspace:choose-folder'),
    chooseDirectory: (requirementId) =>
      ipcRenderer.invoke('workspace:choose-directory', requirementId),
    getBinding: (requirementId) =>
      ipcRenderer.invoke('workspace:get-binding', requirementId),
    listDirectory: (requirementId, path) =>
      ipcRenderer.invoke('workspace:list-directory', requirementId, path),
    readFile: (requirementId, path) =>
      ipcRenderer.invoke('workspace:read-file', requirementId, path),
    writeFile: (input) => ipcRenderer.invoke('workspace:write-file', input),
    readManifest: (requirementId) =>
      ipcRenderer.invoke('workspace:read-manifest', requirementId),
    writeManifest: (requirementId, manifest) =>
      ipcRenderer.invoke('workspace:write-manifest', requirementId, manifest),
    getPreviewUrl: (requirementId, path) =>
      ipcRenderer.invoke('workspace:get-preview-url', requirementId, path),
    showItem: (requirementId, path) =>
      ipcRenderer.invoke('workspace:show-item', requirementId, path)
  },
  webWorkbench: {
    create: (url) => ipcRenderer.invoke('web-workbench:create', url),
    show: (id, bounds) => ipcRenderer.invoke('web-workbench:show', id, bounds),
    hideAll: () => ipcRenderer.invoke('web-workbench:hide-all'),
    setBounds: (id, bounds) =>
      ipcRenderer.invoke('web-workbench:set-bounds', id, bounds),
    navigate: (id, url) =>
      ipcRenderer.invoke('web-workbench:navigate', id, url),
    goBack: (id) => ipcRenderer.invoke('web-workbench:go-back', id),
    goForward: (id) => ipcRenderer.invoke('web-workbench:go-forward', id),
    reload: (id) => ipcRenderer.invoke('web-workbench:reload', id),
    destroy: (id) => ipcRenderer.invoke('web-workbench:destroy', id),
    openExternal: (url) =>
      ipcRenderer.invoke('web-workbench:open-external', url),
    onStateChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]): void => {
        listener(state)
      }
      ipcRenderer.on('web-workbench:state-changed', handler)
      return () => ipcRenderer.removeListener('web-workbench:state-changed', handler)
    }
  },
  terminal: {
    create: (workspaceId, dimensions) =>
      ipcRenderer.invoke('terminal:create', workspaceId, dimensions),
    write: (sessionId, data) =>
      ipcRenderer.invoke('terminal:write', sessionId, data),
    resize: (sessionId, dimensions) =>
      ipcRenderer.invoke('terminal:resize', sessionId, dimensions),
    destroy: (sessionId) =>
      ipcRenderer.invoke('terminal:destroy', sessionId),
    onEvent: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        terminalEvent: Parameters<typeof listener>[0]
      ): void => {
        listener(terminalEvent)
      }
      ipcRenderer.on('terminal:event', handler)
      return () => ipcRenderer.removeListener('terminal:event', handler)
    }
  }
}

contextBridge.exposeInMainWorld('realmflow', api)
