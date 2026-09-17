import { describe, expect, it, vi } from 'vitest'
import { registerPersistenceIpc } from './persistence-ipc'

describe('registerPersistenceIpc', () => {
  it('registers only the legacy migration read path', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const persistence = {
      load: vi.fn().mockResolvedValue({
        status: 'loaded',
        snapshot: { revision: 1, value: null }
      })
    }
    registerPersistenceIpc({
      persistence,
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler)
      }
    })
    expect(handlers.has('persistence:save')).toBe(false)
    await expect(
      handlers.get('persistence:load')?.({}, 'workspaceNavigation')
    ).resolves.toEqual({
      status: 'loaded',
      snapshot: { revision: 1, value: null }
    })
    expect(persistence.load).toHaveBeenCalledWith('workspaceNavigation')
  })
})
