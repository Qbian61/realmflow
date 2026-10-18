import {
  act,
  fireEvent,
  render as testingRender,
  screen
} from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type {
  AssistantDisplayNode,
  AssistantTurnProjection
} from '../../../domain/assistant-turn'
import type { AgentRuntimeApi } from '../../../shared/agent-runtime-state'
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
    Object.defineProperty(window, 'realmflow', {
      configurable: true,
      value: undefined
    })
  })

  it('localizes the task disclosure and status from the application locale', () => {
    window.localStorage.setItem(
      LOCALE_PREFERENCE_KEY,
      JSON.stringify({ version: 1, locale: 'en' })
    )
    render(
      <AssistantExecutionTimeline
        execution={projection({ status: 'completed', completedAt: 2_600 })}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Task duration 2.5s' })
    )
    expect(screen.queryByText('Task completed')).not.toBeInTheDocument()
  })

  it('does not expose editable Agent Runtime controls in conversations', () => {
    Object.defineProperty(window, 'realmflow', {
      configurable: true,
      value: { agentRuntime: {} as AgentRuntimeApi }
    })
    render(
      <AssistantExecutionTimeline
        execution={projection({ status: 'completed', completedAt: 2_600 })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '任务耗时 2.5s' }))
    expect(screen.queryByText('任务完成')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '运行详情' })).not.toBeInTheDocument()
  })

  it('formats long task duration with compact localized units', () => {
    const view = render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 93_784_100
        })}
      />
    )

    expect(
      screen.getByRole('button', {
        name: '任务耗时 1d 2h 3m 4s'
      })
    ).toBeInTheDocument()
    expect(
      view.container.querySelector('.assistant-task-divider-line')
    ).toBeInTheDocument()
  })

  it('renders the task divider below the disclosure label', () => {
    const view = render(
      <AssistantExecutionTimeline
        execution={projection({ status: 'completed', completedAt: 2_600 })}
      />
    )

    const trigger = screen.getByRole('button', { name: '任务耗时 2.5s' })
    const header = trigger.parentElement
    const divider = view.container.querySelector<HTMLElement>(
      '.assistant-task-divider-line'
    )

    expect(header).toHaveClass('assistant-task-disclosure-header')
    expect(header).toContainElement(divider)
    expect(trigger).not.toContainElement(divider)
  })

  it('updates a running duration and stops at elapsedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_100)
    const view = render(
      <AssistantExecutionTimeline execution={projection({ status: 'running' })} />
    )
    expect(screen.getByRole('button', { name: '任务耗时 2.0s' })).toBeVisible()

    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByRole('button', { name: '任务耗时 4.0s' })).toBeVisible()

    view.rerender(
      <LocalizationProvider>
        <AssistantExecutionTimeline
          execution={projection({ status: 'paused', elapsedAt: 4_100 })}
        />
      </LocalizationProvider>
    )
    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByRole('button', { name: '任务耗时 4.0s' })).toBeVisible()
  })

  it('keeps a manual root disclosure choice when a task completes', () => {
    const view = render(
      <AssistantExecutionTimeline execution={projection({ status: 'running' })} />
    )
    const task = screen.getByRole('button', { name: /任务耗时/ })
    fireEvent.click(task)
    expect(task).toHaveAttribute('aria-expanded', 'false')

    view.rerender(
      <LocalizationProvider>
        <AssistantExecutionTimeline
          execution={projection({ status: 'completed', completedAt: 2_600 })}
        />
      </LocalizationProvider>
    )
    expect(screen.getByRole('button', { name: '任务耗时 2.5s' }))
      .toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps a cancelled terminal run collapsed by default', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({ status: 'cancelled', elapsedAt: 2_600 })}
      />
    )

    expect(screen.getByRole('button', { name: '任务耗时 2.5s' }))
      .toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('任务已取消')).not.toBeInTheDocument()
  })

  it('renders only execution.tree and ignores legacy projection arrays', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'running',
          executionSummaries: [
            { id: 'legacy-summary', content: '旧思考', source: 'system' }
          ],
          references: [
            {
              id: 'legacy-reference',
              title: '旧引用',
              sourceType: 'knowledge',
              summary: '不应渲染'
            }
          ],
          tree: [
            {
              id: 'reasoning',
              kind: 'reasoning',
              order: 1,
              content: '展示树思考',
              status: 'streaming'
            }
          ]
        })}
      />
    )

    expect(screen.getByText('展示树思考')).toBeInTheDocument()
    expect(screen.queryByText('旧思考')).not.toBeInTheDocument()
    expect(screen.queryByText('旧引用')).not.toBeInTheDocument()
  })

  it('does not duplicate completed Tool failures as a terminal error', () => {
    const failed = toolNode('failed', 'failed')
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'completed',
          completedAt: 3_000,
          tree: [
            {
              id: 'todo',
              kind: 'todo_group',
              order: 1,
              todo: {
                todoId: 'todo-1',
                title: '测试',
                status: 'failed',
                items: [
                  {
                    id: 'item-1',
                    ordinal: 1,
                    title: '失败项',
                    status: 'failed',
                    children: [failed]
                  }
                ]
              }
            }
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '任务耗时 2.9s' }))
    expect(screen.queryByText('仍有 1 个工具失败未恢复')).not.toBeInTheDocument()
  })

  it('shows terminal run errors even when the tree has details', () => {
    render(
      <AssistantExecutionTimeline
        execution={projection({
          status: 'failed',
          error: 'Provider request failed',
          tree: [toolNode('failed', 'failed')]
        })}
      />
    )
    expect(screen.getByText('Provider request failed')).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: '读取 src/file.ts失败' })
    ).toBeInTheDocument()
    expect(screen.getByText('工具执行超时')).toBeInTheDocument()
  })

  it('executes recovery actions and reports results', async () => {
    const onRecoveryAction = vi.fn(
      async (action: 'resume' | 'branch' | 'cancel') =>
        action === 'branch'
          ? ({ status: 'branched', runId: 'run-branch' } as const)
          : action === 'cancel'
            ? ({ status: 'cancelled' } as const)
            : ({ status: 'resumed' } as const)
    )
    render(
      <AssistantExecutionTimeline
        onRecoveryAction={onRecoveryAction}
        execution={projection({
          status: 'recovery_blocked',
          recovery: {
            reason: 'capability_unavailable',
            actions: ['resume', 'branch', 'cancel']
          }
        })}
      />
    )

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
  })

  it('renders nothing when no execution projection exists', () => {
    const view = render(<AssistantExecutionTimeline execution={undefined} />)
    expect(view.container).toBeEmptyDOMElement()
  })
})

function projection(
  patch: Partial<AssistantTurnProjection>
): AssistantTurnProjection {
  return {
    schemaVersion: 2,
    runId: 'run-1',
    turnId: 'turn-1',
    assistantMessageId: 'assistant-1',
    status: 'running',
    startedAt: 100,
    answer: '',
    tree: [],
    collapsedDefaults: [],
    executionSummaries: [],
    references: [],
    toolCalls: [],
    delegations: [],
    compactions: [],
    lastSequence: 1,
    ...patch
  }
}

function toolNode(
  id: string,
  status: 'running' | 'failed'
): AssistantDisplayNode {
  return {
    id,
    kind: 'tool_call',
    order: 1,
    toolCall: {
      callId: id,
      toolName: 'builtin.files.read',
      category: 'filesystem',
      status,
      argumentsSummary: '{"path":"src/file.ts"}',
      requestedAt: 100,
      errorCode: status === 'failed' ? 'tool_timeout' : undefined,
      error: status === 'failed' ? 'Timed out' : undefined
    },
    view: { type: 'file', title: '读取文件' }
  }
}
