import type {
  DeleteScheduleResult,
  RunScheduleNowResult,
  ScheduleDto,
  ScheduleMutationResult,
  ScheduleRunDto
} from '../../../shared/business'
import { normalizeScheduleDefinition } from '../../../domain/schedule'

export function requireScheduleListResult(
  value: unknown,
  channel: string
): ScheduleDto[] {
  if (!Array.isArray(value)) invalid(channel, 'result')
  return value.map((item, index) =>
    requireSchedule(item, channel, `result.${index}`)
  )
}

export function requireScheduleRunListResult(
  value: unknown,
  channel: string
): ScheduleRunDto[] {
  if (!Array.isArray(value)) invalid(channel, 'result')
  return value.map((item, index) =>
    requireScheduleRun(item, channel, `result.${index}`)
  )
}

export function requireScheduleMutationResult(
  value: unknown,
  channel: string
): ScheduleMutationResult {
  const record = object(value, channel, 'result')
  exact(record, ['outcome', 'schedule'], channel, 'result')
  if (record.outcome !== 'saved' && record.outcome !== 'conflict') {
    invalid(channel, 'result.outcome')
  }
  return {
    outcome: record.outcome,
    schedule: requireSchedule(record.schedule, channel, 'result.schedule')
  }
}

export function requireDeleteScheduleResult(
  value: unknown,
  channel: string
): DeleteScheduleResult {
  const record = object(value, channel, 'result')
  if (record.outcome === 'conflict') {
    exact(record, ['outcome', 'schedule'], channel, 'result')
    return {
      outcome: 'conflict',
      schedule: requireSchedule(record.schedule, channel, 'result.schedule')
    }
  }
  exact(record, ['outcome', 'id'], channel, 'result')
  if (record.outcome !== 'deleted' && record.outcome !== 'not_found') {
    invalid(channel, 'result.outcome')
  }
  return {
    outcome: record.outcome,
    id: id(record.id, channel, 'result.id')
  }
}

export function requireRunScheduleNowResult(
  value: unknown,
  channel: string
): RunScheduleNowResult {
  const record = object(value, channel, 'result')
  if (record.outcome === 'conflict') {
    exact(record, ['outcome', 'run'], channel, 'result')
    return {
      outcome: 'conflict',
      run: requireScheduleRun(record.run, channel, 'result.run')
    }
  }
  exact(
    record,
    ['outcome', 'run', ...(record.schedule === undefined ? [] : ['schedule'])],
    channel,
    'result'
  )
  if (record.outcome !== 'executed' && record.outcome !== 'replayed') {
    invalid(channel, 'result.outcome')
  }
  return {
    outcome: record.outcome,
    run: requireScheduleRun(record.run, channel, 'result.run'),
    ...(record.schedule === undefined
      ? {}
      : {
          schedule: requireSchedule(
            record.schedule,
            channel,
            'result.schedule'
          )
        })
  }
}

