import { describe, expect, it, vi } from 'vitest'
import type { BusinessHandlers } from '../../../shared/business'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import { registerBusinessIpc } from './business-ipc'

describe('schedule IPC', () => {
  it('forwards validated schedule queries and commands', async () => {
    const { handlers, registered } = registerScheduleHandlers()
    const create = {
      definition: definition(),
      idempotencyKey: 'schedule-create-1'
    }

    await registered.get(IPC_QUERY_CHANNELS.scheduleList)?.({})
    await registered.get(IPC_QUERY_CHANNELS.scheduleRunList)?.({}, {
      scheduleId: 'schedule-1',
      status: 'failed',
      limit: 25
    })
    await registered.get(IPC_COMMAND_CHANNELS.scheduleCreate)?.({}, create)
    await registered.get(IPC_COMMAND_CHANNELS.scheduleUpdate)?.({}, {
      id: 'schedule-1',
      expectedRevision: 2,
      definition: definition(),
      idempotencyKey: 'schedule-update-1'
    })
    await registered.get(IPC_COMMAND_CHANNELS.schedulePause)?.({}, {
      id: 'schedule-1',
      expectedRevision: 2,
      idempotencyKey: 'schedule-pause-1'
    })
    await registered.get(IPC_COMMAND_CHANNELS.scheduleResume)?.({}, {
      id: 'schedule-1',
      expectedRevision: 3,
      idempotencyKey: 'schedule-resume-1'
    })
    await registered.get(IPC_COMMAND_CHANNELS.scheduleRunNow)?.({}, {
      id: 'schedule-1',
      idempotencyKey: 'schedule-run-1'
    })
    await registered.get(IPC_COMMAND_CHANNELS.scheduleDelete)?.({}, {
      id: 'schedule-1',
      expectedRevision: 4,
      idempotencyKey: 'schedule-delete-1'
    })

    expect(handlers.listSchedules.execute).toHaveBeenCalledOnce()
    expect(handlers.listScheduleRuns.execute).toHaveBeenCalledWith({
      scheduleId: 'schedule-1',
      status: 'failed',
      limit: 25
    })
    expect(handlers.createSchedule.execute).toHaveBeenCalledWith(create)
    expect(handlers.updateSchedule.execute).toHaveBeenCalledWith({
      id: 'schedule-1',
      expectedRevision: 2,
      definition: definition(),
      idempotencyKey: 'schedule-update-1'
    })
    expect(handlers.pauseSchedule.execute).toHaveBeenCalledOnce()
    expect(handlers.resumeSchedule.execute).toHaveBeenCalledOnce()
    expect(handlers.runScheduleNow.execute).toHaveBeenCalledOnce()
    expect(handlers.deleteSchedule.execute).toHaveBeenCalledOnce()
  })

  it.each([
    [
      'unknown create field',
      IPC_COMMAND_CHANNELS.scheduleCreate,
      {
        definition: definition(),
        idempotencyKey: 'schedule-create-1',
        unexpected: true
      }
    ],
    [
      'duplicate Connector service',
      IPC_COMMAND_CHANNELS.scheduleCreate,
      {
        definition: {
          ...definition(),
          connectorBindings: [
            { service: 'issues', connectorId: 'connector-1' },
            { service: 'issues', connectorId: 'connector-2' }
          ]
        },
        idempotencyKey: 'schedule-create-1'
      }
    ],
    [
      'missing missed-run policy',
      IPC_COMMAND_CHANNELS.scheduleCreate,
      {
        definition: {
          ...definition(),
          missedRunPolicy: undefined
        },
        idempotencyKey: 'schedule-create-1'
      }
    ],
    [
      'invalid missed-run policy',
      IPC_COMMAND_CHANNELS.scheduleCreate,
      {
        definition: {
          ...definition(),
          missedRunPolicy: 'run_all'
        },
        idempotencyKey: 'schedule-create-1'
      }
    ],
    [
      'stale revision shape',
      IPC_COMMAND_CHANNELS.schedulePause,
      {
        id: 'schedule-1',
        expectedRevision: 0,
        idempotencyKey: 'schedule-pause-1'
      }
    ],
    [
      'invalid run status',
      IPC_QUERY_CHANNELS.scheduleRunList,
      { status: 'queued', limit: 20 }
    ]
  ])('rejects %s', async (_label, channel, value) => {
    const { registered } = registerScheduleHandlers()

    expect(() => registered.get(channel)?.({}, value)).toThrow(
      `Invalid IPC payload for ${channel}`
    )
  })

  it('rejects malformed schedule results from Main', async () => {
    const { handlers, registered } = registerScheduleHandlers()
    vi.mocked(handlers.listSchedules.execute).mockResolvedValueOnce([
      { ...schedule(), status: 'queued' as never }
    ])

    await expect(
      registered.get(IPC_QUERY_CHANNELS.scheduleList)?.({})
    ).rejects.toThrow(
      `Invalid IPC result for ${IPC_QUERY_CHANNELS.scheduleList}`
    )
  })

  it('preserves next-run and cron slot metadata from Main', async () => {
    const { handlers, registered } = registerScheduleHandlers()
    vi.mocked(handlers.listSchedules.execute).mockResolvedValueOnce([
      { ...schedule(), nextRunAt: 200 } as never
    ])
    vi.mocked(handlers.listScheduleRuns.execute).mockResolvedValueOnce([
      {
        id: 'schedule-run-cron',
        scheduleId: 'schedule-1',
        scheduleRevision: 1,
        scheduleName: 'Daily summary',
        triggerSource: 'cron',
        status: 'succeeded',
        toolExecutionId: 'tool-execution-1',
        scheduledFor: 180,
        startedAt: 181,
        finishedAt: 190,
        revision: 2
      } as never
    ])

    await expect(
      registered.get(IPC_QUERY_CHANNELS.scheduleList)?.({})
    ).resolves.toEqual([
      expect.objectContaining({ id: 'schedule-1', nextRunAt: 200 })
    ])
    await expect(
      registered.get(IPC_QUERY_CHANNELS.scheduleRunList)?.({}, { limit: 10 })
    ).resolves.toEqual([
      expect.objectContaining({
        triggerSource: 'cron',
        scheduledFor: 180
      })
    ])
  })

  it('preserves the missed-run policy and latest recovery decision', async () => {
    const { handlers, registered } = registerScheduleHandlers()
    vi.mocked(handlers.listSchedules.execute).mockResolvedValueOnce([
      {
        ...schedule(),
        missedRunPolicy: 'run_once',
        lastRecoveryDecision: {
          scheduleId: 'schedule-1',
          scheduleRevision: 1,
          missedDueAt: 150,
          policy: 'run_once',
          action: 'run_once',
          runId: 'schedule-run-recovery',
          decidedAt: 200
        }
      } as never
    ])

    await expect(
      registered.get(IPC_QUERY_CHANNELS.scheduleList)?.({})
    ).resolves.toEqual([
      expect.objectContaining({
        missedRunPolicy: 'run_once',
        lastRecoveryDecision: expect.objectContaining({
          action: 'run_once',
          runId: 'schedule-run-recovery'
        })
      })
    ])
  })

  it('rejects inconsistent recovery decision results from Main', async () => {
    const { handlers, registered } = registerScheduleHandlers()
    vi.mocked(handlers.listSchedules.execute).mockResolvedValueOnce([
      {
        ...schedule(),
        lastRecoveryDecision: {
          scheduleId: 'schedule-1',
          scheduleRevision: 1,
          missedDueAt: 150,
          policy: 'skip',
          action: 'run_once',
          runId: 'schedule-run-recovery',
          decidedAt: 200
        }
      } as never
    ])

    await expect(
      registered.get(IPC_QUERY_CHANNELS.scheduleList)?.({})
    ).rejects.toThrow(
      `Invalid IPC result for ${IPC_QUERY_CHANNELS.scheduleList}`
    )
  })

  it('rejects run results with inconsistent trigger slot metadata', async () => {
    const { handlers, registered } = registerScheduleHandlers()
    vi.mocked(handlers.listScheduleRuns.execute)
      .mockResolvedValueOnce([
        {
          id: 'schedule-run-cron',
          scheduleId: 'schedule-1',
          scheduleRevision: 1,
          scheduleName: 'Daily summary',
          triggerSource: 'cron',
          status: 'running',
          startedAt: 180,
          revision: 1
        } as never
      ])
      .mockResolvedValueOnce([
        {
          id: 'schedule-run-manual',
          scheduleId: 'schedule-1',
          scheduleRevision: 1,
          scheduleName: 'Daily summary',
          triggerSource: 'manual',
          status: 'running',
          scheduledFor: 180,
          startedAt: 180,
          revision: 1
        } as never
      ])

    await expect(
      registered.get(IPC_QUERY_CHANNELS.scheduleRunList)?.({}, { limit: 10 })
    ).rejects.toThrow(
      `Invalid IPC result for ${IPC_QUERY_CHANNELS.scheduleRunList}`
    )
    await expect(
      registered.get(IPC_QUERY_CHANNELS.scheduleRunList)?.({}, { limit: 10 })
    ).rejects.toThrow(
      `Invalid IPC result for ${IPC_QUERY_CHANNELS.scheduleRunList}`
    )
  })
})

