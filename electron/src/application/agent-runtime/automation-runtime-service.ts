import { createHash } from 'node:crypto'
import {
  createSchedule,
  type Schedule,
  type ScheduleDefinition,
  type ScheduleRun
} from '../../../../domain/schedule'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ScheduleRunQuery } from '../schedules/schedule-store'

type SchedulerStatus = {
  running: boolean
  nextDueAt?: number
  nextScheduleId?: string
}

type BackgroundStatus = {
  running: number
  pending: number
}

type Dependencies = {
  schedules: {
    list(): Promise<Schedule[]>
    listRuns(query: ScheduleRunQuery): Promise<ScheduleRun[]>
  }
  scheduler: {
    status(): SchedulerStatus
  }
  background: {
    status(): Promise<BackgroundStatus>
  }
  now?: () => number
}

type RuntimeContext = {
  runId: string
  requestId: string
}

type AutomationAction =
  | 'status'
  | 'list'
  | 'runs'
  | 'heartbeat'
  | 'create_proposal'
  | 'update_proposal'
  | 'pause_proposal'
  | 'resume_proposal'

const ACTIONS = new Set<AutomationAction>([
  'status',
  'list',
  'runs',
  'heartbeat',
  'create_proposal',
  'update_proposal',
  'pause_proposal',
  'resume_proposal'
])
const PROPOSAL_TTL_MS = 15 * 60 * 1000
const SCHEDULE_STATUSES = new Set(['active', 'paused'])
const RUN_STATUSES = new Set([
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted'
])

export class AutomationRuntimeService {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: JsonObject, context: RuntimeContext): Promise<JsonObject> {
    const action = requireAction(input)
    if (isProposalAction(action)) {
      return this.proposal(action, input, context)
    }
    try {
      if (action === 'status') return await this.status()
      if (action === 'list') return await this.list(input)
      if (action === 'runs') return await this.runs(input)
      return await this.heartbeat()
    } catch (error) {
      if (error instanceof Error && error.message === 'automation_command_invalid') {
        throw error
      }
      throw new Error('automation_unavailable')
    }
  }

  private async status(): Promise<JsonObject> {
    const [schedules, runs, background] = await Promise.all([
      this.dependencies.schedules.list(),
      this.dependencies.schedules.listRuns({ limit: 50 }),
      this.dependencies.background.status()
    ])
    return {
      status: 'ready',
      scheduler: schedulerSnapshot(this.dependencies.scheduler.status()),
      schedules: {
        total: schedules.length,
        active: schedules.filter(({ status }) => status === 'active').length,
        paused: schedules.filter(({ status }) => status === 'paused').length
      },
      recentRuns: {
        total: runs.length,
        running: runs.filter(({ status }) => status === 'running').length,
        failed: runs.filter(({ status }) => status === 'failed').length
      },
      background: normalizeBackground(background)
    }
  }

  private async list(input: JsonObject): Promise<JsonObject> {
    exactKeys(input, ['action', 'status', 'limit'])
    const status = optionalEnum(input.status, SCHEDULE_STATUSES)
    const limit = optionalLimit(input.limit)
    const schedules = (await this.dependencies.schedules.list())
      .filter((schedule) => !status || schedule.status === status)
      .sort((left, right) =>
        right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
      )
    return {
      status: 'completed',
      schedules: schedules.slice(0, limit).map(scheduleSummary),
      total: schedules.length,
      truncated: schedules.length > limit
    }
  }

  private async runs(input: JsonObject): Promise<JsonObject> {
    exactKeys(input, ['action', 'scheduleId', 'status', 'limit'])
    const scheduleId = optionalIdentifier(input.scheduleId)
    const status = optionalEnum(input.status, RUN_STATUSES) as
      | ScheduleRun['status']
      | undefined
    const limit = optionalLimit(input.limit)
    const runs = await this.dependencies.schedules.listRuns({
      ...(scheduleId ? { scheduleId } : {}),
      ...(status ? { status } : {}),
      limit
    })
    return {
      status: 'completed',
      runs: runs.map(runSummary),
      total: runs.length
    }
  }

  private async heartbeat(): Promise<JsonObject> {
    const background = await this.dependencies.background.status()
    return {
      status: 'alive',
      observedAt: this.now(),
      schedulerRunning: this.dependencies.scheduler.status().running,
      background: normalizeBackground(background)
    }
  }

  private proposal(
    action: Extract<AutomationAction, `${string}_proposal`>,
    input: JsonObject,
    context: RuntimeContext
  ): JsonObject {
    validateProposal(action, input)
    return {
      status: 'approval_required',
      action,
      approvalSurface: 'schedules',
      proposalId: `automation-${digest({ context, input }).slice(0, 24)}`,
      runId: context.runId,
      requestId: context.requestId,
      expiresAt: this.now() + PROPOSAL_TTL_MS
    }
  }

  private now(): number {
    return (this.dependencies.now ?? Date.now)()
  }
}

