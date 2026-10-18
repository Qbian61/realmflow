import type { ToolCallProjection } from '../../../domain/assistant-turn'

const MAX_TEXT_LENGTH = 4_096
const SECRET_KEY =
  /^(authorization|cookie|credential|password|secret|token|api[_-]?key)$/i
const ABSOLUTE_PATH = /(?:\/Users|\/home|\/tmp|[A-Za-z]:\\)[^\s"',}]*/g
const INLINE_SECRET =
  /\b(?:authorization|cookie|credential|password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi

type ToolRendererKind =
  | 'command'
  | 'write_stdin'
  | 'file_read'
  | 'file_edit'
  | 'file_search'
  | 'web_search'
  | 'image'
  | 'widget'
  | 'skill'
  | 'agent'
  | 'mcp'
  | 'connector'
  | 'generic'
  | 'error'

export type ToolViewModel = {
  kind: ToolRendererKind
  callId: string
  title: string
  status: ToolCallProjection['status']
  toolName: string
  command?: string
  processTarget?: string
  input?: string
  path?: string
  fileName?: string
  files?: Array<{
    path: string
    fileName: string
    additions?: number
    deletions?: number
  }>
  lineRange?: string
  query?: string
  output: string
  summary?: string
  truncated: boolean
  artifactIds: string[]
  errorCode?: string
  message?: string
  recoveryHint?: string
  diagnosticId?: string
}

export function assembleToolViewModel(
  toolCall: ToolCallProjection
): ToolViewModel {
  const args = parseSummary(toolCall.argumentsSummary)
  const rawOutput = toolCall.resultSummary ?? toolCall.progressSummary ?? ''
  const output = boundText(redactText(userVisibleOutput(rawOutput)))
  const base = {
    callId: toolCall.callId,
    status: toolCall.status,
    toolName: toolCall.toolName,
    output: output.text,
    message:
      toolCall.status === 'waiting_permission'
        ? optionalText(toolCall.error)
        : undefined,
    truncated: output.truncated,
    artifactIds: [...(toolCall.artifactIds ?? [])],
    diagnosticId: safeDiagnosticId(toolCall.diagnosticId)
  }
  if (toolCall.status === 'failed') {
    return {
      ...base,
      kind: 'error',
      title: failedToolTitle(toolCall, args),
      errorCode: toolCall.errorCode,
      message: publicError(toolCall.errorCode, toolCall.error),
      recoveryHint: publicRecoveryHint(toolCall.errorCode, toolCall.recoveryHint)
    }
  }

  const kind = classifyTool(toolCall)
  if (kind === 'command') {
    const command = firstText(args, ['command', 'cmd', 'script', 'value']) || '命令'
    return {
      ...base,
      kind,
      command,
      title: `运行 ${command}`
    }
  }
  if (kind === 'write_stdin') {
    const processTarget =
      firstText(args, ['sessionId', 'session_id', 'processId', 'pid']) || '进程'
    return {
      ...base,
      kind,
      processTarget,
      input: firstText(args, ['input', 'chars', 'data']),
      title: `向进程 ${processTarget} 发送输入`
    }
  }
  if (kind === 'file_edit') {
    const files = editedFilesFromArguments(args)
    return {
      ...base,
      kind,
      files,
      title: `编辑 ${files.length || 1} 个文件`
    }
  }
  if (kind === 'file_read') {
    const path = firstText(args, ['path', 'filePath', 'file', 'target']) || '文件'
    const start = firstNumber(args, ['startLine', 'start_line', 'offset'])
    const end = firstNumber(args, ['endLine', 'end_line'])
    return {
      ...base,
      kind,
      path,
      fileName: basename(path),
      lineRange:
        start === undefined
          ? undefined
          : end === undefined
            ? `第 ${start} 行起`
            : `第 ${start}-${end} 行`,
      title: `读取 ${path}`
    }
  }
  if (kind === 'file_search') {
    const path = firstText(args, ['path', 'directory', 'root']) || '工作区'
    const query = firstText(args, ['query', 'pattern', 'glob']) || '文件'
    return {
      ...base,
      kind,
      path,
      query,
      title: `在 ${path} 中搜索 ${query}`
    }
  }
  if (kind === 'web_search') {
    const query = firstText(args, ['query', 'q', 'keyword']) || '网页'
    return { ...base, kind, query, title: `搜索 ${query}` }
  }
  if (kind === 'image') {
    const path = firstText(args, ['path', 'imagePath', 'file']) || '图片'
    return {
      ...base,
      kind,
      path,
      fileName: basename(path),
      title: `查看 ${basename(path)}`
    }
  }
  if (kind === 'widget') {
    const title = firstText(args, ['title', 'name']) || '交互内容'
    return { ...base, kind, title }
  }
  if (kind === 'skill') {
    return { ...base, kind, title: `技能 · ${readableToolName(toolCall.toolName)}` }
  }
  if (kind === 'mcp') {
    return { ...base, kind, title: `MCP · ${stripPrefix(toolCall.toolName, 'mcp.')}` }
  }
  if (kind === 'connector') {
    return {
      ...base,
      kind,
      title: `连接器 · ${stripPrefix(toolCall.toolName, 'connector.')}`
    }
  }
  if (kind === 'agent') {
    return { ...base, kind, title: `子 Agent · ${readableToolName(toolCall.toolName)}` }
  }
  const facadeTitle = realmFlowFacadeTitle(toolCall.toolName)
  return {
    ...base,
    kind: 'generic',
    title: facadeTitle ?? `使用 ${readableToolName(toolCall.toolName)}`
  }
}

export function summarizeToolActivity(
  toolCalls: readonly ToolCallProjection[]
): string {
  const failedCount = toolCalls.filter(({ status }) => status === 'failed').length
  if (failedCount === toolCalls.length) {
    return `${failedCount} 项操作失败`
  }

  const completed = toolCalls.filter(({ status }) => status !== 'failed')
  const editedFiles = new Set(
    completed
      .filter(isFileEdit)
      .flatMap((toolCall) =>
        editedFilesFromArguments(
          parseSummary(toolCall.argumentsSummary)
        ).map((file) => file.path)
      )
      .filter(Boolean)
  )
  const commandCount = completed.filter(
    (toolCall) =>
      classifyTool(toolCall) === 'command' ||
      classifyTool(toolCall) === 'write_stdin'
  ).length
  const describedCount = editedFiles.size + commandCount
  const otherCalls = completed.filter(
    (toolCall) =>
      !isFileEdit(toolCall) &&
      classifyTool(toolCall) !== 'command' &&
      classifyTool(toolCall) !== 'write_stdin'
  )
  const parts: string[] = []

  if (editedFiles.size > 0) {
    parts.push(`已编辑 ${editedFiles.size} 个文件`)
  }
  if (commandCount > 0) {
    parts.push(`${parts.length > 0 ? '' : '已'}执行 ${commandCount} 条命令`)
  }
  if (otherCalls.length === 1 && describedCount === 0 && failedCount === 0) {
    parts.push(completedActivityTitle(otherCalls[0]))
  } else if (otherCalls.length > 0) {
    parts.push(`${parts.length > 0 ? '' : '已'}执行 ${otherCalls.length} 项操作`)
  }
  if (failedCount > 0) {
    parts.push(`${failedCount} 项失败`)
  }
  return parts.join('，') || '执行操作'
}

function failedToolTitle(
  toolCall: ToolCallProjection,
  args: Record<string, unknown>
): string {
  const kind = classifyTool(toolCall)
  if (kind === 'command') {
    return `运行 ${firstText(args, ['command', 'cmd', 'script', 'value']) || '命令'}失败`
  }
  if (kind === 'write_stdin') {
    const target =
      firstText(args, ['sessionId', 'session_id', 'processId', 'pid']) || '进程'
    return `向进程 ${target} 发送输入失败`
  }
  if (kind === 'file_read') {
    return `读取 ${firstText(args, ['path', 'filePath', 'file', 'target']) || '文件'}失败`
  }
  if (kind === 'skill') {
    return `技能 ${readableToolName(toolCall.toolName)} 调用失败`
  }
  const facadeTitle = realmFlowFacadeTitle(toolCall.toolName)
  return facadeTitle ? `${facadeTitle}失败` : '工具执行失败'
}

function classifyTool(toolCall: ToolCallProjection): ToolRendererKind {
  const name = toolCall.toolName.toLowerCase()
  if (/(?:^|[._-])(?:write_stdin|stopcommand)(?:$|[._-])/.test(name)) {
    return 'write_stdin'
  }
  if (/(?:^|[._-])(?:process[._-]run|exec_command|shell)(?:$|[._-])/.test(name)) {
    return 'command'
  }
  if (isFileEdit(toolCall)) return 'file_edit'
  if (/(?:^|[._-])(?:files?[._-]read|documents?[._-]read|read)(?:$|[._-])/.test(name)) {
    return 'file_read'
  }
  if (/(?:^|[._-])(?:files?[._-](?:search|list)|grep|ls)(?:$|[._-])/.test(name)) {
    return 'file_search'
  }
  if (/(?:view_image|image_generate|images?[._-](?:inspect|thumbnail))/.test(name)) {
    return 'image'
  }
  if (/(?:pureshowwidget|pure_show_widget|widget)/.test(name)) return 'widget'
  if (toolCall.category === 'web_search') return 'web_search'
  if (toolCall.category === 'skill') return 'skill'
  if (toolCall.category === 'agent') return 'agent'
  if (toolCall.category === 'mcp') return 'mcp'
  if (toolCall.category === 'connector') return 'connector'
  if (toolCall.category === 'command') return 'command'
  if (toolCall.category === 'filesystem') return 'file_search'
  return 'generic'
}

function parseSummary(value: string): Record<string, unknown> {
  if (!value.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? redactRecord(parsed) : { value: redactUnknown(parsed) }
  } catch {
    return { value: redactText(value) }
  }
}

function redactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      SECRET_KEY.test(key) ? '[redacted]' : redactUnknown(value)
    ])
  )
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.slice(0, 50).map(redactUnknown)
  if (isRecord(value)) return redactRecord(value)
  return value
}

