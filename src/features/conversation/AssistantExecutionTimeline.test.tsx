import {
  fireEvent,
  render as testingRender,
  screen
} from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { AssistantTurnProjection } from '../../../domain/assistant-turn'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { LOCALE_PREFERENCE_KEY } from '../../localization/locale-preference'
import { AssistantExecutionTimeline } from './AssistantExecutionTimeline'

function render(element: React.ReactNode) {
  return testingRender(element, {
    wrapper: ({ children }) => (
      <LocalizationProvider>{children}</LocalizationProvider>
    )
  })
}

describe('AssistantExecutionTimeline', () => {
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.removeItem(LOCALE_PREFERENCE_KEY)
  })

  it('localizes the task disclosure and status from the application locale', () => {
    window.localStorage.setItem(
      LOCALE_PREFERENCE_KEY,
      JSON.stringify({ version: 1, locale: 'en' })
    )

    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 2_600
        })}
      />
    )

    const task = screen.getByRole('button', {
      name: 'Task duration 2.5 seconds'
    })
    fireEvent.click(task)
    expect(screen.getByText('Task completed')).toBeInTheDocument()
  })

  it('uses compact English units for long task duration parts', () => {
    window.localStorage.setItem(
      LOCALE_PREFERENCE_KEY,
      JSON.stringify({ version: 1, locale: 'en' })
    )

    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 93_784_100
        })}
      />
    )

    expect(
      screen.getByRole('button', {
        name: 'Task duration 1d 2h 3m 4s'
      })
    ).toBeInTheDocument()
  })

  it('shows duration and aggregated Tool counts with successful details collapsed', () => {
    const view = render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 2_600,
          toolCalls: [
            toolCall('one', 'web_search'),
            toolCall('two', 'web_search'),
            toolCall('three', 'command')
          ]
        })}
      />
    )

    const task = screen.getByRole('button', { name: '任务耗时 2.5 秒' })
    expect(task).toHaveAttribute('aria-expanded', 'false')
    expect(task.firstElementChild).toHaveTextContent('任务耗时 2.5 秒')
    expect(task.lastElementChild?.tagName).toBe('svg')
    fireEvent.click(task)
    expect(screen.getByText('任务完成')).toBeInTheDocument()
    expect(screen.getByText('搜索 2 次网页')).toBeInTheDocument()
    expect(screen.getByText('执行 1 条命令')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^执行详情/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(
      view.container.querySelector('.assistant-execution-timeline')
    ).toHaveAttribute('data-density', 'compact')
  })

  it('formats long task duration into day, hour, minute, and second parts', () => {
    const { rerender } = render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 882_100
        })}
      />
    )

    expect(
      screen.getByRole('button', { name: '任务耗时 14 分 42 秒' })
    ).toBeInTheDocument()

    rerender(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 3_723_100
        })}
      />
    )

    expect(
      screen.getByRole('button', { name: '任务耗时 1 小时 2 分 3 秒' })
    ).toBeInTheDocument()

    rerender(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 93_784_100
        })}
      />
    )

    expect(
      screen.getByRole('button', {
        name: '任务耗时 1 天 2 小时 3 分 4 秒'
      })
    ).toBeInTheDocument()
  })

  it('hides recovered failed attempts from completed run details', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 3_000,
          toolCalls: [
            {
              ...toolCall('failed-stat', 'filesystem'),
              toolName: 'rf_builtin_files_stat_ffd70cef',
              status: 'failed',
              errorCode: 'tool_execution_failed',
              error: 'Tool execution failed',
              completedAt: 200
            },
            {
              ...toolCall('successful-read', 'filesystem'),
              toolName: 'rf_builtin_documents_read_eface55f',
              status: 'completed',
              completedAt: 300
            },
            {
              ...toolCall('failed-run', 'command'),
              toolName: 'rf_builtin_process_run_ce248e65',
              status: 'failed',
              errorCode: 'builtin_execution_failed',
              error: 'Path is outside the bound workspace',
              completedAt: 400
            },
            {
              ...toolCall('successful-run', 'command'),
              toolName: 'rf_builtin_process_run_ce248e65',
              status: 'completed',
              completedAt: 500
            }
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '任务耗时 2.9 秒' }))
    expect(screen.getByText('执行 1 条命令')).toBeInTheDocument()
    expect(screen.getByText('操作 1 次文件')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^执行详情/ }))
    expect(screen.queryByText('Tool execution failed')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Path is outside the bound workspace')
    ).not.toBeInTheDocument()
  })

  it('keeps a manual disclosure choice when a running task completes', () => {
    const { rerender } = render(
      <AssistantExecutionTimeline
        execution={projection({ status: 'running' })}
      />
    )
    const task = screen.getByRole('button', { name: /任务耗时/ })
    expect(task).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(task)
    expect(task).toHaveAttribute('aria-expanded', 'false')

    rerender(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 2_600
        })}
      />
    )

    expect(screen.getByRole('button', { name: '任务耗时 2.5 秒' }))
      .toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps duration frozen while a Run is waiting for input', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'waiting_input',
          elapsedAt: 2_600,
          recovery: { reason: 'consecutive_tool_failures' }
        })}
      />
    )

    expect(
      screen.getByRole('button', { name: '任务耗时 2.5 秒' })
    ).toBeInTheDocument()

    vi.advanceTimersByTime(5_000)

    expect(
      screen.getByRole('button', { name: '任务耗时 2.5 秒' })
    ).toBeInTheDocument()
  })

  it('renders references and summaries in separate keyboard disclosures', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          references: [
            {
              id: 'reference-1',
              title: 'RealmFlow 设计',
              sourceType: 'knowledge',
              summary: '设计约束'
            }
          ],
          executionSummaries: [
            { id: 'summary-1', content: '已分析需求', source: 'system' }
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '参考内容' }))
    expect(screen.getByText('RealmFlow 设计')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '思考过程' }))
    expect(screen.getByText('已分析需求')).toBeInTheDocument()
  })

  it('auto-expands failures and renders nothing for an empty legacy projection', () => {
    const { rerender } = render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'failed',
          error: '执行失败',
          toolCalls: [
            {
              ...toolCall('one', 'command'),
              status: 'failed',
              errorCode: 'tool_timeout',
              error: '/private/workspace/secret timed out'
            }
          ]
        })}
      />
    )
    expect(screen.getByRole('button', { name: /^执行详情/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('工具执行超时')).toBeInTheDocument()
    expect(
      screen.queryByText('/private/workspace/secret timed out')
    ).not.toBeInTheDocument()

    rerender(<AssistantExecutionTimeline execution={undefined} />)
    expect(screen.queryByText('执行详情')).not.toBeInTheDocument()
  })

  it('shows a stable user-facing error when a Skill Connector is unavailable', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'failed',
          toolCalls: [
            {
              ...toolCall('rf_skill_uploaded_report_abcdef12', 'skill'),
              status: 'failed',
              errorCode: 'skill_connector_unavailable',
              error: 'Connector grant token is unavailable'
            }
          ]
        })}
      />
    )

    expect(screen.getByText('技能连接器不可用')).toBeInTheDocument()
    expect(
      screen.queryByText('Connector grant token is unavailable')
    ).not.toBeInTheDocument()
  })

  it('shows a deterministic Skill call with a user-facing name and permission state', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'waiting_permission',
          toolCalls: [
            {
              ...toolCall(
                'rf_skill_builtin_skill_code_review_abcdef12',
                'skill'
              ),
              status: 'waiting_permission'
            }
          ]
        })}
      />
    )

    expect(screen.getAllByText('等待授权')).toHaveLength(2)
    expect(screen.getByText('调用 1 次技能')).toBeInTheDocument()
    expect(screen.getByText('技能 · code review')).toBeInTheDocument()
    expect(
      screen.queryByText('rf_skill_builtin_skill_code_review_abcdef12')
    ).not.toBeInTheDocument()
  })

  it('shows an accessible delegation summary with partial child results', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          delegations: [
            {
              callId: 'delegate-1',
              status: 'partial',
              requestedAt: 100,
              completedAt: 300,
              tasks: [
                {
                  taskId: 'docs',
                  objective: 'Inspect docs',
                  status: 'completed',
                  summary: 'Docs summary',
                  evidenceCount: 2
                },
                {
                  taskId: 'tests',
                  objective: 'Inspect tests',
                  status: 'failed',
                  summary: 'Provider failed',
                  evidenceCount: 0,
                  errorCode: 'provider_rejected'
                }
              ]
            }
          ]
        })}
      />
    )

    expect(screen.getByText('委派 2 个子任务')).toBeInTheDocument()
    const trigger = screen.getByRole('button', {
      name: /委派 2 个子任务/
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Inspect docs')).toBeInTheDocument()
    expect(screen.getByText('Docs summary')).toBeInTheDocument()
    expect(screen.getByText('部分完成')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.queryByText('Docs summary')).not.toBeInTheDocument()
  })

  it('shows explainable recovery blocking, actions and context compaction', async () => {
    const onRecoveryAction = vi.fn(
      async (action: 'resume' | 'branch' | 'cancel') =>
        action === 'branch'
          ? ({ status: 'branched', runId: 'run-branch' } as const)
          : action === 'cancel'
            ? ({ status: 'cancelled' } as const)
          : ({ status: 'resumed' } as const),
    )
    render(
      <AssistantExecutionTimeline
        onRecoveryAction={onRecoveryAction}
        execution={projection({
          status: 'recovery_blocked',
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
              compactedAt: 200
            }
          ]
        })}
      />
    )

    expect(screen.getByText('恢复受阻')).toBeInTheDocument()
    expect(screen.getByText('所需能力版本不可用')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(await screen.findByText('已继续运行')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '创建分支' }))
    expect(await screen.findByText('已创建新运行')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(await screen.findByText('已取消运行')).toBeInTheDocument()
    expect(onRecoveryAction.mock.calls.map(([action]) => action)).toEqual([
      'resume',
      'branch',
      'cancel'
    ])
    fireEvent.click(screen.getByRole('button', { name: '已整理上下文' }))
    expect(screen.getByText('保留 1 个目标、2 条约束、1 个未完成项，关联 5 个来源')).toBeInTheDocument()
  })

  it('shows a localized automatic continuation state after context compaction', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'retrying',
          recovery: {
            reason: 'max_agent_turns',
            attempt: 1
          },
          compactions: [
            {
              objectiveCount: 1,
              constraintCount: 3,
              incompleteItemCount: 2,
              sourceCount: 4,
              compactedAt: 2_000
            }
          ]
        })}
      />
    )

    expect(screen.getByText('正在重试')).toBeInTheDocument()
    expect(
      screen.getByText('已达到当前执行分段上限，正在自动续跑')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('max_agent_turns')
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '已整理上下文' }))
    expect(
      screen.getByText(
        '保留 1 个目标、3 条约束、2 个未完成项，关联 4 个来源'
      )
    ).toBeInTheDocument()
  })

  it('paginates more than 100 expanded tool calls', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'failed',
          toolCalls: Array.from({ length: 150 }, (_, index) =>
            toolCall(`tool-${index}`, 'command')
          )
        })}
      />
    )

    expect(
      document.querySelectorAll('.assistant-tool-call-list li')
    ).toHaveLength(100)
    expect(screen.getByText('1-100 / 150')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(
      document.querySelectorAll('.assistant-tool-call-list li')
    ).toHaveLength(50)
    expect(screen.getByText('101-150 / 150')).toBeInTheDocument()
  })
})

function projection(
  patch: Partial<AssistantTurnProjection>
): AssistantTurnProjection {
  return {
    runId: 'run-1',
    assistantMessageId: 'assistant-1',
    status: 'running',
    startedAt: 100,
    answer: '最终回答',
    executionSummaries: [],
    references: [],
    toolCalls: [],
    delegations: [],
    compactions: [],
    lastSequence: 1,
    ...patch
  }
}

function toolCall(
  callId: string,
  category: 'web_search' | 'command' | 'skill' | 'filesystem'
) {
  return {
    callId,
    toolExecutionId: `execution-${callId}`,
    toolName: callId,
    category,
    status: 'completed' as const,
    argumentsSummary: '',
    requestedAt: 100,
    startedAt: 200,
    completedAt: 300
  }
}
