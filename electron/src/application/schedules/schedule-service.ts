import { createHash, randomUUID } from 'node:crypto'
import {
  createSchedule,
  createScheduleRun,
  finishScheduleRun,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
  updateScheduleRunSummary,
  type Schedule,
  type ScheduleDefinition,
  type ScheduleRecoveryDecision,
  type ScheduleRun
} from '../../../../domain/schedule'
import type {
  ModelPoolRepository
} from '../ports/business-repositories'
import type {
  SaveScheduleInput,
  ScheduleRunQuery,
  ScheduleStore
} from './schedule-store'

export type ScheduleServiceErrorCode =
  | 'schedule_invalid'
  | 'schedule_not_found'
  | 'schedule_revision_conflict'
  | 'schedule_state_conflict'
  | 'schedule_dependency_unavailable'
  | 'schedule_permission_required'
  | 'schedule_permission_denied'
  | 'schedule_trigger_stale'
  | 'schedule_idempotency_conflict'
  | 'schedule_execution_failed'
  | 'schedule_persistence_unavailable'

export class ScheduleServiceError extends Error {
  readonly name = 'ScheduleServiceError'

  constructor(
    readonly code: ScheduleServiceErrorCode,
    message: string
  ) {
    super(message)
  }
}

type ScheduleToolExecutionCommand = {
  definition: Schedule['executionTarget']
  triggerSource: 'schedule'
  context: {
    scope: { kind: 'space'; workspaceId: string }
    workspaceId: string
    scheduleRunId: string
  }
  input: Record<string, unknown>
  connectorBindings: Schedule['connectorBindings']
}

type PrepareScheduleToolExecutionResult =
  | { outcome: 'ready'; permissionRequests: [] }
  | { outcome: 'permission_required'; permissionRequests: unknown[] }
  | { outcome: 'permission_denied'; permissionRequests: unknown[] }
type ExecuteScheduleToolExecutionResult =
  | Exclude<PrepareScheduleToolExecutionResult, { outcome: 'ready' }>
  | {
      outcome: 'executed'
      execution: {
        id: string
        status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
        error?: { code: string }
        finishedAt?: number
      }
    }

type ToolExecutionPort = {
  prepare(
    command: ScheduleToolExecutionCommand
  ): Promise<PrepareScheduleToolExecutionResult>
  execute(
    command: ScheduleToolExecutionCommand & { idempotencyKey: string }
  ): Promise<ExecuteScheduleToolExecutionResult>
}

type SkillExecutionPort = {
  prepare(command: {
    schedule: Schedule
    scheduleRunId: string
  }): Promise<PrepareScheduleToolExecutionResult>
  execute(command: {
    schedule: Schedule
    scheduleRunId: string
  }): Promise<ExecuteScheduleToolExecutionResult>
}

type Dependencies = {
  store: ScheduleStore
  models: Pick<ModelPoolRepository, 'getProfile' | 'getProvider'>
  tools: ToolExecutionPort
  skills: SkillExecutionPort
  now?: () => number
  createId?: (kind: 'schedule' | 'schedule_run' | 'event') => string
  onScheduleChanged?: () => void | Promise<void>
}

export type ScheduleMutationResult =
  | { outcome: 'saved'; schedule: Schedule }
  | { outcome: 'conflict'; schedule: Schedule }

export type DeleteScheduleResult =
  | { outcome: 'deleted'; id: string }
  | { outcome: 'not_found'; id: string }
  | { outcome: 'conflict'; schedule: Schedule }

export type RunScheduleNowResult =
  | {
      outcome: 'executed' | 'replayed'
      run: ScheduleRun
      schedule?: Schedule
    }
  | { outcome: 'conflict'; run: ScheduleRun }

