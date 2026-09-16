import { vi } from 'vitest'
import { registerTerminalIpc } from './terminal-ipc'

describe('registerTerminalIpc', () => {
  it('registers an owner-scoped terminal command surface', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const manager = {
      create: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      disposeOwner: vi.fn()
    }

    registerTerminalIpc({
      manager,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    expect([...handlers.keys()]).toEqual([
      'terminal:create',
      'terminal:write',
      'terminal:resize',
      'terminal:destroy'
    ])

    const event = {
      sender: {
        id: 12,
        send: vi.fn(),
        once: vi.fn()
      }
    }
    await handlers.get('terminal:create')?.(
      event,
      'session-folder',
      { cols: 80, rows: 24 }
    )
    expect(manager.create).toHaveBeenCalledWith(
      event.sender,
      'session-folder',
      { cols: 80, rows: 24 }
    )
    expect(event.sender.once).toHaveBeenCalledWith(
      'destroyed',
      expect.any(Function)
    )

    await handlers.get('terminal:write')?.(event, 'terminal-1', 'ls\r')
    expect(manager.write).toHaveBeenCalledWith(12, 'terminal-1', 'ls\r')
  })

  it('rejects malformed terminal payloads before calling the manager', () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const manager = {
      create: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      disposeOwner: vi.fn()
    }
    const event = {
      sender: {
        id: 12,
        send: vi.fn(),
        once: vi.fn()
      }
    }

    registerTerminalIpc({
      manager,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })

    expect(() =>
      handlers.get('terminal:create')?.(event, '', { cols: 80, rows: 24 })
    ).toThrow('Invalid IPC payload for terminal:create')
    expect(() =>
      handlers
        .get('terminal:resize')
        ?.(event, 'terminal-1', { cols: Number.NaN, rows: 24 })
    ).toThrow('Invalid IPC payload for terminal:resize')
    expect(manager.create).not.toHaveBeenCalled()
    expect(manager.resize).not.toHaveBeenCalled()
  })
})
