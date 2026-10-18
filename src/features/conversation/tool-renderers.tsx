import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  File,
  FileCode2,
  FilePenLine,
  FileSearch,
  Image,
  Plug,
  Search,
  SquareTerminal,
  TriangleAlert,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ToolViewModel } from './tool-view-model'

type ToolRendererProps = {
  viewModel: ToolViewModel
}

export function ToolRenderer({
  viewModel
}: ToolRendererProps): JSX.Element {
  const Icon = toolIcon(viewModel)
  const heading = toolHeading(viewModel)
  const suffix = toolSuffix(viewModel)
  const copyValue = toolCopyValue(viewModel)
  const body = toolBody(viewModel)
  const permissionNotice = waitingPermissionNotice(viewModel)

  return (
    <section
      className={`assistant-tool-card ${viewModel.kind} ${viewModel.status}`}
      role="group"
      aria-label={heading}
    >
      <header className="assistant-tool-card__header">
        <span className="assistant-tool-card__icon">
          <Icon aria-hidden="true" />
        </span>
        <div className="assistant-tool-card__title-area">
          <span className="assistant-tool-card__title">{heading}</span>
          {suffix ? (
            <span className="assistant-tool-card__suffix">
              <span className="assistant-tool-card__summary" title={suffix}>
                {suffix}
              </span>
              {copyValue ? (
                <CopyToolValue
                  value={copyValue}
                  label={
                    viewModel.kind === 'command'
                      ? '复制命令'
                      : '复制工具详情'
                  }
                />
              ) : null}
            </span>
          ) : null}
        </div>
      </header>
      {body || permissionNotice ? (
        <div className="assistant-tool-card__body-row">
          <span className="assistant-tool-card__connector" aria-hidden="true" />
          <div className="assistant-tool-card__body">
            {body}
            {permissionNotice}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function waitingPermissionNotice(
  viewModel: ToolViewModel
): JSX.Element | null {
  if (viewModel.status !== 'waiting_permission' || !viewModel.message) {
    return null
  }
  return (
    <p className="assistant-tool-permission-detail">
      {viewModel.message}
    </p>
  )
}

function toolBody(viewModel: ToolViewModel): JSX.Element | null {
  switch (viewModel.kind) {
    case 'command':
      return <CommandRenderer viewModel={viewModel} />
    case 'write_stdin':
      return <WriteStdinRenderer viewModel={viewModel} />
    case 'file_edit':
      return <FileEditRenderer viewModel={viewModel} />
    case 'file_read':
      return <FileReadRenderer viewModel={viewModel} />
    case 'file_search':
      return viewModel.output
        ? <SimpleOutput viewModel={viewModel} />
        : null
    case 'web_search':
      return viewModel.output
        ? <SimpleOutput viewModel={viewModel} />
        : null
    case 'image':
      return <ImageRenderer viewModel={viewModel} />
    case 'widget':
      return <WidgetRenderer viewModel={viewModel} />
    case 'error':
      return <ErrorRenderer viewModel={viewModel} />
    case 'skill':
    case 'agent':
    case 'mcp':
    case 'connector':
    case 'generic':
      return viewModel.output
        ? <SimpleOutput viewModel={viewModel} />
        : null
  }
}

function CommandRenderer({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <CollapsibleToolContent
      output={viewModel.output}
      ariaLabel="命令输出"
    >
      <div className="assistant-tool-command-line">
        <span aria-hidden="true">$</span>
        <code>{viewModel.command}</code>
      </div>
      <ToolOutput viewModel={viewModel} />
    </CollapsibleToolContent>
  )
}

function WriteStdinRenderer({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <CollapsibleToolContent
      output={viewModel.output}
      ariaLabel="进程输入输出"
    >
      {viewModel.input ? (
        <div className="assistant-tool-command-line">
          <span aria-hidden="true">$</span>
          <code>{viewModel.input}</code>
        </div>
      ) : null}
      <ToolOutput viewModel={viewModel} />
    </CollapsibleToolContent>
  )
}

function FileEditRenderer({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <div className="assistant-tool-file-list">
      {(viewModel.files ?? []).map((file) => (
        <div className="assistant-tool-file-item" key={file.path}>
          <FileCode2 aria-hidden="true" />
          <span title={file.path}>{file.fileName}</span>
          {file.additions !== undefined || file.deletions !== undefined ? (
            <span className="assistant-tool-file-diff">
              {file.additions !== undefined ? (
                <span className="additions">{`+${file.additions}`}</span>
              ) : null}
              {file.deletions !== undefined ? (
                <span className="deletions">{`-${file.deletions}`}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function FileReadRenderer({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <div className="assistant-tool-file-detail">
      <div className="assistant-tool-file-item">
        <File aria-hidden="true" />
        <span title={viewModel.path}>{viewModel.fileName ?? viewModel.path}</span>
        {viewModel.lineRange ? <small>{viewModel.lineRange}</small> : null}
      </div>
      {viewModel.output ? (
        <CollapsibleToolContent
          output={viewModel.output}
          ariaLabel="文件读取结果"
        >
          <ToolOutput viewModel={viewModel} />
        </CollapsibleToolContent>
      ) : null}
    </div>
  )
}

function SimpleOutput({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <CollapsibleToolContent
      output={viewModel.output}
      ariaLabel="工具输出"
    >
      <ToolOutput viewModel={viewModel} />
    </CollapsibleToolContent>
  )
}

function ImageRenderer({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <figure className="assistant-tool-image">
      <div role="img" aria-label={viewModel.fileName ?? '图片'}>
        <Image aria-hidden="true" />
      </div>
      <figcaption>
        <code>{viewModel.path}</code>
        {viewModel.output ? <span>{viewModel.output}</span> : null}
      </figcaption>
    </figure>
  )
}

function WidgetRenderer({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <div className="assistant-tool-widget">
      <iframe
        title={viewModel.title}
        sandbox=""
        srcDoc={widgetDocument(viewModel.title, viewModel.output)}
      />
    </div>
  )
}

function ErrorRenderer({ viewModel }: ToolRendererProps): JSX.Element {
  return (
    <div className="assistant-tool-error-detail">
      <p>{viewModel.message}</p>
      {viewModel.recoveryHint ? (
        <p className="assistant-tool-call-recovery">{viewModel.recoveryHint}</p>
      ) : null}
      {viewModel.diagnosticId ? (
        <p className="assistant-tool-call-diagnostic">
          {`诊断 ID：${viewModel.diagnosticId}`}
        </p>
      ) : null}
    </div>
  )
}

function CollapsibleToolContent({
  output,
  ariaLabel,
  children
}: {
  output: string
  ariaLabel: string
  children: ReactNode
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const collapsible =
    output.length > 1_200 || output.split('\n').length > 12
  return (
    <div
      className={[
        'assistant-tool-surface',
        collapsible && !expanded ? 'collapsed' : '',
        collapsible && expanded ? 'expanded' : ''
      ].filter(Boolean).join(' ')}
      role="region"
      aria-label={ariaLabel}
    >
      <div className="assistant-tool-surface__body">
        <div className="assistant-tool-surface__inner">
          {children}
        </div>
      </div>
      {collapsible ? (
        <button
          type="button"
          className="assistant-tool-surface__toggle"
          aria-label={expanded ? '收起命令输出' : '展开命令输出'}
          title={expanded ? '收起命令输出' : '展开命令输出'}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  )
}

function CopyToolValue({
  value,
  label
}: {
  value: string
  label: string
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="assistant-tool-card__copy"
      aria-label={copied ? '已复制' : label}
      title={copied ? '已复制' : label}
      onClick={() => {
        const copy = navigator.clipboard?.writeText(value)
        if (!copy) return
        void copy
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1_200)
          })
          .catch(() => setCopied(false))
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </button>
  )
}

function ToolOutput({ viewModel }: ToolRendererProps): JSX.Element | null {
  if (!viewModel.output) return null
  return <pre className="assistant-tool-output">{viewModel.output}</pre>
}

function toolHeading(viewModel: ToolViewModel): string {
  if (
    viewModel.status === 'failed' ||
    viewModel.kind === 'generic' ||
    viewModel.kind === 'skill' ||
    viewModel.kind === 'agent' ||
    viewModel.kind === 'mcp' ||
    viewModel.kind === 'connector'
  ) {
    return viewModel.title
  }
  if (viewModel.status === 'waiting_permission') return '等待授权'
  const running =
    viewModel.status === 'requested' || viewModel.status === 'running'
  const labels: Record<ToolViewModel['kind'], [string, string]> = {
    command: ['命令执行中', '命令已执行'],
    write_stdin: ['正在发送输入', '输入已发送'],
    file_edit: ['正在编辑', '已编辑'],
    file_read: ['正在读取', '文件已读取'],
    file_search: ['正在搜索', '搜索已完成'],
    web_search: ['正在搜索', '搜索已完成'],
    image: ['正在查看图片', '图片已查看'],
    widget: ['正在生成内容', '内容已生成'],
    skill: ['正在调用技能', '技能已调用'],
    agent: ['正在调用 Agent', 'Agent 已调用'],
    mcp: ['正在调用 MCP', 'MCP 已调用'],
    connector: ['正在调用连接器', '连接器已调用'],
    generic: ['工具执行中', '工具已执行'],
    error: ['工具执行失败', '工具执行失败']
  }
  return labels[viewModel.kind][running ? 0 : 1]
}

function toolSuffix(viewModel: ToolViewModel): string {
  if (
    viewModel.kind === 'error' ||
    viewModel.kind === 'generic' ||
    viewModel.kind === 'skill' ||
    viewModel.kind === 'agent' ||
    viewModel.kind === 'mcp' ||
    viewModel.kind === 'connector'
  ) {
    return ''
  }
  if (viewModel.kind === 'command') return viewModel.command ?? viewModel.title
  if (viewModel.kind === 'file_edit') {
    return `${viewModel.files?.length || 1}个文件`
  }
  if (viewModel.kind === 'file_read') {
    return viewModel.fileName ?? viewModel.title
  }
  return viewModel.title
}

function toolCopyValue(viewModel: ToolViewModel): string | undefined {
  if (viewModel.kind === 'command') return viewModel.command
  if (viewModel.kind === 'write_stdin') return viewModel.input
  return undefined
}

function toolIcon(
  viewModel: ToolViewModel
): LucideIcon {
  if (viewModel.status === 'failed' || viewModel.kind === 'error') {
    return TriangleAlert
  }
  return {
    command: SquareTerminal,
    write_stdin: SquareTerminal,
    file_read: File,
    file_edit: FilePenLine,
    file_search: FileSearch,
    web_search: Search,
    image: Image,
    widget: Image,
    skill: Wrench,
    agent: Bot,
    mcp: Plug,
    connector: Plug,
    generic: Wrench,
    error: TriangleAlert
  }[viewModel.kind]
}

function widgetDocument(title: string, content: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="color-scheme" content="light dark">',
    '<style>body{margin:0;padding:12px;font:13px system-ui;overflow-wrap:anywhere}',
    'h1{margin:0 0 8px;font-size:14px}p{margin:0;white-space:pre-wrap}</style>',
    `</head><body><h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(content || 'Widget ready')}</p></body></html>`
  ].join('')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] ?? character)
}
