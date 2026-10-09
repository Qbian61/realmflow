import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { registerToolPermissionIpc } from './tool-permission-ipc'

describe('Tool permission IPC', () => {
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
      decisions: { resolve },
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
  })

  it('rejects malformed, extra, and stale-shaped commands', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >()
    registerToolPermissionIpc({
      permissions: { listPendingPermissions: vi.fn() },
      decisions: { resolve: vi.fn() },
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
