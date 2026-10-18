import { Copy, Share2, ThumbsDown, ThumbsUp } from 'lucide-react'
import type {
  AssistantDisplayNode,
  AssistantTurnProjection,
  ToolCallProjection
} from '../../../domain/assistant-turn'
import { translate } from '../../localization/translate'
import { AssistantExecutionTimeline } from './AssistantExecutionTimeline'
import { StreamingMessageContent } from './StreamingMessageContent'

export function ConversationParityFixture(): JSX.Element {
  return (
    <main className="conversation-parity-fixture">
      <header className="conversation-parity-fixture__header">
        <strong>RealmFlow</strong>
        <span>Message renderer acceptance</span>
      </header>
      <div className="conversation-parity-fixture__viewport">
        <section data-scenario="collapsed" className="conversation-parity-scenario">
          <ScenarioHeading label="Collapsed" />
          <AssistantExecutionTimeline
            execution={projection('completed', [commandNode('collapsed-command', 'completed')])}
          />
          <StreamingMessageContent
            content="任务已完成，执行详情保持折叠。"
            pending={false}
          />
        </section>

        <section data-scenario="expanded" className="conversation-parity-scenario">
          <ScenarioHeading label="Expanded renderer set" />
          <AssistantExecutionTimeline
            execution={projection('running', expandedNodes())}
          />
        </section>

        <section data-scenario="running" className="conversation-parity-scenario">
          <ScenarioHeading label="Running" />
          <AssistantExecutionTimeline
            execution={projection('running', [
              {
                id: 'running-group',
                kind: 'execution_group',
                order: 1,
                groupType: 'command',
                title: '正在执行命令',
                status: 'running',
                defaultExpanded: true,
                children: [commandNode('running-command', 'running')]
              }
            ])}
          />
        </section>

        <section data-scenario="completed" className="conversation-parity-scenario">
          <ScenarioHeading label="Completed" />
          <AssistantExecutionTimeline
            execution={projection('completed', [
              {
                id: 'finish',
                kind: 'finish',
                order: 1,
                answerMessageId: 'fixture-completed-message',
                fileChanges: { added: 1, modified: 2, deleted: 0 },
                artifacts: [
                  {
                    path: 'artifacts/message-parity-report.pdf',
                    name: 'message-parity-report.pdf',
                    mediaType: 'application/pdf',
                    sizeBytes: 84_120,
                    kind: 'pdf'
                  }
                ],
                images: []
              }
            ])}
          />
          <StreamingMessageContent
            content={[
              '### 完成结果',
              '',
              'Renderer Registry 已完成，并通过聚焦测试。',
              '',
              '| 项目 | 结果 |',
              '| --- | --- |',
              '| 工具视图 | 通过 |',
              '| 展示树 | 通过 |',
              '',
              '```ts',
              'const renderer = registry[node.kind]',
              '```'
            ].join('\n')}
            pending={false}
          >
            <FixtureActionBar />
          </StreamingMessageContent>
        </section>

        <section data-scenario="failed" className="conversation-parity-scenario">
          <ScenarioHeading label="Failed" />
          <AssistantExecutionTimeline
            execution={{
              ...projection('failed', [
                toolNode('failed-read', 'builtin.files.read', 'filesystem', 'failed', {
                  argumentsSummary: '{"path":"src/message.ts"}',
                  errorCode: 'tool_timeout',
                  error: 'Read timed out',
                  recoveryHint: '缩小读取范围后重试',
                  diagnosticId: 'toolerr_fixture_001'
                }),
                {
                  id: 'failed-notification',
                  kind: 'notification',
                  order: 2,
                  level: 'error',
                  message: '无法完成全部文件检查',
                  diagnosticId: 'node_fixture_001'
                }
              ]),
              error: '任务失败，请检查诊断信息。'
            }}
          />
        </section>

        <section data-scenario="sub-agent" className="conversation-parity-scenario">
          <ScenarioHeading label="Sub-agent" />
          <AssistantExecutionTimeline
            execution={projection('running', [
              {
                id: 'sub-agent-group',
                kind: 'sub_agent_group',
                order: 1,
                group: {
                  groupId: 'fixture-group',
                  callId: 'fixture-delegation',
                  parentRunId: 'fixture-run-sub-agent',
                  strategy: 'parallel',
                  status: 'running',
                  requestedAt: Date.now() - 3_000,
                  children: [
                    {
                      taskId: 'architecture',
                      childRunId: 'child-architecture',
                      childSessionId: 'session-architecture',
                      ordinal: 1,
                      agentName: '架构审查 Agent',
                      objective: '检查 Renderer 依赖边界',
                      status: 'completed',
                      resultSummary: '未发现反向依赖',
                      evidenceCount: 3,
                      artifactIds: [],
                      tree: [
                        toolNode(
                          'child-search',
                          'builtin.files.search',
                          'filesystem',
                          'completed',
                          {
                            argumentsSummary:
                              '{"path":"src","query":"AssistantDisplayNode"}',
                            resultSummary: '找到 12 个引用'
                          }
                        )
                      ]
                    },
                    {
                      taskId: 'visual',
                      childRunId: 'child-visual',
                      childSessionId: 'session-visual',
                      ordinal: 2,
                      agentName: '视觉验收 Agent',
                      objective: '比对三种窗口尺寸',
                      status: 'running',
                      progressSummary: '正在检查 1280 x 800',
                      evidenceCount: 1,
                      artifactIds: [],
                      tree: [commandNode('child-screenshot', 'running')]
                    }
                  ]
                }
              }
            ])}
          />
        </section>
      </div>
    </main>
  )
}

