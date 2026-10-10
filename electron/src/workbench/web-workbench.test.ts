import { vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const viewOptions: unknown[] = []
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const webContents = {
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(
      (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener)
      }
    ),
    loadURL: vi.fn().mockResolvedValue(undefined),
    getTitle: vi.fn(() => ''),
    getURL: vi.fn(() => ''),
    isLoading: vi.fn(() => true),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    close: vi.fn()
  }
  const view = {
    webContents,
    setBackgroundColor: vi.fn(),
    setVisible: vi.fn(),
    setBounds: vi.fn()
  }

  return {
    viewOptions,
    listeners,
    view,
    webContents,
    permissionSession: {
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn() }
    }
  }
})

vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: class {
    constructor(options: unknown) {
      electronMocks.viewOptions.push(options)
      return electronMocks.view
    }
  },
  session: {
    fromPartition: vi.fn(() => electronMocks.permissionSession)
  },
  shell: {
    openExternal: vi.fn()
  }
}))

import { WebWorkbenchManager } from './web-workbench'

describe('WebWorkbenchManager', () => {
  it('does not throw when loading starts before Electron exposes a URL', async () => {
    const send = vi.fn()
    const manager = new WebWorkbenchManager(() => ({
      isDestroyed: () => false,
      webContents: { send },
      contentView: {
        children: [],
        addChildView: vi.fn(),
        removeChildView: vi.fn()
      }
    }) as never)

    await manager.create('https://developers.pub/wiki/1002310/1025604')

    expect(() => {
      electronMocks.listeners.get('did-start-loading')?.()
    }).not.toThrow()
    expect(send).toHaveBeenCalledWith(
      'web-workbench:state-changed',
      expect.objectContaining({
        title: 'developers.pub',
        url: 'https://developers.pub/wiki/1002310/1025604'
      })
    )
  })

  it('creates an isolated Agent surface in the host workbench and emits lifecycle events', async () => {
    const send = vi.fn()
    const manager = new WebWorkbenchManager(() => ({
      isDestroyed: () => false,
      webContents: { send },
      contentView: {
        children: [],
        addChildView: vi.fn(),
        removeChildView: vi.fn()
      }
    }) as never)

    const surface = (manager as unknown as {
      createAgentSurface(input: {
        sessionId: string
        profileId: string
      }): { webContents: unknown; destroy(): void }
    }).createAgentSurface({
      sessionId: 'browser-session-1',
      profileId: 'browser-profile-1'
    })

    expect(surface.webContents).toBe(electronMocks.webContents)
    expect(electronMocks.viewOptions.at(-1)).toMatchObject({
      webPreferences: {
        partition: 'persist:realmflow-browser-browser-profile-1',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    expect(vi.mocked(electronMocks.permissionSession.setPermissionCheckHandler))
      .toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(
      'web-workbench:agent-browser-surface',
      expect.objectContaining({
        type: 'opened',
        page: expect.objectContaining({
          id: 'browser-session-1',
          managed: 'agent'
        })
      })
    )
    await expect(
      manager.navigate(
        'browser-session-1',
        'https://renderer-must-not-control.example'
      )
    ).rejects.toThrow('Tool execution boundary')

    surface.destroy()
    expect(send).toHaveBeenCalledWith(
      'web-workbench:agent-browser-surface',
      { type: 'closed', sessionId: 'browser-session-1' }
    )
  })
})
