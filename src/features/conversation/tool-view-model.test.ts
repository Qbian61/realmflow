import { expect, it } from 'vitest'
import type { ToolCallProjection } from '../../../domain/assistant-turn'

async function assemble(toolCall: ToolCallProjection) {
  const module = await import('./tool-view-model').catch(() => undefined)
  return module?.assembleToolViewModel(toolCall)
}

async function summarize(toolCalls: ToolCallProjection[]) {
  const module = await import('./tool-view-model').catch(() => undefined)
  return module?.summarizeToolActivity(toolCalls)
}

function toolCall(
  toolName: string,
  category: ToolCallProjection['category'],
  patch: Partial<ToolCallProjection> = {}
): ToolCallProjection {
  return {
    callId: `call:${toolName}`,
    toolName,
    category,
    status: 'completed',
    argumentsSummary: '',
    requestedAt: 100,
    ...patch
  }
}

it.each([
  ['builtin.process.run', 'command', 'command'],
  ['write_stdin', 'command', 'write_stdin'],
  ['builtin.files.read', 'filesystem', 'file_read'],
  ['builtin.files.write', 'filesystem', 'file_edit'],
  ['builtin.files.list', 'filesystem', 'file_search'],
  ['builtin.files.search', 'filesystem', 'file_search'],
  ['builtin.web.search', 'web_search', 'web_search'],
  ['view_image', 'other', 'image'],
  ['PureShowWidget', 'other', 'widget'],
  ['rf_skill_builtin_skill_code_review_abcdef12', 'skill', 'skill'],
  ['mcp.docs.search', 'mcp', 'mcp'],
  ['connector.feishu.search', 'connector', 'connector'],
  ['custom.unknown', 'other', 'generic']
] as const)('classifies %s as the %s renderer', async (
  toolName,
  category,
  expectedKind
) => {
  expect(await assemble(toolCall(toolName, category))).toMatchObject({
    kind: expectedKind
  })
})

it('assembles edited files for the file card body', async () => {
  const view = await assemble(toolCall('builtin.files.write', 'filesystem', {
    argumentsSummary:
      '{"path":"src/features/conversation/AssistantDisplayTree.test.tsx"}'
  }))

  expect(view).toMatchObject({
    kind: 'file_edit',
    files: [
      {
        path: 'src/features/conversation/AssistantDisplayTree.test.tsx',
        fileName: 'AssistantDisplayTree.test.tsx'
      }
    ]
  })
})

it('suppresses transport boilerplate that adds no user-visible result', async () => {
  const view = await assemble(toolCall('rf_agents_list_8f16c2aa', 'other', {
    resultSummary: 'Tool execution completed'
  }))

  expect(view).toMatchObject({
    kind: 'generic',
    title: '查看 Agent 列表',
    output: ''
  })
})

it('assembles bounded command output without exposing secrets or absolute paths', async () => {
  const view = await assemble(toolCall('builtin.process.run', 'command', {
    argumentsSummary: JSON.stringify({
      command: 'npm test',
      cwd: '/Users/alice/private-repository',
      token: 'secret-value'
    }),
    resultSummary: `${'line\n'.repeat(2_000)}token=another-secret`
  }))

  expect(view).toMatchObject({
    kind: 'command',
    command: 'npm test',
    truncated: true
  })
  expect(JSON.stringify(view)).not.toContain('/Users/alice')
  expect(JSON.stringify(view)).not.toContain('secret-value')
  expect(JSON.stringify(view)).not.toContain('another-secret')
  expect(view?.output.length).toBeLessThanOrEqual(4_096)
})

it('preserves public diagnostics while replacing sensitive error details', async () => {
  const view = await assemble(toolCall('builtin.files.read', 'filesystem', {
    status: 'failed',
    errorCode: 'tool_timeout',
    error: '/Users/alice/private.txt timed out with token=secret',
    recoveryHint: 'Retry from /Users/alice/private.txt',
    diagnosticId: 'toolerr_0123456789abcdef'
  }))

  expect(view).toMatchObject({
    kind: 'error',
    message: '工具执行超时',
    diagnosticId: 'toolerr_0123456789abcdef'
  })
  expect(JSON.stringify(view)).not.toContain('/Users/alice')
  expect(JSON.stringify(view)).not.toContain('token=secret')
})

