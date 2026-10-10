import { describe, expect, it, vi } from 'vitest'
import type { Schedule, ScheduleRun } from '../../../../domain/schedule'
import { AutomationRuntimeService } from './automation-runtime-service'

const active: Schedule = {
  id: 'schedule-active',
  name: 'Daily summary',
  description: 'Summarize the workspace',
  cronExpression: '0 9 * * *',
  timeZone: 'Asia/Shanghai',
  missedRunPolicy: 'run_once',
  workspaceId: 'workspace-1',
  modelProfileId: 'profile-1',
  executionTarget: {
    kind: 'skill',
    id: 'summary',
    version: '1.0.0',
    digest: 'a'.repeat(64)
  },
  skillInput: { privatePrompt: 'must-not-be-returned' },
  connectorBindings: [{ service: 'mail', connectorId: 'private-connector' }],
  permissions: ['filesystem.read'],
  status: 'active',
  revision: 3,
  createdAt: 10,
  updatedAt: 20,
  lastRunAt: 30,
  lastRunStatus: 'succeeded'
}

const paused: Schedule = {
  ...active,
  id: 'schedule-paused',
  name: 'Weekly report',
  status: 'paused',
  revision: 2,
  lastRunStatus: 'failed'
}

const running: ScheduleRun = {
  id: 'run-1',
  scheduleId: active.id,
  scheduleRevision: 3,
  scheduleName: active.name,
  triggerSource: 'cron',
  status: 'running',
  scheduledFor: 90,
  startedAt: 100,
  revision: 1
}

function fixture() {
  const dependencies = {
    schedules: {
      list: vi.fn(async () => [paused, active]),
      listRuns: vi.fn(async () => [running])
    },
    scheduler: {
      status: vi.fn(() => ({
        running: true,
        nextDueAt: 200,
        nextScheduleId: active.id
      }))
    },
    background: {
      status: vi.fn(async () => ({ running: 2, pending: 1 }))
    },
    now: () => 1_000
  }
  return {
    service: new AutomationRuntimeService(dependencies),
    dependencies
  }
}

const context = { runId: 'agent-run-1', requestId: 'request-1' }

