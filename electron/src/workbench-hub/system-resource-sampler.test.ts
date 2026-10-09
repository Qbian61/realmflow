import { describe, expect, it, vi } from 'vitest'
import { SystemResourceSampler } from './system-resource-sampler'

describe('SystemResourceSampler', () => {
  it('calculates CPU use from two aggregate interval snapshots', async () => {
    const cpus = vi
      .fn()
      .mockReturnValueOnce([
        cpuTimes({ user: 100, sys: 100, idle: 800 }),
        cpuTimes({ user: 100, sys: 100, idle: 800 })
      ])
      .mockReturnValueOnce([
        cpuTimes({ user: 200, sys: 100, idle: 900 }),
        cpuTimes({ user: 200, sys: 100, idle: 900 })
      ])
    const sampler = new SystemResourceSampler({
      cpus,
      totalmem: () => 1_000,
      freemem: () => 400,
      statfs: vi.fn().mockResolvedValue({
        blocks: 100n,
        bfree: 40n,
        bavail: 40n,
        bsize: 10n
      }),
      wait: vi.fn().mockResolvedValue(undefined),
      diskPath: '/data'
    })

    await expect(sampler.sample()).resolves.toEqual({
      cpuPercent: 50,
      memoryUsedBytes: 600,
      memoryTotalBytes: 1_000,
      memoryPercent: 60,
      diskUsedBytes: 600,
      diskTotalBytes: 1_000,
      diskPercent: 60
    })
  })

  it('clamps invalid or empty CPU intervals to a safe percentage', async () => {
    const snapshot = [cpuTimes({ user: 10, sys: 10, idle: 80 })]
    const sampler = new SystemResourceSampler({
      cpus: () => snapshot,
      totalmem: () => 0,
      freemem: () => 0,
      statfs: vi.fn().mockResolvedValue({
        blocks: 0n,
        bfree: 0n,
        bavail: 0n,
        bsize: 0n
      }),
      wait: vi.fn().mockResolvedValue(undefined),
      diskPath: '/data'
    })

    const result = await sampler.sample()

    expect(result.cpuPercent).toBe(0)
    expect(result.memoryPercent).toBe(0)
    expect(result.diskPercent).toBe(0)
  })

  it('yields during sampling instead of blocking the caller event loop', async () => {
    let release: (() => void) | undefined
    const sampler = new SystemResourceSampler({
      cpus: () => [cpuTimes({ idle: 100 })],
      totalmem: () => 100,
      freemem: () => 50,
      statfs: vi.fn().mockResolvedValue({
        blocks: 10n,
        bfree: 5n,
        bavail: 5n,
        bsize: 10n
      }),
      wait: () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
      diskPath: '/data'
    })
    let settled = false

    const sampling = sampler.sample().then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(settled).toBe(false)
    expect(release).toBeTypeOf('function')
    release?.()
    await sampling
    expect(settled).toBe(true)
  })
})

function cpuTimes(
  times: Partial<{
    user: number
    nice: number
    sys: number
    idle: number
    irq: number
  }>
) {
  return {
    model: 'cpu',
    speed: 1,
    times: {
      user: 0,
      nice: 0,
      sys: 0,
      idle: 0,
      irq: 0,
      ...times
    }
  }
}
