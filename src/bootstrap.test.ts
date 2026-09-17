import { vi } from 'vitest'
import type { RealmFlowApi } from '../shared/types'
import type { RendererRepositories } from './application/ports/repositories'
import { resolveApplicationRepositories } from './bootstrap'

describe('resolveApplicationRepositories', () => {
  it('uses App local repositories when the Electron bridge is missing', async () => {
    const createRepositories = vi.fn()

    await expect(
      resolveApplicationRepositories(undefined, createRepositories)
    ).resolves.toEqual({
      repositories: undefined,
      degraded: true
    })
    expect(createRepositories).not.toHaveBeenCalled()
  })

  it('uses App local repositories when Electron repository initialization fails', async () => {
    const bridge = {} as RealmFlowApi
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const createRepositories = vi
      .fn<() => Promise<RendererRepositories>>()
      .mockRejectedValue(new Error('preload unavailable'))

    await expect(
      resolveApplicationRepositories(bridge, createRepositories)
    ).resolves.toEqual({
      repositories: undefined,
      degraded: true
    })
    expect(logError).toHaveBeenCalledWith(
      'Failed to initialize Electron repositories; using local repositories.',
      expect.any(Error)
    )
  })

  it('returns Electron repositories after successful initialization', async () => {
    const bridge = {} as RealmFlowApi
    const repositories = {} as RendererRepositories

    await expect(
      resolveApplicationRepositories(bridge, async () => repositories)
    ).resolves.toEqual({
      repositories,
      degraded: false
    })
  })
})
