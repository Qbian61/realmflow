import type { AgentRunLifecycleStatus } from '../../../../domain/agent-runtime'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { AgentRuntimeState, RuntimeGoal } from '../../../../shared/agent-runtime-state'
import type { DshRuntimeEventEnvelope } from '../../../../shared/dsh-runtime-event-contract'
import { sanitizeRuntimeText } from '../agent-runtime/runtime-state-service'

export type DshGoalProjection = Readonly<{
  runId: string
  sessionId: string
  lifecycleStatus: AgentRunLifecycleStatus
  state: AgentRuntimeState
  governanceFact: JsonObject
}>

type DshGoalStatus =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
  | 'completed'
  | 'cancelled'

const DSH_GOAL_STATUSES = new Set<DshGoalStatus>([
  'active',
  'paused',
  'blocked',
  'complete',
  'completed',
  'cancelled'
])

export class DshGoalProjector {
  project(event: DshRuntimeEventEnvelope): DshGoalProjection {
    if (event.kind !== 'goal.updated') {
      throw new Error('DSH goal event is required')
    }
    const goalId = dataText(event.data, 'goalId', event.eventId)
    const objective = sanitizeRuntimeText(
      dataText(
        event.data,
        'objective',
        dataText(event.data, 'title', 'Goal')
      )
    )
    const dshStatus = goalStatus(event.data.status)
    const mapped = mapGoalStatus(dshStatus)
    const goal: RuntimeGoal = {
      objective,
      status: mapped.goalStatus,
      revision: event.sequence,
      updatedAt: event.occurredAt
    }
    const state: AgentRuntimeState = {
      runId: event.runId,
      revision: event.sequence,
      goal,
      cards: [],
      instructions: []
    }
    return deepFreeze({
      runId: event.runId,
      sessionId: event.sessionId,
      lifecycleStatus: mapped.lifecycleStatus,
      state,
      governanceFact: {
        kind: 'dsh.goal',
        goalId,
        dshStatus,
        lifecycleStatus: mapped.lifecycleStatus,
        sequence: event.sequence
      }
    } satisfies DshGoalProjection)
  }
}

function mapGoalStatus(status: DshGoalStatus): {
  goalStatus: RuntimeGoal['status']
  lifecycleStatus: AgentRunLifecycleStatus
} {
  switch (status) {
    case 'active':
      return { goalStatus: 'active', lifecycleStatus: 'running' }
    case 'paused':
      return { goalStatus: 'active', lifecycleStatus: 'paused' }
    case 'blocked':
      return { goalStatus: 'blocked', lifecycleStatus: 'recovery_blocked' }
    case 'complete':
    case 'completed':
      return { goalStatus: 'completed', lifecycleStatus: 'completed' }
    case 'cancelled':
      return { goalStatus: 'cancelled', lifecycleStatus: 'cancelled' }
  }
}

function goalStatus(value: unknown): DshGoalStatus {
  const normalized =
    typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : 'active'
  if (!DSH_GOAL_STATUSES.has(normalized as DshGoalStatus)) {
    throw new Error('DSH goal status is invalid')
  }
  return normalized as DshGoalStatus
}

function dataText(
  data: JsonObject,
  key: string,
  fallback = ''
): string {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child)
  }
  return value
}
