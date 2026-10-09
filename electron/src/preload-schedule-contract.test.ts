import { expect, it, vi } from 'vitest'
import { createRealmFlowApi } from './preload-api'

it('forwards schedule management to exact channels', async () => {
  const invoke = vi.fn().mockResolvedValue(undefined)
  const api = createRealmFlowApi(
    {
      invoke,
      on: vi.fn(),
      removeListener: vi.fn()
    },
    'darwin'
  )
  const definition = {
    name: 'Daily summary',
    description: 'Summarize project status',
    cronExpression: '0 9 * * 1-5',
    timeZone: 'Asia/Shanghai',
    missedRunPolicy: 'skip' as const,
    workspaceId: 'workspace-1',
    modelProfileId: 'model-profile-1',
    executionTarget: { kind: 'skill' as const, id: 'com.example.planning', version: '1.0.0', digest: 'a'.repeat(64) },
    skillInput: {},
    connectorBindings: [],
    permissions: []
  }

  await api.business.listSchedules()
  await api.business.listScheduleRuns({
    scheduleId: 'schedule-1',
    limit: 20
  })
  await api.business.createSchedule({
    definition,
    idempotencyKey: 'schedule-create-1'
  })
  await api.business.updateSchedule({
    id: 'schedule-1',
    expectedRevision: 1,
    definition,
    idempotencyKey: 'schedule-update-1'
  })
  await api.business.pauseSchedule({
    id: 'schedule-1',
    expectedRevision: 2,
    idempotencyKey: 'schedule-pause-1'
  })
  await api.business.resumeSchedule({
    id: 'schedule-1',
    expectedRevision: 3,
    idempotencyKey: 'schedule-resume-1'
  })
  await api.business.runScheduleNow({
    id: 'schedule-1',
    idempotencyKey: 'schedule-run-1'
  })
  await api.business.deleteSchedule({
    id: 'schedule-1',
    expectedRevision: 4,
    idempotencyKey: 'schedule-delete-1'
  })

  expect(invoke.mock.calls).toEqual([
    ['schedule:list'],
    ['schedule-run:list', { scheduleId: 'schedule-1', limit: 20 }],
    [
      'schedule:create',
      { definition, idempotencyKey: 'schedule-create-1' }
    ],
    [
      'schedule:update',
      {
        id: 'schedule-1',
        expectedRevision: 1,
        definition,
        idempotencyKey: 'schedule-update-1'
      }
    ],
    [
      'schedule:pause',
      {
        id: 'schedule-1',
        expectedRevision: 2,
        idempotencyKey: 'schedule-pause-1'
      }
    ],
    [
      'schedule:resume',
      {
        id: 'schedule-1',
        expectedRevision: 3,
        idempotencyKey: 'schedule-resume-1'
      }
    ],
    [
      'schedule:run-now',
      { id: 'schedule-1', idempotencyKey: 'schedule-run-1' }
    ],
    [
      'schedule:delete',
      {
        id: 'schedule-1',
        expectedRevision: 4,
        idempotencyKey: 'schedule-delete-1'
      }
    ]
  ])
})
