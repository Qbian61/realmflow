import type { AiRunEvent } from '../../../../domain/ai-run'
import {
  createAssistantTurnProjection as createProjection
} from '../../../../domain/assistant-turn'
import {
  projectConversationRunEvent,
  summarizeToolArguments,
  toAssistantRunEvent
} from './assistant-turn-projector'

function createAssistantTurnProjection(
  input: Omit<Parameters<typeof createProjection>[0], 'turnId'> & {
    turnId?: string
  }
) {
  return createProjection({ turnId: 'turn-1', ...input })
}

describe('assistant turn projector', () => {
  it('normalizes a provider Finish Tool result to a formal answer and Finish node', () => {
    let current = createAssistantTurnProjection({
      runId: 'run-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    } as Parameters<typeof createAssistantTurnProjection>[0])
    current = projectConversationRunEvent(
      current,
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'finish-1',
          name: 'finish',
          arguments: JSON.stringify({ summary: '最终回答' })
        }
      })
    )!
    current = projectConversationRunEvent(
      current,
      aiEvent(2, 'tool.call.completed', {
        toolResult: {
          callId: 'finish-1',
          status: 'completed',
          output: { summary: '最终回答' },
          toolExecutionId: 'execution-finish-1'
        }
      })
    )!

    expect(current.answer).toBe('最终回答')
    expect(current.toolCalls).toEqual([])
    expect(current.tree).toEqual([
      {
        id: 'finish:assistant-1',
        kind: 'finish',
        order: 2,
        answerMessageId: 'assistant-1'
      }
    ])
  })

  it('maps a requested Tool call to an explicit category with redacted arguments', () => {
    const current = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    const projected = projectConversationRunEvent(
      current,
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-1',
          name: 'rf_builtin_web_search_12345678',
          arguments: JSON.stringify({
            query: 'RealmFlow',
            authorization: 'Bearer secret',
            path: '/Users/alice/private/design.md'
          })
        }
      })
    )

    expect(projected?.toolCalls[0]).toMatchObject({
      callId: 'call-1',
      category: 'web_search',
      argumentsSummary: expect.stringContaining('[REDACTED]')
    })
    expect(projected?.toolCalls[0].argumentsSummary).not.toContain('secret')
    expect(projected?.toolCalls[0].argumentsSummary).not.toContain(
      '/Users/alice'
    )
  })

  it('classifies model Skill calls separately from ordinary Tools', () => {
    const projected = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-skill',
        startedAt: 100
      }),
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-skill',
          name: 'rf_skill_builtin_skill_code_review_abcdef12',
          arguments: '{}'
        }
      })
    )

    expect(projected?.toolCalls[0]).toMatchObject({
      callId: 'call-skill',
      category: 'skill'
    })
  })

  it('advances projection sequence for filtered Tool result events', () => {
    let current = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-1',
          name: 'rf_builtin_files_list_b80a4b75',
          arguments: '{}'
        }
      })
    )!

    current = projectConversationRunEvent(
      current,
      aiEvent(2, 'tool.call.completed', {})
    )!

    expect(current.lastSequence).toBe(2)
    expect(() =>
      projectConversationRunEvent(current, aiEvent(3, 'run.completed', {}))
    ).not.toThrow()
  })

  it('projects a standard Tool permission wait event instead of a heartbeat', () => {
    let current = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-1',
          name: 'rf_builtin_process_run_12345678',
          arguments: '{"executable":"python3","arguments":["-c","print(1)"],"cwd":"."}'
        }
      })
    )!

    current = projectConversationRunEvent(
      current,
      aiEvent(2, 'tool.call.permission_required', {
        callId: 'call-1',
        requestId: 'permission-1',
        toolExecutionId: 'execution-1'
      })
    )!

    expect(current).toMatchObject({
      status: 'waiting_permission',
      lastSequence: 2,
      toolCalls: [
        {
          callId: 'call-1',
          toolExecutionId: 'execution-1',
          status: 'waiting_permission'
        }
      ]
    })
  })

  it('projects DSH direct tool call and result fields instead of heartbeats', () => {
    let current = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      aiEvent(1, 'tool.call.requested', {
        callId: 'call-dsh-1',
        toolName: 'bash',
        category: 'command',
        argumentsSummary: '{"command":"pwd"}'
      })
    )!

    current = projectConversationRunEvent(
      current,
      aiEvent(2, 'tool.call.completed', {
        callId: 'call-dsh-1',
        toolExecutionId: 'job-dsh-1',
        resultSummary: '/workspace/one'
      })
    )!

    expect(current).toMatchObject({
      lastSequence: 2,
      toolCalls: [
        {
          callId: 'call-dsh-1',
          toolName: 'bash',
          category: 'command',
          status: 'completed',
          resultSummary: '/workspace/one'
        }
      ]
    })
  })

  it('maps delegation arguments and results without exposing child transcripts', () => {
    let current = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-delegation',
      startedAt: 100
    })
    current = projectConversationRunEvent(
      current,
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'delegate-1',
          name: 'rf_delegate_research',
          arguments: JSON.stringify({
            tasks: [
              {
                id: 'docs',
                objective: 'Inspect /Users/alice/private docs',
                completionCriteria: ['Summarize docs'],
                maxToolCalls: 2,
                resultFormat: 'research_summary'
              }
            ]
          })
        }
      })
    )!
    const projected = projectConversationRunEvent(
      current,
      aiEvent(2, 'tool.call.completed', {
        toolResult: {
          callId: 'delegate-1',
          status: 'completed',
          output: {
            status: 'completed',
            tasks: [
              {
                taskId: 'docs',
                childRunId: 'child-docs',
                childSessionId: 'session-docs',
                ordinal: 1,
                agentId: 'builtin.general',
                agentName: 'General',
                status: 'completed',
                summary: 'Found token=secret at /tmp/private/file',
                evidence: [],
                unresolved: [],
                artifactIds: ['artifact-1'],
                startedAt: 101,
                completedAt: 102
              }
            ],
            rawChildTranscript: 'must never be projected'
          },
          toolExecutionId: 'delegation:delegate-1',
          resultSummary: 'Delegated 1 research task'
        }
      })
    )

    expect(projected?.toolCalls[0].category).toBe('agent')
    expect(projected?.delegations[0]).toMatchObject({
      status: 'completed',
      tasks: [
        {
          taskId: 'docs',
          objective: 'Inspect [local path] docs',
          summary: 'Found [REDACTED] at [local path]',
          childRunId: 'child-docs',
          childSessionId: 'session-docs',
          ordinal: 1
        }
      ]
    })
    expect(projected?.tree).toEqual([
      expect.objectContaining({
        id: 'progress',
        children: [
          expect.objectContaining({
            id: 'sub_agent',
            children: [
              expect.objectContaining({
                kind: 'sub_agent_group',
                group: expect.objectContaining({
                  status: 'completed',
                  children: [
                    expect.objectContaining({
                      childRunId: 'child-docs',
                      childSessionId: 'session-docs',
                      ordinal: 1,
                      tree: [
                        expect.objectContaining({
                          kind: 'finish',
                          answerMessageId: 'child-docs:assistant'
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
    expect(JSON.stringify(projected)).not.toContain('rawChildTranscript')
    expect(JSON.stringify(projected)).not.toContain('/Users/alice')
    expect(JSON.stringify(projected)).not.toContain('token=secret')
  })

  it('projects DSH delegation update run events into Sub-agents display nodes', () => {
    const projected = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-subagent',
        startedAt: 100
      }),
      aiEvent(1, 'delegation.updated' as AiRunEvent['type'], {
        groupId: 'subagent:call-subagent-1',
        callId: 'call-subagent-1',
        parentRunId: 'run-1',
        strategy: 'parallel',
        requestedAt: 101,
        children: [
          {
            taskId: 'child-session-1',
            childRunId: 'child-session-1',
            childSessionId: 'child-session-1',
            ordinal: 1,
            agentId: 'builtin.general',
            agentName: 'General',
            objective: 'Inspect workspace',
            status: 'running',
            evidenceCount: 0,
            artifactIds: [],
            tree: []
          }
        ]
      } as AiRunEvent['data'])
    )

    expect(projected?.tree).toEqual([
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
                id: 'sub-agent-group:subagent:call-subagent-1',
                kind: 'sub_agent_group',
                group: expect.objectContaining({
                  status: 'running',
                  children: [
                    expect.objectContaining({
                      taskId: 'child-session-1',
                      objective: 'Inspect workspace',
                      status: 'running'
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

  it('normalizes ordered Todo events into the recursive Todo display tree', () => {
    const projected = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-todo',
        startedAt: 100
      }),
      aiEvent(1, 'todo.updated' as AiRunEvent['type'], {
        todo: {
          todoId: 'plan-1',
          title: 'Implementation plan',
          items: [
            {
              id: 'verify',
              ordinal: 2,
              title: 'Verify',
              status: 'pending',
              children: []
            },
            {
              id: 'implement',
              ordinal: 1,
              title: 'Implement',
              status: 'completed',
              children: []
            }
          ]
        }
      } as AiRunEvent['data'])
    )

    expect(projected?.tree).toEqual([
      expect.objectContaining({
        id: 'progress',
        children: [
          expect.objectContaining({
            id: 'todo',
            children: [
              expect.objectContaining({
                kind: 'todo_group',
                todo: expect.objectContaining({
                  status: 'running',
                  items: [
                    expect.objectContaining({ id: 'implement', ordinal: 1 }),
                    expect.objectContaining({ id: 'verify', ordinal: 2 })
                  ]
                })
              })
            ]
          })
        ]
      })
    ])
  })

  it('projects useful Tool output while redacting sensitive fields', () => {
    let current = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    current = projectConversationRunEvent(
      current,
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-1',
          name: 'rf_builtin_shell_12345678',
          arguments: '{"command":"pwd"}'
        }
      })
    )!
    const projected = projectConversationRunEvent(
      current,
      aiEvent(2, 'tool.call.completed', {
        toolResult: {
          callId: 'call-1',
          status: 'completed',
          output: { credential: 'raw-secret', stdout: 'very long output' }
        },
        toolExecutionId: 'execution-1',
        resultSummary: '命令执行完成'
      })
    )

    expect(JSON.stringify(projected)).not.toContain('raw-secret')
    expect(JSON.stringify(projected)).not.toContain('credential')
    expect(projected?.toolCalls[0]).toMatchObject({
      toolExecutionId: 'execution-1',
      resultSummary: 'very long output',
      status: 'completed'
    })
  })

  it('settles active Tool calls when the run fails before the Tool returns', () => {
    let current = createAssistantTurnProjection({
      runId: 'run-1',
      assistantMessageId: 'assistant-1',
      startedAt: 100
    })
    current = projectConversationRunEvent(
      current,
      aiEvent(1, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-1',
          name: 'rf_builtin_process_run_12345678',
          arguments: '{"command":"python3 -c \\"print(1)\\""}'
        }
      })
    )!

    const projected = projectConversationRunEvent(
      current,
      aiEvent(2, 'run.failed', {
        message: 'Sidecar event stream disconnected',
        errorCode: 'stream_error'
      })
    )

    expect(projected).toMatchObject({
      status: 'failed',
      toolCalls: [
        {
          callId: 'call-1',
          status: 'failed',
          errorCode: 'stream_error',
          error: 'Sidecar event stream disconnected',
          completedAt: 102
        }
      ],
      tree: expect.arrayContaining([
        expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({
              children: expect.arrayContaining([
                expect.objectContaining({
                  toolCall: expect.objectContaining({
                    callId: 'call-1',
                    status: 'failed',
                    errorCode: 'stream_error'
                  })
                })
              ])
            })
          ])
        })
      ])
    })
  })

  it('projects a Tool rejected before execution from its failure metadata', () => {
    const projected = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      aiEvent(1, 'tool.call.failed', {
        toolName: 'rf_builtin_files_search_12345678',
        toolResult: {
          callId: 'call-over-budget',
          status: 'failed',
          errorCode: 'tool_call_limit',
          message: 'Tool call budget exhausted'
        }
      })
    )

    expect(projected?.toolCalls).toEqual([
      expect.objectContaining({
        callId: 'call-over-budget',
        toolName: 'rf_builtin_files_search_12345678',
        category: 'filesystem',
        status: 'failed',
        errorCode: 'tool_call_limit',
        error: 'Tool call budget exhausted',
        requestedAt: 101,
        completedAt: 101
      })
    ])
  })

  it('classifies bare bash failed Tool events as command failures', () => {
    const projected = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      aiEvent(1, 'tool.call.failed', {
        toolName: 'bash',
        toolResult: {
          callId: 'call-bash-failed',
          status: 'failed',
          errorCode: 'process_exit_code_37',
          message: 'TC-P0-020-FIXED-EXPECTED-FAIL\n[exit code: 37]'
        }
      })
    )

    expect(projected?.toolCalls).toEqual([
      expect.objectContaining({
        callId: 'call-bash-failed',
        toolName: 'bash',
        category: 'command',
        status: 'failed',
        errorCode: 'process_exit_code_37',
        error: 'TC-P0-020-FIXED-EXPECTED-FAIL\n[exit code: 37]'
      })
    ])
  })

  it('projects a safe Tool recovery hint without leaking local paths', () => {
    const projected = projectConversationRunEvent(
      createAssistantTurnProjection({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        startedAt: 100
      }),
      aiEvent(1, 'tool.call.failed', {
        toolName: 'rf_builtin_git_status_12345678',
        toolResult: {
          callId: 'call-git-status',
          status: 'failed',
          errorCode: 'git_repository_outside_scope',
          message:
            'Git repository is outside the authorized scope: /Users/alice/private',
          recoveryHint:
            'Choose the repository folder as the scope root. /Users/alice/private',
          diagnosticId: 'toolerr_1111111111111111'
        }
      })
    )

    expect(projected?.toolCalls[0]).toMatchObject({
      errorCode: 'git_repository_outside_scope',
      error: 'Git repository is outside the authorized scope: [local path]',
      recoveryHint: 'Choose the repository folder as the scope root. [local path]',
      diagnosticId: 'toolerr_1111111111111111'
    })
  })

  it('caps summaries and redacts credentials and absolute local paths', () => {
    const summary = summarizeToolArguments({
      token: 'secret',
      nested: { password: 'hidden' },
      path: '/tmp/private/file.txt',
      text: 'x'.repeat(2_000)
    })

    expect(summary.length).toBeLessThanOrEqual(500)
    expect(summary).not.toContain('secret')
    expect(summary).not.toContain('/tmp/private')
  })

  it('consumes an invalid knowledge reference without exposing it or creating a sequence gap', () => {
    const projectWithCitationPolicy = toAssistantRunEvent as unknown as (
      event: AiRunEvent,
      policy: {
        allowedKnowledgeReferences: ReadonlySet<string>
      }
    ) => ReturnType<typeof toAssistantRunEvent>

    expect(
      projectWithCitationPolicy(
        aiEvent(1, 'reference.added', {
          reference: {
            id: 'missing-chunk',
            title: 'Missing source',
            sourceType: 'knowledge',
            summary: 'Unsupported citation',
            localResourceId: 'missing-chunk'
          }
        }),
        {
          allowedKnowledgeReferences: new Set(['included-chunk'])
        }
      )
    ).toMatchObject({
      type: 'heartbeat',
      data: {}
    })
  })

  it('maps recovery and compaction events to stable public data', () => {
    expect(
      toAssistantRunEvent(
        aiEvent(1, 'run.retrying', {
          retryCount: 2,
          retryAfterMs: 5_000,
          errorCode: 'provider_rate_limited',
          message: 'secret token at /Users/alice/private',
          remainingAttempts: 1
        } as AiRunEvent['data'])
      )
    ).toMatchObject({
      type: 'run.retrying',
      data: {
        attempt: 2,
        reason: 'provider_rate_limited',
        nextRetryAt: 5_101,
        remainingAttempts: 1
      }
    })
    expect(
      toAssistantRunEvent(
        aiEvent(2, 'run.recovery_blocked', {
          recoveryReason: 'capability_unavailable',
          recoveryActions: ['resume', 'branch', 'cancel']
        })
      )
    ).toMatchObject({
      type: 'run.recovery_blocked',
      data: {
        reason: 'capability_unavailable',
        actions: ['resume', 'branch', 'cancel']
      }
    })
    expect(
      toAssistantRunEvent(
        aiEvent(4, 'run.waiting_input', {
          recoveryReason: 'deterministic_tool_failure',
          recoveryActions: ['resume', 'cancel']
        })
      )
    ).toMatchObject({
      type: 'run.waiting_input',
      data: {
        reason: 'deterministic_tool_failure'
      }
    })
    expect(
      toAssistantRunEvent(
        aiEvent(3, 'context.compacted', {
          objectiveCount: 1,
          constraintCount: 2,
          incompleteItemCount: 1,
          sourceCount: 5
        })
      )
    ).toMatchObject({
      type: 'context.compacted',
      data: { sourceCount: 5 }
    })
    expect(
      JSON.stringify(
        toAssistantRunEvent(
          aiEvent(1, 'run.retrying', {
            retryCount: 2,
            errorCode: 'provider_timeout',
            message: 'secret token at /Users/alice/private'
          })
        )
      )
    ).not.toContain('secret')
  })

  it('preserves provider retry hints on terminal failures', () => {
    expect(
      toAssistantRunEvent(
        aiEvent(1, 'run.failed', {
          errorCode: 'provider_rate_limited',
          message: 'Provider request failed',
          retryCount: 1,
          retryAfterMs: 5_000,
          remainingAttempts: 0
        })
      )
    ).toMatchObject({
      type: 'run.failed',
      data: {
        errorCode: 'provider_rate_limited',
        message: 'Provider request failed',
        retryCount: 1,
        retryAfterMs: 5_000,
        remainingAttempts: 0
      }
    })
  })
})

function aiEvent(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data']
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    timestamp: new Date(100 + sequence).toISOString(),
    data
  }
}