function redactText(value: string): string {
  return value
    .replace(ABSOLUTE_PATH, '[local path]')
    .replace(INLINE_SECRET, '[redacted]')
}

function firstText(
  value: Record<string, unknown>,
  keys: readonly string[]
): string {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return boundText(redactText(candidate.trim())).text
    }
  }
  return ''
}

function firstNumber(
  value: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const candidate = value[key]
    if (Number.isInteger(candidate) && Number(candidate) >= 0) {
      return Number(candidate)
    }
  }
  return undefined
}

function editedFilesFromArguments(
  args: Record<string, unknown>
): NonNullable<ToolViewModel['files']> {
  const candidates: unknown[] = []
  for (const key of ['path', 'filePath', 'file', 'target']) {
    if (typeof args[key] === 'string') candidates.push(args[key])
  }
  for (const key of ['paths', 'files']) {
    if (Array.isArray(args[key])) candidates.push(...args[key])
  }
  const seen = new Set<string>()
  return candidates.flatMap((candidate) => {
    const record = isRecord(candidate) ? candidate : undefined
    const path =
      typeof candidate === 'string'
        ? candidate
        : record
          ? firstText(record, ['path', 'filePath', 'file', 'target'])
          : ''
    if (!path || seen.has(path)) return []
    seen.add(path)
    return [{
      path,
      fileName: basename(path),
      ...(record && firstNumber(record, ['additions', 'added']) !== undefined
        ? { additions: firstNumber(record, ['additions', 'added']) }
        : {}),
      ...(record && firstNumber(record, ['deletions', 'deleted', 'removed']) !== undefined
        ? { deletions: firstNumber(record, ['deletions', 'deleted', 'removed']) }
        : {})
    }]
  })
}