function requireSchedule(
  value: unknown,
  channel: string,
  field: string
): ScheduleDto {
  const record = object(value, channel, field)
  exact(
    record,
    [
      'id',
      'name',
      'description',
      'cronExpression',
      'timeZone',
      'missedRunPolicy',
      'workspaceId',
      'modelProfileId',
      'executionTarget',
      'skillInput',
      'connectorBindings',
      'permissions',
      'status',
      'revision',
      'createdAt',
      'updatedAt',
      ...(record.lastRunAt === undefined ? [] : ['lastRunAt']),
      ...(record.lastRunStatus === undefined ? [] : ['lastRunStatus']),
      ...(record.nextRunAt === undefined ? [] : ['nextRunAt']),
      ...(record.lastRecoveryDecision === undefined
        ? []
        : ['lastRecoveryDecision'])
    ],
    channel,
    field
  )
  if (record.status !== 'active' && record.status !== 'paused') {
    invalid(channel, `${field}.status`)
  }
  if (
    record.lastRunStatus !== undefined &&
    !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(
      String(record.lastRunStatus)
    )
  ) {
    invalid(channel, `${field}.lastRunStatus`)
  }
  let definition
  try {
    definition = normalizeScheduleDefinition({
      name: text(record.name, channel, `${field}.name`),
      description: text(record.description, channel, `${field}.description`),
      cronExpression: text(
        record.cronExpression,
        channel,
        `${field}.cronExpression`
      ),
      timeZone: text(record.timeZone, channel, `${field}.timeZone`),
      missedRunPolicy: missedRunPolicy(
        record.missedRunPolicy,
        channel,
        `${field}.missedRunPolicy`
      ),
      workspaceId: id(record.workspaceId, channel, `${field}.workspaceId`),
      modelProfileId: id(
        record.modelProfileId,
        channel,
        `${field}.modelProfileId`
      ),
      executionTarget: record.executionTarget as ScheduleDto['executionTarget'],
      skillInput: jsonObject(record.skillInput, channel, `${field}.skillInput`),
      connectorBindings: bindings(
        record.connectorBindings,
        channel,
        `${field}.connectorBindings`
      ),
      permissions: permissions(
        record.permissions,
        channel,
        `${field}.permissions`
      )
    })
  } catch {
    invalid(channel, field)
  }
  const scheduleId = id(record.id, channel, `${field}.id`)
  const scheduleRevision = positive(
    record.revision,
    channel,
    `${field}.revision`
  )
  const lastRecoveryDecision =
    record.lastRecoveryDecision === undefined
      ? undefined
      : requireRecoveryDecision(
          record.lastRecoveryDecision,
          channel,
          `${field}.lastRecoveryDecision`
        )
  if (
    lastRecoveryDecision &&
    (lastRecoveryDecision.scheduleId !== scheduleId ||
      lastRecoveryDecision.scheduleRevision > scheduleRevision)
  ) {
    invalid(channel, `${field}.lastRecoveryDecision`)
  }
  return {
    id: scheduleId,
    ...definition,
    status: record.status,
    revision: scheduleRevision,
    createdAt: timestamp(record.createdAt, channel, `${field}.createdAt`),
    updatedAt: timestamp(record.updatedAt, channel, `${field}.updatedAt`),
    ...(record.lastRunAt === undefined
      ? {}
      : {
          lastRunAt: timestamp(
            record.lastRunAt,
            channel,
            `${field}.lastRunAt`
          )
        }),
    ...(record.lastRunStatus === undefined
      ? {}
      : {
          lastRunStatus:
            record.lastRunStatus as ScheduleDto['lastRunStatus']
        }),
    ...(record.nextRunAt === undefined
      ? {}
      : {
          nextRunAt: timestamp(
            record.nextRunAt,
            channel,
            `${field}.nextRunAt`
          )
        }),
    ...(lastRecoveryDecision === undefined
      ? {}
      : { lastRecoveryDecision })
  }
}

function requireRecoveryDecision(
  value: unknown,
  channel: string,
  field: string
): NonNullable<ScheduleDto['lastRecoveryDecision']> {
  const record = object(value, channel, field)
  exact(
    record,
    [
      'scheduleId',
      'scheduleRevision',
      'missedDueAt',
      'policy',
      'action',
      ...(record.runId === undefined ? [] : ['runId']),
      'decidedAt'
    ],
    channel,
    field
  )
  const policy = missedRunPolicy(record.policy, channel, `${field}.policy`)
  if (record.action !== 'skipped' && record.action !== 'run_once') {
    invalid(channel, `${field}.action`)
  }
  if (
    (record.action === 'skipped' &&
      (policy !== 'skip' || record.runId !== undefined)) ||
    (record.action === 'run_once' &&
      (policy !== 'run_once' || record.runId === undefined))
  ) {
    invalid(channel, field)
  }
  return {
    scheduleId: id(record.scheduleId, channel, `${field}.scheduleId`),
    scheduleRevision: positive(
      record.scheduleRevision,
      channel,
      `${field}.scheduleRevision`
    ),
    missedDueAt: timestamp(
      record.missedDueAt,
      channel,
      `${field}.missedDueAt`
    ),
    policy,
    action: record.action,
    ...(record.runId === undefined
      ? {}
      : { runId: id(record.runId, channel, `${field}.runId`) }),
    decidedAt: timestamp(record.decidedAt, channel, `${field}.decidedAt`)
  }
}

function missedRunPolicy(
  value: unknown,
  channel: string,
  field: string
): ScheduleDto['missedRunPolicy'] {
  if (value !== 'skip' && value !== 'run_once') invalid(channel, field)
  return value
}

