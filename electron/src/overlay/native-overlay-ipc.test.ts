import { vi } from 'vitest'
import { registerNativeOverlayIpc } from './native-overlay-ipc'

describe('registerNativeOverlayIpc', () => {
  it('forwards overlay commands with the renderer owner id', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const manager = {
      show: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn(),
      select: vi.fn(),
      close: vi.fn()
    }
    registerNativeOverlayIpc({
      manager: manager as never,
      ipcMain: {
        handle: (
          channel: string,
          handler: (...args: any[]) => unknown
        ) => handlers.set(channel, handler),
        on: (
          channel: string,
          listener: (...args: any[]) => unknown
        ) => listeners.set(channel, listener)
      } as never
    })
    const sender = { id: 23 }
    const request = {
      kind: 'workbench-menu' as const,
      anchor: { x: 20, y: 30, width: 34, height: 34 }
    }

    await handlers.get('native-overlay:show')?.({ sender }, request)
    await handlers.get('native-overlay:hide')?.(
      { sender },
      'workbench-menu'
    )
    listeners.get('native-overlay:select')?.({ sender }, 'terminal')
    listeners.get('native-overlay:close')?.({ sender })

    expect(manager.show).toHaveBeenCalledWith(23, request)
    expect(manager.hide).toHaveBeenCalledWith(23, 'workbench-menu')
    expect(manager.select).toHaveBeenCalledWith(23, 'terminal')
    expect(manager.close).toHaveBeenCalledWith(23)
  })

  it('rejects malformed overlay payloads before calling the manager', () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const manager = {
      show: vi.fn(),
      hide: vi.fn(),
      select: vi.fn(),
      close: vi.fn()
    }

    registerNativeOverlayIpc({
      manager: manager as never,
      ipcMain: {
        handle: (channel: string, handler: (...args: any[]) => unknown) =>
          handlers.set(channel, handler),
        on: (channel: string, listener: (...args: any[]) => unknown) =>
          listeners.set(channel, listener)
      } as never
    })
    const sender = { id: 23 }

    expect(() =>
      handlers.get('native-overlay:show')?.(
        { sender },
        {
          kind: 'unknown',
          anchor: { x: 0, y: 0, width: 34, height: 34 }
        }
      )
    ).toThrow('Invalid IPC payload for native-overlay:show')
    expect(() =>
      listeners.get('native-overlay:select')?.({ sender }, 'unknown')
    ).toThrow('Invalid IPC payload for native-overlay:select')
    expect(manager.show).not.toHaveBeenCalled()
    expect(manager.select).not.toHaveBeenCalled()
  })
})
