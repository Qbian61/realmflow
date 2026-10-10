import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  BrowserWindow,
  session,
  shell,
  WebContentsView,
  type Rectangle
} from 'electron'
import { IPC_EVENT_CHANNELS } from '../../../shared/ipc-contract'
import type { WebPageState, WorkbenchBounds } from '../../../shared/workbench'
import type { BrowserPageHost } from '../application/browser/browser-cdp-page'
import { browserUrl } from '../application/browser/browser-artifacts'
import { normalizeWebUrl } from './web-url'

const WEB_PARTITION = 'realmflow-web-workbench'

class AgentBrowserPageHost extends EventEmitter implements BrowserPageHost {
  private closed = false

  constructor(
    readonly webContents: WebContentsView['webContents'],
    private readonly closeSurface: () => void,
    private readonly cleanup: () => void
  ) {
    super()
  }

  loadURL(url: string): Promise<void> {
    return this.webContents.loadURL(url)
  }

  isDestroyed(): boolean {
    return this.closed || this.webContents.isDestroyed()
  }

  destroy(): void {
    this.closeSurface()
  }

  markClosed(): void {
    if (this.closed) return
    this.closed = true
    this.cleanup()
    this.emit('closed')
  }
}

function sanitizeBounds(bounds: WorkbenchBounds): Rectangle {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  }
}

export class WebWorkbenchManager {
  private readonly views = new Map<string, WebContentsView>()
  private readonly urls = new Map<string, string>()
  private readonly agentHosts = new Map<string, AgentBrowserPageHost>()
  private readonly agentIds = new Set<string>()
  private activeId: string | undefined

  constructor(
    private readonly getHostWindow: () => BrowserWindow | null
  ) {
    const isolatedSession = session.fromPartition(WEB_PARTITION)
    isolatedSession.setPermissionCheckHandler(() => false)
    isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    const preventDownload = (event: Electron.Event): void =>
      event.preventDefault()
    isolatedSession.on('will-download', preventDownload)
  }