it.each([
  [
    'computer_accessibility_permission_required',
    '需要在系统设置中开启辅助功能权限',
    '打开 macOS 系统设置 > 隐私与安全性 > 辅助功能，允许 RealmFlow 控制电脑后重试。'
  ],
  [
    'computer_screen_recording_permission_required',
    '需要在系统设置中开启屏幕录制权限',
    '打开 macOS 系统设置 > 隐私与安全性 > 屏幕录制，允许 RealmFlow 读取屏幕后重试。'
  ],
  [
    'gateway_path_denied',
    '请求路径不在允许范围内',
    '在设置中授权该目录，或把操作范围改到已授权的工作区目录内。'
  ]
] as const)(
  'adds recovery guidance for non-dialog permission failure %s',
  async (errorCode, message, recoveryHint) => {
    const view = await assemble(toolCall('rf_builtin_computer_observe_12345678', 'other', {
      status: 'failed',
      errorCode,
      error: 'Permission needs to be fixed outside this conversation'
    }))

    expect(view).toMatchObject({
      kind: 'error',
      message,
      recoveryHint
    })
  }
)

it.each([
  ['rf_agents_list_8f16c2aa', '查看 Agent 列表'],
  ['rf_session_status_8f16c2aa', '查看会话状态'],
  ['rf_builtin_realmflow_spaces_list_8f16c2aa', '查看空间列表'],
  ['rf_automation_run_8f16c2aa', '运行自动化'],
  ['rf_sessions_list_8f16c2aa', '查看会话列表'],
  ['rf_gateway_a9c6e24a', '执行网关操作'],
  ['rf_automation_2cc08c9e', '执行自动化操作'],
  ['rf_sessions_2ca56720', '执行会话操作'],
  ['rf_progress_card_1d58a927', '更新任务进度']
] as const)('gives the RealmFlow facade %s a semantic title', async (
  toolName,
  title
) => {
  const view = await assemble(toolCall(toolName, 'other'))

  expect(view).toMatchObject({ title })
  expect(view?.title).not.toContain(toolName)
  expect(view?.title).not.toContain('未知工具')
})

it('summarizes adjacent file edits and commands without raw Tool names', async () => {
  const summary = await summarize([
    toolCall('builtin.files.write', 'filesystem', {
      argumentsSummary: '{"path":"src/index.css"}'
    }),
    toolCall('process.run', 'command', {
      argumentsSummary: '{"command":"npm test"}'
    })
  ])

  expect(summary).toBe('已编辑 1 个文件，执行 1 条命令')
})

it('counts file arrays and stdin continuations in the activity summary', async () => {
  const summary = await summarize([
    toolCall('builtin.files.write', 'filesystem', {
      argumentsSummary:
        '{"files":[{"path":"src/a.ts"},{"path":"src/a.ts"}]}'
    }),
    toolCall('process.run', 'command', {
      argumentsSummary: '{"command":"npm test"}'
    }),
    toolCall('write_stdin', 'command', {
      argumentsSummary: '{"sessionId":"pty-1","input":"yes"}'
    })
  ])

  expect(summary).toBe('已编辑 1 个文件，执行 2 条命令')
})

it('summarizes failed facade calls as one compact activity', async () => {
  const summary = await summarize([
    toolCall('rf_gateway_read_8f16c2aa', 'other', { status: 'failed' }),
    toolCall('rf_gateway_status_9a27d3bb', 'other', { status: 'failed' }),
    toolCall('rf_gateway_retry_0b38e4cc', 'other', { status: 'failed' })
  ])

  expect(summary).toBe('3 项操作失败')
  expect(summary).not.toContain('rf_gateway')
})

it('keeps mixed activity summaries generic when unrelated calls fail', async () => {
  const summary = await summarize([
    toolCall('rf_builtin_computer_observe_8f16c2aa', 'other', {
      status: 'failed',
      errorCode: 'permission_denied'
    }),
    toolCall('rf_builtin_web_fetch_9a27d3bb', 'web_search', {
      status: 'failed',
      errorCode: 'tool_effects_unresolved'
    }),
    toolCall('rf_automation_0b38e4cc', 'other', {
      status: 'completed'
    })
  ])

  expect(summary).toBe('已执行 1 项操作，2 项失败')
  expect(summary).not.toContain('自动化')
})
