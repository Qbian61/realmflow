import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { resolveAppIconPath } from './app-icon'
import { registerNativeOverlayIpc } from './overlay/native-overlay-ipc'
import { NativeOverlayManager } from './overlay/native-overlay-manager'
import { SidecarManager } from './sidecar/manager'
import { registerTerminalIpc } from './terminal/terminal-ipc'
import { TerminalManager } from './terminal/terminal-manager'
import { WebWorkbenchManager } from './workbench/web-workbench'
import { registerWebWorkbenchIpc } from './workbench/web-workbench-ipc'
import { createArtifactProtocolHandler } from './workspace/artifact-protocol'
import { registerWorkspaceIpc } from './workspace/workspace-ipc'
import { WorkspaceService } from './workspace/workspace-service'

const sidecar = new SidecarManager()
let mainWindow: BrowserWindow | null = null
let webWorkbench: WebWorkbenchManager | null = null
let terminalManager: TerminalManager | null = null
let nativeOverlayManager: NativeOverlayManager | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'realmflow-artifact',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function createWindow(): void {
  const icon = resolveAppIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    cwd: process.cwd()
  })
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 920,
    minHeight: 620,
    title: 'RealmFlow',
    icon,
    backgroundColor: '#f1f1f1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`Preload failed: ${preloadPath}`, error)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.on('closed', () => {
    nativeOverlayManager?.dispose()
    webWorkbench?.dispose()
    if (mainWindow === window) mainWindow = null
  })
  mainWindow = window

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(
      resolveAppIconPath({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        cwd: process.cwd()
      })
    )
  }
  const workspace = new WorkspaceService(
    join(app.getPath('userData'), 'workspace-bindings.json')
  )
  ipcMain.handle('sidecar:get-status', () => sidecar.getStatus())
  ipcMain.handle('app:quit', () => app.quit())
  registerWorkspaceIpc({ workspace, ipcMain, dialog, shell })
  terminalManager = new TerminalManager({ workspace })
  registerTerminalIpc({ manager: terminalManager, ipcMain })
  nativeOverlayManager = new NativeOverlayManager({
    getHostWindow: () => mainWindow,
    preloadPath: join(
      __dirname,
      '../preload/native-overlay-preload.cjs'
    ),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html')
  })
  registerNativeOverlayIpc({ manager: nativeOverlayManager, ipcMain })
  webWorkbench = new WebWorkbenchManager(() => mainWindow)
  registerWebWorkbenchIpc({ manager: webWorkbench, ipcMain })
  protocol.handle(
    'realmflow-artifact',
    createArtifactProtocolHandler(workspace)
  )
  void sidecar.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  nativeOverlayManager?.dispose()
  terminalManager?.dispose()
  sidecar.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
