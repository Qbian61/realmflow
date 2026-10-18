import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type {
  AssistantDisplayNode,
  AssistantTurnProjection,
  ToolCallProjection
} from '../../../domain/assistant-turn'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { AssistantExecutionTimeline } from './AssistantExecutionTimeline'

function renderTree(tree: AssistantDisplayNode[]) {
  return render(
    <LocalizationProvider>
      <AssistantExecutionTimeline execution={projection(tree)} />
    </LocalizationProvider>
  )
}

function projection(tree: AssistantDisplayNode[]): AssistantTurnProjection {
  return {
    schemaVersion: 2,
    runId: 'run-renderers',
    turnId: 'turn-renderers',
    assistantMessageId: 'assistant-renderers',
    status: 'running',
    startedAt: Date.now(),
    answer: '',
    tree,
    collapsedDefaults: [],
    executionSummaries: [],
    references: [],
    toolCalls: [],
    delegations: [],
    compactions: [],
    lastSequence: 1
  }
}

function toolNode(
  id: string,
  toolName: string,
  category: ToolCallProjection['category'],
  patch: Partial<ToolCallProjection> = {}
): AssistantDisplayNode {
  const toolCall: ToolCallProjection = {
    callId: id,
    toolName,
    category,
    status: 'running',
    argumentsSummary: '',
    requestedAt: 100,
    ...patch
  }
  return {
    id,
    kind: 'tool_call',
    order: 1,
    toolCall,
    view: { type: category === 'filesystem' ? 'file' : 'generic', title: toolName }
  }
}

it('renders command and write-stdin calls as terminal operations', () => {
  renderTree([
    toolNode('command', 'builtin.process.run', 'command', {
      argumentsSummary: '{"command":"npm test"}',
      resultSummary: '18 tests passed',
      status: 'completed'
    }),
    {
      ...toolNode('stdin', 'write_stdin', 'command', {
        argumentsSummary: '{"sessionId":"pty-7","input":"yes"}',
        resultSummary: 'Input delivered',
        status: 'completed'
      }),
      order: 2
    }
  ])

  expect(screen.getByRole('group', { name: '命令已执行' })).toHaveTextContent(
    'npm test'
  )
  expect(screen.getByRole('region', { name: '命令输出' })).toHaveTextContent(
    'npm test'
  )
  expect(screen.getByRole('button', { name: '复制命令' })).toBeInTheDocument()
  expect(screen.getByText('18 tests passed')).toBeInTheDocument()
  expect(screen.getByText('向进程 pty-7 发送输入')).toBeInTheDocument()
  expect(screen.getByText('Input delivered')).toBeInTheDocument()
})

it('renders waiting permission command calls with the approval reason', () => {
  renderTree([
    toolNode('approval', 'bash', 'command', {
      argumentsSummary: JSON.stringify({
        command:
          "printf 'APPROVAL_SHOULD_WAIT' > '/workspace/test-space/side-effects/TC-P0-012-approval.txt'"
      }),
      status: 'waiting_permission',
      error:
        'escalate sandbox to danger-full-access: 需要一次更宽的文件访问授权。'
    })
  ])

  const card = screen.getByRole('group', { name: '等待授权' })
  expect(card).toHaveTextContent("printf 'APPROVAL_SHOULD_WAIT'")
  expect(card).toHaveTextContent('需要一次更宽的文件访问授权')
})

it('renders file edits as Trae-style file lists', () => {
  renderTree([
    toolNode('edit', 'builtin.files.write', 'filesystem', {
      argumentsSummary:
        '{"path":"src/features/conversation/AssistantDisplayTree.test.tsx"}',
      resultSummary: 'File updated',
      status: 'completed'
    })
  ])

  const card = screen.getByRole('group', { name: '已编辑' })
  expect(card).toHaveTextContent('1个文件')
  expect(card).toHaveTextContent('AssistantDisplayTree.test.tsx')
})

