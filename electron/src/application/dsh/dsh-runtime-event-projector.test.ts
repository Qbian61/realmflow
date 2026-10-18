import { describe, expect, it } from 'vitest'
import {
  DSH_RUNTIME_EVENT_KINDS,
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  type DshRuntimeEventEnvelope,
  type DshRuntimeEventKind
} from '../../../../shared/dsh-runtime-event-contract'
import {
  DshRuntimeEventProjector,
  runtimeEventPlacementForKind
} from './dsh-runtime-event-projector'

const owner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

describe('DshRuntimeEventProjector', () => {
  it('maps model text and thought events into assistant reply projections', () => {
    const projector = new DshRuntimeEventProjector()

    expect(
      projector.project(
        runtimeEvent({
          kind: 'model.text_delta',
          data: { delta: 'Hello token=sk-live-secret' }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'answer.delta',
        data: { delta: 'Hello [redacted]' }
      },
      placements: expect.arrayContaining([
        { surface: 'assistant_reply', mode: 'inline' }
      ])
    })

    expect(
      projector.project(
        runtimeEvent({
          kind: 'model.thought_delta',
          data: {
            summaryId: 'thought-1',
            delta: 'Checking /Users/bytedance/private'
          }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'execution.summary.delta',
        data: {
          summaryId: 'thought-1',
          delta: 'Checking [local path]',
          source: 'provider'
        }
      },
      placements: expect.arrayContaining([
        { surface: 'assistant_reply_details', mode: 'details' }
      ])
    })
  })

  it('maps Tool, Skill, MCP, Connector, Product Command and Subagent facts into timeline placements', () => {
    const projector = new DshRuntimeEventProjector()

    const capabilityCases: Array<{
      kind: DshRuntimeEventKind
      name: string
      category: string
    }> = [
      {
        kind: 'tool.lifecycle',
        name: 'builtin.files.write',
        category: 'filesystem'
      },
      {
        kind: 'skill.lifecycle',
        name: 'builtin.skills.summarize',
        category: 'skill'
      },
      {
        kind: 'mcp.lifecycle',
        name: 'mcp.docs.search',
        category: 'mcp'
      },
      {
        kind: 'connector.lifecycle',
        name: 'connector.slack.post_message',
        category: 'connector'
      }
    ]

    for (const item of capabilityCases) {
      expect(
        projector.project(
          runtimeEvent({
            kind: item.kind,
            data: {
              lifecycle: 'requested',
              activityId: `${item.category}-activity`,
              capabilityId: item.name,
              capabilityName: item.name,
              inputSummary: '{"password":"must-not-leak"}'
            }
          })
        )
      ).toMatchObject({
        assistantRunEvent: {
          type: 'tool.call.requested',
          data: {
            callId: `${item.category}-activity`,
            toolName: item.name,
            category: item.category,
            argumentsSummary: '{"password":"[redacted]"}'
          }
        },
        placements: expect.arrayContaining([
          { surface: 'assistant_reply_timeline', mode: 'timeline' },
          { surface: 'run_details', mode: 'details' }
        ])
      })
    }

    expect(
      projector.project(
        runtimeEvent({
          kind: 'product_command.completed',
          data: {
            commandId: 'command-1',
            command: 'realmflow.node.answer_question',
            productVersion: 'node-v2',
            resultSummary: 'Node answer saved'
          }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'tool.call.completed',
        data: {
          callId: 'command-1',
          resultSummary: 'Node answer saved'
        }
      },
      placements: expect.arrayContaining([
        { surface: 'product_surface', mode: 'summary' }
      ])
    })

    expect(
      projector.project(
        runtimeEvent({
          kind: 'subagent.lifecycle',
          data: {
            groupId: 'group-1',
            callId: 'delegate-1',
            parentRunId: 'run-1',
            strategy: 'parallel',
            requestedAt: 900,
            children: [
              {
                taskId: 'task-1',
                childRunId: 'child-run-1',
                childSessionId: 'child-session-1',
                ordinal: 1,
                objective: 'Inspect docs',
                status: 'running',
                evidenceCount: 0,
                artifactIds: []
              }
            ]
          }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'delegation.updated',
        data: {
          groupId: 'group-1',
          callId: 'delegate-1',
          parentRunId: 'run-1'
        }
      }
    })
  })

  it('projects interaction, usage, cancellation, error and terminal facts without raw payload leakage', () => {
    const projector = new DshRuntimeEventProjector()

    expect(
      projector.project(
        runtimeEvent({
          kind: 'interaction.requested',
          data: {
            interactionKind: 'permission_approval',
            requestId: 'request-1',
            prompt: 'Allow file write?'
          }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'run.waiting_input',
        data: { reason: 'permission_required' }
      },
      actionableInteraction: {
        requestId: 'request-1',
        interactionKind: 'permission_approval'
      },
      placements: expect.arrayContaining([
        {
          surface: 'human_interaction',
          mode: 'action',
          actionRequired: true
        }
      ])
    })

    expect(
      projector.project(
        runtimeEvent({
          kind: 'model.usage',
          data: {
            inputTokens: 10,
            outputTokens: 4,
            reasoningTokens: 2,
            rawPayload: { token: 'sk-live-secret' }
          }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'execution.summary.delta',
        data: {
          summaryId: 'usage-1',
          delta: 'Usage: 10 input tokens, 4 output tokens, 2 reasoning tokens',
          source: 'system'
        }
      },
      usage: {
        inputTokens: 10,
        outputTokens: 4,
        reasoningTokens: 2
      },
      placements: expect.arrayContaining([
        { surface: 'runtime_governance', mode: 'summary' }
      ])
    })

    expect(
      projector.project(
        runtimeEvent({
          kind: 'runtime.error',
          data: {
            errorCode: 'provider_unavailable',
            message:
              'Failed with apiKey=sk-live-secret at https://secret.example'
          }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'run.failed',
        data: {
          errorCode: 'provider_unavailable',
          message: 'Failed with [redacted] at [url]'
        }
      }
    })

    expect(
      projector.project(
        runtimeEvent({
          kind: 'runtime.cancelled',
          data: { message: 'User stopped the run' }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'run.cancelled',
        data: { message: 'User stopped the run' }
      }
    })

    expect(
      projector.project(
        runtimeEvent({
          kind: 'runtime.completed',
          data: { durationMs: 250 }
        })
      )
    ).toMatchObject({
      assistantRunEvent: {
        type: 'run.completed',
        data: { durationMs: 250 }
      }
    })
  })

  it('projects every DSH interaction kind into the human interaction surface', () => {
    const projector = new DshRuntimeEventProjector()

    for (const [interactionKind, reason] of [
      ['permission_approval', 'permission_required'],
      ['ask_user', 'clarification_required'],
      ['elicitation', 'clarification_required'],
      ['choice', 'clarification_required'],
      ['confirmation', 'clarification_required'],
      ['credential_consent', 'credential_consent_required']
    ] as const) {
      expect(
        projector.project(
          runtimeEvent({
            kind: 'interaction.requested',
            eventId: `event-${interactionKind}`,
            data: {
              interactionKind,
              requestId: `request-${interactionKind}`,
              prompt: `Prompt for ${interactionKind}`
            }
          })
        )
      ).toMatchObject({
        assistantRunEvent: {
          type: 'run.waiting_input',
          data: { reason }
        },
        actionableInteraction: {
          requestId: `request-${interactionKind}`,
          interactionKind,
          prompt: `Prompt for ${interactionKind}`
        },
        placements: expect.arrayContaining([
          {
            surface: 'human_interaction',
            mode: 'action',
            actionRequired: true
          }
        ])
      })
    }
  })

  it('defines at least one UI placement for every DSH runtime event kind', () => {
    for (const kind of DSH_RUNTIME_EVENT_KINDS) {
      expect(runtimeEventPlacementForKind(kind), kind).not.toEqual([])
    }
  })

  it('projects every DSH runtime event kind into a visible or inspectable payload', () => {
    const projector = new DshRuntimeEventProjector()

    for (const kind of DSH_RUNTIME_EVENT_KINDS) {
      const projected = projector.project(
        runtimeEvent({
          kind,
          eventId: `event-${kind.replaceAll('.', '-')}`,
          data: dataForKind(kind)
        })
      )
      expect(
        Boolean(projected.assistantRunEvent) ||
          Boolean(projected.actionableInteraction) ||
          Boolean(projected.governanceFact) ||
          Boolean(projected.usage),
        kind
      ).toBe(true)
    }
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
    kind: 'run.started',
    occurredAt: 1_000,
    data: {},
    ...overrides
  }
}

function dataForKind(kind: DshRuntimeEventKind): DshRuntimeEventEnvelope['data'] {
  switch (kind) {
    case 'model.text_delta':
      return { delta: 'Hello' }
    case 'model.thought_delta':
      return { summaryId: 'thought-1', delta: 'Thinking' }
    case 'model.usage':
      return { inputTokens: 1, outputTokens: 2 }
    case 'tool.lifecycle':
    case 'skill.lifecycle':
    case 'mcp.lifecycle':
    case 'connector.lifecycle':
      return {
        lifecycle: 'requested',
        activityId: `activity-${kind}`,
        capabilityId: `capability-${kind}`,
        inputSummary: '{}'
      }
    case 'subagent.lifecycle':
      return {
        groupId: 'group-1',
        callId: 'delegate-1',
        children: []
      }
    case 'interaction.requested':
      return {
        interactionKind: 'ask_user',
        requestId: 'request-1',
        prompt: 'Need clarification'
      }
    case 'goal.updated':
      return { goalId: 'goal-1', title: 'Goal', status: 'running' }
    case 'retrieval.reference':
      return {
        reference: {
          id: 'reference-1',
          title: 'Reference',
          sourceType: 'knowledge',
          summary: 'Summary'
        }
      }
    case 'runtime.retrying':
      return { attempt: 1, reason: 'provider_timeout' }
    case 'runtime.cancelled':
      return { message: 'Cancelled' }
    case 'runtime.error':
      return { errorCode: 'provider_timeout', message: 'Timed out' }
    case 'runtime.completed':
      return { durationMs: 100 }
    case 'session.closed':
      return { reason: 'user_requested' }
    case 'context.compacted':
      return {
        objectiveCount: 1,
        constraintCount: 1,
        incompleteItemCount: 0,
        sourceCount: 2
      }
    case 'product_command.completed':
      return {
        commandId: 'command-1',
        command: 'realmflow.node.answer_question',
        resultSummary: 'Saved'
      }
    case 'run.started':
    case 'session.resumed':
      return {}
  }
}
