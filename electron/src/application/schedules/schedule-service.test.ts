import { describe, expect, it, vi } from 'vitest'
import {
  createSchedule,
  createScheduleRun,
  finishScheduleRun,
  pauseSchedule,
  type Schedule
} from '../../../../domain/schedule'
import type { SkillExecution } from '../../../../domain/skill-execution'
import type {
  ModelProfile,
  ModelProvider
} from '../../../../domain/model'
import type { ScheduleStore } from './schedule-store'
import {
  ScheduleService,
  ScheduleServiceError
} from './schedule-service'

type PrepareSkillExecutionResult =
  | { outcome: 'ready'; permissionRequests: [] }
  | { outcome: 'permission_required'; permissionRequests: unknown[] }
  | { outcome: 'permission_denied'; permissionRequests: unknown[] }
type ExecuteSkillResult =
  | Exclude<PrepareSkillExecutionResult, { outcome: 'ready' }>
  | { outcome: 'executed'; execution: SkillExecution }

const definition = {
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
  permissions: ['filesystem.read' as const]
}

describe('ScheduleService', () => {
  it('creates a schedule only after model and D09 preflight pass', async () => {
    const harness = createHarness()

    await expect(
      harness.service.create({
        definition,
        idempotencyKey: 'create-1'
      })
    ).resolves.toMatchObject({
      outcome: 'saved',
      schedule: { id: 'schedule-1', status: 'active', revision: 1 }
    })

    expect(harness.models.getProfile).toHaveBeenCalledWith('model-profile-1')
    expect(harness.models.getProvider).toHaveBeenCalledWith('provider-1')
    expect(harness.skills.prepare).toHaveBeenCalledWith({
      schedule: expect.objectContaining({
        id: 'schedule-1',
        executionTarget: definition.executionTarget
      }),
      scheduleRunId: 'schedule-preflight'
    })
    expect(harness.store.save).toHaveBeenCalledOnce()
  })

  it.each([
    ['missing profile', { profile: undefined }],
    ['disabled profile', { profileEnabled: false }],
    ['missing provider', { provider: undefined }],
    ['disabled provider', { providerEnabled: false }]
  ])('rejects an unavailable model dependency: %s', async (_label, options) => {
    const harness = createHarness(options)

    await expect(
      harness.service.create({
        definition,
        idempotencyKey: 'create-1'
      })
    ).rejects.toMatchObject({
      code: 'schedule_dependency_unavailable'
    })
    expect(harness.store.save).not.toHaveBeenCalled()
  })

  it.each(['permission_required', 'permission_denied'] as const)(
    'rejects D09 %s without saving a schedule',
    async (outcome) => {
      const harness = createHarness({ prepareOutcome: outcome })

      await expect(
        harness.service.create({
          definition,
          idempotencyKey: 'create-1'
        })
      ).rejects.toMatchObject({
        code:
          outcome === 'permission_required'
            ? 'schedule_permission_required'
            : 'schedule_permission_denied'
      })
      expect(harness.store.save).not.toHaveBeenCalled()
    }
  )

  it('maps D09 dependency errors to a safe schedule error', async () => {
    const harness = createHarness({
      prepareError: new Error('/private/skills/secret failed')
    })

    await expect(
      harness.service.create({
        definition,
        idempotencyKey: 'create-1'
      })
    ).rejects.toEqual(
      new ScheduleServiceError(
        'schedule_dependency_unavailable',
        'Schedule dependencies are unavailable'
      )
    )
    expect(harness.store.save).not.toHaveBeenCalled()
  })

  it('updates and resumes only after a fresh preflight', async () => {
    const current = schedule()
    const paused = pauseSchedule(current, 110)
    const harness = createHarness({ current: paused })

    await expect(
      harness.service.update({
        id: paused.id,
        expectedRevision: paused.revision,
        definition: { ...definition, name: 'Updated summary' },
        idempotencyKey: 'update-1'
      })
    ).resolves.toMatchObject({
      outcome: 'saved',
      schedule: { name: 'Updated summary', revision: 3 }
    })
    harness.current = paused
    await expect(
      harness.service.resume({
        id: paused.id,
        expectedRevision: paused.revision,
        idempotencyKey: 'resume-1'
      })
    ).resolves.toMatchObject({
      outcome: 'saved',
      schedule: { status: 'active', revision: 3 }
    })
    expect(harness.skills.prepare).toHaveBeenCalledTimes(2)
  })

  it('returns the latest schedule on a revision conflict', async () => {
    const current = schedule()
    const latest = pauseSchedule(current, 110)
    const harness = createHarness({ current })
    harness.store.save.mockResolvedValueOnce({
      status: 'revision_conflict',
      schedule: latest
    })

    await expect(
      harness.service.pause({
        id: current.id,
        expectedRevision: current.revision,
        idempotencyKey: 'pause-1'
      })
    ).resolves.toEqual({ outcome: 'conflict', schedule: latest })
  })

  it('does not allow a paused schedule to run', async () => {
    const harness = createHarness({
      current: pauseSchedule(schedule(), 110)
    })

    await expect(
      harness.service.runNow({
        id: 'schedule-1',
        idempotencyKey: 'run-1'
      })
    ).rejects.toMatchObject({ code: 'schedule_state_conflict' })
    expect(harness.store.startRun).not.toHaveBeenCalled()
    expect(harness.skills.execute).not.toHaveBeenCalled()
  })

  it('persists a run before executing D09 and atomically saves success', async () => {
    const harness = createHarness()
    const order: string[] = []
    harness.store.startRun.mockImplementation(async (input) => {
      order.push('start')
      return { status: 'applied', run: input.run }
    })
    harness.skills.execute.mockImplementation(async () => {
      order.push('execute')
      return {
        outcome: 'executed',
        execution: skillExecution('succeeded')
      }
    })
    harness.store.finishRun.mockImplementation(async (input) => {
      order.push('finish')
      return {
        status: 'applied',
        run: input.run,
        schedule: input.schedule
      }
    })

    await expect(
      harness.service.runNow({
        id: 'schedule-1',
        idempotencyKey: 'run-1'
      })
    ).resolves.toMatchObject({
      outcome: 'executed',
      run: {
        id: 'schedule-run-1',
        status: 'succeeded',
        toolExecutionId: 'tool-execution-1'
      }
    })
    expect(order).toEqual(['start', 'execute', 'finish'])
    expect(harness.skills.execute).toHaveBeenCalledWith({
      schedule: expect.objectContaining({
        id: 'schedule-1',
        executionTarget: definition.executionTarget
      }),
      scheduleRunId: 'schedule-run-1'
    })
  })

  it('keeps a Tool schedule on the direct Tool runtime', async () => {
    const toolDefinition = {
      ...definition,
      executionTarget: {
        kind: 'tool' as const,
        id: 'files.read',
        version: '1.0.0',
        digest: 'b'.repeat(64)
      },
      skillInput: { path: 'README.md' }
    }
    const harness = createHarness({
      current: createSchedule({
        id: 'schedule-1',
        definition: toolDefinition,
        at: 100
      })
    })

    await expect(
      harness.service.runNow({
        id: 'schedule-1',
        idempotencyKey: 'run-tool-1'
      })
    ).resolves.toMatchObject({
      outcome: 'executed',
      run: { status: 'succeeded' }
    })

    expect(harness.tools.prepare).toHaveBeenCalledOnce()
    expect(harness.tools.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: toolDefinition.executionTarget,
        triggerSource: 'schedule',
        input: { path: 'README.md' },
        idempotencyKey: 'schedule-run:run-tool-1'
      })
    )
    expect(harness.skills.prepare).not.toHaveBeenCalled()
    expect(harness.skills.execute).not.toHaveBeenCalled()
  })

  it('saves a safe failed run when D09 execution fails', async () => {
    const harness = createHarness({
      execution: skillExecution('failed')
    })

    await expect(
      harness.service.runNow({
        id: 'schedule-1',
        idempotencyKey: 'run-1'
      })
    ).resolves.toMatchObject({
      outcome: 'executed',
      run: {
        status: 'failed',
        errorCode: 'skill_timeout',
        errorMessage: 'Skill execution failed'
      }
    })
  })

  it('does not execute D09 again when run creation is replayed', async () => {
    const current = schedule()
    const existing = createScheduleRun({
      id: 'schedule-run-existing',
      schedule: current,
      triggerSource: 'manual',
      at: 120
    })
    const harness = createHarness({ current })
    harness.store.startRun.mockResolvedValueOnce({
      status: 'replayed',
      run: existing
    })

    await expect(
      harness.service.runNow({
        id: current.id,
        idempotencyKey: 'run-1'
      })
    ).resolves.toEqual({ outcome: 'replayed', run: existing })
    expect(harness.skills.execute).not.toHaveBeenCalled()
    expect(harness.store.finishRun).not.toHaveBeenCalled()
  })

  it('claims a cron slot before preflight and D09 execution', async () => {
    const harness = createHarness()
    const order: string[] = []
    harness.store.claimScheduledRun.mockImplementation(async (input) => {
      order.push('claim')
      return { status: 'applied', run: input.run }
    })
    harness.skills.prepare.mockImplementation(async () => {
      order.push('prepare')
      return { outcome: 'ready', permissionRequests: [] }
    })
    harness.skills.execute.mockImplementation(async () => {
      order.push('execute')
      return {
        outcome: 'executed',
        execution: skillExecution('succeeded')
      }
    })
    harness.store.finishRun.mockImplementation(async (input) => {
      order.push('finish')
      return {
        status: 'applied',
        run: input.run,
        schedule: input.schedule
      }
    })

    await expect(
      harness.service.runScheduled({
        id: 'schedule-1',
        scheduleRevision: 1,
        scheduledFor: 110,
        nextDueAt: 180
      })
    ).resolves.toMatchObject({
      outcome: 'executed',
      run: {
        triggerSource: 'cron',
        scheduledFor: 110,
        status: 'succeeded'
      }
    })

    expect(order).toEqual(['claim', 'prepare', 'execute', 'finish'])
    expect(harness.store.claimScheduledRun).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'schedule-cron:schedule-1:1:110',
        run: expect.objectContaining({
          scheduleRevision: 1,
          scheduledFor: 110,
          triggerSource: 'cron'
        }),
        nextDueAt: 180
      })
    )
    expect(harness.skills.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleRunId: 'schedule-run-1'
      })
    )
  })

  it('requests a scheduler refresh after claiming a slot while D09 is still running', async () => {
    const refreshes = vi.fn()
    const harness = createHarness({ onScheduleChanged: refreshes })
    let finishExecution!: (result: ExecuteSkillResult) => void
    harness.skills.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishExecution = resolve
        })
    )

    const execution = harness.service.runScheduled({
      id: 'schedule-1',
      scheduleRevision: 1,
      scheduledFor: 110,
      nextDueAt: 180
    })

    await vi.waitFor(() => expect(refreshes).toHaveBeenCalledOnce())
    expect(harness.store.claimScheduledRun).toHaveBeenCalledOnce()
    finishExecution({
      outcome: 'executed',
      execution: skillExecution('succeeded')
    })
    await execution
  })

  it.each([
    [
      'dependency',
      { profile: undefined },
      'schedule_dependency_unavailable'
    ],
    [
      'permission',
      { prepareOutcome: 'permission_denied' as const },
      'schedule_permission_denied'
    ]
  ])(
    'saves a safe failed cron run after a %s preflight failure',
    async (_label, options, errorCode) => {
      const harness = createHarness(options)

      await expect(
        harness.service.runScheduled({
          id: 'schedule-1',
          scheduleRevision: 1,
          scheduledFor: 110,
          nextDueAt: 180
        })
      ).resolves.toMatchObject({
        outcome: 'executed',
        run: { status: 'failed', errorCode }
      })

      expect(harness.store.claimScheduledRun).toHaveBeenCalledOnce()
      expect(harness.skills.execute).not.toHaveBeenCalled()
      expect(harness.store.finishRun).toHaveBeenCalledOnce()
    }
  )

  it('saves a safe failed cron run when D09 execution rejects', async () => {
    const harness = createHarness()
    harness.skills.execute.mockRejectedValueOnce(
      new Error('/private/runtime failure')
    )

    await expect(
      harness.service.runScheduled({
        id: 'schedule-1',
        scheduleRevision: 1,
        scheduledFor: 110,
        nextDueAt: 180
      })
    ).resolves.toMatchObject({
      outcome: 'executed',
      run: {
        status: 'failed',
        errorCode: 'schedule_execution_failed',
        errorMessage: 'Schedule execution failed'
      }
    })
  })

  it('does not invoke D09 for replayed, stale or overlapping cron claims', async () => {
    const current = schedule()
    const cronRun = createScheduleRun({
      id: 'schedule-run-existing',
      schedule: current,
      triggerSource: 'cron',
      scheduledFor: 110,
      at: 120
    })
    const overlap = finishScheduleRun(cronRun, {
      status: 'failed',
      errorCode: 'schedule_overlap',
      errorMessage: 'Schedule execution overlaps',
      at: 120
    })
    const replay = createHarness({ current })
    replay.store.claimScheduledRun.mockResolvedValueOnce({
      status: 'replayed',
      run: cronRun
    })
    await expect(
      replay.service.runScheduled({
        id: current.id,
        scheduleRevision: 1,
        scheduledFor: 110,
        nextDueAt: 180
      })
    ).resolves.toEqual({ outcome: 'replayed', run: cronRun })

    const stale = createHarness({ current })
    stale.store.claimScheduledRun.mockResolvedValueOnce({ status: 'stale' })
    await expect(
      stale.service.runScheduled({
        id: current.id,
        scheduleRevision: 1,
        scheduledFor: 110,
        nextDueAt: 180
      })
    ).rejects.toMatchObject({ code: 'schedule_trigger_stale' })

    const overlapping = createHarness({ current })
    overlapping.store.claimScheduledRun.mockResolvedValueOnce({
      status: 'applied',
      run: overlap
    })
    await expect(
      overlapping.service.runScheduled({
        id: current.id,
        scheduleRevision: 1,
        scheduledFor: 110,
        nextDueAt: 180
      })
    ).resolves.toEqual({ outcome: 'executed', run: overlap })

    for (const harness of [replay, stale, overlapping]) {
      expect(harness.skills.prepare).not.toHaveBeenCalled()
      expect(harness.skills.execute).not.toHaveBeenCalled()
      expect(harness.store.finishRun).not.toHaveBeenCalled()
    }
  })

  it('records a skipped missed slot without preflight or execution', async () => {
    const harness = createHarness()
    harness.store.listMissedTriggers.mockResolvedValueOnce([
      {
        scheduleId: 'schedule-1',
        scheduleRevision: 1,
        nextDueAt: 180,
        missedDueAt: 110,
        updatedAt: 115
      }
    ])
    harness.store.resolveMissedTrigger.mockImplementationOnce(
      async (input) => ({
        status: 'applied',
        decision: input.decision
      })
    )

    await expect(harness.service.recoverMissed()).resolves.toEqual([
      expect.objectContaining({
        scheduleId: 'schedule-1',
        missedDueAt: 110,
        outcome: 'skipped'
      })
    ])
    expect(harness.store.resolveMissedTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'schedule-recovery:schedule-1:1:110',
        decision: expect.objectContaining({
          policy: 'skip',
          action: 'skipped',
          decidedAt: 120
        })
      })
    )
    expect(harness.skills.prepare).not.toHaveBeenCalled()
    expect(harness.skills.execute).not.toHaveBeenCalled()
  })

  it('claims a run-once missed slot before preflight and execution', async () => {
    const current = schedule('run_once')
    const harness = createHarness({ current })
    const order: string[] = []
    harness.store.listMissedTriggers.mockResolvedValueOnce([
      {
        scheduleId: current.id,
        scheduleRevision: current.revision,
        nextDueAt: 180,
        missedDueAt: 110,
        updatedAt: 115
      }
    ])
    harness.store.resolveMissedTrigger.mockImplementationOnce(
      async (input) => {
        order.push('resolve')
        return {
          status: 'applied',
          decision: input.decision,
          run: input.run
        }
      }
    )
    harness.skills.prepare.mockImplementationOnce(async () => {
      order.push('prepare')
      return { outcome: 'ready', permissionRequests: [] }
    })
    harness.skills.execute.mockImplementationOnce(async () => {
      order.push('execute')
      return {
        outcome: 'executed',
        execution: skillExecution('succeeded')
      }
    })
    harness.store.finishRun.mockImplementationOnce(async (input) => {
      order.push('finish')
      return {
        status: 'applied',
        run: input.run,
        schedule: input.schedule
      }
    })

    await expect(harness.service.recoverMissed()).resolves.toEqual([
      expect.objectContaining({
        scheduleId: current.id,
        missedDueAt: 110,
        outcome: 'executed',
        run: expect.objectContaining({
          triggerSource: 'cron',
          scheduledFor: 110,
          status: 'succeeded'
        })
      })
    ])
    expect(order).toEqual(['resolve', 'prepare', 'execute', 'finish'])
  })

  it('does not finish a recovered run twice when terminal persistence fails', async () => {
    const current = schedule('run_once')
    const harness = createHarness({ current })
    harness.store.listMissedTriggers.mockResolvedValueOnce([
      {
        scheduleId: current.id,
        scheduleRevision: current.revision,
        nextDueAt: 180,
        missedDueAt: 110,
        updatedAt: 115
      }
    ])
    harness.store.resolveMissedTrigger.mockImplementationOnce(
      async (input) => ({
        status: 'applied',
        decision: input.decision,
        run: input.run
      })
    )
    harness.store.finishRun.mockRejectedValue(
      new Error('/private/database failure')
    )

    await expect(harness.service.recoverMissed()).resolves.toEqual([
      expect.objectContaining({
        scheduleId: current.id,
        missedDueAt: 110,
        outcome: 'failed',
        errorCode: 'schedule_persistence_unavailable'
      })
    ])
    expect(harness.skills.execute).toHaveBeenCalledOnce()
    expect(harness.store.finishRun).toHaveBeenCalledOnce()
  })

  it('does not execute a replayed or overlapping missed recovery', async () => {
    const current = schedule('run_once')
    const replay = createHarness({ current })
    const running = createScheduleRun({
      id: 'schedule-run-existing',
      schedule: current,
      triggerSource: 'cron',
      scheduledFor: 110,
      at: 120
    })
    const overlap = finishScheduleRun(running, {
      status: 'failed',
      errorCode: 'schedule_overlap',
      errorMessage: 'Schedule execution overlaps',
      at: 120
    })
    replay.store.listMissedTriggers.mockResolvedValue([
      {
        scheduleId: current.id,
        scheduleRevision: 1,
        nextDueAt: 180,
        missedDueAt: 110,
        updatedAt: 115
      }
    ])
    replay.store.resolveMissedTrigger.mockResolvedValueOnce({
      status: 'replayed',
      decision: {
        scheduleId: current.id,
        scheduleRevision: 1,
        missedDueAt: 110,
        policy: 'run_once',
        action: 'run_once',
        runId: running.id,
        decidedAt: 120
      },
      run: running
    })
    await replay.service.recoverMissed()
    expect(replay.skills.execute).not.toHaveBeenCalled()

    const overlapping = createHarness({ current })
    overlapping.store.listMissedTriggers.mockResolvedValue(
      await replay.store.listMissedTriggers()
    )
    overlapping.store.resolveMissedTrigger.mockResolvedValueOnce({
      status: 'applied',
      decision: {
        scheduleId: current.id,
        scheduleRevision: 1,
        missedDueAt: 110,
        policy: 'run_once',
        action: 'run_once',
        runId: overlap.id,
        decidedAt: 120
      },
      run: overlap
    })
    await overlapping.service.recoverMissed()
    expect(overlapping.skills.execute).not.toHaveBeenCalled()
  })

  it('returns a safe failure when missed recovery cannot be persisted', async () => {
    const current = schedule('run_once')
    const harness = createHarness({ current })
    harness.store.listMissedTriggers.mockResolvedValueOnce([
      {
        scheduleId: current.id,
        scheduleRevision: 1,
        nextDueAt: 180,
        missedDueAt: 110,
        updatedAt: 115
      }
    ])
    harness.store.resolveMissedTrigger.mockRejectedValueOnce(
      new Error('/private/database failure')
    )

    await expect(harness.service.recoverMissed()).resolves.toEqual([
      {
        scheduleId: current.id,
        scheduleRevision: 1,
        missedDueAt: 110,
        outcome: 'failed',
        errorCode: 'schedule_persistence_unavailable'
      }
    ])
    expect(harness.skills.execute).not.toHaveBeenCalled()
  })

  it('requests one asynchronous refresh after each committed management change', async () => {
    const refreshes = vi.fn()
    const created = createHarness({ onScheduleChanged: refreshes })
    await created.service.create({
      definition,
      idempotencyKey: 'create-refresh'
    })
    const updated = createHarness({ onScheduleChanged: refreshes })
    await updated.service.update({
      id: 'schedule-1',
      expectedRevision: 1,
      definition: { ...definition, name: 'Updated' },
      idempotencyKey: 'update-refresh'
    })
    const paused = createHarness({ onScheduleChanged: refreshes })
    await paused.service.pause({
      id: 'schedule-1',
      expectedRevision: 1,
      idempotencyKey: 'pause-refresh'
    })
    const resumedSchedule = pauseSchedule(schedule(), 110)
    const resumed = createHarness({
      current: resumedSchedule,
      onScheduleChanged: refreshes
    })
    await resumed.service.resume({
      id: 'schedule-1',
      expectedRevision: resumedSchedule.revision,
      idempotencyKey: 'resume-refresh'
    })
    const deleted = createHarness({ onScheduleChanged: refreshes })
    await deleted.service.delete({
      id: 'schedule-1',
      expectedRevision: 1,
      idempotencyKey: 'delete-refresh'
    })
    await Promise.resolve()

    expect(refreshes).toHaveBeenCalledTimes(5)
  })

  it('does not refresh after replay, conflict or failed validation', async () => {
    const refreshes = vi.fn()
    const replay = createHarness({ onScheduleChanged: refreshes })
    replay.store.save.mockImplementationOnce(async (input) => ({
      status: 'replayed',
      schedule: input.schedule
    }))
    await replay.service.pause({
      id: 'schedule-1',
      expectedRevision: 1,
      idempotencyKey: 'pause-replay'
    })

    const conflict = createHarness({ onScheduleChanged: refreshes })
    conflict.store.save.mockResolvedValueOnce({
      status: 'revision_conflict',
      schedule: pauseSchedule(schedule(), 110)
    })
    await conflict.service.pause({
      id: 'schedule-1',
      expectedRevision: 1,
      idempotencyKey: 'pause-conflict'
    })

    const failed = createHarness({
      profile: undefined,
      onScheduleChanged: refreshes
    })
    await expect(
      failed.service.create({
        definition,
        idempotencyKey: 'create-failed'
      })
    ).rejects.toMatchObject({
      code: 'schedule_dependency_unavailable'
    })
    await Promise.resolve()

    expect(refreshes).not.toHaveBeenCalled()
  })

  it('maps delete protection and idempotency conflicts', async () => {
    const current = schedule()
    const harness = createHarness({ current })
    harness.store.delete
      .mockResolvedValueOnce({ status: 'active_run', schedule: current })
      .mockResolvedValueOnce({ status: 'idempotency_conflict' })

    await expect(
      harness.service.delete({
        id: current.id,
        expectedRevision: current.revision,
        idempotencyKey: 'delete-1'
      })
    ).rejects.toMatchObject({ code: 'schedule_state_conflict' })
    await expect(
      harness.service.delete({
        id: current.id,
        expectedRevision: current.revision,
        idempotencyKey: 'delete-2'
      })
    ).rejects.toMatchObject({ code: 'schedule_idempotency_conflict' })
  })
})

