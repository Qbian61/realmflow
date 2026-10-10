import { describe, expect, it, vi } from 'vitest'
import { createRealmFlowApi } from '../preload-api'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION } from '../../../shared/web-provider'
import { registerWebProviderIpc } from './web-provider-ipc'

describe('Web provider IPC', () => {
  it('exposes typed preload get/save calls without exposing credential resolution', async () => {
    const invoke = vi.fn().mockResolvedValue(DEFAULT_WEB_PROVIDER_CONFIGURATION)
    const api = createRealmFlowApi({ invoke, on: vi.fn(), removeListener: vi.fn() }, 'darwin')
    expect(api.webProviders).toBeDefined()
    await api.webProviders!.get()
    const command = {
      searchProvider: 'disabled' as const, searxngBaseUrl: '', browserContinuation: false,
      requestId: 'web-save-1', expectedRevision: 0
    }
    await api.webProviders!.save(command)
    expect(invoke.mock.calls).toEqual([['web-provider:get'], ['web-provider:save', command]])
    expect(api.webProviders).not.toHaveProperty('resolveCredential')
  })

  it('rejects unexpected positional arguments before forwarding to Main service', async () => {
    const handlers = new Map<string, (...values: unknown[]) => unknown>()
    const service = { get: vi.fn(() => DEFAULT_WEB_PROVIDER_CONFIGURATION), save: vi.fn() }
    registerWebProviderIpc({ service,
      ipcMain: { handle: (name, handler) => handlers.set(name, handler as (...values: unknown[]) => unknown) }
    })
    expect(() => handlers.get('web-provider:get')!({}, {})).toThrow()
    expect(() => handlers.get('web-provider:save')!({}, {}, {})).toThrow()
    expect(service.get).not.toHaveBeenCalled()
    expect(service.save).not.toHaveBeenCalled()
    expect(handlers.get('web-provider:get')!({})).toEqual(DEFAULT_WEB_PROVIDER_CONFIGURATION)
  })
})
