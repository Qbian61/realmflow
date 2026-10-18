import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  File,
  Image as ImageIcon,
  ListTodo,
  TriangleAlert
} from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import type {
  AssistantDisplayNode,
  AssistantExecutionGroupNode,
  AssistantTurnStatus,
  SubAgentChildProjection,
  TodoItemProjection
} from '../../../domain/assistant-turn'
import type { Translator } from '../../localization/translate'
import type { AssistantDisclosureState } from './use-assistant-disclosure-state'
import { ToolRenderer } from './tool-renderers'
import {
  assembleToolViewModel,
  summarizeToolActivity
} from './tool-view-model'

type NodeRendererProps = {
  node: AssistantDisplayNode
  disclosure: AssistantDisclosureState
  t: Translator
}

const NODE_RENDERERS: Record<
  AssistantDisplayNode['kind'],
  ComponentType<NodeRendererProps>
> = {
  execution_group: ExecutionGroupRenderer,
  tool_call: ToolCallRenderer,
  reasoning: ReasoningRenderer,
  notification: NotificationRenderer,
  reference_group: ReferenceGroupRenderer,
  context_compaction: ContextCompactionRenderer,
  sub_agent_group: SubAgentGroupRenderer,
  todo_group: TodoGroupRenderer,
  artifact: ArtifactRenderer,
  widget: WidgetRenderer,
  finish: FinishRenderer
}

export function AssistantNodeRenderer(
  props: NodeRendererProps
): JSX.Element {
  const kind = runtimeKind(props.node)
  const Renderer = NODE_RENDERERS[kind]
  return Renderer
    ? <Renderer {...props} />
    : <UnknownAssistantNode node={props.node} t={props.t} />
}

export function SortedAssistantNodes({
  nodes,
  disclosure,
  t
}: {
  nodes: readonly AssistantDisplayNode[]
  disclosure: AssistantDisclosureState
  t: Translator
}): JSX.Element {
  return (
    <>
      {[...nodes]
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((node) => (
          <AssistantNodeRenderer
            key={node.id}
            node={node}
            disclosure={disclosure}
            t={t}
          />
        ))}
    </>
  )
}

function ExecutionGroupRenderer({
  node,
  disclosure,
  t
}: NodeRendererProps): JSX.Element {
  const group = node as AssistantExecutionGroupNode
  if (group.groupType === 'progress' || group.groupType === 'sub_agent') {
    return (
      <div
        className={
          group.groupType === 'progress'
            ? 'assistant-progress-group'
            : 'assistant-sub-agent-execution-group'
        }
      >
        <SortedAssistantNodes
          nodes={group.children}
          disclosure={disclosure}
          t={t}
        />
      </div>
    )
  }
  const toolCalls = group.children.flatMap((child) =>
    child.kind === 'tool_call' ? [child.toolCall] : []
  )
  const hasFailedToolCalls = toolCalls.some(
    (toolCall) => toolCall.status === 'failed'
  )
  const summary =
    toolCalls.length > 0
      ? summarizeToolActivity(toolCalls)
      : group.title
  const label = `${summary}${executionGroupStatusSuffix(group)}`
  return (
    <DisplayDisclosure
      className={`assistant-display-group ${group.groupType}`}
      disclosure={disclosure}
      nodeKey={group.id}
      label={label}
      defaultOpen={
        group.defaultExpanded ||
        hasFailedToolCalls ||
        (group.status !== 'running' && shouldAutoExpand(group.status))
      }
    >
      <div className="assistant-display-group-children">
        <SortedAssistantNodes
          nodes={group.children}
          disclosure={disclosure}
          t={t}
        />
      </div>
    </DisplayDisclosure>
  )
}

function executionGroupStatusSuffix(
  group: AssistantExecutionGroupNode
): string {
  if (group.status === 'waiting_permission') return '，等待授权'
  return ''
}

function ToolCallRenderer({
  node
}: NodeRendererProps): JSX.Element {
  if (node.kind !== 'tool_call') return <UnknownAssistantNode node={node} />
  const viewModel = assembleToolViewModel(node.toolCall)
  return (
    <div className={`assistant-display-tool ${viewModel.kind}`}>
      <ToolRenderer viewModel={viewModel} />
    </div>
  )
}

