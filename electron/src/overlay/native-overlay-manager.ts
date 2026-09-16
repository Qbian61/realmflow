import { BrowserWindow } from 'electron'
import type {
  NativeOverlayEvent,
  NativeOverlayKind,
  NativeOverlayRequest,
  WorkbenchActionId
} from '../../../shared/native-overlay'

const MENU_WIDTH = 300
const MENU_HEIGHT = 206
const WINDOW_MARGIN = 8
const ANCHOR_GAP = 4
const allowedActions = new Set<WorkbenchActionId>([
  'files',
  'folder',
  'browser',
  'terminal'
])

type NativeOverlayManagerOptions = {
  getHostWindow: () => BrowserWindow | null
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
}

export class NativeOverlayManager {
  private overlayWindow: BrowserWindow | null = null
  private overlayKind: NativeOverlayKind | null = null
  private loadPromise: Promise<void> | null = null
  private hostWindow: BrowserWindow | null = null

  constructor(private readonly options: NativeOverlayManagerOptions) {}

  async show(ownerId: number, request: NativeOverlayRequest): Promise<void> {
    const host = this.requireOwner(ownerId)
    this.validateRequest(request)
    const overlay = this.ensureWindow(host)
    await this.loadPromise

    const hostBounds = host.getContentBounds()
    const below = hostBounds.y + request.anchor.y + request.anchor.height + ANCHOR_GAP
    const above = hostBounds.y + request.anchor.y - MENU_HEIGHT - ANCHOR_GAP
    const maximumX = hostBounds.x + hostBounds.width - MENU_WIDTH - WINDOW_MARGIN
    const maximumY = hostBounds.y + hostBounds.height - MENU_HEIGHT - WINDOW_MARGIN
    const x = Math.min(
      Math.max(hostBounds.x + request.anchor.x, hostBounds.x + WINDOW_MARGIN),
      maximumX
    )
    const y =
      below <= maximumY
        ? below
        : Math.max(hostBounds.y + WINDOW_MARGIN, above)

    this.overlayKind = request.kind
    overlay.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: MENU_WIDTH,
      height: MENU_HEIGHT
    })
    overlay.show()
    overlay.focus()
  }

  hide(ownerId: number, kind: NativeOverlayKind): void {
    this.requireOwner(ownerId)
    if (this.overlayKind !== kind) return
    this.hideOverlay(false)
  }

  select(ownerId: number, action: WorkbenchActionId): void {
    this.requireOverlayOwner(ownerId)
    if (!allowedActions.has(action)) {
      throw new Error('Invalid native overlay action')
    }
    const kind = this.overlayKind
    if (!kind) return
    this.hideOverlay(false)
    this.emit({ kind, type: 'action', action })
  }

  close(ownerId: number): void {
    this.requireOverlayOwner(ownerId)
    this.hideOverlay(true)
  }

  dispose(): void {
    this.detachHostWindow()
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.close()
    }
    this.overlayWindow = null
    this.loadPromise = null
    this.overlayKind = null
  }

  private ensureWindow(host: BrowserWindow): BrowserWindow {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow
    }

    this.attachHostWindow(host)
    const overlay = new BrowserWindow({
      parent: host,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
      useContentSize: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })
    overlay.on('blur', () => this.hideOverlay(true))
    overlay.on('closed', () => {
      this.overlayWindow = null
      this.loadPromise = null
      this.overlayKind = null
    })

    this.overlayWindow = overlay
    this.loadPromise = this.loadRenderer(overlay)
    return overlay
  }

  private loadRenderer(overlay: BrowserWindow): Promise<void> {
    if (this.options.rendererUrl) {
      const url = new URL(this.options.rendererUrl)
      url.searchParams.set('nativeOverlay', 'workbench-menu')
      return overlay.loadURL(url.toString())
    }
    if (this.options.rendererFile) {
      return overlay.loadFile(this.options.rendererFile, {
        query: { nativeOverlay: 'workbench-menu' }
      })
    }
    return Promise.reject(new Error('Native overlay renderer is unavailable'))
  }

  private hideOverlay(emitClosed: boolean): void {
    if (!this.overlayWindow || !this.overlayKind) return
    const kind = this.overlayKind
    this.overlayWindow.hide()
    this.overlayKind = null
    if (emitClosed && kind) {
      this.emit({ kind, type: 'closed' })
    }
  }

  private emit(event: NativeOverlayEvent): void {
    const host = this.options.getHostWindow()
    if (!host || host.isDestroyed()) return
    host.webContents.send('native-overlay:event', event)
  }

  private requireOwner(ownerId: number): BrowserWindow {
    const host = this.options.getHostWindow()
    if (!host || host.isDestroyed() || host.webContents.id !== ownerId) {
      throw new Error('Native overlay owner is unavailable')
    }
    return host
  }

  private requireOverlayOwner(ownerId: number): void {
    if (
      !this.overlayWindow ||
      this.overlayWindow.isDestroyed() ||
      this.overlayWindow.webContents.id !== ownerId
    ) {
      throw new Error('Native overlay sender is unavailable')
    }
  }

  private validateRequest(request: NativeOverlayRequest): void {
    const values = [
      request.anchor.x,
      request.anchor.y,
      request.anchor.width,
      request.anchor.height
    ]
    if (
      request.kind !== 'workbench-menu' ||
      values.some((value) => !Number.isFinite(value)) ||
      request.anchor.width < 0 ||
      request.anchor.height < 0
    ) {
      throw new Error('Invalid native overlay request')
    }
  }

  private attachHostWindow(host: BrowserWindow): void {
    if (this.hostWindow === host) return
    this.detachHostWindow()
    this.hostWindow = host
    host.on('move', this.handleHostGeometryChange)
    host.on('resize', this.handleHostGeometryChange)
    host.on('closed', this.handleHostClosed)
  }

  private detachHostWindow(): void {
    if (!this.hostWindow) return
    this.hostWindow.removeListener('move', this.handleHostGeometryChange)
    this.hostWindow.removeListener('resize', this.handleHostGeometryChange)
    this.hostWindow.removeListener('closed', this.handleHostClosed)
    this.hostWindow = null
  }

  private readonly handleHostGeometryChange = (): void => {
    this.hideOverlay(true)
  }

  private readonly handleHostClosed = (): void => {
    this.dispose()
  }
}