function registerScheduleHandlers() {
  const handlers = {
    listSchedules: { execute: vi.fn(async () => [schedule()]) },
    listScheduleRuns: { execute: vi.fn(async () => []) },
    createSchedule: {
      execute: vi.fn(async () => ({
        outcome: 'saved',
        schedule: schedule()
      }))
    },
    updateSchedule: {
      execute: vi.fn(async () => ({
        outcome: 'saved',
        schedule: schedule()
      }))
    },
    pauseSchedule: {
      execute: vi.fn(async () => ({
        outcome: 'saved',
        schedule: { ...schedule(), status: 'paused' }
      }))
    },
    resumeSchedule: {
      execute: vi.fn(async () => ({
        outcome: 'saved',
        schedule: schedule()
      }))
    },
    runScheduleNow: {
      execute: vi.fn(async () => ({
        outcome: 'executed',
        run: {
          id: 'schedule-run-1',
          scheduleId: 'schedule-1',
          scheduleRevision: 1,
          scheduleName: 'Daily summary',
          triggerSource: 'manual',
          status: 'succeeded',
          toolExecutionId: 'tool-execution-1',
          startedAt: 100,
          finishedAt: 120,
          revision: 2
        },
        schedule: schedule()
      }))
    },
    deleteSchedule: {
      execute: vi.fn(async () => ({
        outcome: 'deleted',
        id: 'schedule-1'
      }))
    }
  }
  const registered = new Map<string, (...args: unknown[]) => unknown>()
  registerBusinessIpc({
    handlers: handlers as unknown as BusinessHandlers,
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        registered.set(channel, handler)
      }
    } as never
  })
  return { handlers, registered }
}

function definition() {
  return {
    name: 'Daily summary',
    description: 'Summarize project status',
    cronExpression: '0 9 * * 1-5',
    timeZone: 'Asia/Shanghai',
    missedRunPolicy: 'skip' as const,
    workspaceId: 'workspace-1',
    modelProfileId: 'model-profile-1',
    executionTarget: { kind: 'skill' as const, id: 'com.example.planning', version: '1.0.0', digest: 'a'.repeat(64) },
    skillInput: { audience: 'team' },
    connectorBindings: [
      { service: 'issues', connectorId: 'connector-1' }
    ],
    permissions: ['filesystem.read']
  }
}

function schedule() {
  return {
    id: 'schedule-1',
    ...definition(),
    status: 'active' as const,
    revision: 1,
    createdAt: 100,
    updatedAt: 100
  }
}
