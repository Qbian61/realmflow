import { vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const overlayListeners = new Map<string, (...args: unknown[]) => void>()
  const hostListeners = new Map<string, (...args: unknown[]) => void>()
  let browserWindowOptions: Record<string, unknown> | undefined

  const overlayWindow = {
    webContents: {
      id: 31,
      on: vi.fn(),
      close: vi.fn()
    },
    on: vi.fn(
      (event: string, listener: (...args: unknown[]) => void) => {
        overlayListeners.set(event, listener)
      }
    ),
    setBounds: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false)
  }

  const send = vi.fn()
  const hostWindow = {
    webContents: {
      id: 7,
      send
    },
    getContentBounds: vi.fn(() => ({
      x: 100,
      y: 200,
      width: 1000,
      height: 700
    })),
    isDestroyed: vi.fn(() => false),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      hostListeners.set(event, listener)
    }),
    removeListener: vi.fn()
  }

  return {
    overlayListeners,
    hostListeners,
    overlayWindow,
    hostWindow,
    send,
    setBrowserWindowOptions: (options: Record<string, unknown>) => {
      browserWindowOptions = options
    },
    getBrowserWindowOptions: () => browserWindowOptions
  }
})

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (
    this: unknown,
    options: Record<string, unknown>
  ) {
    electronMocks.setBrowserWindowOptions(options)
    return electronMocks.overlayWindow
  })
}))

import { NativeOverlayManager } from './native-overlay-manager'

describe('NativeOverlayManager', () => {
  it('shows a secure child window above the host at the requested anchor', async () => {
    const manager = new NativeOverlayManager({
      getHostWindow: () => electronMocks.hostWindow as never,
      preloadPath: '/tmp/native-overlay-preload.cjs',
      rendererUrl: 'http://localhost:5173/'
    })

    await manager.show(7, {
      kind: 'workbench-menu',
      anchor: {
        x: 651,
        y: 16,
        width: 34,
        height: 34
      }
    })

    expect(electronMocks.getBrowserWindowOptions()).toMatchObject({
      parent: electronMocks.hostWindow,
      frame: false,
      transparent: true,
      show: false,
      width: 300,
      height: 206,
      webPreferences: {
        preload: '/tmp/native-overlay-preload.cjs',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })
    expect(electronMocks.overlayWindow.loadURL).toHaveBeenCalledWith(
      'http://localhost:5173/?nativeOverlay=workbench-menu'
    )
    expect(electronMocks.overlayWindow.setBounds).toHaveBeenCalledWith({
      x: 751,
      y: 254,
      width: 300,
      height: 206
    })
    expect(electronMocks.overlayWindow.show).toHaveBeenCalled()
    expect(electronMocks.overlayWindow.focus).toHaveBeenCalled()
  })

  it('forwards allowlisted actions and closes the overlay', async () => {
    const manager = new NativeOverlayManager({
      getHostWindow: () => electronMocks.hostWindow as never,
      preloadPath: '/tmp/native-overlay-preload.cjs',
      rendererUrl: 'http://localhost:5173/'
    })
    await manager.show(7, {
      kind: 'workbench-menu',
      anchor: { x: 20, y: 20, width: 34, height: 34 }
    })

    manager.select(31, 'terminal')
    expect(electronMocks.send).toHaveBeenCalledWith('native-overlay:event', {
      kind: 'workbench-menu',
      type: 'action',
      action: 'terminal'
    })
    expect(electronMocks.overlayWindow.hide).toHaveBeenCalled()
  })
})
