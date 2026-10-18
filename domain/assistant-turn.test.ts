import {
  AssistantTurnProjectionError,
  createAssistantTurnProjection as createProjection,
  projectAssistantTurn,
  summarizeToolCalls,
  type AssistantRunEvent
} from './assistant-turn'

function createAssistantTurnProjection(
  input: Omit<Parameters<typeof createProjection>[0], 'turnId'> & {
    turnId?: string
  }
) {
  return createProjection({ turnId: 'turn-1', ...input })
}

describe('AssistantTurnProjection', () => {
  it('creates a V2 projection owned by one Turn with an empty display tree', () => {
    const projection = createAssistantTurnProjection({
      runId: 'run-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    } as Parameters<typeof createAssistantTurnProjection>[0])

    expect(projection).toMatchObject({
      schemaVersion: 2,
      runId: 'run-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      tree: [],
      collapsedDefaults: []
    })
  })

  it('builds a stable progress-command-tool tree while Tool state changes', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    } as Parameters<typeof createAssistantTurnProjection>[0])
    projection = projectAssistantTurn(
      projection,
      assistantEvent(1, 'execution.summary.delta', {
        summaryId: 'reasoning-1',
        delta: '准备执行命令',
        source: 'system'
      })
    )
    projection = projectAssistantTurn(
      projection,
      assistantEvent(2, 'tool.call.requested', {
        callId: 'call-1',
        toolName: 'process.run',
        category: 'command',
        argumentsSummary: 'npm test'
      })
    )
    const requestedTree = projection.tree
    projection = projectAssistantTurn(
      projection,
      assistantEvent(3, 'tool.call.started', {
        callId: 'call-1',
        toolExecutionId: 'execution-1'
      })
    )

    expect(projection.tree).toEqual([
      expect.objectContaining({
        id: 'progress',
        kind: 'execution_group',
        order: 1,
        groupType: 'progress',
        children: [
          expect.objectContaining({
            id: 'reasoning:reasoning-1',
            kind: 'reasoning',
            order: 1,
            content: '准备执行命令'
          }),
          expect.objectContaining({
            id: 'activity:2',
            kind: 'execution_group',
            order: 2,
            groupType: 'command',
            children: [
              expect.objectContaining({
                id: 'tool:call-1',
                kind: 'tool_call',
                order: 2,
                toolCall: expect.objectContaining({
                  callId: 'call-1',
                  status: 'running'
                })
              })
            ]
          })
        ]
      })
    ])
    expect(projection.tree[0]?.id).toBe(requestedTree[0]?.id)
    expect(
      projection.tree[0]?.kind === 'execution_group'
        ? projection.tree[0].children[1]?.id
        : undefined
    ).toBe('activity:2')
  })

  it('keeps adjacent Tool calls in chronological segments separated by reasoning', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    for (const event of [
      assistantEvent(1, 'execution.summary.delta', {
        summaryId: 'reasoning-1',
        delta: '先检查现状',
        source: 'system'
      }),
      assistantEvent(2, 'tool.call.requested', {
        callId: 'call-1',
        toolName: 'builtin.files.read',
        category: 'filesystem',
        argumentsSummary: '{"path":"src/a.ts"}'
      }),
      assistantEvent(3, 'tool.call.requested', {
        callId: 'call-2',
        toolName: 'process.run',
        category: 'command',
        argumentsSummary: '{"command":"npm test"}'
      }),
      assistantEvent(4, 'execution.summary.delta', {
        summaryId: 'reasoning-2',
        delta: '再修复问题',
        source: 'system'
      }),
      assistantEvent(5, 'tool.call.requested', {
        callId: 'call-3',
        toolName: 'builtin.files.write',
        category: 'filesystem',
        argumentsSummary: '{"path":"src/a.ts"}'
      })
    ] satisfies AssistantRunEvent[]) {
      projection = projectAssistantTurn(projection, event)
    }

    expect(projection.tree).toEqual([
      expect.objectContaining({
        id: 'progress',
        children: [
          expect.objectContaining({ id: 'reasoning:reasoning-1' }),
          expect.objectContaining({
            id: 'activity:2',
            kind: 'execution_group',
            children: [
              expect.objectContaining({ id: 'tool:call-1' }),
              expect.objectContaining({ id: 'tool:call-2' })
            ]
          }),
          expect.objectContaining({ id: 'reasoning:reasoning-2' }),
          expect.objectContaining({
            id: 'activity:5',
            kind: 'execution_group',
            children: [
              expect.objectContaining({ id: 'tool:call-3' })
            ]
          })
        ]
      })
    ])
  })

  it('completes the formal answer and appends a Finish node that only references its Message', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    } as Parameters<typeof createAssistantTurnProjection>[0])
    projection = projectAssistantTurn(
      projection,
      assistantEvent(1, 'answer.completed' as AssistantRunEvent['type'], {
        content: '最终回答'
      } as never)
    )

    expect(projection.answer).toBe('最终回答')
    expect(projection.tree).toEqual([
      {
        id: 'finish:assistant-1',
        kind: 'finish',
        order: 1,
        answerMessageId: 'assistant-1'
      }
    ])
    expect(JSON.stringify(projection.tree)).not.toContain('最终回答')
  })

  it('degrades an unknown future event to a safe diagnostic notification', () => {
    const projection = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: 'run-1',
        turnId: 'turn-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      } as Parameters<typeof createAssistantTurnProjection>[0]),
      {
        id: 'future-event',
        runId: 'run-1',
        sequence: 1,
        type: 'provider.future_event',
        timestamp: 101,
        data: { secret: 'must-not-be-projected' }
      } as unknown as AssistantRunEvent
    )

    expect(projection.tree).toEqual([
      {
        id: 'notification:future-event',
        kind: 'notification',
        order: 1,
        level: 'warning',
        message: 'Unsupported assistant event',
        diagnosticId: 'future-event'
      }
    ])
    expect(JSON.stringify(projection)).not.toContain('must-not-be-projected')
  })

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

  it('preserves failed Tool attempts when the same call is retried and later succeeds', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    for (const event of [
      assistantEvent(1, 'tool.call.requested', {
        callId: 'call-1',
        toolName: 'files.stat',
        category: 'filesystem',
        argumentsSummary: '[local path]/missing.md'
      }),
      assistantEvent(2, 'tool.call.started', {
        callId: 'call-1',
        toolExecutionId: 'execution-1'
      }),
      assistantEvent(3, 'tool.call.failed', {
        callId: 'call-1',
        toolExecutionId: 'execution-1',
        errorCode: 'tool_timeout',
        message: 'Tool execution timed out',
        diagnosticId: 'toolerr_01'
      }),
      assistantEvent(4, 'tool.call.started', {
        callId: 'call-1',
        toolExecutionId: 'execution-2'
      }),
      assistantEvent(5, 'tool.call.completed', {
        callId: 'call-1',
        toolExecutionId: 'execution-2',
        resultSummary: 'Stat succeeded'
      })
    ] satisfies AssistantRunEvent[]) {
      projection = projectAssistantTurn(projection, event)
    }

    expect(projection.toolCalls).toEqual([
      expect.objectContaining({
        callId: 'call-1',
        toolExecutionId: 'execution-2',
        status: 'completed',
        attempt: 2,
        resultSummary: 'Stat succeeded',
        attempts: [
          {
            attempt: 1,
            status: 'failed',
            toolExecutionId: 'execution-1',
            errorCode: 'tool_timeout',
            error: 'Tool execution timed out',
            diagnosticId: 'toolerr_01',
            startedAt: 102,
            completedAt: 103
          }
        ]
      })
    ])
    expect(projection.toolCalls[0].errorCode).toBeUndefined()
    expect(projection.toolCalls[0].error).toBeUndefined()
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

  it('projects durable child lineage as a stable recursive sub-agent group', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    projection = projectAssistantTurn(
      projection,
      assistantEvent(1, 'delegation.updated' as AssistantRunEvent['type'], {
        groupId: 'delegation:delegate-1',
        callId: 'delegate-1',
        parentRunId: 'run-1',
        strategy: 'parallel',
        requestedAt: 101,
        children: [
          {
            taskId: 'tests',
            childRunId: 'child-2',
            childSessionId: 'session-2',
            ordinal: 2,
            agentId: 'builtin.general',
            agentName: 'General',
            objective: 'Inspect tests',
            status: 'failed',
            resultSummary: 'Provider failed',
            evidenceCount: 0,
            artifactIds: [],
            startedAt: 102,
            completedAt: 104,
            errorCode: 'provider_rejected',
            tree: [
              {
                id: 'child-2-error',
                kind: 'notification',
                order: 1,
                level: 'error',
                message: 'Provider failed'
              }
            ]
          },
          {
            taskId: 'docs',
            childRunId: 'child-1',
            childSessionId: 'session-1',
            ordinal: 1,
            agentId: 'builtin.general',
            agentName: 'General',
            objective: 'Inspect docs',
            status: 'completed',
            resultSummary: 'Docs summary',
            evidenceCount: 1,
            artifactIds: ['artifact-1'],
            startedAt: 102,
            completedAt: 103,
            tree: [
              {
                id: 'finish:child-1:assistant',
                kind: 'finish',
                order: 1,
                answerMessageId: 'child-1:assistant'
              }
            ]
          }
        ]
      } as never)
    )

    expect(projection.tree).toEqual([
      expect.objectContaining({
        id: 'progress',
        kind: 'execution_group',
        children: [
          expect.objectContaining({
            id: 'sub_agent',
            kind: 'execution_group',
            groupType: 'sub_agent',
            children: [
              expect.objectContaining({
                id: 'sub-agent-group:delegation:delegate-1',
                kind: 'sub_agent_group',
                group: expect.objectContaining({
                  status: 'partial',
                  children: [
                    expect.objectContaining({
                      taskId: 'docs',
                      childRunId: 'child-1',
                      childSessionId: 'session-1',
                      ordinal: 1,
                      tree: [
                        expect.objectContaining({
                          kind: 'finish',
                          answerMessageId: 'child-1:assistant'
                        })
                      ]
                    }),
                    expect.objectContaining({
                      taskId: 'tests',
                      childRunId: 'child-2',
                      childSessionId: 'session-2',
                      ordinal: 2,
                      tree: [
                        expect.objectContaining({
                          kind: 'notification',
                          level: 'error'
                        })
                      ]
                    })
                  ]
                })
              })
            ]
          })
        ]
      })
    ])
  })

  it('projects ordered Todo updates into a recursive Todo execution group', () => {
    let projection = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    projection = projectAssistantTurn(
      projection,
      assistantEvent(1, 'todo.updated' as AssistantRunEvent['type'], {
        todoId: 'plan-1',
        title: 'Implementation plan',
        items: [
          {
            id: 'verify',
            ordinal: 2,
            title: 'Verify UI',
            status: 'pending',
            children: []
          },
          {
            id: 'implement',
            ordinal: 1,
            title: 'Implement projection',
            status: 'completed',
            children: [
              {
                id: 'tool:write',
                kind: 'tool_call',
                order: 1,
                toolCall: toolCall('write', 'filesystem'),
                view: { type: 'file', title: 'filesystem.write' }
              }
            ]
          }
        ]
      } as never)
    )

    expect(projection.tree).toEqual([
      expect.objectContaining({
        id: 'progress',
        kind: 'execution_group',
        children: [
          expect.objectContaining({
            id: 'todo',
            kind: 'execution_group',
            groupType: 'todo',
            children: [
              expect.objectContaining({
                id: 'todo-group:plan-1',
                kind: 'todo_group',
                todo: expect.objectContaining({
                  status: 'running',
                  items: [
                    expect.objectContaining({
                      id: 'implement',
                      ordinal: 1,
                      children: [expect.objectContaining({ kind: 'tool_call' })]
                    }),
                    expect.objectContaining({
                      id: 'verify',
                      ordinal: 2
                    })
                  ]
                })
              })
            ]
          })
        ]
      })
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

  it('preserves provider retry metadata on terminal rate-limit failures', () => {
    const projection = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      assistantEvent(1, 'run.failed', {
        message: 'Provider request failed',
        errorCode: 'provider_rate_limited',
        retryCount: 1,
        retryAfterMs: 5_000,
        remainingAttempts: 0
      })
    )

    expect(projection).toMatchObject({
      status: 'failed',
      error: 'Provider request failed',
      recovery: {
        reason: 'provider_rate_limited',
        attempt: 1,
        nextRetryAt: 5_101,
        remainingAttempts: 0
      }
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
