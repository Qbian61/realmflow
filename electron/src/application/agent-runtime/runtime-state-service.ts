import { createHash } from 'node:crypto'
import type { AgentRuntimeState, RuntimeGoal, RuntimeProgressCard } from '../../../../shared/agent-runtime-state'
import type { RuntimeStateCommit, RuntimeStateStore } from './runtime-state'

export type GoalInput = Pick<RuntimeGoal, 'objective' | 'status'> & { expectedRevision: number }
export type ProgressInput = Pick<RuntimeProgressCard, 'message' | 'status' | 'completed' | 'total'> & {
  cardId: string
  title?: string
  expectedRevision: number
}
export type SteeringInput = { sourceRunId: string; message: string }
export type AppliedInput = { ids: string[]; checkpointOrdinal: number }

export class RuntimeStateService {
  constructor(private readonly store: RuntimeStateStore, private readonly now: () => number = Date.now) {}

  read(runId: string): AgentRuntimeState {
    return this.store.read(runId)
  }

  goal(runId: string, requestId: string, input: GoalInput): AgentRuntimeState {
    return this.mutate(runId, requestId, 'goal', input, (state, at) => {
      assertText(input.objective, 2000, 'runtime_goal_invalid')
      if (!['active', 'blocked', 'completed', 'cancelled'].includes(input.status)) {
        throw new Error('runtime_goal_invalid')
      }
      assertRevision(input.expectedRevision, state.goal?.revision ?? 0)
      if (state.goal && ['completed', 'cancelled'].includes(state.goal.status)) {
        throw new Error('runtime_goal_terminal')
      }
      state.goal = {
        objective: sanitizeRuntimeText(input.objective), status: input.status,
        revision: input.expectedRevision + 1, updatedAt: at
      }
    })
  }

  progress(runId: string, requestId: string, input: ProgressInput): AgentRuntimeState {
    return this.mutate(runId, requestId, 'progress', input, (state, at) => {
      assertText(input.cardId, 120, 'runtime_progress_invalid')
      assertText(input.message, 2000, 'runtime_progress_invalid')
      if (input.title !== undefined) assertText(input.title, 240, 'runtime_progress_invalid')
      if (!['pending', 'running', 'blocked', 'completed', 'failed'].includes(input.status) ||
          [input.completed, input.total].some((n) => n !== undefined && (!Number.isSafeInteger(n) || n < 0)) ||
          (input.completed !== undefined && input.total !== undefined && input.completed > input.total)) {
        throw new Error('runtime_progress_invalid')
      }
      const current = state.cards.find(({ id }) => id === input.cardId)
      assertRevision(input.expectedRevision, current?.revision ?? 0)
      if (!current && state.cards.length >= 50) throw new Error('runtime_progress_limit')
      const card: RuntimeProgressCard = {
        id: input.cardId, title: sanitizeRuntimeText(input.title ?? current?.title ?? input.cardId),
        message: sanitizeRuntimeText(input.message), status: input.status,
        ...(input.completed === undefined ? {} : { completed: input.completed }),
        ...(input.total === undefined ? {} : { total: input.total }),
        revision: input.expectedRevision + 1, updatedAt: at
      }
      state.cards = [...state.cards.filter(({ id }) => id !== input.cardId), card]
    })
  }

  send(sourceRunId: string, requestId: string, input: {
    targetRunId: string; sessionId: string; message: string
  }): AgentRuntimeState {
    assertText(requestId, 240, 'runtime_request_invalid')
    const origin = {
      runId: sourceRunId, requestId,
      fingerprint: commandFingerprint('sessions_send', { sessionId: input.sessionId, message: input.message })
    }
    const replay = this.store.replay(origin.runId, origin.requestId, origin.fingerprint)
    if (replay) return replay
    const deliveryId = `send:${commandFingerprint(sourceRunId, { requestId })}`
    return this.queue(input.targetRunId, deliveryId, { sourceRunId, message: input.message }, origin)
  }

  steer(runId: string, requestId: string, input: SteeringInput): AgentRuntimeState {
    return this.queue(runId, requestId, input)
  }

  private queue(
    runId: string, requestId: string, input: SteeringInput, origin?: RuntimeStateCommit['origin']
  ): AgentRuntimeState {
    return this.mutate(runId, requestId, 'steer', input, (state, at) => {
      assertText(input.sourceRunId, 160, 'runtime_instruction_invalid')
      assertText(input.message, 12000, 'runtime_instruction_invalid')
      if (state.instructions.length >= 100) throw new Error('runtime_instruction_limit')
      state.instructions.push({
        id: requestId, sourceRunId: input.sourceRunId,
        message: sanitizeRuntimeText(input.message), status: 'queued', createdAt: at
      })
    }, origin)
  }

  applied(runId: string, requestId: string, input: AppliedInput): AgentRuntimeState {
    return this.mutate(runId, requestId, 'instructions_applied', input, (state, at) => {
      if (!Number.isSafeInteger(input.checkpointOrdinal) || input.checkpointOrdinal < 1 ||
          !Array.isArray(input.ids) || input.ids.length === 0 || input.ids.length > 100 ||
          new Set(input.ids).size !== input.ids.length ||
          input.ids.some((id) => !state.instructions.some((item) => item.id === id && item.status === 'queued'))) {
        throw new Error('runtime_instruction_unavailable')
      }
      state.instructions = state.instructions.map((item) => input.ids.includes(item.id)
        ? { ...item, status: 'applied', appliedAt: at, checkpointOrdinal: input.checkpointOrdinal }
        : item)
    })
  }

  private mutate(
    runId: string, requestId: string, kind: RuntimeStateCommit['kind'], input: object,
    update: (state: AgentRuntimeState, at: number) => void, origin?: RuntimeStateCommit['origin']
  ): AgentRuntimeState {
    assertText(requestId, 240, 'runtime_request_invalid')
    const fingerprint = commandFingerprint(kind, input)
    const replay = this.store.replay(runId, requestId, fingerprint)
    if (replay) return replay
    const state = structuredClone(this.store.read(runId))
    const expectedRevision = state.revision
    const at = this.now()
    update(state, at)
    state.revision += 1
    return this.store.commit({ runId, requestId, fingerprint, expectedRevision, state, kind, at, ...(origin ? { origin } : {}) })
  }
}

function commandFingerprint(kind: string, input: object): string {
  return createHash('sha256').update(JSON.stringify({ kind, input }, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value
  )).digest('hex')
}

export function sanitizeRuntimeText(text: string): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/(["']?(?:authorization|cookie|password|secret|token|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s;,]+)/gi, '$1[redacted]')
    .replace(/(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g, '[local path]')
    .trim()
}

function assertText(value: string, limit: number, code: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(code)
}

function assertRevision(expected: number, current: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected !== current) {
    throw new Error('runtime_revision_conflict')
  }
}
