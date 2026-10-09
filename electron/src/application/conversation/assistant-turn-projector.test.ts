import type { AiRunEvent } from '../../../../domain/ai-run'
import { createAssistantTurnProjection } from '../../../../domain/assistant-turn'
import {
  projectConversationRunEvent,
  summarizeToolArguments,
  toAssistantRunEvent
} from './assistant-turn-projector'

describe('assistant turn projector', () => {
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
                status: 'completed',
                summary: 'Found token=secret at /tmp/private/file',
                evidence: [],
                unresolved: [],
                artifactIds: []
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
          summary: 'Found [REDACTED] at [local path]'
        }
      ]
    })
    expect(JSON.stringify(projected)).not.toContain('rawChildTranscript')
    expect(JSON.stringify(projected)).not.toContain('/Users/alice')
    expect(JSON.stringify(projected)).not.toContain('token=secret')
  })

  it('does not include raw Tool output in a terminal projection', () => {
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
    expect(projected?.toolCalls[0]).toMatchObject({
      toolExecutionId: 'execution-1',
      resultSummary: '命令执行完成',
      status: 'completed'
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
          message: 'secret token at /Users/alice/private'
        })
      )
    ).toMatchObject({
      type: 'run.retrying',
      data: {
        attempt: 2,
        reason: 'provider_rate_limited',
        nextRetryAt: 5_101
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