function ReasoningRenderer({ node }: NodeRendererProps): JSX.Element {
  if (node.kind !== 'reasoning') return <UnknownAssistantNode node={node} />
  return (
    <p
      className="assistant-display-reasoning"
      data-streaming={node.status === 'streaming' ? 'true' : undefined}
    >
      {node.content}
    </p>
  )
}

function NotificationRenderer({ node }: NodeRendererProps): JSX.Element {
  if (node.kind !== 'notification') return <UnknownAssistantNode node={node} />
  return (
    <div
      className={`assistant-display-notification ${node.level}`}
      role={node.level === 'error' ? 'alert' : 'status'}
    >
      {node.level === 'error' ? <TriangleAlert aria-hidden="true" /> : null}
      <p>{node.message}</p>
      {node.diagnosticId ? <DiagnosticId value={node.diagnosticId} /> : null}
    </div>
  )
}

function ReferenceGroupRenderer({
  node,
  disclosure
}: NodeRendererProps): JSX.Element {
  if (node.kind !== 'reference_group') {
    return <UnknownAssistantNode node={node} />
  }
  return (
    <DisplayDisclosure
      className="assistant-reference-group"
      disclosure={disclosure}
      nodeKey={node.id}
      label="参考内容"
      defaultOpen={false}
    >
      <ul className="assistant-reference-list">
        {node.references.map((reference) => (
          <li key={reference.id}>
            {safeWebUrl(reference.location) ? (
              <a
                href={reference.location}
                target="_blank"
                rel="noreferrer noopener"
              >
                {reference.title}
              </a>
            ) : (
              <strong>{reference.title}</strong>
            )}
            <span>{reference.summary}</span>
          </li>
        ))}
      </ul>
    </DisplayDisclosure>
  )
}

function ContextCompactionRenderer({ node, t }: NodeRendererProps): JSX.Element {
  if (node.kind !== 'context_compaction') {
    return <UnknownAssistantNode node={node} t={t} />
  }
  const value = node.compaction
  return (
    <div className="assistant-context-compaction">
      <strong>{t('chat.execution.compacted')}</strong>
      <span>
        {t('chat.execution.compactionSummary', {
          objectives: value.objectiveCount,
          constraints: value.constraintCount,
          incompleteItems: value.incompleteItemCount,
          sources: value.sourceCount
        })}
      </span>
    </div>
  )
}

function TodoGroupRenderer({
  node,
  disclosure,
  t
}: NodeRendererProps): JSX.Element {
  if (node.kind !== 'todo_group') return <UnknownAssistantNode node={node} />
  return (
    <DisplayDisclosure
      className="assistant-todo-group"
      disclosure={disclosure}
      nodeKey={node.id}
      label={node.todo.title}
      defaultOpen={node.todo.status === 'running' || node.todo.status === 'failed'}
    >
      <ol className="assistant-todo-items">
        {[...node.todo.items]
          .sort((left, right) => left.ordinal - right.ordinal)
          .map((item) => (
            <TodoItem
              key={item.id}
              item={item}
              disclosure={disclosure}
              t={t}
            />
          ))}
      </ol>
    </DisplayDisclosure>
  )
}

function TodoItem({
  item,
  disclosure,
  t
}: {
  item: TodoItemProjection
  disclosure: AssistantDisclosureState
  t: Translator
}): JSX.Element {
  const Icon = item.status === 'completed' ? CheckCircle2 : Circle
  return (
    <li className={`assistant-todo-item ${item.status}`}>
      <div>
        <Icon aria-hidden="true" />
        <span>{item.title}</span>
        <small>{statusText(item.status)}</small>
      </div>
      {item.children.length > 0 ? (
        <div className="assistant-todo-item-children">
          <SortedAssistantNodes
            nodes={item.children}
            disclosure={disclosure}
            t={t}
          />
        </div>
      ) : null}
    </li>
  )
}

