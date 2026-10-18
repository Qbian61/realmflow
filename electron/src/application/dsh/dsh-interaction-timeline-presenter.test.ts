import { describe, expect, it, vi } from 'vitest'
import {
  createAssistantTurnProjection,
  type AssistantRunEvent,
  type AssistantTurnProjection
} from '../../../../domain/assistant-turn'
import {
  DSH_INTERACTION_SCHEMA_VERSION,
  type DshInteractionRequestRecord
} from '../../../../shared/dsh-interaction-contract'
import { DshInteractionTimelinePresenter } from './dsh-interaction-timeline-presenter'

describe('DshInteractionTimelinePresenter', () => {
  it('projects pending permission approvals into waiting tool events and publishes the final projection', async () => {
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      startedAt: 1_000
    })
    const events: AssistantRunEvent[] = []
    let projection: AssistantTurnProjection | undefined = initial
    const publishProjection = vi.fn()
    const resolveConversationId = vi.fn().mockResolvedValue('conversation-1')
    const presenter = new DshInteractionTimelinePresenter({
      timeline: {
        getSnapshot: vi.fn(async () => projection),
        appendAndProject: vi.fn(async (event, next) => {
          events.push(event)
          projection = next
          return true
        })
      },
      resolveConversationId,
      publishProjection
    })

    await presenter.project(permissionRecord())

    expect(events).toEqual([
      expect.objectContaining({
        sequence: 1,
        type: 'tool.call.requested',
        data: {
          callId: 'call-approval-1',
          toolName: 'bash',
          category: 'command',
          argumentsSummary: 'Run shell command'
        }
      }),
      expect.objectContaining({
        sequence: 2,
        type: 'tool.call.permission_required',
        data: {
          callId: 'call-approval-1',
          toolExecutionId: 'approval-request-1',
          message:
            'escalate sandbox to danger-full-access: approval is required'
        }
      })
    ])
    expect(projection).toMatchObject({
      status: 'waiting_permission',
      lastSequence: 2,
      toolCalls: [
        {
          callId: 'call-approval-1',
          toolName: 'bash',
          status: 'waiting_permission',
          error:
            'escalate sandbox to danger-full-access: approval is required'
        }
      ]
    })
    expect(resolveConversationId).toHaveBeenCalledWith({
      record: permissionRecord(),
      projection
    })
    expect(publishProjection).toHaveBeenCalledWith({
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      projection
    })
  })

  it('projects denied permission approvals into failed tool and run terminal events', async () => {
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      startedAt: 1_000
    })
    const events: AssistantRunEvent[] = []
    let projection: AssistantTurnProjection | undefined = initial
    const publishProjection = vi.fn()
    const presenter = new DshInteractionTimelinePresenter({
      timeline: {
        getSnapshot: vi.fn(async () => projection),
        appendAndProject: vi.fn(async (event, next) => {
          events.push(event)
          projection = next
          return true
        })
      },
      resolveConversationId: vi.fn().mockResolvedValue('conversation-1'),
      publishProjection
    })

    await presenter.project(permissionRecord())
    await presenter.project({
      ...permissionRecord(),
      status: 'resolved',
      requestRevision: 2,
      resolvedAt: 1_500,
      response: {
        kind: 'permission_approval',
        decision: 'deny'
      },
      decisionDigest: 'd'.repeat(64),
      decisionSignature: 'e'.repeat(64)
    })

    expect(events.slice(2)).toEqual([
      expect.objectContaining({
        sequence: 3,
        type: 'tool.call.failed',
        data: {
          callId: 'call-approval-1',
          toolExecutionId: 'approval-request-1',
          toolName: 'bash',
          category: 'command',
          errorCode: 'permission_denied',
          message: 'Permission denied by user'
        }
      }),
      expect.objectContaining({
        sequence: 4,
        type: 'run.failed',
        data: {
          errorCode: 'permission_denied',
          message: 'Permission denied by user'
        }
      })
    ])
    expect(projection).toMatchObject({
      status: 'failed',
      error: 'Permission denied by user',
      lastSequence: 4,
      toolCalls: [
        {
          callId: 'call-approval-1',
          status: 'failed',
          errorCode: 'permission_denied',
          error: 'Permission denied by user'
        }
      ]
    })
    expect(publishProjection).toHaveBeenLastCalledWith({
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      projection
    })
  })
})

function permissionRecord(): DshInteractionRequestRecord {
  return {
    schemaVersion: DSH_INTERACTION_SCHEMA_VERSION,
    kind: 'permission_approval',
    runtimeInstanceId: 'runtime-1',
    sessionId: 'dsh-session-1',
    runId: 'run-1',
    requestId: 'approval-request-1',
    activityId: 'call-approval-1',
    capabilityId: 'bash',
    scopeDigest: 'a'.repeat(64),
    effectDigest: 'b'.repeat(64),
    expiresAt: 60_000,
    payload: {
      title: 'Run shell command',
      message: 'escalate sandbox to danger-full-access: approval is required',
      approvalProfileId: 'cautious',
      maxGrant: 'once',
      options: ['deny', 'allow_once']
    },
    status: 'pending',
    nonce: 'nonce-1',
    requestedAt: 1_200,
    requestRevision: 1
  }
}
