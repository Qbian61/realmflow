import { vi } from 'vitest'
import { registerWebWorkbenchIpc } from './web-workbench-ipc'

describe('registerWebWorkbenchIpc', () => {
  it('registers the explicit web workbench command surface', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const manager = {
      create: vi.fn(),
      show: vi.fn(),
      hideAll: vi.fn(),
      setBounds: vi.fn(),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      openExternal: vi.fn()
    }

    registerWebWorkbenchIpc({
      manager,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    expect([...handlers.keys()]).toEqual([
      'web-workbench:create',
      'web-workbench:show',
      'web-workbench:hide-all',
      'web-workbench:set-bounds',
      'web-workbench:navigate',
      'web-workbench:go-back',
      'web-workbench:go-forward',
      'web-workbench:reload',
      'web-workbench:destroy',
      'web-workbench:open-external'
    ])
  })

  it('rejects malformed command payloads before calling the manager', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const manager = {
      create: vi.fn(),
      show: vi.fn(),
      hideAll: vi.fn(),
      setBounds: vi.fn(),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      openExternal: vi.fn()
    }

    registerWebWorkbenchIpc({
      manager,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    expect(() =>
      handlers.get('web-workbench:show')?.({}, 'page-1', {
        x: 0,
        y: 0,
        width: Number.NaN,
        height: 400
      })
    ).toThrow('Invalid IPC payload for web-workbench:show')
    expect(() =>
      handlers.get('web-workbench:navigate')?.({}, 'page-1', null)
    ).toThrow('Invalid IPC payload for web-workbench:navigate')
    expect(manager.show).not.toHaveBeenCalled()
    expect(manager.navigate).not.toHaveBeenCalled()
  })
})