describe('AutomationRuntimeService', () => {
  it('returns bounded sanitized status from Main-owned schedule state', async () => {
    const { service, dependencies } = fixture()

    await expect(service.execute({ action: 'status' }, context)).resolves.toEqual({
      status: 'ready',
      scheduler: {
        running: true,
        nextDueAt: 200,
        nextScheduleId: active.id
      },
      schedules: { total: 2, active: 1, paused: 1 },
      recentRuns: { total: 1, running: 1, failed: 0 },
      background: { running: 2, pending: 1 }
    })
    expect(dependencies.schedules.listRuns).toHaveBeenCalledWith({ limit: 50 })
  })

  it('lists sanitized schedules without inputs, connector IDs, or permissions', async () => {
    const { service } = fixture()

    const output = await service.execute(
      { action: 'list', status: 'active', limit: 1 },
      context
    )

    expect(output).toEqual({
      status: 'completed',
      schedules: [{
        id: active.id,
        name: active.name,
        description: active.description,
        cronExpression: active.cronExpression,
        timeZone: active.timeZone,
        scheduleStatus: active.status,
        revision: active.revision,
        updatedAt: active.updatedAt,
        lastRunAt: active.lastRunAt,
        lastRunStatus: active.lastRunStatus
      }],
      total: 1,
      truncated: false
    })
    expect(JSON.stringify(output)).not.toContain('private')
  })

  it('returns bounded sanitized run history', async () => {
    const { service, dependencies } = fixture()

    await expect(service.execute({
      action: 'runs',
      scheduleId: active.id,
      status: 'running',
      limit: 5
    }, context)).resolves.toEqual({
      status: 'completed',
      runs: [{
        id: running.id,
        scheduleId: running.scheduleId,
        scheduleRevision: running.scheduleRevision,
        scheduleName: running.scheduleName,
        triggerSource: running.triggerSource,
        runStatus: running.status,
        scheduledFor: running.scheduledFor,
        startedAt: running.startedAt,
        revision: running.revision
      }],
      total: 1
    })
    expect(dependencies.schedules.listRuns).toHaveBeenCalledWith({
      scheduleId: active.id,
      status: 'running',
      limit: 5
    })
  })

  it('returns a heartbeat without mutating automation state', async () => {
    const { service, dependencies } = fixture()

    await expect(service.execute({ action: 'heartbeat' }, context)).resolves.toEqual({
      status: 'alive',
      observedAt: 1_000,
      schedulerRunning: true,
      background: { running: 2, pending: 1 }
    })
    expect(dependencies.schedules.list).not.toHaveBeenCalled()
    expect(dependencies.schedules.listRuns).not.toHaveBeenCalled()
  })

  it.each([
    ['create_proposal', {
      action: 'create_proposal',
      definition: {
        name: 'Daily summary',
        description: 'Summarize the workspace',
        cronExpression: '0 9 * * *',
        timeZone: 'Asia/Shanghai',
        missedRunPolicy: 'run_once',
        workspaceId: 'workspace-1',
        modelProfileId: 'profile-1',
        executionTarget: {
          kind: 'skill',
          id: 'summary',
          version: '1.0.0',
          digest: 'a'.repeat(64)
        },
        skillInput: {},
        connectorBindings: [],
        permissions: []
      }
    }],
    ['update_proposal', {
      action: 'update_proposal',
      scheduleId: active.id,
      expectedRevision: 3,
      definition: {
        name: 'Daily summary',
        description: 'Summarize the workspace at ten',
        cronExpression: '0 10 * * *',
        timeZone: 'UTC',
        missedRunPolicy: 'skip',
        workspaceId: 'workspace-1',
        modelProfileId: 'profile-1',
        executionTarget: {
          kind: 'skill',
          id: 'summary',
          version: '1.0.0',
          digest: 'a'.repeat(64)
        },
        skillInput: {},
        connectorBindings: [],
        permissions: []
      }
    }],
    ['pause_proposal', {
      action: 'pause_proposal',
      scheduleId: active.id,
      expectedRevision: 3
    }],
    ['resume_proposal', {
      action: 'resume_proposal',
      scheduleId: paused.id,
      expectedRevision: 2
    }]
  ] as const)('creates a deterministic %s without changing schedules', async (
    action,
    input
  ) => {
    const { service, dependencies } = fixture()

    const first = await service.execute(input, context)
    const replay = await service.execute(input, context)

    expect(first).toEqual(replay)
    expect(first).toMatchObject({
      status: 'approval_required',
      action,
      approvalSurface: 'schedules',
      runId: context.runId,
      requestId: context.requestId,
      expiresAt: 901_000
    })
    expect(first.proposalId).toMatch(/^automation-[a-f0-9]{24}$/)
    expect(dependencies.schedules.list).not.toHaveBeenCalled()
    expect(dependencies.schedules.listRuns).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { action: 'unknown' },
    { action: 'list', limit: 51 },
    { action: 'runs', status: 'unknown' },
    { action: 'pause_proposal', scheduleId: active.id },
    { action: 'create_proposal', definition: { name: 'incomplete' } }
  ])('rejects malformed commands without consulting repositories', async (input) => {
    const { service, dependencies } = fixture()

    await expect(service.execute(input, context)).rejects.toThrow(
      'automation_command_invalid'
    )
    expect(dependencies.schedules.list).not.toHaveBeenCalled()
    expect(dependencies.schedules.listRuns).not.toHaveBeenCalled()
  })

  it('converts repository failures to a stable unavailable error', async () => {
    const { service, dependencies } = fixture()
    dependencies.schedules.list.mockRejectedValueOnce(new Error('private db path'))

    await expect(service.execute({ action: 'list' }, context)).rejects.toThrow(
      'automation_unavailable'
    )
  })
})
