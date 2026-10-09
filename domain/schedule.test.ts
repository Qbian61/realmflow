import { describe, expect, it } from 'vitest'
import {
  createSchedule,
  createScheduleRun,
  finishScheduleRun,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
  updateScheduleRunSummary
} from './schedule'

const definition = {
  name: ' 每日项目摘要 ',
  description: ' 汇总进度和风险 ',
  cronExpression: '0 9 * * 1-5',
  timeZone: 'Asia/Shanghai',
  missedRunPolicy: 'skip' as const,
  workspaceId: 'space-1',
  modelProfileId: 'model-1',
  executionTarget: {
    kind: 'skill' as const,
    id: 'builtin.project-summary',
    version: '1.0.0',
    digest: 'a'.repeat(64)
  },
  skillInput: { audience: 'team' },
  connectorBindings: [
    { service: 'issues', connectorId: 'connector-1' }
  ],
  permissions: ['filesystem.read' as const]
}

describe('schedule domain', () => {
  it('creates an active schedule with normalized immutable bindings', () => {
    const schedule = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })

    expect(schedule).toEqual({
      id: 'schedule-1',
      name: '每日项目摘要',
      description: '汇总进度和风险',
      cronExpression: '0 9 * * 1-5',
      timeZone: 'Asia/Shanghai',
      missedRunPolicy: 'skip',
      status: 'active',
      workspaceId: 'space-1',
      modelProfileId: 'model-1',
      executionTarget: {
        kind: 'skill' as const,
        id: 'builtin.project-summary',
        version: '1.0.0',
        digest: 'a'.repeat(64)
      },
      skillInput: { audience: 'team' },
      connectorBindings: [
        { service: 'issues', connectorId: 'connector-1' }
      ],
      permissions: ['filesystem.read'],
      revision: 1,
      createdAt: 100,
      updatedAt: 100
    })

    definition.skillInput.audience = 'changed'
    definition.connectorBindings[0].connectorId = 'changed'
    expect(schedule.skillInput).toEqual({ audience: 'team' })
    expect(schedule.connectorBindings[0].connectorId).toBe('connector-1')
  })

  it.each([
    ['invalid cron', { cronExpression: '0 9 * *' }, 'Schedule cron expression is invalid'],
    ['invalid timezone', { timeZone: 'Mars/Olympus' }, 'Schedule time zone is invalid'],
    ['empty name', { name: '  ' }, 'Schedule name is required'],
    [
      'duplicate service',
      {
        connectorBindings: [
          { service: 'issues', connectorId: 'connector-1' },
          { service: 'issues', connectorId: 'connector-2' }
        ]
      },
      'Schedule connector services must be unique'
    ],
    [
      'unsupported permission',
      { permissions: ['network.unrestricted'] },
      'Schedule permission is invalid'
    ]
  ])('rejects %s', (_label, override, message) => {
    expect(() =>
      createSchedule({
        id: 'schedule-1',
        definition: { ...definition, ...override } as typeof definition,
        at: 100
      })
    ).toThrow(message)
  })

  it('updates a definition with revision and creation time preserved', () => {
    const current = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })

    const updated = updateSchedule(current, {
      definition: {
        ...definition,
        name: '每周项目摘要',
        cronExpression: '0 10 * * 1',
        missedRunPolicy: 'run_once'
      },
      at: 200
    })

    expect(updated.name).toBe('每周项目摘要')
    expect(updated.cronExpression).toBe('0 10 * * 1')
    expect(updated.missedRunPolicy).toBe('run_once')
    expect(updated.revision).toBe(2)
    expect(updated.createdAt).toBe(100)
    expect(updated.updatedAt).toBe(200)
  })

  it('rejects an unsupported missed-run policy', () => {
    expect(() =>
      createSchedule({
        id: 'schedule-1',
        definition: {
          ...definition,
          missedRunPolicy: 'run_all'
        } as never,
        at: 100
      })
    ).toThrow('Schedule missed-run policy is invalid')
  })

  it('only allows active and paused state transitions', () => {
    const active = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })
    const paused = pauseSchedule(active, 200)
    const resumed = resumeSchedule(paused, 300)

    expect(paused).toMatchObject({
      status: 'paused',
      revision: 2,
      updatedAt: 200
    })
    expect(resumed).toMatchObject({
      status: 'active',
      revision: 3,
      updatedAt: 300
    })
    expect(() => pauseSchedule(paused, 301)).toThrow(
      'Schedule is already paused'
    )
    expect(() => resumeSchedule(active, 301)).toThrow(
      'Schedule is already active'
    )
  })

  it('creates and finishes a manual run without mutating its task snapshot', () => {
    const schedule = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })
    const run = createScheduleRun({
      id: 'run-1',
      schedule,
      triggerSource: 'manual',
      at: 200
    })
    const finished = finishScheduleRun(run, {
      status: 'succeeded',
      toolExecutionId: 'tool-execution-1',
      at: 250
    })

    expect(run).toMatchObject({
      id: 'run-1',
      scheduleId: 'schedule-1',
      scheduleRevision: 1,
      scheduleName: '每日项目摘要',
      triggerSource: 'manual',
      status: 'running',
      startedAt: 200,
      revision: 1
    })
    expect(finished).toMatchObject({
      status: 'succeeded',
      toolExecutionId: 'tool-execution-1',
      finishedAt: 250,
      revision: 2
    })
    expect(() =>
      finishScheduleRun(finished, { status: 'failed', at: 260 })
    ).toThrow('Schedule run is already terminal')
  })

  it('requires a planned time for a cron run', () => {
    const schedule = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })

    expect(() =>
      createScheduleRun({
        id: 'run-1',
        schedule,
        triggerSource: 'cron',
        at: 200
      })
    ).toThrow('Cron schedule run requires its planned time')
  })

  it('forbids a planned time for a manual run', () => {
    const schedule = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })

    expect(() =>
      createScheduleRun({
        id: 'run-1',
        schedule,
        triggerSource: 'manual',
        scheduledFor: 150,
        at: 200
      })
    ).toThrow('Manual schedule run cannot have a planned time')
  })

  it('forbids a cron planned time later than its start', () => {
    const schedule = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })

    expect(() =>
      createScheduleRun({
        id: 'run-1',
        schedule,
        triggerSource: 'cron',
        scheduledFor: 201,
        at: 200
      })
    ).toThrow('Schedule run planned time cannot be later than its start')
  })

  it('records the latest run summary on the schedule', () => {
    const schedule = createSchedule({
      id: 'schedule-1',
      definition,
      at: 100
    })
    const run = finishScheduleRun(
      createScheduleRun({
        id: 'run-1',
        schedule,
        triggerSource: 'manual',
        at: 200
      }),
      {
        status: 'failed',
        errorCode: 'skill_execution_failed',
        errorMessage: 'Skill failed safely',
        at: 250
      }
    )

    expect(updateScheduleRunSummary(schedule, run)).toMatchObject({
      lastRunAt: 250,
      lastRunStatus: 'failed',
      revision: 2,
      updatedAt: 250
    })
  })
})
