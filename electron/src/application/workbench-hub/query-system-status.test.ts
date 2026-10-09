import { describe, expect, it, vi } from 'vitest'
import { QuerySystemStatus } from './query-system-status'

describe('QuerySystemStatus', () => {
  it('keeps healthy services when knowledge health fails', async () => {
    const query = new QuerySystemStatus({
      resources: {
        sample: vi.fn().mockResolvedValue({
          cpuPercent: 25,
          memoryUsedBytes: 50,
          memoryTotalBytes: 100,
          memoryPercent: 50,
          diskUsedBytes: 75,
          diskTotalBytes: 100,
          diskPercent: 75
        })
      },
      sidecar: { getStatus: () => 'ready' },
      knowledge: {
        get: vi.fn().mockRejectedValue(new Error('model unavailable'))
      },
      sqlite: { check: vi.fn().mockResolvedValue(undefined) },
      backgroundJobs: {
        count: vi.fn().mockResolvedValue({ running: 2, pending: 3 })
      },
      now: () => 1_000
    })

    const snapshot = await query.execute()

    expect(snapshot.asOf).toBe(1_000)
    expect(snapshot.resources.cpuPercent).toBe(25)
    expect(
      Object.fromEntries(
        snapshot.services.map(({ id, status }) => [id, status])
      )
    ).toEqual({
      sidecar: 'ready',
      vector_store: 'degraded',
      embedding: 'degraded',
      sqlite: 'ready',
      background_jobs: 'ready'
    })
    expect(
      snapshot.services.find(({ id }) => id === 'background_jobs')?.detail
    ).toEqual({ running: 2, pending: 3 })
  })

  it('degrades only the failing resource or service probes', async () => {
    const query = new QuerySystemStatus({
      resources: {
        sample: vi.fn().mockRejectedValue(new Error('statfs unavailable'))
      },
      sidecar: { getStatus: () => 'starting' },
      knowledge: {
        get: vi.fn().mockResolvedValue({
          status: 'unavailable',
          components: {
            vectorStore: 'ready',
            embeddings: 'unavailable'
          }
        })
      },
      sqlite: {
        check: vi.fn().mockRejectedValue(new Error('database unavailable'))
      },
      backgroundJobs: {
        count: vi.fn().mockRejectedValue(new Error('jobs unavailable'))
      },
      now: () => 2_000
    })

    const snapshot = await query.execute()

    expect(snapshot.resources).toEqual({
      cpuPercent: 0,
      memoryUsedBytes: 0,
      memoryTotalBytes: 0,
      memoryPercent: 0,
      diskUsedBytes: 0,
      diskTotalBytes: 0,
      diskPercent: 0,
      status: 'unavailable'
    })
    expect(
      Object.fromEntries(
        snapshot.services.map(({ id, status }) => [id, status])
      )
    ).toEqual({
      sidecar: 'starting',
      vector_store: 'ready',
      embedding: 'degraded',
      sqlite: 'failed',
      background_jobs: 'degraded'
    })
  })
})