function publicError(code: string | undefined, fallback: string | undefined): string {
  const labels: Record<string, string> = {
    tool_timeout: '工具执行超时',
    tool_output_limit: '工具输出超过限制',
    tool_memory_limit: '工具内存超过限制',
    tool_sandbox_unavailable: '当前设备无法提供安全执行环境',
    sandbox_unavailable: '当前设备无法提供安全执行环境',
    tool_sandbox_manifest_invalid: '工具安全策略校验失败',
    skill_connector_unavailable: '技能连接器不可用',
    run_suspended: '任务暂停，工具未继续执行',
    gateway_path_denied: '请求路径不在允许范围内',
    permission_denied: '缺少执行此操作所需的权限',
    computer_accessibility_permission_required: '需要在系统设置中开启辅助功能权限',
    computer_screen_recording_permission_required: '需要在系统设置中开启屏幕录制权限',
    computer_application_not_authorized: '目标应用尚未授权给电脑控制工具',
    connector_permission_required: '连接器需要先完成授权',
    connector_permission_denied: '连接器授权被拒绝',
    tool_effects_unresolved: '工具影响范围无法确认'
  }
  const fallbackText = optionalText(fallback)
  return (
    labels[code ?? ''] ??
    labels[fallbackText ?? ''] ??
    fallbackText ??
    '工具执行失败'
  )
}

