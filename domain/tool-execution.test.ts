import { describe, expect, it } from 'vitest'
import {
  createToolDomainEvent,
  replayToolExecution,
  upcastToolDomainEvent,
  type ToolDomainEvent
} from './tool-execution'

describe('ToolExecution event envelope', () => {
  it('creates a checksummed immutable envelope', () => {
    const payload = {
      executionId: 'execution-1',
      definition: {
        id: 'builtin.files.read',
        version: '1.0.0',
        definitionDigest: 'a'.repeat(64)
      }
    }
    const event = toolEvent(1, 'tool.invocation_requested', payload)
    payload.definition.id = 'changed'

    expect(event).toMatchObject({
      eventId: 'event-1',
      streamId: 'tool-execution-1',
      streamType: 'tool_execution',
      sequence: 1,
      globalPosition: 1,
      eventType: 'tool.invocation_requested',
      eventSchemaVersion: 1,
      payload: {
        executionId: 'execution-1',
        definition: { id: 'builtin.files.read' }
      },
      metadata: {
        correlationId: 'correlation-1',
        causationId: 'command-1',
        commandId: 'command-1',
        actorType: 'local_user',
        actorId: 'user-1',
        occurredAt: 101
      }
    })
    expect(event.payloadChecksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each([
    { label: 'sequence', changes: { sequence: 0 } },
    { label: 'global position', changes: { globalPosition: 0 } },
    { label: 'stream type', changes: { streamType: 'workflow' } },
    {
      label: 'actor type',
      changes: {
        metadata: {
          correlationId: 'correlation-1',
          causationId: 'command-1',
          commandId: 'command-1',
          actorType: 'admin',
          actorId: 'user-1',
          occurredAt: 100
        }
      }
    }
  ])('rejects an invalid $label', ({ changes }) => {
    expect(() =>
      createToolDomainEvent({
        eventId: 'event-1',
        streamId: 'tool-execution-1',
        streamType: 'tool_execution',
        sequence: 1,
        globalPosition: 1,
        eventType: 'tool.invocation_requested',
        eventSchemaVersion: 1,
        payload: { executionId: 'execution-1' },
        metadata: metadata(100),
        ...changes
      } as never)
    ).toThrow(/Tool event/)
  })
})

describe('ToolExecution reducer', () => {
  it('requires planned effects and authorization before dispatch', () => {
    const state = replayToolExecution([
      invocation(1),
      toolEvent(2, 'tool.arguments_validated', {
        argumentsDigest: 'b'.repeat(64)
      }),
      toolEvent(3, 'tool.binding_resolved', {
        adapterKind: 'builtin',
        bindingId: 'binding-1'
      }),
      toolEvent(4, 'tool.effects_planned', {
        effectsDigest: 'c'.repeat(64),
        effectCount: 1
      }),
      toolEvent(5, 'tool.authorization_auto_granted', {
        authorizationIds: ['bound-scope-1'],
        grantIds: []
      }),
      toolEvent(6, 'tool.dispatch_enqueued', {
        dispatchId: 'dispatch-1'
      })
    ])

    expect(state).toMatchObject({
      status: 'queued',
      effects: {
        digest: 'c'.repeat(64),
        count: 1
      },
      permission: {
        outcome: 'authorized',
        grantIds: [],
        authorizationIds: ['bound-scope-1']
      }
    })
  })

  it('replays a successful execution without persisted mutable state', () => {
    const state = replayToolExecution([
      invocation(1),
      toolEvent(2, 'tool.arguments_validated', {
        argumentsDigest: 'b'.repeat(64)
      }),
      toolEvent(3, 'tool.binding_resolved', {
        adapterKind: 'builtin',
        bindingId: 'binding-1'
      }),
      toolEvent(4, 'tool.dispatch_enqueued', {
        dispatchId: 'dispatch-1'
      }),
      toolEvent(5, 'tool.attempt_started', {
        attempt: 1,
        startedAt: 105
      }),
      toolEvent(6, 'tool.progress_reported', {
        attempt: 1,
        completed: 1,
        total: 2,
        message: 'Reading'
      }, 2),
      toolEvent(7, 'tool.output_appended', {
        attempt: 1,
        chunkIndex: 0,
        byteLength: 12
      }),
      toolEvent(8, 'tool.attempt_succeeded', {
        attempt: 1,
        output: { content: 'hello' },
        metrics: { durationMs: 20, outputBytes: 5 },
        finishedAt: 120
      }),
      toolEvent(9, 'tool.completed', { completedAt: 121 })
    ])

    expect(state).toMatchObject({
      executionId: 'execution-1',
      streamId: 'tool-execution-1',
      status: 'succeeded',
      revision: 9,
      argumentsValidated: true,
      binding: {
        adapterKind: 'builtin',
        bindingId: 'binding-1'
      },
      attempts: [
        {
          attempt: 1,
          status: 'succeeded',
          startedAt: 105,
          finishedAt: 120
        }
      ],
      progress: {
        completed: 1,
        total: 2,
        message: 'Reading'
      },
      output: { content: 'hello' },
      metrics: { durationMs: 20, outputBytes: 5 },
      completedAt: 121
    })
  })

  it('replays permission, retry, and cancellation transitions', () => {
    const events = [
      invocation(1),
      toolEvent(2, 'tool.permission_requested', {
        requestIds: ['permission-1']
      }),
      toolEvent(3, 'tool.permission_decided', {
        outcome: 'authorized',
        grantIds: ['grant-1']
      }),
      toolEvent(4, 'tool.dispatch_enqueued', {
        dispatchId: 'dispatch-1'
      }),
      toolEvent(5, 'tool.attempt_started', {
        attempt: 1,
        startedAt: 105
      }),
      toolEvent(6, 'tool.attempt_failed', {
        attempt: 1,
        error: { code: 'adapter_unavailable', message: 'Unavailable' },
        metrics: { durationMs: 5, outputBytes: 0 },
        finishedAt: 110
      }),
      toolEvent(7, 'tool.retry_scheduled', {
        nextAttempt: 2,
        retryAt: 120
      }),
      toolEvent(8, 'tool.attempt_started', {
        attempt: 2,
        startedAt: 120
      }),
      toolEvent(9, 'tool.cancellation_requested', {
        requestedAt: 125
      }),
      toolEvent(10, 'tool.cancel_dispatched', {
        attempt: 2,
        dispatchedAt: 126
      }),
      toolEvent(11, 'tool.cancelled', {
        cancelledAt: 127,
        metrics: { durationMs: 7, outputBytes: 0 }
      })
    ]

    expect(replayToolExecution(events)).toMatchObject({
      status: 'cancelled',
      revision: 11,
      permission: {
        outcome: 'authorized',
        grantIds: ['grant-1']
      },
      attempts: [
        { attempt: 1, status: 'failed' },
        { attempt: 2, status: 'cancelled' }
      ],
      cancellationRequestedAt: 125,
      completedAt: 127
    })
  })

  it('replays recovery into an interrupted terminal state', () => {
    expect(
      replayToolExecution([
        invocation(1),
        toolEvent(2, 'tool.dispatch_enqueued', {
          dispatchId: 'dispatch-1'
        }),
        toolEvent(3, 'tool.recovery_started', { recoveredAt: 200 }),
        toolEvent(4, 'tool.interrupted', {
          interruptedAt: 201,
          error: {
            code: 'execution_interrupted',
            message: 'Application restarted'
          }
        })
      ])
    ).toMatchObject({
      status: 'interrupted',
      recoveryStartedAt: 200,
      completedAt: 201
    })
  })

  it.each([
    {
      name: 'event before invocation',
      events: [
        toolEvent(1, 'tool.dispatch_enqueued', { dispatchId: 'dispatch-1' })
      ]
    },
    {
      name: 'sequence gap',
      events: [invocation(1), invocation(3)]
    },
    {
      name: 'second active attempt',
      events: [
        invocation(1),
        toolEvent(2, 'tool.dispatch_enqueued', {
          dispatchId: 'dispatch-1'
        }),
        toolEvent(3, 'tool.attempt_started', {
          attempt: 1,
          startedAt: 103
        }),
        toolEvent(4, 'tool.attempt_started', {
          attempt: 2,
          startedAt: 104
        })
      ]
    },
    {
      name: 'event after terminal state',
      events: [
        invocation(1),
        toolEvent(2, 'tool.failed', {
          failedAt: 102,
          error: { code: 'permission_denied', message: 'Denied' }
        }),
        toolEvent(3, 'tool.dispatch_enqueued', {
          dispatchId: 'dispatch-1'
        })
      ]
    },
    {
      name: 'mixed streams',
      events: [
        invocation(1),
        toolEvent(
          2,
          'tool.dispatch_enqueued',
          { dispatchId: 'dispatch-1' },
          1,
          'other-stream'
        )
      ]
    }
  ])('rejects $name', ({ events }) => {
    expect(() => replayToolExecution(events)).toThrow(/Tool execution/)
  })
})

describe('Tool event upcaster', () => {
  it('upcasts progress v1 percent into the current bounded progress payload', () => {
    const legacy = toolEvent(
      6,
      'tool.progress_reported',
      { attempt: 1, percent: 25, message: 'Reading' },
      1
    )
    const current = upcastToolDomainEvent(legacy)

    expect(current.eventSchemaVersion).toBe(2)
    expect(current.payload).toEqual({
      attempt: 1,
      completed: 25,
      total: 100,
      message: 'Reading'
    })
    expect(current.payloadChecksum).toBe(legacy.payloadChecksum)
  })

  it('rejects unknown future event versions', () => {
    expect(() =>
      upcastToolDomainEvent(
        toolEvent(
          1,
          'tool.progress_reported',
          { attempt: 1 },
          3
        )
      )
    ).toThrow('Tool event schema version is unsupported')
  })
})

function invocation(sequence: number): ToolDomainEvent {
  return toolEvent(sequence, 'tool.invocation_requested', {
    executionId: 'execution-1',
    definition: {
      id: 'builtin.files.read',
      version: '1.0.0',
      definitionDigest: 'a'.repeat(64)
    }
  })
}

function toolEvent(
  sequence: number,
  eventType: string,
  payload: Record<string, unknown>,
  eventSchemaVersion = 1,
  streamId = 'tool-execution-1'
): ToolDomainEvent {
  return createToolDomainEvent({
    eventId: `event-${sequence}`,
    streamId,
    streamType: 'tool_execution',
    sequence,
    globalPosition: sequence,
    eventType,
    eventSchemaVersion,
    payload,
    metadata: metadata(100 + sequence)
  })
}

function metadata(occurredAt: number) {
  return {
    correlationId: 'correlation-1',
    causationId: 'command-1',
    commandId: 'command-1',
    actorType: 'local_user' as const,
    actorId: 'user-1',
    occurredAt
  }
}