  async create(urlValue: string): Promise<WebPageState> {
    const url = normalizeWebUrl(urlValue)
    const id = randomUUID()
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: WEB_PARTITION
      }
    })
    view.setBackgroundColor('#ffffff')
    view.setVisible(false)
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const preventUnsupportedNavigation = (
      event: Electron.Event,
      nextUrl: string
    ): void => {
      try {
        normalizeWebUrl(nextUrl)
      } catch {
        event.preventDefault()
      }
    }
    view.webContents.on('will-navigate', preventUnsupportedNavigation)
    view.webContents.on('will-redirect', preventUnsupportedNavigation)
    view.webContents.on('did-start-loading', () => this.emitState(id))
    view.webContents.on('did-stop-loading', () => this.emitState(id))
    view.webContents.on('did-navigate', () => this.emitState(id))
    view.webContents.on('did-navigate-in-page', () => this.emitState(id))
    view.webContents.on('page-title-updated', () => this.emitState(id))
    view.webContents.on(
      'did-fail-load',
      (_event, _errorCode, errorDescription) => {
        this.emitState(id, errorDescription)
      }
    )
    this.views.set(id, view)
    this.urls.set(id, url)
    void view.webContents
      .loadURL(url)
      .catch((error: Error) => this.emitState(id, error.message))
    return {
      id,
      title: new URL(url).hostname,
      url,
      loading: true,
      canGoBack: false,
      canGoForward: false
    }
  }

  createAgentSurface(input: {
    sessionId: string
    profileId: string
  }): BrowserPageHost {
    if (
      !/^browser-[A-Za-z0-9-]+$/.test(input.sessionId) ||
      !/^browser-[A-Za-z0-9-]+$/.test(input.profileId) ||
      this.views.has(input.sessionId)
    ) {
      throw new Error('Agent browser surface identity is invalid')
    }
    const partition = `persist:realmflow-browser-${input.profileId}`
    const isolatedSession = session.fromPartition(partition)
    isolatedSession.setPermissionCheckHandler(() => false)
    isolatedSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false)
    )
    const preventDownload = (event: Electron.Event): void =>
      event.preventDefault()
    isolatedSession.on('will-download', preventDownload)
    isolatedSession.webRequest.onBeforeRequest(
      { urls: ['<all_urls>'] },
      (details, callback) => {
        let permitted = false
        try {
          permitted = details.url === 'about:blank' ||
            Boolean(browserUrl(details.url))
        } catch {
          permitted = false
        }
        callback({ cancel: !permitted })
      }
    )
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        navigateOnDragDrop: false,
        partition
      }
    })
    view.setBackgroundColor('#ffffff')
    view.setVisible(false)
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const preventUnsupportedNavigation = (
      event: Electron.Event,
      nextUrl: string
    ): void => {
      try {
        if (nextUrl !== 'about:blank') browserUrl(nextUrl)
      } catch {
        event.preventDefault()
      }
    }
    view.webContents.on('will-navigate', preventUnsupportedNavigation)
    view.webContents.on('will-redirect', preventUnsupportedNavigation)
    view.webContents.on('will-frame-navigate', (event) => {
      try {
        if (event.url !== 'about:blank') browserUrl(event.url)
      } catch {
        event.preventDefault()
      }
    })
    view.webContents.on('did-start-loading', () =>
      this.emitState(input.sessionId))
    view.webContents.on('did-stop-loading', () =>
      this.emitState(input.sessionId))
    view.webContents.on('did-navigate', () =>
      this.emitState(input.sessionId))
    view.webContents.on('did-navigate-in-page', () =>
      this.emitState(input.sessionId))
    view.webContents.on('page-title-updated', () =>
      this.emitState(input.sessionId))
    view.webContents.on(
      'did-fail-load',
      (_event, _errorCode, errorDescription) =>
        this.emitState(input.sessionId, errorDescription)
    )
    const host = new AgentBrowserPageHost(
      view.webContents,
      () => this.destroy(input.sessionId),
      () => isolatedSession.removeListener(
        'will-download',
        preventDownload
      )
    )
    this.views.set(input.sessionId, view)
    this.urls.set(input.sessionId, 'about:blank')
    this.agentIds.add(input.sessionId)
    this.agentHosts.set(input.sessionId, host)
    this.emitAgentSurface({
      type: 'opened',
      page: {
        id: input.sessionId,
        title: 'Agent Browser',
        url: 'about:blank',
        loading: false,
        canGoBack: false,
        canGoForward: false,
        managed: 'agent'
      }
    })
    return host
  }

  show(id: string, bounds: WorkbenchBounds): void {
    const view = this.requireView(id)
    const hostWindow = this.requireHostWindow()
    this.hideAll()
    if (!hostWindow.contentView.children.includes(view)) {
      hostWindow.contentView.addChildView(view)
    }
    view.setBounds(sanitizeBounds(bounds))
    view.setVisible(true)
    this.activeId = id
  }

  hideAll(): void {
    for (const view of this.views.values()) view.setVisible(false)
    this.activeId = undefined
  }

  setBounds(id: string, bounds: WorkbenchBounds): void {
    this.requireView(id).setBounds(sanitizeBounds(bounds))
  }

  async navigate(id: string, urlValue: string): Promise<WebPageState> {
    this.requireUserView(id)
    const view = this.requireView(id)
    const url = normalizeWebUrl(urlValue)
    this.urls.set(id, url)
    await view.webContents.loadURL(url)
    return this.getState(id)
  }

  goBack(id: string): void {
    this.requireUserView(id)
    const contents = this.requireView(id).webContents
    if (contents.canGoBack()) contents.goBack()
  }

  goForward(id: string): void {
    this.requireUserView(id)
    const contents = this.requireView(id).webContents
    if (contents.canGoForward()) contents.goForward()
  }

  reload(id: string): void {
    this.requireUserView(id)
    this.requireView(id).webContents.reload()
  }

  destroy(id: string): void {
    const view = this.views.get(id)
    if (!view) return
    const hostWindow = this.getHostWindow()
    if (hostWindow?.contentView.children.includes(view)) {
      hostWindow.contentView.removeChildView(view)
    }
    view.webContents.close()
    this.views.delete(id)
    this.urls.delete(id)
    if (this.agentIds.delete(id)) {
      this.agentHosts.get(id)?.markClosed()
      this.agentHosts.delete(id)
      this.emitAgentSurface({ type: 'closed', sessionId: id })
    }
    if (this.activeId === id) this.activeId = undefined
  }

  async openExternal(urlValue: string): Promise<void> {
    await shell.openExternal(normalizeWebUrl(urlValue))
  }

  dispose(): void {
    for (const id of [...this.views.keys()]) this.destroy(id)
  }

  private getState(id: string, error?: string): WebPageState {
    const contents = this.requireView(id).webContents
    const currentUrl = contents.getURL()
    const url = currentUrl || this.urls.get(id) || ''
    if (currentUrl) this.urls.set(id, currentUrl)
    return {
      id,
      title: contents.getTitle() || this.getUrlTitle(url),
      url,
      loading: contents.isLoading(),
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
      ...(this.agentIds.has(id) ? { managed: 'agent' as const } : {}),
      ...(error ? { error } : {})
    }
  }

  private getUrlTitle(url: string): string {
    try {
      return new URL(url).hostname || url || '网页'
    } catch {
      return url || '网页'
    }
  }

  private emitState(id: string, error?: string): void {
    const hostWindow = this.getHostWindow()
    if (!hostWindow || hostWindow.isDestroyed() || !this.views.has(id)) return
    hostWindow.webContents.send(
      IPC_EVENT_CHANNELS.webWorkbenchStateChanged,
      this.getState(id, error)
    )
  }

  private emitAgentSurface(
    event: import('../../../shared/workbench').AgentBrowserSurfaceEvent
  ): void {
    const hostWindow = this.getHostWindow()
    if (!hostWindow || hostWindow.isDestroyed()) return
    hostWindow.webContents.send(
      IPC_EVENT_CHANNELS.agentBrowserSurface,
      event
    )
  }

  private requireHostWindow(): BrowserWindow {
    const hostWindow = this.getHostWindow()
    if (!hostWindow || hostWindow.isDestroyed()) {
      throw new Error('Application window is unavailable')
    }
    return hostWindow
  }

  private requireView(id: string): WebContentsView {
    const view = this.views.get(id)
    if (!view) throw new Error('Web page is no longer available')
    return view
  }

  private requireUserView(id: string): void {
    if (this.agentIds.has(id)) {
      throw new Error(
        'Agent browser navigation requires the Tool execution boundary'
      )
    }
  }
}