function requireScheduleRun(
  value: unknown,
  channel: string,
  field: string
): ScheduleRunDto {
  const record = object(value, channel, field)
  exact(
    record,
    [
      'id',
      'scheduleId',
      'scheduleRevision',
      'scheduleName',
      'triggerSource',
      'status',
      'startedAt',
      'revision',
      ...(record.toolExecutionId === undefined ? [] : ['toolExecutionId']),
      ...(record.errorCode === undefined ? [] : ['errorCode']),
      ...(record.errorMessage === undefined ? [] : ['errorMessage']),
      ...(record.scheduledFor === undefined ? [] : ['scheduledFor']),
      ...(record.finishedAt === undefined ? [] : ['finishedAt'])
    ],
    channel,
    field
  )
  if (record.triggerSource !== 'manual' && record.triggerSource !== 'cron') {
    invalid(channel, `${field}.triggerSource`)
  }
  if (
    !['running', 'succeeded', 'failed', 'cancelled', 'interrupted'].includes(
      String(record.status)
    )
  ) {
    invalid(channel, `${field}.status`)
  }
  if (
    (record.triggerSource === 'cron' &&
      record.scheduledFor === undefined) ||
    (record.triggerSource === 'manual' &&
      record.scheduledFor !== undefined)
  ) {
    invalid(channel, `${field}.scheduledFor`)
  }
  const startedAt = timestamp(
    record.startedAt,
    channel,
    `${field}.startedAt`
  )
  const scheduledFor =
    record.scheduledFor === undefined
      ? undefined
      : timestamp(
          record.scheduledFor,
          channel,
          `${field}.scheduledFor`
        )
  if (scheduledFor !== undefined && scheduledFor > startedAt) {
    invalid(channel, `${field}.scheduledFor`)
  }
  return {
    id: id(record.id, channel, `${field}.id`),
    scheduleId: id(record.scheduleId, channel, `${field}.scheduleId`),
    scheduleRevision: positive(
      record.scheduleRevision,
      channel,
      `${field}.scheduleRevision`
    ),
    scheduleName: text(record.scheduleName, channel, `${field}.scheduleName`),
    triggerSource: record.triggerSource,
    status: record.status as ScheduleRunDto['status'],
    ...(scheduledFor === undefined ? {} : { scheduledFor }),
    startedAt,
    revision: positive(record.revision, channel, `${field}.revision`),
    ...(record.toolExecutionId === undefined
      ? {}
      : {
          toolExecutionId: id(
            record.toolExecutionId,
            channel,
            `${field}.toolExecutionId`
          )
        }),
    ...(record.errorCode === undefined
      ? {}
      : { errorCode: text(record.errorCode, channel, `${field}.errorCode`) }),
    ...(record.errorMessage === undefined
      ? {}
      : {
          errorMessage: text(
            record.errorMessage,
            channel,
            `${field}.errorMessage`
          )
        }),
    ...(record.finishedAt === undefined
      ? {}
      : {
          finishedAt: timestamp(
            record.finishedAt,
            channel,
            `${field}.finishedAt`
          )
        })
  }
}

function bindings(
  value: unknown,
  channel: string,
  field: string
): ScheduleDto['connectorBindings'] {
  if (!Array.isArray(value)) invalid(channel, field)
  return value.map((item, index) => {
    const itemField = `${field}.${index}`
    const record = object(item, channel, itemField)
    exact(record, ['service', 'connectorId'], channel, itemField)
    return {
      service: id(record.service, channel, `${itemField}.service`),
      connectorId: id(
        record.connectorId,
        channel,
        `${itemField}.connectorId`
      )
    }
  })
}

function permissions(
  value: unknown,
  channel: string,
  field: string
): ScheduleDto['permissions'] {
  const allowed = new Set([
    'filesystem.read',
    'filesystem.write',
    'process.execute',
    'repository.modify'
  ])
  if (
    !Array.isArray(value) ||
    value.some((item) => !allowed.has(String(item)))
  ) {
    invalid(channel, field)
  }
  return value as ScheduleDto['permissions']
}

function jsonObject(
  value: unknown,
  channel: string,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(channel, field)
  }
  try {
    JSON.stringify(value)
  } catch {
    invalid(channel, field)
  }
  return value as Record<string, unknown>
}

function object(
  value: unknown,
  channel: string,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(channel, field)
  }
  return value as Record<string, unknown>
}

function exact(
  record: Record<string, unknown>,
  fields: string[],
  channel: string,
  prefix: string
): void {
  if (
    Object.keys(record).length !== fields.length ||
    Object.keys(record).some((key) => !fields.includes(key))
  ) {
    invalid(channel, prefix)
  }
}

function id(value: unknown, channel: string, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
  ) {
    invalid(channel, field)
  }
  return value
}

function text(value: unknown, channel: string, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4_000) {
    invalid(channel, field)
  }
  return value
}

function positive(value: unknown, channel: string, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid(channel, field)
  }
  return value
}

function timestamp(value: unknown, channel: string, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid(channel, field)
  }
  return value
}

function invalid(channel: string, field: string): never {
  throw new Error(`Invalid IPC result for ${channel}: ${field}`)
}
