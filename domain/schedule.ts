import {
  normalizeToolDefinitionReference,
  type ToolCapability,
  type ToolDefinitionReference
} from './tool-definition'

export type ScheduleStatus = 'active' | 'paused'
export type MissedRunPolicy = 'skip' | 'run_once'
export type ScheduleRunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type ScheduleConnectorBinding = {
  service: string
  connectorId: string
}

export type ScheduleDefinition = {
  name: string
  description: string
  cronExpression: string
  timeZone: string
  missedRunPolicy: MissedRunPolicy
  workspaceId: string
  modelProfileId: string
  executionTarget: ToolDefinitionReference
  skillInput: Record<string, unknown>
  connectorBindings: ScheduleConnectorBinding[]
  permissions: ToolCapability[]
}

export type Schedule = ScheduleDefinition & {
  id: string
  status: ScheduleStatus
  revision: number
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  lastRunStatus?: Exclude<ScheduleRunStatus, 'running'>
  lastRecoveryDecision?: ScheduleRecoveryDecision
}

export type ScheduleRun = {
  id: string
  scheduleId: string
  scheduleRevision: number
  scheduleName: string
  triggerSource: 'manual' | 'cron'
  status: ScheduleRunStatus
  toolExecutionId?: string
  errorCode?: string
  errorMessage?: string
  scheduledFor?: number
  startedAt: number
  finishedAt?: number
  revision: number
}

export type ScheduleRecoveryDecision = {
  scheduleId: string
  scheduleRevision: number
  missedDueAt: number
  policy: MissedRunPolicy
  action: 'skipped' | 'run_once'
  runId?: string
  decidedAt: number
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const SERVICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const CAPABILITIES = new Set<ToolCapability>([
  'filesystem.read',
  'filesystem.write',
  'process.execute',
  'repository.modify'
])
const CRON_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7]
] as const

export function createSchedule(input: {
  id: string
  definition: ScheduleDefinition
  at: number
}): Schedule {
  return {
    id: requireIdentifier(input.id, 'Schedule ID'),
    ...normalizeScheduleDefinition(input.definition),
    status: 'active',
    revision: 1,
    createdAt: requireTimestamp(input.at),
    updatedAt: input.at
  }
}

export function updateSchedule(
  current: Schedule,
  input: { definition: ScheduleDefinition; at: number }
): Schedule {
  const at = requireForwardTimestamp(input.at, current.updatedAt)
  return {
    ...current,
    ...normalizeScheduleDefinition(input.definition),
    revision: current.revision + 1,
    updatedAt: at
  }
}

export function pauseSchedule(current: Schedule, at: number): Schedule {
  if (current.status === 'paused') {
    throw new Error('Schedule is already paused')
  }
  return transitionSchedule(current, 'paused', at)
}

export function resumeSchedule(current: Schedule, at: number): Schedule {
  if (current.status === 'active') {
    throw new Error('Schedule is already active')
  }
  return transitionSchedule(current, 'active', at)
}

export function createScheduleRun(input: {
  id: string
  schedule: Schedule
  triggerSource: ScheduleRun['triggerSource']
  scheduledFor?: number
  at: number
}): ScheduleRun {
  if (input.schedule.status !== 'active') {
    throw new Error('Schedule must be active to run')
  }
  if (input.triggerSource !== 'manual' && input.triggerSource !== 'cron') {
    throw new Error('Schedule run trigger source is invalid')
  }
  if (input.triggerSource === 'cron' && input.scheduledFor === undefined) {
    throw new Error('Cron schedule run requires its planned time')
  }
  if (input.triggerSource === 'manual' && input.scheduledFor !== undefined) {
    throw new Error('Manual schedule run cannot have a planned time')
  }
  const startedAt = requireTimestamp(input.at)
  const scheduledFor =
    input.scheduledFor === undefined
      ? undefined
      : requireTimestamp(input.scheduledFor)
  if (scheduledFor !== undefined && scheduledFor > startedAt) {
    throw new Error('Schedule run planned time cannot be later than its start')
  }
  return {
    id: requireIdentifier(input.id, 'Schedule run ID'),
    scheduleId: input.schedule.id,
    scheduleRevision: input.schedule.revision,
    scheduleName: input.schedule.name,
    triggerSource: input.triggerSource,
    status: 'running',
    ...(scheduledFor === undefined ? {} : { scheduledFor }),
    startedAt,
    revision: 1
  }
}

