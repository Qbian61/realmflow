export const IPC_INVOKE_CHANNELS = {
  sidecarGetStatus: 'sidecar:get-status',
  appQuit: 'app:quit',
  persistenceLoad: 'persistence:load',
  persistenceSave: 'persistence:save',
  nativeOverlayShow: 'native-overlay:show',
  nativeOverlayHide: 'native-overlay:hide',
  workspaceChooseFiles: 'workspace:choose-files',
  workspaceChooseFolder: 'workspace:choose-folder',
  workspaceChooseDirectory: 'workspace:choose-directory',
  workspaceGetBinding: 'workspace:get-binding',
  workspaceListDirectory: 'workspace:list-directory',
  workspaceReadFile: 'workspace:read-file',
  workspaceWriteFile: 'workspace:write-file',
  workspaceReadManifest: 'workspace:read-manifest',
  workspaceWriteManifest: 'workspace:write-manifest',
  workspaceGetPreviewUrl: 'workspace:get-preview-url',
  workspaceShowItem: 'workspace:show-item',
  webWorkbenchCreate: 'web-workbench:create',
  webWorkbenchShow: 'web-workbench:show',
  webWorkbenchHideAll: 'web-workbench:hide-all',
  webWorkbenchSetBounds: 'web-workbench:set-bounds',
  webWorkbenchNavigate: 'web-workbench:navigate',
  webWorkbenchGoBack: 'web-workbench:go-back',
  webWorkbenchGoForward: 'web-workbench:go-forward',
  webWorkbenchReload: 'web-workbench:reload',
  webWorkbenchDestroy: 'web-workbench:destroy',
  webWorkbenchOpenExternal: 'web-workbench:open-external',
  terminalCreate: 'terminal:create',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalDestroy: 'terminal:destroy'
} as const

export const IPC_SEND_CHANNELS = {
  nativeOverlaySelect: 'native-overlay:select',
  nativeOverlayClose: 'native-overlay:close'
} as const

export const IPC_EVENT_CHANNELS = {
  persistenceChanged: 'persistence:changed',
  nativeOverlayEvent: 'native-overlay:event',
  webWorkbenchStateChanged: 'web-workbench:state-changed',
  terminalEvent: 'terminal:event'
} as const
