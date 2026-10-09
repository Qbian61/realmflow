import { describe, expect, it, vi } from 'vitest'
import { LegacyOfficeRuntimeCapabilityProvider } from './legacy-office-runtime-capability'

describe('LegacyOfficeRuntimeCapabilityProvider', () => {
  it('discovers LibreOffice from PATH without invoking a process', async () => {
    const isExecutable = vi.fn(async (path: string) =>
      path === '/opt/tools/soffice'
    )
    const provider = new LegacyOfficeRuntimeCapabilityProvider({
      platform: 'linux',
      environment: { PATH: '/usr/bin:/opt/tools' },
      isExecutable
    })

    await expect(provider.getUnavailableToolIds()).resolves.toEqual(new Set())
    expect(isExecutable).toHaveBeenCalledWith('/opt/tools/soffice')
  })

  it('discovers the standard macOS application executable', async () => {
    const path = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    const provider = new LegacyOfficeRuntimeCapabilityProvider({
      platform: 'darwin',
      environment: { PATH: '' },
      isExecutable: async (candidate) => candidate === path
    })

    await expect(provider.getUnavailableToolIds()).resolves.toEqual(new Set())
  })

  it('hides legacy Office import but keeps PDF export visible for structured fallback', async () => {
    const provider = new LegacyOfficeRuntimeCapabilityProvider({
      platform: 'linux',
      environment: { PATH: '/usr/bin' },
      isExecutable: async () => false
    })

    await expect(provider.getUnavailableToolIds()).resolves.toEqual(
      new Set(['builtin.office.import_legacy'])
    )
  })

  it('caches discovery until explicitly invalidated', async () => {
    let available = false
    const isExecutable = vi.fn(async () => available)
    const provider = new LegacyOfficeRuntimeCapabilityProvider({
      platform: 'linux',
      environment: { PATH: '/usr/bin' },
      isExecutable
    })

    await provider.getUnavailableToolIds()
    expect(isExecutable).toHaveBeenCalledTimes(2)
    available = true
    await expect(provider.getUnavailableToolIds()).resolves.toEqual(
      new Set(['builtin.office.import_legacy'])
    )
    expect(isExecutable).toHaveBeenCalledTimes(2)
    provider.invalidate()
    await expect(provider.getUnavailableToolIds()).resolves.toEqual(new Set())
    expect(isExecutable).toHaveBeenCalledTimes(3)
  })

  it('refreshes discovery after the cache lifetime', async () => {
    let now = 1_000
    let available = false
    const provider = new LegacyOfficeRuntimeCapabilityProvider({
      platform: 'linux',
      environment: { PATH: '/runtime' },
      isExecutable: async () => available,
      now: () => now,
      cacheTtlMs: 30_000
    })

    await expect(provider.getUnavailableToolIds()).resolves.toEqual(
      new Set(['builtin.office.import_legacy'])
    )
    available = true
    now += 30_001
    await expect(provider.getUnavailableToolIds()).resolves.toEqual(new Set())
  })
})