export function finishScheduleRun(
  current: ScheduleRun,
  input: {
    status: Exclude<ScheduleRunStatus, 'running'>
    toolExecutionId?: string
    errorCode?: string
    errorMessage?: string
    at: number
  }
): ScheduleRun {
  if (current.status !== 'running') {
    throw new Error('Schedule run is already terminal')
  }
  const at = requireForwardTimestamp(input.at, current.startedAt)
  const toolExecutionId = input.toolExecutionId
    ? requireIdentifier(input.toolExecutionId, 'Tool execution ID')
    : undefined
  const errorCode = normalizeOptionalText(input.errorCode, 100)
  const errorMessage = normalizeOptionalText(input.errorMessage, 500)
  const requiresError =
    input.status === 'failed' || input.status === 'interrupted'
  if (requiresError && (!errorCode || !errorMessage)) {
    throw new Error('Failed schedule run requires an error')
  }
  if (!requiresError && (errorCode || errorMessage)) {
    throw new Error('Successful schedule run cannot contain an error')
  }
  return {
    ...current,
    status: input.status,
    ...(toolExecutionId ? { toolExecutionId } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    finishedAt: at,
    revision: current.revision + 1
  }
}

export function updateScheduleRunSummary(
  current: Schedule,
  run: ScheduleRun
): Schedule {
  if (run.scheduleId !== current.id) {
    throw new Error('Schedule run does not belong to schedule')
  }
  if (run.status === 'running' || run.finishedAt === undefined) {
    throw new Error('Schedule run must be terminal')
  }
  if (run.finishedAt < current.updatedAt) {
    throw new Error('Schedule run completion time is invalid')
  }
  return {
    ...current,
    lastRunAt: run.finishedAt,
    lastRunStatus: run.status,
    revision: current.revision + 1,
    updatedAt: run.finishedAt
  }
}

export function normalizeScheduleDefinition(
  input: ScheduleDefinition
): ScheduleDefinition {
  const name = requireText(input.name, 'Schedule name', 120)
  const description = requireText(
    input.description,
    'Schedule description',
    4_000
  )
  const cronExpression = normalizeCronExpression(input.cronExpression)
  const timeZone = normalizeTimeZone(input.timeZone)
  const missedRunPolicy = normalizeMissedRunPolicy(input.missedRunPolicy)
  const workspaceId = requireIdentifier(input.workspaceId, 'Workspace ID')
  const modelProfileId = requireIdentifier(
    input.modelProfileId,
    'Model profile ID'
  )
  const executionTarget = normalizeToolDefinitionReference(
    input.executionTarget
  )
  const skillInput = cloneJsonObject(input.skillInput)
  const connectorBindings = normalizeConnectorBindings(
    input.connectorBindings
  )
  const permissions = normalizePermissions(input.permissions)
  return {
    name,
    description,
    cronExpression,
    timeZone,
    missedRunPolicy,
    workspaceId,
    modelProfileId,
    executionTarget,
    skillInput,
    connectorBindings,
    permissions
  }
}

function normalizeMissedRunPolicy(value: MissedRunPolicy): MissedRunPolicy {
  if (value !== 'skip' && value !== 'run_once') {
    throw new Error('Schedule missed-run policy is invalid')
  }
  return value
}

function transitionSchedule(
  current: Schedule,
  status: ScheduleStatus,
  at: number
): Schedule {
  return {
    ...current,
    status,
    revision: current.revision + 1,
    updatedAt: requireForwardTimestamp(at, current.updatedAt)
  }
}

function normalizeCronExpression(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const fields = normalized.split(' ')
  if (
    fields.length !== 5 ||
    fields.some((field, index) => {
      const [min, max] = CRON_RANGES[index]
      return !validCronField(field, min, max)
    })
  ) {
    throw new Error('Schedule cron expression is invalid')
  }
  return normalized
}

function validCronField(value: string, min: number, max: number): boolean {
  return value.split(',').every((part) => {
    const [range, step, extra] = part.split('/')
    if (
      extra !== undefined ||
      (step !== undefined &&
        (!/^\d+$/.test(step) || Number(step) < 1 || Number(step) > max))
    ) {
      return false
    }
    if (range === '*') return true
    const bounds = range.split('-')
    if (bounds.length > 2 || bounds.some((item) => !/^\d+$/.test(item))) {
      return false
    }
    const start = Number(bounds[0])
    const end = Number(bounds[1] ?? bounds[0])
    return start >= min && end <= max && start <= end
  })
}

function normalizeTimeZone(value: string): string {
  const timeZone = value.trim()
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
  } catch {
    throw new Error('Schedule time zone is invalid')
  }
  if (!timeZone) throw new Error('Schedule time zone is invalid')
  return timeZone
}

function normalizeConnectorBindings(
  bindings: ScheduleConnectorBinding[]
): ScheduleConnectorBinding[] {
  if (!Array.isArray(bindings)) {
    throw new Error('Schedule connector bindings are invalid')
  }
  const normalized = bindings.map((binding) => ({
    service: requireService(binding.service),
    connectorId: requireIdentifier(binding.connectorId, 'Connector ID')
  }))
  if (new Set(normalized.map(({ service }) => service)).size !== normalized.length) {
    throw new Error('Schedule connector services must be unique')
  }
  return normalized.sort(
    (left, right) =>
      left.service.localeCompare(right.service) ||
      left.connectorId.localeCompare(right.connectorId)
  )
}

function normalizePermissions(
  permissions: ToolCapability[]
): ToolCapability[] {
  if (
    !Array.isArray(permissions) ||
    permissions.some((permission) => !CAPABILITIES.has(permission))
  ) {
    throw new Error('Schedule permission is invalid')
  }
  return [...new Set(permissions)].sort()
}

function cloneJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('Schedule skill input must be a JSON object')
  }
  try {
    const json = JSON.stringify(value)
    const cloned = JSON.parse(json) as unknown
    if (
      cloned === null ||
      typeof cloned !== 'object' ||
      Array.isArray(cloned)
    ) {
      throw new Error()
    }
    return cloned as Record<string, unknown>
  } catch {
    throw new Error('Schedule skill input must be a JSON object')
  }
}

function requireText(value: string, label: string, maxLength: number): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${label} is required`)
  if (normalized.length > maxLength) {
    throw new Error(`${label} is too long`)
  }
  return normalized
}

function normalizeOptionalText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new Error('Schedule run error is invalid')
  }
  return normalized
}

function requireIdentifier(value: string, label: string): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

function requireService(value: string): string {
  if (typeof value !== 'string' || !SERVICE_PATTERN.test(value)) {
    throw new Error('Schedule connector service is invalid')
  }
  return value
}

function requireTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Schedule timestamp is invalid')
  }
  return value
}

function requireForwardTimestamp(value: number, previous: number): number {
  const timestamp = requireTimestamp(value)
  if (timestamp < previous) {
    throw new Error('Schedule timestamp is invalid')
  }
  return timestamp
}
