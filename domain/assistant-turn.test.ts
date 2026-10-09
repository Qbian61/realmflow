import {
  AssistantTurnProjectionError,
  createAssistantTurnProjection,
  projectAssistantTurn,
  summarizeToolCalls,
  type AssistantRunEvent
} from './assistant-turn'

describe('AssistantTurnProjection', () => {
  it('projects answer, summaries, references, and a complete Tool lifecycle', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    for (const event of [
      assistantEvent(1, 'execution.summary.delta', {
        summaryId: 'summary-1',
        delta: '正在检索',
        source: 'system'
      }),
      assistantEvent(2, 'reference.added', {
        reference: {
          id: 'reference-1',
          title: 'RealmFlow 设计',
          sourceType: 'local_file',
          location: 'docs/design.md',
          summary: '设计约束'
        }
      }),
      assistantEvent(3, 'tool.call.requested', {
        callId: 'call-1',
        toolName: 'web.search',
        category: 'web_search',
        argumentsSummary: 'RealmFlow'
      }),
      assistantEvent(4, 'tool.call.started', {
        callId: 'call-1',
        toolExecutionId: 'execution-1'
      }),
      assistantEvent(5, 'tool.call.progress', {
        callId: 'call-1',
        summary: '已检索 3 个网页'
      }),
      assistantEvent(6, 'tool.call.completed', {
        callId: 'call-1',
        toolExecutionId: 'execution-1',
        resultSummary: '找到 3 条结果'
      }),
      assistantEvent(7, 'answer.delta', { delta: '最终回答' }),
      assistantEvent(8, 'run.completed', {})
    ] satisfies AssistantRunEvent[]) {
      projection = projectAssistantTurn(projection, event)
    }

    expect(projection).toMatchObject({
      status: 'completed',
      answer: '最终回答',
      lastSequence: 8,
      completedAt: 108,
      executionSummaries: [{ id: 'summary-1', content: '正在检索' }],
      references: [{ id: 'reference-1', title: 'RealmFlow 设计' }],
      toolCalls: [
        {
          callId: 'call-1',
          toolExecutionId: 'execution-1',
          status: 'completed',
          progressSummary: '已检索 3 个网页',
          resultSummary: '找到 3 条结果'
        }
      ]
    })
  })

  it('ignores duplicate events but rejects a sequence gap', () => {
    const initial = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    const first = projectAssistantTurn(
      initial,
      assistantEvent(1, 'answer.delta', { delta: 'A' })
    )

    expect(
      projectAssistantTurn(
        first,
        assistantEvent(1, 'answer.delta', { delta: 'duplicate' })
      )
    ).toBe(first)
    expect(() =>
      projectAssistantTurn(
        first,
        assistantEvent(3, 'run.completed', {})
      )
    ).toThrowError(
      new AssistantTurnProjectionError('sequence_gap', 2, 3)
    )
  })

  it('keeps terminal projections immutable', () => {
    const completed = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      assistantEvent(1, 'run.completed', {})
    )

    expect(() =>
      projectAssistantTurn(
        completed,
        assistantEvent(2, 'answer.delta', { delta: 'late' })
      )
    ).toThrow(/terminal/)
  })

  it('updates one Tool card across permission wait and completion', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    for (const event of [
      assistantEvent(1, 'tool.call.requested', {
        callId: 'call-1',
        toolName: 'filesystem.write',
        category: 'filesystem',
        argumentsSummary: '[local path]/design.md'
      }),
      assistantEvent(2, 'tool.call.permission_required', {
        callId: 'call-1',
        toolExecutionId: 'execution-1',
        message: '需要文件写入权限'
      })
    ] satisfies AssistantRunEvent[]) {
      projection = projectAssistantTurn(projection, event)
    }
    expect(projection).toMatchObject({
      status: 'waiting_permission',
      elapsedAt: 102
    })

    for (const event of [
      assistantEvent(3, 'tool.call.started', {
        callId: 'call-1',
        toolExecutionId: 'execution-1'
      }),
      assistantEvent(4, 'tool.call.completed', {
        callId: 'call-1',
        toolExecutionId: 'execution-1',
        resultSummary: '已写入'
      })
    ] satisfies AssistantRunEvent[]) {
      projection = projectAssistantTurn(projection, event)
    }

    expect(projection.status).toBe('running')
    expect(projection.elapsedAt).toBeUndefined()
    expect(projection.toolCalls).toHaveLength(1)
    expect(projection.toolCalls[0]).toMatchObject({
      callId: 'call-1',
      status: 'completed'
    })
  })

  it('freezes elapsed time and settles unresolved Tool calls when input is required', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    for (const event of [
      assistantEvent(1, 'tool.call.requested', {
        callId: 'call-requested',
        toolName: 'process.run',
        category: 'command',
        argumentsSummary: 'pwd'
      }),
      assistantEvent(2, 'tool.call.requested', {
        callId: 'call-running',
        toolName: 'process.run',
        category: 'command',
        argumentsSummary: 'convert'
      }),
      assistantEvent(3, 'tool.call.started', {
        callId: 'call-running',
        toolExecutionId: 'execution-running'
      }),
      assistantEvent(4, 'run.waiting_input', {
        reason: 'consecutive_tool_failures'
      })
    ] satisfies AssistantRunEvent[]) {
      projection = projectAssistantTurn(projection, event)
    }

    expect(projection).toMatchObject({
      status: 'waiting_input',
      elapsedAt: 104,
      toolCalls: [
        {
          callId: 'call-requested',
          status: 'failed',
          completedAt: 104,
          errorCode: 'run_suspended'
        },
        {
          callId: 'call-running',
          status: 'failed',
          completedAt: 104,
          errorCode: 'run_suspended'
        }
      ]
    })

    projection = projectAssistantTurn(
      projection,
      assistantEvent(5, 'run.resumed', {})
    )
    expect(projection.status).toBe('running')
    expect(projection.elapsedAt).toBeUndefined()

    projection = projectAssistantTurn(
      projection,
      assistantEvent(6, 'tool.call.started', {
        callId: 'call-running',
        toolExecutionId: 'execution-resumed'
      })
    )
    projection = projectAssistantTurn(
      projection,
      assistantEvent(7, 'tool.call.completed', {
        callId: 'call-running',
        toolExecutionId: 'execution-resumed',
        resultSummary: 'Completed after resume'
      })
    )
    expect(projection.toolCalls[1]).toMatchObject({
      status: 'completed',
      resultSummary: 'Completed after resume'
    })
    expect(projection.toolCalls[1].errorCode).toBeUndefined()
    expect(projection.toolCalls[1].error).toBeUndefined()
  })

  it('projects one delegation from requested tasks to a partial aggregate', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    projection = projectAssistantTurn(
      projection,
      assistantEvent(1, 'tool.call.requested', {
        callId: 'delegate-1',
        toolName: 'rf_delegate_research',
        category: 'agent',
        argumentsSummary: '2 research tasks',
        delegation: {
          tasks: [
            { taskId: 'docs', objective: 'Inspect docs' },
            { taskId: 'tests', objective: 'Inspect tests' }
          ]
        }
      })
    )
    projection = projectAssistantTurn(
      projection,
      assistantEvent(2, 'tool.call.completed', {
        callId: 'delegate-1',
        toolExecutionId: 'delegation:delegate-1',
        resultSummary: 'Delegated 2 research tasks',
        delegation: {
          status: 'partial',
          tasks: [
            {
              taskId: 'docs',
              status: 'completed',
              summary: 'Docs summary',
              evidence: [
                {
                  title: 'Design',
                  summary: 'Relevant design',
                  referenceId: 'reference-1'
                }
              ],
              unresolved: [],
              artifactIds: []
            },
            {
              taskId: 'tests',
              status: 'failed',
              summary: 'Provider failed',
              evidence: [],
              unresolved: ['Retry later'],
              artifactIds: [],
              errorCode: 'provider_rejected'
            }
          ]
        }
      })
    )

    expect(projection.delegations).toEqual([
      {
        callId: 'delegate-1',
        status: 'partial',
        requestedAt: 101,
        tasks: [
          {
            taskId: 'docs',
            objective: 'Inspect docs',
            status: 'completed',
            summary: 'Docs summary',
            evidenceCount: 1
          },
          {
            taskId: 'tests',
            objective: 'Inspect tests',
            status: 'failed',
            summary: 'Provider failed',
            evidenceCount: 0,
            errorCode: 'provider_rejected'
          }
        ],
        completedAt: 102
      }
    ])
  })

  it('aggregates Tool calls by explicit category', () => {
    expect(
      summarizeToolCalls([
        toolCall('one', 'web_search'),
        toolCall('two', 'web_search'),
        toolCall('three', 'command')
      ])
    ).toEqual([
      { category: 'web_search', count: 2 },
      { category: 'command', count: 1 }
    ])
  })

  it('projects retry, pause, input wait, compaction, and recovery blocking', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    for (const event of [
      assistantEvent(1, 'run.retrying', {
        attempt: 2,
        reason: 'provider_rate_limited',
        nextRetryAt: 5_000
      }),
      assistantEvent(2, 'run.resumed', {}),
      assistantEvent(3, 'context.compacted', {
        objectiveCount: 1,
        constraintCount: 2,
        incompleteItemCount: 1,
        sourceCount: 5
      }),
      assistantEvent(4, 'run.paused', { reason: 'user_requested' }),
      assistantEvent(5, 'run.resumed', {}),
      assistantEvent(6, 'run.waiting_input', {
        reason: 'clarification_required'
      }),
      assistantEvent(7, 'run.resumed', {}),
      assistantEvent(8, 'run.recovery_blocked', {
        reason: 'capability_unavailable',
        actions: ['resume', 'branch', 'cancel']
      })
    ] satisfies AssistantRunEvent[]) {
      projection = projectAssistantTurn(projection, event)
    }

    expect(projection).toMatchObject({
      status: 'recovery_blocked',
      elapsedAt: 108,
      recovery: {
        reason: 'capability_unavailable',
        actions: ['resume', 'branch', 'cancel']
      },
      compactions: [
        {
          objectiveCount: 1,
          constraintCount: 2,
          incompleteItemCount: 1,
          sourceCount: 5,
          compactedAt: 103
        }
      ],
      lastSequence: 8
    })
  })
})

function assistantEvent<T extends AssistantRunEvent['type']>(
  sequence: number,
  type: T,
  data: Extract<AssistantRunEvent, { type: T }>['data']
): Extract<AssistantRunEvent, { type: T }> {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    timestamp: 100 + sequence,
    data
  } as Extract<AssistantRunEvent, { type: T }>
}

function toolCall(
  callId: string,
  category: 'web_search' | 'command'
) {
  return {
    callId,
    toolName: callId,
    category,
    status: 'requested' as const,
    argumentsSummary: '',
    requestedAt: 1
  }
}