function SubAgentGroupRenderer({
  node,
  disclosure,
  t
}: NodeRendererProps): JSX.Element {
  if (node.kind !== 'sub_agent_group') {
    return <UnknownAssistantNode node={node} />
  }
  return (
    <DisplayDisclosure
      className="assistant-sub-agent-group"
      disclosure={disclosure}
      nodeKey={node.id}
      label={`已委派 ${node.group.children.length} 个子任务`}
      defaultOpen={
        node.group.status === 'running' ||
        node.group.status === 'partial' ||
        node.group.status === 'failed'
      }
    >
      <div className="assistant-sub-agent-items">
        {[...node.group.children]
          .sort((left, right) => left.ordinal - right.ordinal)
          .map((child) => (
            <SubAgentItem
              key={child.taskId}
              child={child}
              disclosure={disclosure}
              t={t}
            />
          ))}
      </div>
    </DisplayDisclosure>
  )
}

function SubAgentItem({
  child,
  disclosure,
  t
}: {
  child: SubAgentChildProjection
  disclosure: AssistantDisclosureState
  t: Translator
}): JSX.Element {
  const name = child.agentName ?? child.agentId ?? '子 Agent'
  const status = statusText(child.status)
  const disclosureKey = `sub-agent:${child.taskId}`
  const defaultOpen = child.status === 'running' || child.status === 'failed'
  const open = disclosure.isOpen(disclosureKey, defaultOpen)
  const hasDetails = Boolean(
    child.progressSummary ||
    child.resultSummary ||
    child.evidenceCount > 0 ||
    child.tree.length > 0
  )
  return (
    <section className={`assistant-sub-agent-item ${child.status}`}>
      <div className="assistant-sub-agent-indicator" aria-hidden="true">
        <span className="assistant-sub-agent-avatar">
          <Bot />
        </span>
        <span className="assistant-sub-agent-line" />
      </div>
      <div className="assistant-sub-agent-main">
        <button
          type="button"
          className="assistant-sub-agent-header"
          aria-label={`${name} · ${status}`}
          aria-expanded={hasDetails ? open : undefined}
          disabled={!hasDetails}
          onClick={() => {
            if (hasDetails) disclosure.toggle(disclosureKey, defaultOpen)
          }}
          onKeyDown={(event) => {
            if (hasDetails) {
              disclosure.handleKeyDown(event, disclosureKey, defaultOpen)
            }
          }}
        >
          <strong>{name}</strong>
          <span className="assistant-sub-agent-separator" aria-hidden="true">
            ·
          </span>
          <span className="assistant-sub-agent-status">{status}</span>
          {hasDetails ? (
            open
              ? <ChevronDown aria-hidden="true" />
              : <ChevronRight aria-hidden="true" />
          ) : null}
        </button>
        <p className="assistant-sub-agent-objective" title={child.objective}>
          {child.objective}
        </p>
        {hasDetails && open ? (
          <div className="assistant-sub-agent-body">
            {child.progressSummary ? (
              <p className="assistant-sub-agent-summary">
                {child.progressSummary}
              </p>
            ) : null}
            {child.resultSummary ? (
              <p className="assistant-sub-agent-summary">
                {child.resultSummary}
              </p>
            ) : null}
            {child.evidenceCount > 0 ? (
              <span className="assistant-sub-agent-evidence">
                {`${child.evidenceCount} 条证据`}
              </span>
            ) : null}
            {child.tree.length > 0 ? (
              <div className="assistant-sub-agent-tree">
                <SortedAssistantNodes
                  nodes={child.tree}
                  disclosure={disclosure}
                  t={t}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ArtifactRenderer({ node }: NodeRendererProps): JSX.Element {
  if (node.kind !== 'artifact') return <UnknownAssistantNode node={node} />
  return <ArtifactItem artifact={node.artifact} />
}

function WidgetRenderer({ node }: NodeRendererProps): JSX.Element {
  if (node.kind !== 'widget') return <UnknownAssistantNode node={node} />
  return (
    <iframe
      className="assistant-isolated-widget"
      title={node.widget.title}
      sandbox=""
      srcDoc={isolatedHtml(node.widget.html)}
    />
  )
}

function FinishRenderer({ node, t }: NodeRendererProps): JSX.Element | null {
  if (node.kind !== 'finish') return <UnknownAssistantNode node={node} t={t} />
  const changedFiles = node.fileChanges
    ? node.fileChanges.added + node.fileChanges.modified + node.fileChanges.deleted
    : 0
  if (
    changedFiles === 0 &&
    (node.artifacts?.length ?? 0) === 0 &&
    (node.images?.length ?? 0) === 0
  ) {
    return null
  }
  return (
    <section
      className="assistant-finish-summary"
      aria-label={t('chat.execution.finalResult')}
    >
      {changedFiles > 0 ? <strong>{`${changedFiles} 个文件变更`}</strong> : null}
      {(node.artifacts?.length ?? 0) > 0 ? (
        <div className="assistant-finish-artifacts">
          {node.artifacts?.map((artifact) => (
            <ArtifactItem key={`${artifact.path}:${artifact.name}`} artifact={artifact} />
          ))}
        </div>
      ) : null}
      {(node.images?.length ?? 0) > 0 ? (
        <div className="assistant-finish-images">
          {node.images?.map((image) => (
            <figure key={image.id}>
              <div role="img" aria-label={image.name}>
                <ImageIcon aria-hidden="true" />
              </div>
              <figcaption>{image.name}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ArtifactItem({
  artifact
}: {
  artifact: {
    name: string
    kind: string
    sizeBytes: number
  }
}): JSX.Element {
  return (
    <div className="assistant-artifact-item">
      <File aria-hidden="true" />
      <div>
        <strong>{artifact.name}</strong>
        <span>{`${artifact.kind.toUpperCase()} · ${formatBytes(artifact.sizeBytes)}`}</span>
      </div>
    </div>
  )
}

function UnknownAssistantNode({
  node,
  t
}: {
  node: AssistantDisplayNode
  t?: Translator
}): JSX.Element {
  const runtime = node as unknown as Record<string, unknown>
  const diagnosticId =
    typeof runtime.diagnosticId === 'string' ? runtime.diagnosticId : node.id
  const title = t ? t('chat.execution.unknownNode') : 'Unsupported message item'
  return (
    <div className="assistant-unknown-node" role="status">
      <TriangleAlert aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <DiagnosticId value={diagnosticId} />
      </div>
    </div>
  )
}

function DiagnosticId({ value }: { value: string }): JSX.Element {
  return <span className="assistant-tool-call-diagnostic">{`诊断 ID：${value}`}</span>
}

function DisplayDisclosure({
  className,
  disclosure,
  nodeKey,
  label,
  defaultOpen,
  children
}: {
  className: string
  disclosure: AssistantDisclosureState
  nodeKey: string
  label: string
  defaultOpen: boolean
  children: ReactNode
}): JSX.Element {
  const open = disclosure.isOpen(nodeKey, defaultOpen)
  return (
    <div className={className}>
      <button
        type="button"
        className="assistant-disclosure-trigger"
        aria-expanded={open}
        onClick={() => disclosure.toggle(nodeKey, defaultOpen)}
        onKeyDown={(event) =>
          disclosure.handleKeyDown(event, nodeKey, defaultOpen)
        }
      >
        <span>{label}</span>
        {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
      </button>
      {open ? <div className="assistant-display-disclosure-body">{children}</div> : null}
    </div>
  )
}

function shouldAutoExpand(
  status:
    | AssistantTurnStatus
    | 'requested'
    | 'registered'
    | 'pending'
    | 'initializing'
): boolean {
  return [
    'requested',
    'registered',
    'pending',
    'initializing',
    'running',
    'retrying',
    'waiting_permission',
    'waiting_input',
    'paused',
    'recovery_blocked',
    'failed'
  ].includes(status)
}

function statusText(status: string): string {
  return {
    requested: '等待执行',
    registered: '等待执行',
    pending: '等待执行',
    initializing: '初始化中',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }[status] ?? status
}

function runtimeKind(
  node: AssistantDisplayNode
): AssistantDisplayNode['kind'] {
  return (node as { kind: AssistantDisplayNode['kind'] }).kind
}

function safeWebUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isolatedHtml(html: string): string {
  return [
    '<!doctype html><html><head>',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:">',
    '<meta charset="utf-8"></head><body>',
    html,
    '</body></html>'
  ].join('')
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`
  return `${(value / 1_048_576).toFixed(1)} MB`
}