function requireAction(input: JsonObject): AutomationAction {
  const action = input.action
  if (typeof action !== 'string' || !ACTIONS.has(action as AutomationAction)) {
    throw new Error('automation_command_invalid')
  }
  if (['status', 'heartbeat'].includes(action)) exactKeys(input, ['action'])
  return action as AutomationAction
}

function isProposalAction(
  action: AutomationAction
): action is Extract<AutomationAction, `${string}_proposal`> {
  return action.endsWith('_proposal')
}

function validateProposal(
  action: Extract<AutomationAction, `${string}_proposal`>,
  input: JsonObject
): void {
  if (action === 'create_proposal') {
    exactKeys(input, ['action', 'definition'])
    validateDefinition(input.definition)
    return
  }
  if (action === 'update_proposal') {
    exactKeys(input, [
      'action',
      'scheduleId',
      'expectedRevision',
      'definition'
    ])
    requireScheduleIdentity(input)
    validateDefinition(input.definition)
    return
  }
  exactKeys(input, ['action', 'scheduleId', 'expectedRevision'])
  requireScheduleIdentity(input)
}

function validateDefinition(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('automation_command_invalid')
  }
  try {
    createSchedule({
      id: 'automation-proposal',
      definition: value as ScheduleDefinition,
      at: 1
    })
  } catch {
    throw new Error('automation_command_invalid')
  }
}

function requireScheduleIdentity(input: JsonObject): void {
  if (
    !optionalIdentifier(input.scheduleId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 1
  ) {
    throw new Error('automation_command_invalid')
  }
}

function optionalIdentifier(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
  ) {
    throw new Error('automation_command_invalid')
  }
  return value
}

function optionalEnum(
  value: unknown,
  allowed: ReadonlySet<string>
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error('automation_command_invalid')
  }
  return value
}

function optionalLimit(value: unknown): number {
  if (value === undefined) return 20
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 50) {
    throw new Error('automation_command_invalid')
  }
  return Number(value)
}

function exactKeys(input: JsonObject, allowed: string[]): void {
  const keys = new Set(allowed)
  if (
    Object.keys(input).some(
      (key) => !keys.has(key) || input[key] === undefined
    )
  ) {
    throw new Error('automation_command_invalid')
  }
}

function scheduleSummary(schedule: Schedule): JsonObject {
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description,
    cronExpression: schedule.cronExpression,
    timeZone: schedule.timeZone,
    scheduleStatus: schedule.status,
    revision: schedule.revision,
    updatedAt: schedule.updatedAt,
    ...(schedule.lastRunAt === undefined
      ? {}
      : { lastRunAt: schedule.lastRunAt }),
    ...(schedule.lastRunStatus
      ? { lastRunStatus: schedule.lastRunStatus }
      : {})
  }
}

function runSummary(run: ScheduleRun): JsonObject {
  return {
    id: run.id,
    scheduleId: run.scheduleId,
    scheduleRevision: run.scheduleRevision,
    scheduleName: run.scheduleName,
    triggerSource: run.triggerSource,
    runStatus: run.status,
    ...(run.toolExecutionId ? { toolExecutionId: run.toolExecutionId } : {}),
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    ...(run.scheduledFor === undefined
      ? {}
      : { scheduledFor: run.scheduledFor }),
    startedAt: run.startedAt,
    ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
    revision: run.revision
  }
}

function schedulerSnapshot(status: SchedulerStatus): JsonObject {
  return {
    running: status.running,
    ...(status.nextDueAt === undefined
      ? {}
      : { nextDueAt: status.nextDueAt }),
    ...(status.nextScheduleId
      ? { nextScheduleId: status.nextScheduleId }
      : {})
  }
}

function normalizeBackground(status: BackgroundStatus): JsonObject {
  if (
    !Number.isSafeInteger(status.running) ||
    status.running < 0 ||
    !Number.isSafeInteger(status.pending) ||
    status.pending < 0
  ) {
    throw new Error('automation_unavailable')
  }
  return { running: status.running, pending: status.pending }
}

function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value, sortedJson))
    .digest('hex')
}

function sortedJson(_key: string, value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      )
    : value
}
