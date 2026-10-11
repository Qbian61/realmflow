import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { registerToolPermissionIpc } from './tool-permission-ipc'

describe('Tool permission IPC', () => {
  it('exposes Main defaults and history with strict query validation', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    const get = vi.fn().mockResolvedValue({ approvalProfileId: 'cautious', revision: 2 })
    const save = vi.fn().mockResolvedValue({ approvalProfileId: 'trusted', revision: 3 })
    const query = vi.fn().mockResolvedValue({ records: [], metrics: [] })
    registerToolPermissionIpc({
      permissions: { listPendingPermissions: vi.fn() },
      decisions: { resolve: vi.fn(), listGrants: vi.fn(), revokeGrant: vi.fn() },
      defaults: { get, save }, observability: { query },
      ipcMain: { handle: (name, handler) => { handlers.set(name, handler) } }
    })
    expect(handlers.has('tool-permission:get-default')).toBe(true)
    await expect(handlers.get('tool-permission:get-default')!({})).resolves.toMatchObject({ revision: 2 })
    await handlers.get('tool-permission:set-default')!({}, { approvalProfileId: 'trusted', revision: 2 })
    expect(save).toHaveBeenCalledWith({ approvalProfileId: 'trusted', revision: 2 })
    await handlers.get('tool-permission:history')!({}, { risk: 'L3', limit: 25 })
    expect(query).toHaveBeenCalledWith({ risk: 'L3', limit: 25 })
    await handlers.get('tool-permission:history')!({}, { limit: 100 })
    expect(query).toHaveBeenLastCalledWith({ limit: 100 })
    expect(() => handlers.get('tool-permission:history')!({}, { risk: 'L9' })).toThrow()
    await expect(handlers.get('tool-permission:set-default')!({}, { approvalProfileId: 'trusted', revision: 2, bypass: true })).rejects.toThrow()
  })

  it('registers strict list and optimistic resolve handlers', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    const listPendingPermissions = vi.fn().mockResolvedValue([
      { id: 'permission-1', status: 'requested' }
    ])
    const resolve = vi.fn().mockResolvedValue({
      id: 'permission-1',
      status: 'approved'
    })
    const onChanged = vi.fn().mockResolvedValue(undefined)
    registerToolPermissionIpc({
      permissions: { listPendingPermissions },
      decisions: { resolve, listGrants: vi.fn().mockResolvedValue([]), revokeGrant: vi.fn().mockResolvedValue(undefined) },
      onChanged,
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      }
    })

    await expect(
      handlers.get('tool-permission:list-pending')!(
        {} as IpcMainInvokeEvent
      )
    ).resolves.toEqual([{ id: 'permission-1', status: 'requested' }])
    await expect(
      handlers.get('tool-permission:resolve')!(
        {} as IpcMainInvokeEvent,
        {
          requestId: 'permission-1',
          expectedRevision: 1,
          decision: 'allow_once'
        }
      )
    ).resolves.toMatchObject({ status: 'approved' })

    expect(resolve).toHaveBeenCalledWith({
      requestId: 'permission-1',
      expectedRevision: 1,
      decision: 'allow_once'
    })
    expect(onChanged).toHaveBeenCalledOnce()
    expect(onChanged.mock.invocationCallOrder[0]).toBeGreaterThan(
      resolve.mock.invocationCallOrder[0]!
    )
    for (const decision of ['deny', 'allow_session', 'allow_requirement', 'allow_space', 'allow_always']) {
      await handlers.get('tool-permission:resolve')!({} as IpcMainInvokeEvent,
        { requestId: 'permission-1', expectedRevision: 1, decision })
      expect(resolve).toHaveBeenLastCalledWith({
        requestId: 'permission-1', expectedRevision: 1, decision
      })
    }
  })

  it('rejects malformed, extra, and stale-shaped commands', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    registerToolPermissionIpc({
      permissions: { listPendingPermissions: vi.fn() },
      decisions: { resolve: vi.fn(), listGrants: vi.fn(), revokeGrant: vi.fn() },
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      }
    })
    const resolve = handlers.get('tool-permission:resolve')!

    await expect(
      Promise.resolve(
        resolve({} as IpcMainInvokeEvent, {
          requestId: 'permission-1',
          expectedRevision: 0,
          decision: 'allow_once'
        })
      )
    ).rejects.toThrow('revision')
    await expect(
      Promise.resolve(
        resolve({} as IpcMainInvokeEvent, {
          requestId: 'permission-1',
          expectedRevision: 1,
          decision: 'deny',
          grantForever: true
        })
      )
    ).rejects.toThrow()
  })
})