export type ScheduleRecoveryResult = {
  scheduleId: string
  scheduleRevision: number
  missedDueAt: number
  outcome:
    | 'skipped'
    | 'executed'
    | 'replayed'
    | 'stale'
    | 'conflict'
    | 'failed'
  decision?: ScheduleRecoveryDecision
  run?: ScheduleRun
  errorCode?: ScheduleServiceErrorCode
}

export class ScheduleService {
  private readonly now: () => number
  private readonly createId: NonNullable<Dependencies['createId']>

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? (() => randomUUID())
  }

  list(): Promise<Schedule[]> {
    return this.dependencies.store.list()
  }

  listRuns(query: ScheduleRunQuery): Promise<ScheduleRun[]> {
    return this.dependencies.store.listRuns(query)
  }

  recoverInterrupted(): Promise<number> {
    return this.dependencies.store.recoverInterrupted({
      at: this.now(),
      createEventId: () => this.createId('event')
    })
  }

  async create(command: {
    definition: ScheduleDefinition
    idempotencyKey: string
  }): Promise<ScheduleMutationResult> {
    requireIdempotencyKey(command.idempotencyKey)
    const at = this.now()
    const schedule = mapInvalid(() =>
      createSchedule({
        id: this.createId('schedule'),
        definition: command.definition,
        at
      })
    )
    await this.preflight(schedule)
    return this.save({
      schedule,
      expectedRevision: 0,
      operation: 'created',
      idempotencyKey: command.idempotencyKey,
      fingerprint: fingerprint({
        operation: 'create',
        definition: definitionOf(schedule)
      }),
      at
    })
  }

  async update(command: {
    id: string
    expectedRevision: number
    definition: ScheduleDefinition
    idempotencyKey: string
  }): Promise<ScheduleMutationResult> {
    requireIdempotencyKey(command.idempotencyKey)
    const current = await this.requireSchedule(command.id)
    if (current.revision !== command.expectedRevision) {
      return { outcome: 'conflict', schedule: current }
    }
    const at = this.now()
    const schedule = mapInvalid(() =>
      updateSchedule(current, { definition: command.definition, at })
    )
    await this.preflight(schedule)
    return this.save({
      schedule,
      expectedRevision: command.expectedRevision,
      operation: 'updated',
      idempotencyKey: command.idempotencyKey,
      fingerprint: fingerprint({
        operation: 'update',
        id: command.id,
        expectedRevision: command.expectedRevision,
        definition: definitionOf(schedule)
      }),
      at
    })
  }

  async pause(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<ScheduleMutationResult> {
    return this.transition(command, 'paused')
  }

  async resume(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<ScheduleMutationResult> {
    return this.transition(command, 'active')
  }

  async delete(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<DeleteScheduleResult> {
    requireIdempotencyKey(command.idempotencyKey)
    const result = await this.dependencies.store.delete({
      ...command,
      eventId: this.createId('event'),
      fingerprint: fingerprint({ operation: 'delete', ...command }),
      at: this.now()
    })
    if (result.status === 'applied') {
      this.notifyScheduleChanged()
      return { outcome: 'deleted', id: result.id }
    }
    if (result.status === 'replayed') {
      return { outcome: 'deleted', id: result.id }
    }
    if (result.status === 'not_found') {
      return { outcome: 'not_found', id: result.id }
    }
    if (result.status === 'revision_conflict') {
      return { outcome: 'conflict', schedule: result.schedule }
    }
    if (result.status === 'active_run') {
      throw new ScheduleServiceError(
        'schedule_state_conflict',
        'Schedule has an active run'
      )
    }
    throw idempotencyConflict()
  }

  async runNow(command: {
    id: string
    idempotencyKey: string
  }): Promise<RunScheduleNowResult> {
    requireIdempotencyKey(command.idempotencyKey)
    const schedule = await this.requireSchedule(command.id)
    if (schedule.status !== 'active') {
      throw new ScheduleServiceError(
        'schedule_state_conflict',
        'Schedule must be active to run'
      )
    }
    await this.preflight(schedule)
    const at = this.now()
    const run = mapInvalid(() =>
      createScheduleRun({
        id: this.createId('schedule_run'),
        schedule,
        triggerSource: 'manual',
        at
      })
    )
    const started = await this.dependencies.store.startRun({
      run,
      eventId: this.createId('event'),
      idempotencyKey: command.idempotencyKey,
      fingerprint: fingerprint({
        operation: 'run_now',
        scheduleId: schedule.id,
        scheduleRevision: schedule.revision
      }),
      at
    })
    if (started.status === 'idempotency_conflict') {
      throw idempotencyConflict()
    }
    if (started.status === 'active_run') {
      return { outcome: 'conflict', run: started.run }
    }
    if (started.status === 'replayed') {
      return { outcome: 'replayed', run: started.run }
    }
    return this.executeRun(schedule, started.run, command.idempotencyKey)
  }

  async runScheduled(command: {
    id: string
    scheduleRevision: number
    scheduledFor: number
    nextDueAt: number
  }): Promise<RunScheduleNowResult> {
    const schedule = await this.dependencies.store.get(command.id)
    if (
      !schedule ||
      schedule.status !== 'active' ||
      schedule.revision !== command.scheduleRevision
    ) {
      throw triggerStale()
    }
    const at = this.now()
    const run = mapInvalid(() =>
      createScheduleRun({
        id: this.createId('schedule_run'),
        schedule,
        triggerSource: 'cron',
        scheduledFor: command.scheduledFor,
        at
      })
    )
    const idempotencyKey = [
      'schedule-cron',
      schedule.id,
      schedule.revision,
      command.scheduledFor
    ].join(':')
    let claimed: Awaited<
      ReturnType<ScheduleStore['claimScheduledRun']>
    >
    try {
      claimed = await this.dependencies.store.claimScheduledRun({
        run,
        nextDueAt: command.nextDueAt,
        eventId: this.createId('event'),
        idempotencyKey,
        fingerprint: fingerprint({
          operation: 'run_scheduled',
          scheduleId: schedule.id,
          scheduleRevision: schedule.revision,
          scheduledFor: command.scheduledFor
        }),
        at
      })
    } catch {
      throw new ScheduleServiceError(
        'schedule_persistence_unavailable',
        'Schedule trigger could not be saved'
      )
    }
    if (claimed.status === 'stale') throw triggerStale()
    if (claimed.status === 'idempotency_conflict') {
      throw idempotencyConflict()
    }
    if (claimed.status === 'replayed') {
      return { outcome: 'replayed', run: claimed.run }
    }
    this.notifyScheduleChanged()
    if (claimed.run.status !== 'running') {
      return { outcome: 'executed', run: claimed.run }
    }
    try {
      await this.preflight(schedule)
    } catch (error) {
      const failure =
        error instanceof ScheduleServiceError
          ? error
          : dependencyUnavailable()
      return this.finishFailedRun(
        schedule,
        claimed.run,
        failure.code,
        failure.message
      )
    }
    return this.executeRun(schedule, claimed.run, idempotencyKey)
  }

  async recoverMissed(): Promise<ScheduleRecoveryResult[]> {
    let cursors: Awaited<
      ReturnType<ScheduleStore['listMissedTriggers']>
    >
    try {
      cursors = await this.dependencies.store.listMissedTriggers()
    } catch {
      throw new ScheduleServiceError(
        'schedule_persistence_unavailable',
        'Missed schedule triggers could not be loaded'
      )
    }
    const results: ScheduleRecoveryResult[] = []
    for (const cursor of cursors) {
      results.push(await this.recoverMissedTrigger(cursor))
    }
    return results
  }

  private async recoverMissedTrigger(
    cursor: Awaited<
      ReturnType<ScheduleStore['listMissedTriggers']>
    >[number]
  ): Promise<ScheduleRecoveryResult> {
    const identity = {
      scheduleId: cursor.scheduleId,
      scheduleRevision: cursor.scheduleRevision,
      missedDueAt: cursor.missedDueAt!
    }
    const schedule = await this.dependencies.store.get(cursor.scheduleId)
    if (
      !schedule ||
      schedule.status !== 'active' ||
      schedule.revision !== cursor.scheduleRevision ||
      cursor.missedDueAt === undefined
    ) {
      return { ...identity, outcome: 'stale' }
    }
    const at = this.now()
    const idempotencyKey = [
      'schedule-recovery',
      schedule.id,
      schedule.revision,
      cursor.missedDueAt
    ].join(':')
    const run =
      schedule.missedRunPolicy === 'run_once'
        ? mapInvalid(() =>
            createScheduleRun({
              id: this.createId('schedule_run'),
              schedule,
              triggerSource: 'cron',
              scheduledFor: cursor.missedDueAt,
              at
            })
          )
        : undefined
    const decision: ScheduleRecoveryDecision = {
      ...identity,
      policy: schedule.missedRunPolicy,
      action:
        schedule.missedRunPolicy === 'run_once' ? 'run_once' : 'skipped',
      ...(run ? { runId: run.id } : {}),
      decidedAt: at
    }
    let resolved: Awaited<
      ReturnType<ScheduleStore['resolveMissedTrigger']>
    >
    try {
      resolved = await this.dependencies.store.resolveMissedTrigger({
        decision,
        ...(run
          ? { run, eventId: this.createId('event') }
          : {}),
        idempotencyKey,
        fingerprint: fingerprint({
          operation: 'recover_missed',
          ...identity,
          policy: schedule.missedRunPolicy
        }),
        at
      })
    } catch {
      return {
        ...identity,
        outcome: 'failed',
        errorCode: 'schedule_persistence_unavailable'
      }
    }
    if (resolved.status === 'stale') {
      return { ...identity, outcome: 'stale' }
    }
    if (resolved.status === 'idempotency_conflict') {
      return {
        ...identity,
        outcome: 'failed',
        errorCode: 'schedule_idempotency_conflict'
      }
    }
    if (resolved.status === 'replayed') {
      return {
        ...identity,
        outcome: 'replayed',
        decision: resolved.decision,
        ...(resolved.run ? { run: resolved.run } : {})
      }
    }
    if (!resolved.run) {
      return {
        ...identity,
        outcome: 'skipped',
        decision: resolved.decision
      }
    }
    if (resolved.run.status !== 'running') {
      return {
        ...identity,
        outcome: 'executed',
        decision: resolved.decision,
        run: resolved.run
      }
    }
    let execution: RunScheduleNowResult | undefined
    try {
      await this.preflight(schedule)
    } catch (error) {
      const failure =
        error instanceof ScheduleServiceError
          ? error
          : dependencyUnavailable()
      try {
        execution = await this.finishFailedRun(
          schedule,
          resolved.run,
          failure.code,
          failure.message
        )
      } catch {
        return {
          ...identity,
          outcome: 'failed',
          decision: resolved.decision,
          run: resolved.run,
          errorCode: 'schedule_persistence_unavailable'
        }
      }
    }
    if (!execution) {
      try {
        execution = await this.executeRun(
          schedule,
          resolved.run,
          idempotencyKey
        )
      } catch {
        return {
          ...identity,
          outcome: 'failed',
          decision: resolved.decision,
          run: resolved.run,
          errorCode: 'schedule_persistence_unavailable'
        }
      }
    }
    return {
      ...identity,
      outcome:
        execution.outcome === 'conflict' ? 'conflict' : 'executed',
      decision: resolved.decision,
      run: execution.run
    }
  }

  private async transition(
    command: {
      id: string
      expectedRevision: number
      idempotencyKey: string
    },
    target: Schedule['status']
  ): Promise<ScheduleMutationResult> {
    requireIdempotencyKey(command.idempotencyKey)
    const current = await this.requireSchedule(command.id)
    if (current.revision !== command.expectedRevision) {
      return { outcome: 'conflict', schedule: current }
    }
    const at = this.now()
    const schedule = mapInvalid(() =>
      target === 'active'
        ? resumeSchedule(current, at)
        : pauseSchedule(current, at)
    )
    if (target === 'active') await this.preflight(schedule)
    return this.save({
      schedule,
      expectedRevision: command.expectedRevision,
      operation: target === 'active' ? 'resumed' : 'paused',
      idempotencyKey: command.idempotencyKey,
      fingerprint: fingerprint({
        operation: target === 'active' ? 'resume' : 'pause',
        ...command
      }),
      at
    })
  }

  private async save(
    input: Omit<SaveScheduleInput, 'eventId'>
  ): Promise<ScheduleMutationResult> {
    const result = await this.dependencies.store.save({
      ...input,
      eventId: this.createId('event')
    })
    if (result.status === 'applied') {
      this.notifyScheduleChanged()
      return { outcome: 'saved', schedule: result.schedule }
    }
    if (result.status === 'replayed') {
      return { outcome: 'saved', schedule: result.schedule }
    }
    if (result.status === 'revision_conflict') {
      return { outcome: 'conflict', schedule: result.schedule }
    }
    throw idempotencyConflict()
  }

  private async preflight(schedule: Schedule): Promise<void> {
    if (schedule.executionTarget.kind === 'skill') {
      const profile = await this.dependencies.models.getProfile(
        schedule.modelProfileId
      )
      const provider = profile
        ? await this.dependencies.models.getProvider(profile.providerId)
        : undefined
      if (!profile?.enabled || !provider?.enabled) {
        throw dependencyUnavailable()
      }
    }
    let result: PrepareScheduleToolExecutionResult
    try {
      result =
        schedule.executionTarget.kind === 'skill'
          ? await this.dependencies.skills.prepare({
              schedule,
              scheduleRunId: 'schedule-preflight'
            })
          : await this.dependencies.tools.prepare(
              executionCommand(schedule, 'schedule-preflight')
            )
    } catch {
      throw dependencyUnavailable()
    }
    if (result.outcome === 'permission_required') {
      throw new ScheduleServiceError(
        'schedule_permission_required',
        'Schedule permissions require user approval'
      )
    }
    if (result.outcome === 'permission_denied') {
      throw new ScheduleServiceError(
        'schedule_permission_denied',
        'Schedule permissions are denied'
      )
    }
  }

  private async executeRun(
    schedule: Schedule,
    run: ScheduleRun,
    idempotencyKey: string
  ): Promise<RunScheduleNowResult> {
    let result: ExecuteScheduleToolExecutionResult
    try {
      result =
        schedule.executionTarget.kind === 'skill'
          ? await this.dependencies.skills.execute({
              schedule,
              scheduleRunId: run.id
            })
          : await this.dependencies.tools.execute({
              ...executionCommand(schedule, run.id),
              idempotencyKey: `schedule-run:${idempotencyKey}`
            })
    } catch {
      return this.finishFailedRun(
        schedule,
        run,
        'schedule_execution_failed',
        'Schedule execution failed'
      )
    }
    if (result.outcome === 'permission_required') {
      return this.finishFailedRun(
        schedule,
        run,
        'schedule_permission_required',
        'Schedule permissions require user approval'
      )
    }
    if (result.outcome === 'permission_denied') {
      return this.finishFailedRun(
        schedule,
        run,
        'schedule_permission_denied',
        'Schedule permissions are denied'
      )
    }
    if (result.execution.status === 'running') {
      return { outcome: 'executed', run }
    }
    const execution = result.execution
    const status = execution.status as Exclude<
      typeof execution.status,
      'running'
    >
    const terminal = finishScheduleRun(run, {
      status,
      toolExecutionId: execution.id,
      ...(status === 'failed' || status === 'interrupted'
        ? {
            errorCode:
              execution.error?.code ?? 'schedule_execution_failed',
            errorMessage: 'Skill execution failed'
          }
        : {}),
      at: execution.finishedAt ?? this.now()
    })
    return this.finish(schedule, terminal)
  }

  private finishFailedRun(
    schedule: Schedule,
    run: ScheduleRun,
    errorCode: string,
    errorMessage: string
  ): Promise<RunScheduleNowResult> {
    return this.finish(
      schedule,
      finishScheduleRun(run, {
        status: 'failed',
        errorCode,
        errorMessage,
        at: this.now()
      })
    )
  }

  private async finish(
    schedule: Schedule,
    run: ScheduleRun
  ): Promise<RunScheduleNowResult> {
    const summarized = updateScheduleRunSummary(schedule, run)
    const result = await this.dependencies.store.finishRun({
      run,
      expectedRunRevision: run.revision - 1,
      schedule: summarized,
      expectedScheduleRevision: schedule.revision,
      eventId: this.createId('event'),
      at: run.finishedAt!
    })
    if (result.status === 'applied') {
      return {
        outcome: 'executed',
        run: result.run,
        schedule: result.schedule
      }
    }
    if (result.status === 'revision_conflict') {
      return { outcome: 'conflict', run: result.run }
    }
    throw new ScheduleServiceError(
      'schedule_persistence_unavailable',
      'Schedule execution result could not be saved'
    )
  }

  private async requireSchedule(id: string): Promise<Schedule> {
    const schedule = await this.dependencies.store.get(id)
    if (!schedule) {
      throw new ScheduleServiceError(
        'schedule_not_found',
        'Schedule was not found'
      )
    }
    return schedule
  }

  private notifyScheduleChanged(): void {
    if (!this.dependencies.onScheduleChanged) return
    void Promise.resolve()
      .then(() => this.dependencies.onScheduleChanged?.())
      .catch((error: unknown) => {
        console.error('Schedule refresh failed', error)
      })
  }
}

function executionCommand(
  schedule: Schedule,
  scheduleRunId: string
): ScheduleToolExecutionCommand {
  return {
    definition: schedule.executionTarget,
    triggerSource: 'schedule',
    context: {
      scope: { kind: 'space', workspaceId: schedule.workspaceId },
      workspaceId: schedule.workspaceId,
      scheduleRunId
    },
    input: schedule.skillInput,
    connectorBindings: schedule.connectorBindings
  }
}

function definitionOf(schedule: Schedule): ScheduleDefinition {
  return {
    name: schedule.name,
    description: schedule.description,
    cronExpression: schedule.cronExpression,
    timeZone: schedule.timeZone,
    missedRunPolicy: schedule.missedRunPolicy,
    workspaceId: schedule.workspaceId,
    modelProfileId: schedule.modelProfileId,
    executionTarget: schedule.executionTarget,
    skillInput: schedule.skillInput,
    connectorBindings: schedule.connectorBindings,
    permissions: schedule.permissions
  }
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function requireIdempotencyKey(value: string): void {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 200
  ) {
    throw new ScheduleServiceError(
      'schedule_invalid',
      'Schedule idempotency key is invalid'
    )
  }
}

function mapInvalid<T>(operation: () => T): T {
  try {
    return operation()
  } catch {
    throw new ScheduleServiceError(
      'schedule_invalid',
      'Schedule input is invalid'
    )
  }
}

function dependencyUnavailable(): ScheduleServiceError {
  return new ScheduleServiceError(
    'schedule_dependency_unavailable',
    'Schedule dependencies are unavailable'
  )
}

function idempotencyConflict(): ScheduleServiceError {
  return new ScheduleServiceError(
    'schedule_idempotency_conflict',
    'Schedule idempotency key conflicts'
  )
}

function triggerStale(): ScheduleServiceError {
  return new ScheduleServiceError(
    'schedule_trigger_stale',
    'Schedule trigger is stale'
  )
}
