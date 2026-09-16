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
})