function publicRecoveryHint(
  code: string | undefined,
  provided: string | undefined
): string | undefined {
  const hints: Record<string, string> = {
    computer_accessibility_permission_required:
      '打开 macOS 系统设置 > 隐私与安全性 > 辅助功能，允许 RealmFlow 控制电脑后重试。',
    computer_screen_recording_permission_required:
      '打开 macOS 系统设置 > 隐私与安全性 > 屏幕录制，允许 RealmFlow 读取屏幕后重试。',
    computer_application_not_authorized:
      '在 RealmFlow 设置中授权目标应用，或切换到已授权的应用后重试。',
    connector_permission_required:
      '在连接器设置中完成账号授权后重试。',
    connector_permission_denied:
      '在连接器设置中重新授权，或切换到已授权的连接器账号后重试。',
    gateway_path_denied:
      '在设置中授权该目录，或把操作范围改到已授权的工作区目录内。',
    permission_denied:
      '如果这是你希望执行的操作，请在工具授权、连接器或系统设置中补齐权限后重试。',
    tool_effects_unresolved:
      '检查工具参数或运行时配置后重试；如果需要访问外部服务，请先完成对应连接器设置。'
  }
  return hints[code ?? ''] ?? optionalText(provided)
}

function optionalText(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  return boundText(redactText(value.trim())).text
}

function userVisibleOutput(value: string): string {
  return /^(?:tool|skill|agent)\s+execution\s+(?:completed|succeeded)$/i.test(
    value.trim()
  )
    ? ''
    : value
}

function safeDiagnosticId(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9:_-]{1,128}$/.test(value) ? value : undefined
}

function boundText(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_TEXT_LENGTH) return { text: value, truncated: false }
  return {
    text: `${value.slice(0, MAX_TEXT_LENGTH - 12)}\n[truncated]`,
    truncated: true
  }
}

function readableToolName(value: string): string {
  return value
    .replace(/_[a-f0-9]{8,}$/i, '')
    .replace(/^rf_skill_/, '')
    .replace(/^(?:builtin|uploaded)_skill_/, '')
    .replaceAll('_', ' ')
    .trim() || '未命名'
}

function realmFlowFacadeTitle(value: string): string | undefined {
  const name = value.toLowerCase().replace(/_[a-f0-9]{8,}$/i, '')
  if (/^rf_agents_list(?:_|$)/.test(name)) return '查看 Agent 列表'
  if (/^rf_session_status(?:_|$)/.test(name)) return '查看会话状态'
  if (/^rf_builtin_realmflow_spaces_list(?:_|$)/.test(name)) {
    return '查看空间列表'
  }
  if (/^rf_automation_(?:run|execute)(?:_|$)/.test(name)) return '运行自动化'
  if (/^rf_sessions_list(?:_|$)/.test(name)) return '查看会话列表'
  if (/^rf_progress_card(?:_|$)/.test(name)) return '更新任务进度'
  if (/^rf_gateway(?:_|$)/.test(name)) return '执行网关操作'
  if (/^rf_automation(?:_|$)/.test(name)) return '执行自动化操作'
  if (/^rf_sessions?(?:_|$)/.test(name)) return '执行会话操作'
  if (/^rf_agents?(?:_|$)/.test(name)) return '执行 Agent 操作'
  if (/^rf_builtin(?:_|$)/.test(name)) return '执行内置工具'
  return undefined
}

function isFileEdit(toolCall: ToolCallProjection): boolean {
  if (/(?:^|[._-])(?:write_stdin|stopcommand)(?:$|[._-])/i.test(
    toolCall.toolName
  )) {
    return false
  }
  return /(?:^|[._-])(?:write|edit|replace|patch|insert|delete|apply_patch)(?:$|[._-])/i
    .test(toolCall.toolName)
}

function completedActivityTitle(toolCall: ToolCallProjection): string {
  const title = realmFlowFacadeTitle(toolCall.toolName)
  if (!title) return '已执行 1 项操作'
  return title.startsWith('执行')
    ? `已${title}`
    : `已${title}`
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function basename(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean)
  return parts.at(-1) ?? path
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
