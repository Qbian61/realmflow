import type {
  Schedule,
  ScheduleRecoveryDecision,
  ScheduleRun
} from '../../../../domain/schedule'

export type ScheduleEventOperation =
  | 'created'
  | 'updated'
  | 'paused'
  | 'resumed'
  | 'run_started'
  | 'run_succeeded'
  | 'run_failed'
  | 'run_cancelled'
  | 'run_interrupted'
  | 'deleted'

export type SaveScheduleInput = {
  schedule: Schedule
  expectedRevision: number
  eventId: string
  operation: Extract<
    ScheduleEventOperation,
    'created' | 'updated' | 'paused' | 'resumed'
  >
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type SaveScheduleResult =
  | { status: 'applied' | 'replayed'; schedule: Schedule }
  | { status: 'revision_conflict'; schedule: Schedule }
  | { status: 'idempotency_conflict' }

export type DeleteScheduleInput = {
  id: string
  expectedRevision: number
  eventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type DeleteScheduleResult =
  | { status: 'applied' | 'replayed'; id: string }
  | { status: 'revision_conflict'; schedule: Schedule }
  | { status: 'active_run'; schedule: Schedule }
  | { status: 'not_found'; id: string }
  | { status: 'idempotency_conflict' }

export type StartScheduleRunInput = {
  run: ScheduleRun
  eventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type StartScheduleRunResult =
  | { status: 'applied' | 'replayed'; run: ScheduleRun }
  | { status: 'active_run'; run: ScheduleRun }
  | { status: 'idempotency_conflict' }

export type FinishScheduleRunInput = {
  run: ScheduleRun
  expectedRunRevision: number
  schedule: Schedule
  expectedScheduleRevision: number
  eventId: string
  at: number
}

export type FinishScheduleRunResult =
  | { status: 'applied'; run: ScheduleRun; schedule: Schedule }
  | { status: 'revision_conflict'; run: ScheduleRun; schedule?: Schedule }
  | { status: 'not_found' }

export type ScheduleRunQuery = {
  scheduleId?: string
  status?: ScheduleRun['status']
  limit: number
}

export type ScheduleTriggerCursor = {
  scheduleId: string
  scheduleRevision: number
  nextDueAt: number
  missedDueAt?: number
  updatedAt: number
}

export type PlannedScheduleTrigger = {
  scheduleId: string
  scheduleRevision: number
  nextDueAt: number
}

export type ReconcileScheduleTriggersInput = {
  plannedTriggers: readonly PlannedScheduleTrigger[]
  at: number
  preserveOverdue: boolean
}

export type ClaimScheduledRunInput = {
  run: ScheduleRun
  nextDueAt: number
  eventId: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type ClaimScheduledRunResult =
  | { status: 'applied' | 'replayed'; run: ScheduleRun }
  | { status: 'stale' }
  | { status: 'idempotency_conflict' }

export type ResolveMissedTriggerInput = {
  decision: ScheduleRecoveryDecision
  run?: ScheduleRun
  eventId?: string
  idempotencyKey: string
  fingerprint: string
  at: number
}

export type ResolveMissedTriggerResult =
  | {
      status: 'applied' | 'replayed'
      decision: ScheduleRecoveryDecision
      run?: ScheduleRun
    }
  | { status: 'stale' }
  | { status: 'idempotency_conflict' }

export interface ScheduleStore {
  list(): Promise<Schedule[]>
  get(id: string): Promise<Schedule | undefined>
  save(input: SaveScheduleInput): Promise<SaveScheduleResult>
  delete(input: DeleteScheduleInput): Promise<DeleteScheduleResult>
  listRuns(query: ScheduleRunQuery): Promise<ScheduleRun[]>
  startRun(input: StartScheduleRunInput): Promise<StartScheduleRunResult>
  finishRun(input: FinishScheduleRunInput): Promise<FinishScheduleRunResult>
  recoverInterrupted(input: {
    at: number
    createEventId: (runId: string) => string
  }): Promise<number>
  reconcileTriggers(
    input: ReconcileScheduleTriggersInput
  ): Promise<ScheduleTriggerCursor[]>
  getNextTrigger(): Promise<ScheduleTriggerCursor | undefined>
  listMissedTriggers(): Promise<ScheduleTriggerCursor[]>
  claimScheduledRun(
    input: ClaimScheduledRunInput
  ): Promise<ClaimScheduledRunResult>
  resolveMissedTrigger(
    input: ResolveMissedTriggerInput
  ): Promise<ResolveMissedTriggerResult>
  clearTrigger(scheduleId: string): Promise<void>
}