it('collapses long command output behind a dedicated output control', () => {
  renderTree([
    toolNode('long-command', 'builtin.process.run', 'command', {
      argumentsSummary: '{"command":"npm test"}',
      resultSummary: Array.from(
        { length: 20 },
        (_, index) => `output line ${index + 1}`
      ).join('\n'),
      status: 'completed'
    })
  ])

  const toggle = screen.getByRole('button', { name: '展开命令输出' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
})

it('renders file read, search and web search with semantic summaries', () => {
  renderTree([
    toolNode('read', 'builtin.files.read', 'filesystem', {
      argumentsSummary: '{"path":"src/index.ts","startLine":10,"endLine":24}',
      resultSummary: '读取 15 行',
      status: 'completed'
    }),
    {
      ...toolNode('grep', 'builtin.files.search', 'filesystem', {
        argumentsSummary: '{"query":"AssistantDisplayNode","path":"src"}',
        resultSummary: '找到 8 个匹配',
        status: 'completed'
      }),
      order: 2
    },
    {
      ...toolNode('web', 'builtin.web.search', 'web_search', {
        argumentsSummary: '{"query":"React renderer registry"}',
        resultSummary: '找到 3 个来源',
        status: 'completed'
      }),
      order: 3
    }
  ])

  expect(
    screen.getByRole('group', { name: '文件已读取' })
  ).toHaveTextContent('index.ts')
  expect(screen.getByTitle('src/index.ts')).toBeInTheDocument()
  expect(screen.getByText('第 10-24 行')).toBeInTheDocument()
  expect(
    screen.getAllByText('在 src 中搜索 AssistantDisplayNode').length
  ).toBeGreaterThan(0)
  expect(
    screen.getAllByText('搜索 React renderer registry').length
  ).toBeGreaterThan(0)
  expect(screen.getByText('找到 3 个来源')).toBeInTheDocument()
})

it('renders image, widget, Skill, MCP, connector and unknown tools distinctly', () => {
  renderTree([
    toolNode('image', 'view_image', 'other', {
      argumentsSummary: '{"path":"artifacts/chart.png"}',
      resultSummary: '1280 x 720',
      status: 'completed'
    }),
    {
      ...toolNode('widget', 'PureShowWidget', 'other', {
        argumentsSummary: '{"title":"执行拓扑"}',
        resultSummary: 'Widget ready',
        status: 'completed'
      }),
      order: 2
    },
    {
      ...toolNode(
        'skill',
        'rf_skill_builtin_skill_code_review_abcdef12',
        'skill',
        { status: 'completed' }
      ),
      order: 3
    },
    {
      ...toolNode('mcp', 'mcp.docs.search', 'mcp', { status: 'completed' }),
      order: 4
    },
    {
      ...toolNode('connector', 'connector.feishu.search', 'connector', {
        status: 'completed'
      }),
      order: 5
    },
    {
      ...toolNode('unknown', 'custom.unknown', 'other', {
        resultSummary: 'Completed safely',
        status: 'completed'
      }),
      order: 6
    }
  ])

  expect(screen.getByRole('img', { name: 'chart.png' })).toBeInTheDocument()
  expect(
    screen.getAllByTitle('执行拓扑').find((element) => element.tagName === 'IFRAME')
  ).toHaveAttribute('sandbox', '')
  expect(screen.getByText('技能 · code review')).toBeInTheDocument()
  expect(screen.getByText('MCP · docs.search')).toBeInTheDocument()
  expect(screen.getByText('连接器 · feishu.search')).toBeInTheDocument()
  expect(screen.getAllByText('使用 custom.unknown').length).toBeGreaterThan(0)
})

it('uses semantic facade titles instead of repeating generic tool boilerplate', () => {
  renderTree([
    toolNode('agents', 'rf_agents_list_a1b2c3d4', 'other', {
      status: 'completed'
    }),
    {
      ...toolNode('gateway', 'rf_gateway_a1b2c3d4', 'other', {
        status: 'failed',
        error: 'gateway_path_denied'
      }),
      order: 2
    }
  ])

  const completed = screen.getByRole('group', { name: '查看 Agent 列表' })
  expect(completed).toHaveTextContent('查看 Agent 列表')
  expect(completed).not.toHaveTextContent('工具已执行')

  const failed = screen.getByRole('group', { name: '执行网关操作失败' })
  expect(failed).toHaveTextContent('执行网关操作失败')
  expect(failed).toHaveTextContent('请求路径不在允许范围内')
  expect(failed).not.toHaveTextContent('工具执行失败')
  expect(
    failed.querySelector('.assistant-tool-error-detail')
  ).toBeInTheDocument()
  expect(
    failed.querySelector('.assistant-tool-surface')
  ).not.toBeInTheDocument()
})

it('renders settings guidance for permission failures that cannot use an in-app dialog', () => {
  renderTree([
    toolNode('computer', 'rf_builtin_computer_observe_a1b2c3d4', 'other', {
      status: 'failed',
      errorCode: 'computer_accessibility_permission_required',
      error: 'Computer Use Accessibility permission is required'
    })
  ])

  const failed = screen.getByRole('group', { name: '执行内置工具失败' })
  expect(failed).toHaveTextContent('需要在系统设置中开启辅助功能权限')
  expect(failed).toHaveTextContent(
    '打开 macOS 系统设置 > 隐私与安全性 > 辅助功能，允许 RealmFlow 控制电脑后重试。'
  )
})

it('renders recursive Todo and Sub-agent execution bodies', () => {
  renderTree([
    {
      id: 'todo',
      kind: 'todo_group',
      order: 1,
      todo: {
        todoId: 'todo-1',
        title: '消息改造',
        status: 'running',
        items: [
          {
            id: 'todo-item',
            ordinal: 1,
            title: '实现 Renderer',
            status: 'running',
            children: [
              toolNode('todo-command', 'builtin.process.run', 'command', {
                argumentsSummary: '{"command":"npm test"}'
              })
            ]
          }
        ]
      }
    },
    {
      id: 'agents',
      kind: 'sub_agent_group',
      order: 2,
      group: {
        groupId: 'group-1',
        callId: 'delegate-1',
        parentRunId: 'run-renderers',
        strategy: 'parallel',
        status: 'running',
        requestedAt: 100,
        children: [
          {
            taskId: 'child-1',
            childRunId: 'child-run',
            childSessionId: 'child-session',
            ordinal: 1,
            agentName: '代码审查 Agent',
            objective: '审查 Renderer',
            status: 'running',
            evidenceCount: 2,
            artifactIds: [],
            tree: [
              toolNode('child-read', 'builtin.files.read', 'filesystem', {
                argumentsSummary: '{"path":"src/renderer.ts"}'
              })
            ]
          }
        ]
      }
    }
  ])

  expect(screen.getByText('实现 Renderer')).toBeInTheDocument()
  expect(screen.getAllByText('npm test').length).toBeGreaterThan(0)
  expect(screen.getByText('代码审查 Agent')).toBeInTheDocument()
  expect(screen.getByText('审查 Renderer')).toBeInTheDocument()
  expect(screen.getByText('2 条证据')).toBeInTheDocument()
  expect(screen.getByTitle('src/renderer.ts')).toBeInTheDocument()
})

it('renders finish, compaction, diagnostic errors and unknown nodes safely', () => {
  const unknown = {
    id: 'future-node',
    kind: 'future_kind',
    order: 5,
    diagnosticId: 'node_0123456789abcdef',
    summary: 'Future result'
  } as unknown as AssistantDisplayNode
  renderTree([
    {
      id: 'compact',
      kind: 'context_compaction',
      order: 1,
      compaction: {
        objectiveCount: 1,
        constraintCount: 2,
        incompleteItemCount: 3,
        sourceCount: 4,
        compactedAt: 100
      }
    },
    toolNode('failed', 'builtin.files.read', 'filesystem', {
      status: 'failed',
      errorCode: 'tool_timeout',
      error: '/Users/alice/private token=secret',
      diagnosticId: 'toolerr_0123456789abcdef'
    }),
    {
      id: 'finish',
      kind: 'finish',
      order: 3,
      answerMessageId: 'assistant-renderers',
      fileChanges: { added: 1, modified: 1, deleted: 0 },
      artifacts: [
        {
          path: 'artifacts/report.pdf',
          name: 'report.pdf',
          mediaType: 'application/pdf',
          sizeBytes: 1024,
          kind: 'pdf'
        }
      ],
      images: []
    } as AssistantDisplayNode,
    unknown
  ])

  expect(screen.getByText('已整理上下文')).toBeInTheDocument()
  expect(screen.getByText(/1 个目标.*2 条约束.*3 个未完成项/)).toBeInTheDocument()
  expect(
    screen.getByRole('group', { name: /读取 .*失败/ })
  ).toBeInTheDocument()
  expect(screen.getByText('工具执行超时')).toBeInTheDocument()
  expect(screen.getByText('诊断 ID：toolerr_0123456789abcdef')).toBeInTheDocument()
  expect(screen.queryByText('/Users/alice/private')).not.toBeInTheDocument()
  expect(screen.getByText('2 个文件变更')).toBeInTheDocument()
  expect(screen.getByText('report.pdf')).toBeInTheDocument()
  expect(screen.getByText('无法展示的消息项')).toBeInTheDocument()
  expect(screen.getByText('诊断 ID：node_0123456789abcdef')).toBeInTheDocument()
})
