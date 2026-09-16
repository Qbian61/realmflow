import { vi } from 'vitest'
import { waitUntilSidecarHealthy } from './manager'

describe('waitUntilSidecarHealthy', () => {
  it('retries typed health checks until the sidecar is ready', async () => {
    const client = {
      getHealth: vi
        .fn()
        .mockRejectedValueOnce(new Error('not ready'))
        .mockResolvedValue({
          status: 'ok' as const,
          service: 'realmflow-agent' as const
        })
    }
    const delay = vi.fn().mockResolvedValue(undefined)

    await expect(
      waitUntilSidecarHealthy(client, {
        retries: 3,
        intervalMs: 1,
        delay
      })
    ).resolves.toBe(true)
    expect(client.getHealth).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledTimes(1)
  })

  it('returns false after all typed health checks fail', async () => {
    const client = {
      getHealth: vi.fn().mockRejectedValue(new Error('not ready'))
    }

    await expect(
      waitUntilSidecarHealthy(client, {
        retries: 2,
        intervalMs: 0,
        delay: vi.fn().mockResolvedValue(undefined)
      })
    ).resolves.toBe(false)
    expect(client.getHealth).toHaveBeenCalledTimes(2)
  })
})
