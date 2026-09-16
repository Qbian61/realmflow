import { vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
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
    listeners,
    view,
    webContents,
    permissionSession: {
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      on: vi.fn()
    }
  }
})

vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: class {
    constructor() {
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
})
