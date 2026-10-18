import { describe, expect, it } from 'vitest'
import {
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'
import { DshGoalProjector } from './dsh-goal-projector'

const owner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

describe('DshGoalProjector', () => {
  it.each([
    ['active', 'running', 'active'],
    ['paused', 'paused', 'active'],
    ['blocked', 'recovery_blocked', 'blocked'],
    ['complete', 'completed', 'completed']
  ] as const)(
    'projects DSH goal %s into the existing Runtime API shape',
    (dshStatus, lifecycleStatus, goalStatus) => {
      const projection = new DshGoalProjector().project(
        runtimeEvent({
          sequence: 7,
          occurredAt: 1_700,
          data: {
            goalId: 'goal-1',
            objective:
              'Ship the runtime without token=sk-live-secret from /Users/bytedance/private',
            status: dshStatus
          }
        })
      )

      expect(projection).toMatchObject({
        runId: 'run-1',
        sessionId: 'session-1',
        lifecycleStatus,
        state: {
          runId: 'run-1',
          revision: 7,
          cards: [],
          instructions: [],
          goal: {
            status: goalStatus,
            revision: 7,
            updatedAt: 1_700
          }
        },
        governanceFact: {
          kind: 'dsh.goal',
          goalId: 'goal-1',
          dshStatus,
          lifecycleStatus,
          sequence: 7
        }
      })
      expect(projection.state.goal?.objective).toBe(
        'Ship the runtime without token=[redacted] from [local path]'
      )
      expect(JSON.stringify(projection)).not.toContain('sk-live-secret')
      expect(JSON.stringify(projection)).not.toContain('/Users/bytedance/private')
      expect(Object.isFrozen(projection)).toBe(true)
      expect(Object.isFrozen(projection.state.goal)).toBe(true)
    }
  )

  it('rejects non-goal events and unsupported DSH goal statuses', () => {
    const projector = new DshGoalProjector()

    expect(() =>
      projector.project(runtimeEvent({ kind: 'runtime.completed' }))
    ).toThrow(/goal event/i)
    expect(() =>
      projector.project(runtimeEvent({ data: { objective: 'Ship', status: 'waiting' } }))
    ).toThrow(/goal status/i)
  })
})

function runtimeEvent(
  overrides: Partial<DshRuntimeEventEnvelope> = {}
): DshRuntimeEventEnvelope {
  return {
    schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
    runtimeInstanceId: 'runtime-1',
    sessionId: 'session-1',
    runId: 'run-1',
    manifestDigest: 'a'.repeat(64),
    owner,
    eventId: 'event-1',
    sequence: 1,
    kind: 'goal.updated',
    occurredAt: 1_000,
    data: {
      objective: 'Ship the runtime',
      status: 'active'
    },
    ...overrides
  }
}