function createHarness(options: {
  current?: Schedule
  profile?: (ModelProfile & { revision: number })
  profileEnabled?: boolean
  provider?: (ModelProvider & { revision: number })
  providerEnabled?: boolean
  prepareOutcome?: 'ready' | 'permission_required' | 'permission_denied'
  prepareError?: Error
  execution?: SkillExecution
  onScheduleChanged?: () => void | Promise<void>
} = {}) {
  const initial = options.current ?? schedule()
  const store = {
    list: vi.fn(async () => [initial]),
    get: vi.fn(async () => initial),
    save: vi.fn<ScheduleStore['save']>(async (input) => ({
      status: 'applied' as const,
      schedule: input.schedule
    })),
    delete: vi.fn<ScheduleStore['delete']>(async (input) => ({
      status: 'applied' as const,
      id: input.id
    })),
    listRuns: vi.fn(async () => []),
    startRun: vi.fn<ScheduleStore['startRun']>(async (input) => ({
      status: 'applied' as const,
      run: input.run
    })),
    finishRun: vi.fn<ScheduleStore['finishRun']>(async (input) => ({
      status: 'applied' as const,
      run: input.run,
      schedule: input.schedule
    })),
    recoverInterrupted: vi.fn(async () => 0),
    reconcileTriggers: vi.fn(async () => []),
    getNextTrigger: vi.fn(async () => undefined),
    listMissedTriggers: vi.fn<ScheduleStore['listMissedTriggers']>(
      async () => []
    ),
    claimScheduledRun: vi.fn<ScheduleStore['claimScheduledRun']>(
      async (input) => ({
        status: 'applied' as const,
        run: input.run
      })
    ),
    resolveMissedTrigger: vi.fn<ScheduleStore['resolveMissedTrigger']>(
      async (input) => ({
        status: 'applied' as const,
        decision: input.decision,
        ...(input.run ? { run: input.run } : {})
      })
    ),
    clearTrigger: vi.fn(async () => undefined)
  } satisfies {
    [Key in keyof ScheduleStore]: ReturnType<typeof vi.fn>
  }
  const models = {
    getProfile: vi.fn(async () =>
      'profile' in options
        ? options.profile
        : {
            id: 'model-profile-1',
            providerId: 'provider-1',
            modelId: 'local-model',
            displayName: 'Local model',
            enabled: options.profileEnabled ?? true,
            capabilities: {
              text: true,
              vision: false,
              toolCalling: false,
              structuredOutput: false
            },
            contextWindow: 4096,
            timeoutMs: 30_000,
            maxRetries: 1,
            maxConcurrency: 1,
            inputCostPerMillionTokens: 0,
            outputCostPerMillionTokens: 0,
            revision: 1
          }
    ),
    getProvider: vi.fn(async () =>
      'provider' in options
        ? options.provider
        : {
            id: 'provider-1',
            type: 'local' as const,
            name: 'Local',
            baseUrl: 'http://127.0.0.1',
            enabled: options.providerEnabled ?? true,
            revision: 1
          }
    )
  }
  const skills = {
    prepare: vi.fn(async (): Promise<PrepareSkillExecutionResult> => {
      if (options.prepareError) throw options.prepareError
      if (options.prepareOutcome === 'permission_required') {
        return {
          outcome: 'permission_required' as const,
          permissionRequests: []
        }
      }
      if (options.prepareOutcome === 'permission_denied') {
        return {
          outcome: 'permission_denied' as const,
          permissionRequests: []
        }
      }
      return { outcome: 'ready', permissionRequests: [] }
    }),
    execute: vi.fn(async (): Promise<ExecuteSkillResult> => ({
      outcome: 'executed' as const,
      execution: options.execution ?? skillExecution('succeeded')
    }))
  }
  const tools = {
    prepare: vi.fn(async () => ({
      outcome: 'ready' as const,
      permissionRequests: [] as []
    })),
    execute: vi.fn(async () => ({
      outcome: 'executed' as const,
      execution: options.execution ?? skillExecution('succeeded')
    }))
  }
  let eventIndex = 0
  const service = new ScheduleService({
    store,
    models,
    tools,
    skills,
    now: () => 120,
    onScheduleChanged: options.onScheduleChanged,
    createId: (kind) => {
      if (kind === 'schedule') return 'schedule-1'
      if (kind === 'schedule_run') return 'schedule-run-1'
      eventIndex += 1
      return `event-${eventIndex}`
    }
  })
  return {
    service,
    store,
    models,
    tools,
    skills,
    get current() {
      return initial
    },
    set current(value: Schedule) {
      store.get.mockResolvedValue(value)
    }
  }
}

