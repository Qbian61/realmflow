import { describe, expect, it, vi } from 'vitest'
import { KnowledgeRefreshScheduler } from './knowledge-refresh-scheduler'

describe('KnowledgeRefreshScheduler', () => {
  it('reconciles policies and arms only the nearest wakeup', async () => {
    const timer = vi.fn()
    const store = {
      listEnabledPolicies: vi.fn().mockResolvedValue([
        {
          sourceId: 'source-1',
          cronExpression: '*/5 * * * *',
          timeZone: 'UTC',
          revision: 2
        }
      ]),
      reconcile: vi.fn(),
      getNextWakeup: vi.fn().mockResolvedValue({
        kind: 'policy',
        sourceId: 'source-1',
        policyRevision: 2,
        nextDueAt: 2_000
      }),
      getPolicy: vi.fn(),
      claimScheduled: vi.fn(),
      claimRetry: vi.fn()
    }
    const scheduler = new KnowledgeRefreshScheduler({
      store,
      planner: { next: vi.fn().mockReturnValue(2_000) },
      execute: vi.fn(),
      now: () => 1_000,
      setTimer: timer,
      clearTimer: vi.fn()
    })

    await scheduler.start()

    expect(store.reconcile).toHaveBeenCalledWith({
      planned: [
        {
          sourceId: 'source-1',
          policyRevision: 2,
          nextDueAt: 2_000
        }
      ],
      at: 1_000,
      preserveOverdue: true
    })
    expect(timer).toHaveBeenCalledTimes(1)
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 1_000)
  })

  it('claims a due policy slot, rearms, then executes it', async () => {
    const callbacks: Array<() => void> = []
    const wakeups = [
      {
        kind: 'policy' as const,
        sourceId: 'source-1',
        policyRevision: 1,
        nextDueAt: 1_000
      },
      undefined
    ]
    const store = {
      listEnabledPolicies: vi.fn().mockResolvedValue([]),
      reconcile: vi.fn(),
      getNextWakeup: vi.fn().mockImplementation(async () => wakeups.shift()),
      getPolicy: vi.fn().mockResolvedValue({
        sourceId: 'source-1',
        enabled: true,
        cronExpression: '*/5 * * * *',
        timeZone: 'UTC',
        revision: 1
      }),
      claimScheduled: vi.fn().mockResolvedValue({
        status: 'claimed',
        run: { id: 'run-1' }
      }),
      claimRetry: vi.fn()
    }
    const execute = vi.fn().mockResolvedValue(undefined)
    const scheduler = new KnowledgeRefreshScheduler({
      store,
      planner: { next: vi.fn().mockReturnValue(301_000) },
      execute,
      createId: () => 'run-1',
      now: () => 1_000,
      setTimer: (callback) => callbacks.push(callback),
      clearTimer: vi.fn()
    })
    await scheduler.start()

    callbacks[0]?.()
    await vi.waitFor(() => {
      expect(store.claimScheduled).toHaveBeenCalledWith({
        runId: 'run-1',
        sourceId: 'source-1',
        policyRevision: 1,
        scheduledFor: 1_000,
        nextDueAt: 301_000,
        at: 1_000
      })
      expect(execute).toHaveBeenCalledWith('run-1')
    })
  })

  it('claims a retry wakeup and ignores callbacks after stop', async () => {
    let callback: (() => void) | undefined
    const clearTimer = vi.fn()
    const store = {
      listEnabledPolicies: vi.fn().mockResolvedValue([]),
      reconcile: vi.fn(),
      getNextWakeup: vi.fn().mockResolvedValue({
        kind: 'retry',
        sourceId: 'source-1',
        runId: 'run-retry',
        policyRevision: 1,
        nextDueAt: 1_000
      }),
      getPolicy: vi.fn(),
      claimScheduled: vi.fn(),
      claimRetry: vi.fn()
    }
    const execute = vi.fn()
    const scheduler = new KnowledgeRefreshScheduler({
      store,
      planner: { next: vi.fn() },
      execute,
      now: () => 1_000,
      setTimer: (next) => {
        callback = next
        return 'refresh-timer'
      },
      clearTimer
    })
    await scheduler.start()
    scheduler.stop()

    callback?.()
    await Promise.resolve()

    expect(store.claimRetry).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(clearTimer).toHaveBeenCalledTimes(1)
  })
})