function ScenarioHeading({ label }: { label: string }): JSX.Element {
  return (
    <div className="conversation-parity-scenario__heading">
      <span>TRAE PARITY</span>
      <strong>{label}</strong>
    </div>
  )
}

function FixtureActionBar(): JSX.Element {
  const labels = {
    actions: translate('zh-CN', 'chat.messageActions'),
    copy: translate('zh-CN', 'chat.copyMessage'),
    share: translate('zh-CN', 'chat.share'),
    like: translate('zh-CN', 'chat.feedback.like'),
    dislike: translate('zh-CN', 'chat.feedback.dislike')
  }
  return (
    <div className="chat-message-actions" aria-label={labels.actions}>
      {[
        [labels.copy, Copy],
        [labels.share, Share2],
        [labels.like, ThumbsUp],
        [labels.dislike, ThumbsDown]
      ].map(([label, Icon]) => (
        <button
          key={label as string}
          type="button"
          className="chat-message-action"
          aria-label={label as string}
          title={label as string}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function projection(
  status: AssistantTurnProjection['status'],
  tree: AssistantDisplayNode[]
): AssistantTurnProjection {
  const now = Date.now()
  return {
    schemaVersion: 2,
    runId: `fixture-run-${status}-${tree[0]?.id ?? 'empty'}`,
    turnId: `fixture-turn-${status}-${tree[0]?.id ?? 'empty'}`,
    assistantMessageId: `fixture-message-${status}-${tree[0]?.id ?? 'empty'}`,
    status,
    startedAt: now - 2_500,
    completedAt: status === 'completed' ? now : undefined,
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

function expandedNodes(): AssistantDisplayNode[] {
  return [
    {
      id: 'references',
      kind: 'reference_group',
      order: 1,
      references: [
        {
          id: 'reference-local',
          title: '消息结构设计',
          sourceType: 'local_file',
          summary: '助手消息与工具时间线的展示约束'
        }
      ]
    },
    {
      id: 'reasoning',
      kind: 'reasoning',
      order: 2,
      content: '正在分析消息展示结构与工具语义。',
      status: 'streaming'
    },
    {
      id: 'command-group',
      kind: 'execution_group',
      order: 3,
      groupType: 'command',
      title: '已执行 2 条命令',
      status: 'completed',
      defaultExpanded: true,
      children: [
        toolNode(
          'command-completed',
          'builtin.process.run',
          'command',
          'completed',
          {
            argumentsSummary:
              '{"command":"npm test -- conversation"}',
            resultSummary: Array.from(
              { length: 18 },
              (_, index) => `PASS conversation renderer ${index + 1}`
            ).join('\n')
          }
        ),
        toolNode('stdin', 'write_stdin', 'command', 'completed', {
          argumentsSummary: '{"sessionId":"pty-7","input":"yes"}',
          resultSummary: 'Input delivered'
        })
      ]
    },
    {
      id: 'edit-group',
      kind: 'execution_group',
      order: 4,
      groupType: 'command',
      title: '已编辑 1 个文件，执行 1 条命令',
      status: 'completed',
      defaultExpanded: true,
      children: [
        toolNode(
          'edit-file',
          'builtin.files.write',
          'filesystem',
          'completed',
          {
            argumentsSummary: JSON.stringify({
              files: [
                {
                  path: 'src/features/conversation/tool-renderers.tsx',
                  additions: 28,
                  deletions: 11
                }
              ]
            }),
            resultSummary: 'File updated'
          }
        ),
        commandNode('edit-test', 'completed')
      ]
    },
    {
      id: 'todo',
      kind: 'todo_group',
      order: 5,
      todo: {
        todoId: 'fixture-todo',
        title: '实现消息 Parity',
        status: 'running',
        items: [
          {
            id: 'todo-renderers',
            ordinal: 1,
            title: '专用 Renderer',
            status: 'completed',
            children: []
          },
          {
            id: 'todo-visual',
            ordinal: 2,
            title: '视觉回归',
            status: 'running',
            children: [
              toolNode(
                'todo-image',
                'view_image',
                'other',
                'completed',
                {
                  argumentsSummary: '{"path":"artifacts/parity.png"}',
                  resultSummary: '1440 x 900'
                }
              )
            ]
          }
        ]
      }
    },
    {
      id: 'tools-group',
      kind: 'execution_group',
      order: 6,
      groupType: 'explore',
      title: '工具与内容',
      status: 'running',
      defaultExpanded: true,
      children: [
        toolNode('read', 'builtin.files.read', 'filesystem', 'completed', {
          argumentsSummary:
            '{"path":"src/features/conversation/AssistantDisplayTree.tsx","startLine":1,"endLine":48}',
          resultSummary: '读取 48 行'
        }),
        toolNode('search', 'builtin.web.search', 'web_search', 'completed', {
          argumentsSummary: '{"query":"React renderer registry"}',
          resultSummary: '找到 4 个来源'
        }),
        toolNode('widget', 'PureShowWidget', 'other', 'completed', {
          argumentsSummary: '{"title":"执行拓扑"}',
          resultSummary: 'Session → Turn → Tree → Renderer'
        }),
        toolNode(
          'skill',
          'rf_skill_builtin_skill_code_review_abcdef12',
          'skill',
          'completed'
        ),
        toolNode('mcp', 'mcp.docs.search', 'mcp', 'completed'),
        toolNode(
          'connector',
          'connector.feishu.search',
          'connector',
          'completed'
        ),
        toolNode('unknown', 'custom.future_tool', 'other', 'completed', {
          resultSummary: '安全摘要'
        })
      ]
    },
    {
      id: 'compact',
      kind: 'context_compaction',
      order: 7,
      compaction: {
        objectiveCount: 2,
        constraintCount: 4,
        incompleteItemCount: 1,
        sourceCount: 8,
        compactedAt: Date.now() - 1_000
      }
    }
  ]
}

function commandNode(
  id: string,
  status: ToolCallProjection['status']
): AssistantDisplayNode {
  return toolNode(id, 'builtin.process.run', 'command', status, {
    argumentsSummary: '{"command":"npm test -- conversation"}',
    progressSummary: status === 'running' ? '正在运行测试' : undefined,
    resultSummary: status === 'completed' ? '57 tests passed' : undefined
  })
}

function toolNode(
  id: string,
  toolName: string,
  category: ToolCallProjection['category'],
  status: ToolCallProjection['status'],
  patch: Partial<ToolCallProjection> = {}
): AssistantDisplayNode {
  const toolCall: ToolCallProjection = {
    callId: id,
    toolName,
    category,
    status,
    argumentsSummary: '',
    requestedAt: Date.now() - 2_000,
    startedAt: Date.now() - 1_500,
    completedAt: status === 'completed' || status === 'failed'
      ? Date.now() - 500
      : undefined,
    ...patch
  }
  return {
    id,
    kind: 'tool_call',
    order: 1,
    toolCall,
    view: { type: semanticType(category), title: toolName }
  }
}

function semanticType(
  category: ToolCallProjection['category']
): 'command' | 'web_search' | 'file' | 'skill' | 'agent' | 'mcp' | 'connector' | 'generic' {
  if (category === 'filesystem') return 'file'
  if (category === 'other') return 'generic'
  return category
}