function schedule(
  missedRunPolicy: Schedule['missedRunPolicy'] = 'skip'
): Schedule {
  return createSchedule({
    id: 'schedule-1',
    definition: { ...definition, missedRunPolicy },
    at: 100
  })
}

function skillExecution(
  status: SkillExecution['status']
): SkillExecution {
  const terminal = status !== 'running'
  return {
    id: 'tool-execution-1',
    skillId: 'skill-1',
    skillVersionId: 'skill-version-1',
    skillVersionChecksum: 'a'.repeat(64),
    triggerSource: 'schedule',
    context: {
      scope: { kind: 'space', workspaceId: 'workspace-1' },
      workspaceId: 'workspace-1',
      scheduleRunId: 'schedule-run-1'
    },
    input: { audience: 'team' },
    inputChecksum: 'b'.repeat(64),
    status,
    revision: terminal ? 2 : 1,
    startedAt: 120,
    updatedAt: terminal ? 130 : 120,
    ...(status === 'succeeded'
      ? {
          output: {},
          outputChecksum: 'c'.repeat(64),
          metrics: { durationMs: 10, outputBytes: 2 },
          finishedAt: 130
        }
      : status === 'failed'
        ? {
            error: { code: 'skill_timeout' as const, message: '/secret/path' },
            metrics: { durationMs: 10, outputBytes: 0 },
            finishedAt: 130
          }
        : status === 'cancelled' || status === 'interrupted'
          ? {
              metrics: { durationMs: 10, outputBytes: 0 },
              finishedAt: 130
            }
          : {})
  }
}
