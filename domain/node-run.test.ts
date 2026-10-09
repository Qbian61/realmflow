import { describe, expect, it } from 'vitest'
import {
  transitionNodeRun,
  type NodeRunState
} from './node-run'
import type { NodeRunStatus } from './workflow'

const allowedTransitions: Record<NodeRunStatus, NodeRunStatus[]> = {
  pending: ['ready', 'skipped', 'cancelled'],
  ready: ['running', 'paused', 'completed', 'failed', 'skipped', 'cancelled'],
  running: [
    'waiting_user',
    'blocked',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ],
  waiting_user: [
    'running',
    'blocked',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ],
  blocked: ['ready', 'running', 'paused', 'failed', 'cancelled', 'interrupted'],
  paused: ['ready', 'cancelled'],
  completed: [],
  failed: ['running', 'cancelled'],
  skipped: [],
  cancelled: ['running'],
  interrupted: ['running', 'cancelled']
}

function nodeRun(
  status: NodeRunStatus,
  overrides: Partial<NodeRunState> = {}
): NodeRunState {
  return {
    status,
    updatedAt: 10,
    ...(['completed', 'failed', 'skipped', 'cancelled'].includes(status)
      ? { completedAt: 10 }
      : {}),
    ...overrides
  }
}

describe('node run state machine', () => {
  it('accepts every defined transition and maintains completion timestamps', () => {
    for (const [fromStatus, targets] of Object.entries(
      allowedTransitions
    ) as Array<[NodeRunStatus, NodeRunStatus[]]>) {
      for (const toStatus of targets) {
        const result = transitionNodeRun(nodeRun(fromStatus), toStatus, {
          reason: 'test_transition',
          triggerSource: 'system',
          transitionedAt: 20
        })

        expect(result.changed).toBe(true)
        expect(result.state.status).toBe(toStatus)
        expect(result.state.updatedAt).toBe(20)
        expect(result.state.completedAt).toBe(
          ['completed', 'failed', 'skipped', 'cancelled'].includes(toStatus)
            ? 20
            : undefined
        )
      }
    }
  })

  it('rejects every transition outside the defined matrix', () => {
    const statuses = Object.keys(allowedTransitions) as NodeRunStatus[]
    for (const fromStatus of statuses) {
      for (const toStatus of statuses) {
        if (
          fromStatus === toStatus ||
          allowedTransitions[fromStatus].includes(toStatus)
        ) {
          continue
        }
        expect(() =>
          transitionNodeRun(nodeRun(fromStatus), toStatus, {
            reason: 'invalid_transition',
            triggerSource: 'system',
            transitionedAt: 20
          })
        ).toThrow(`Node run cannot transition from ${fromStatus}`)
      }
    }
  })

  it('treats an identical state as an idempotent replay', () => {
    const current = nodeRun('running')
    expect(
      transitionNodeRun(current, 'running', {
        reason: 'node_started',
        triggerSource: 'system',
        transitionedAt: 20
      })
    ).toEqual({ changed: false, state: current })
  })

  it('rejects invalid transition metadata', () => {
    expect(() =>
      transitionNodeRun(nodeRun('ready'), 'running', {
        reason: '',
        triggerSource: 'system',
        transitionedAt: 20
      })
    ).toThrow('Node run transition reason is required')
    expect(() =>
      transitionNodeRun(nodeRun('ready'), 'running', {
        reason: 'node_started',
        triggerSource: 'external' as never,
        transitionedAt: 20
      })
    ).toThrow('Invalid node run transition source')
    expect(() =>
      transitionNodeRun(nodeRun('ready'), 'running', {
        reason: 'node_started',
        triggerSource: 'system',
        transitionedAt: 9
      })
    ).toThrow('Node run transition time cannot move backwards')
  })
})
