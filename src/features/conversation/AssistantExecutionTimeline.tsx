import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  RotateCcw,
  X
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import {
  summarizeToolCalls,
  type AssistantTurnProjection,
  type DelegationProjection,
  type ToolCallAttemptProjection,
  type ToolCallCategory,
  type ToolCallProjection
} from '../../../domain/assistant-turn'
import type { AgentRunRecoveryResult } from '../../../shared/ai-run'
import {
  ListPagination,
  useListPagination
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { Translator } from '../../localization/translate'

export function AssistantExecutionTimeline({
  execution,
  onRecoveryAction
}: {
  execution?: AssistantTurnProjection
  onRecoveryAction?: (
    action: 'resume' | 'branch' | 'cancel'
  ) =>
    | AgentRunRecoveryResult
    | void
    | Promise<AgentRunRecoveryResult | void>
}): JSX.Element | null {
  const { t } = useLocalization()
  const [pendingRecoveryAction, setPendingRecoveryAction] = useState<
    'resume' | 'branch' | 'cancel'
  >()
  const [recoveryFeedback, setRecoveryFeedback] = useState<string>()
  const [manualOpen, setManualOpen] = useState<boolean>()
  const [, setClockTick] = useState(0)
  useEffect(() => {
    if (
      !execution ||
      execution.completedAt !== undefined ||
      execution.elapsedAt !== undefined
    ) return
    const timer = window.setInterval(
      () => setClockTick((value) => value + 1),
      1_000
    )
    return () => window.clearInterval(timer)
  }, [execution])
  useEffect(() => {
    if (execution?.status === 'completed') {
      setManualOpen(false)
    }
  }, [execution?.status])
  if (!execution) return null
  const duration = Math.max(
    0,
    (execution.completedAt ?? execution.elapsedAt ?? Date.now()) -
      execution.startedAt
  )
  const open =
    manualOpen ??
    execution.status !== 'completed'
  const toolCalls = displayToolCalls(execution)
  const unrecoveredFailureCount = countUnrecoveredToolFailures(toolCalls)
  const terminalError =
    execution.error ??
    (execution.status === 'completed' && unrecoveredFailureCount > 0
      ? t('chat.execution.tool.unrecoveredFailures', {
          count: unrecoveredFailureCount
        })
      : undefined)
  const recoveryMeta = execution.recovery
    ? recoveryMetaLabel(execution.recovery, t)
    : ''

  return (
    <section
      className="assistant-execution-timeline"
      data-density="compact"
      aria-label={t('chat.execution.aria')}
      aria-live="polite"
    >
      <button
        type="button"
        className="assistant-task-disclosure-trigger"
        aria-expanded={open}
        onClick={() => setManualOpen(!open)}
      >
        <span>
          {t('chat.duration', { duration: formatDuration(duration, t) })}
        </span>
        {open ? (
          <ChevronDown aria-hidden="true" />
        ) : (
          <ChevronRight aria-hidden="true" />
        )}
      </button>
      {open ? <div className="assistant-task-disclosure-content">
      <p className="assistant-execution-status">
        {statusLabel(execution.status, t)}
      </p>
      {execution.recovery ? (
        <>
          <p className="assistant-recovery-reason">
            {recoveryReasonLabel(execution.recovery.reason)}
          </p>
          {recoveryMeta ? (
            <p className="assistant-recovery-meta">
              {recoveryMeta}
            </p>
          ) : null}
          {onRecoveryAction &&
          (execution.recovery.actions?.length ?? 0) > 0 ? (
            <div className="assistant-recovery-actions">
              {(execution.recovery.actions ?? []).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={pendingRecoveryAction !== undefined}
                  onClick={() => {
                    setPendingRecoveryAction(action)
                    setRecoveryFeedback(undefined)
                    void Promise.resolve(onRecoveryAction(action))
                      .then((result) => {
                        if (result) {
                          setRecoveryFeedback(recoveryResultLabel(result, t))
                        }
                      })
                      .catch(() => {
                        setRecoveryFeedback(t('chat.execution.actionFailed'))
                      })
                      .finally(() => {
                        setPendingRecoveryAction(undefined)
                      })
                  }}
                >
                  {recoveryActionIcon(action)}
                  <span>{recoveryActionLabel(action, t)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {recoveryFeedback ? (
            <p className="assistant-recovery-feedback" role="status">
              {recoveryFeedback}
            </p>
          ) : null}
        </>
      ) : null}
      {(execution.compactions?.length ?? 0) > 0 ? (
        <Disclosure label={t('chat.execution.compacted')}>
          <div className="assistant-summary-list">
            {execution.compactions?.map((compaction) => (
              <p key={compaction.compactedAt}>
                {`保留 ${compaction.objectiveCount} 个目标、${compaction.constraintCount} 条约束、${compaction.incompleteItemCount} 个未完成项，关联 ${compaction.sourceCount} 个来源`}
              </p>
            ))}
          </div>
        </Disclosure>
      ) : null}
      {execution.references.length > 0 ? (
        <Disclosure label={t('chat.execution.references')}>
          <ul className="assistant-reference-list">
            {execution.references.map((reference) => (
              <li key={reference.id}>
                <strong>{reference.title}</strong>
                <span>{reference.summary}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {execution.executionSummaries.length > 0 ? (
        <Disclosure label={t('chat.execution.thinking')}>
          <div className="assistant-summary-list">
            {execution.executionSummaries.map((summary) => (
              <p key={summary.id}>{summary.content}</p>
            ))}
          </div>
        </Disclosure>
      ) : null}
      {execution.delegations.map((delegation) => (
        <DelegationDisclosure
          key={delegation.callId}
          delegation={delegation}
        />
      ))}
      {toolCalls.length > 0 ? (
        <ToolDisclosure toolCalls={toolCalls} status={execution.status} />
      ) : null}
      {terminalError ? (
        <p className="assistant-execution-error">
          {terminalError}
        </p>
      ) : null}
      </div> : null}
    </section>
  )
}

function DelegationDisclosure({
  delegation
}: {
  delegation: DelegationProjection
}): JSX.Element {
  const { t } = useLocalization()
  const [open, setOpen] = useState(
    delegation.status === 'partial' ||
      delegation.status === 'failed' ||
      delegation.status === 'cancelled'
  )
  return (
    <div className="assistant-delegation-disclosure">
      <button
        type="button"
        className="assistant-disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown aria-hidden="true" />
        ) : (
          <ChevronRight aria-hidden="true" />
        )}
        <span>
          {t('chat.execution.delegated', {
            count: delegation.tasks.length
          })}
        </span>
        <span className="assistant-delegation-status">
          {delegationStatusLabel(delegation.status)}
        </span>
      </button>
      {open ? (
        <ul className="assistant-delegation-task-list">
          {delegation.tasks.map((task) => (
            <li key={task.taskId}>
              <div className="assistant-delegation-task-heading">
                <span>{task.objective}</span>
                <span>{delegationTaskStatusLabel(task.status)}</span>
              </div>
              {task.summary ? <p>{task.summary}</p> : null}
              {task.evidenceCount > 0 ? (
                <span>
                  {t('chat.execution.evidence', {
                    count: task.evidenceCount
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ToolDisclosure({
  toolCalls,
  status
}: {
  toolCalls: DisplayToolCall[]
  status: AssistantTurnProjection['status']
}): JSX.Element {
  const { t } = useLocalization()
  const defaultOpen =
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'waiting_permission' ||
    status === 'recovery_blocked'
  const [open, setOpen] = useState(defaultOpen)
  const toolPagination = useListPagination(toolCalls)
  return (
    <div className="assistant-tool-disclosure">
      <button
        type="button"
        className="assistant-disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        <span>{t('chat.execution.details')}</span>
        <span className="assistant-tool-aggregates">
          {summarizeToolCalls(toolCalls).map(({ category, count }) => (
            <span key={category}>{aggregateLabel(category, count)}</span>
          ))}
        </span>
      </button>
      {open ? (
        <ul className="assistant-tool-call-list">
          {toolPagination.pageItems.map((toolCall) => (
            <li key={toolCall.callId}>
              <span className="assistant-tool-call-name">
                {toolDisplayName(toolCall.toolName, toolCall.category, t)}
              </span>
              <span>{toolStatusLabel(toolCall.status)}</span>
              {toolCall.recoveredAttempts.length > 0 &&
              toolCall.status === 'completed' ? (
                <span className="assistant-tool-call-retry">
                  {t('chat.execution.tool.retrySucceeded')}
                </span>
              ) : null}
              {toolCall.error ? (
                <span className="assistant-tool-call-error">
                  {toolErrorLabel(toolCall.errorCode, toolCall.error)}
                </span>
              ) : null}
              {toolCall.recoveryHint ? (
                <span className="assistant-tool-call-recovery">
                  {toolCall.recoveryHint}
                </span>
              ) : null}
              {toolCall.diagnosticId ? (
                <span className="assistant-tool-call-diagnostic">
                  {t('chat.execution.tool.diagnosticId', {
                    id: toolCall.diagnosticId
                  })}
                </span>
              ) : null}
              {toolCall.recoveredAttempts.map((attempt) => (
                <Disclosure
                  key={toolAttemptKey(attempt)}
                  label={t('chat.execution.tool.failedAttempt', {
                    attempt: attempt.attempt
                  })}
                >
                  <div className="assistant-tool-attempt-detail">
                    {attempt.error ? (
                      <span className="assistant-tool-call-error">
                        {toolErrorLabel(attempt.errorCode, attempt.error)}
                      </span>
                    ) : null}
                    {attempt.recoveryHint ? (
                      <span className="assistant-tool-call-recovery">
                        {attempt.recoveryHint}
                      </span>
                    ) : null}
                    {attempt.diagnosticId ? (
                      <span className="assistant-tool-call-diagnostic">
                        {t('chat.execution.tool.diagnosticId', {
                          id: attempt.diagnosticId
                        })}
                      </span>
                    ) : null}
                  </div>
                </Disclosure>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <ListPagination
          total={toolCalls.length}
          page={toolPagination.page}
          pageSize={toolPagination.pageSize}
          onPageChange={toolPagination.setPage}
        />
      ) : null}
    </div>
  )
}

type DisplayToolCall = ToolCallProjection & {
  recoveredAttempts: ToolCallAttemptProjection[]
}

function displayToolCalls(
  execution: AssistantTurnProjection
): DisplayToolCall[] {
  const byCallId = new Map(
    execution.toolCalls.map((toolCall) => [toolCall.callId, toolCall])
  )
  const foldedCallIds = new Set<string>()
  const recoveredByCallId = new Map<string, ToolCallAttemptProjection[]>()
  for (const toolCall of execution.toolCalls) {
    if (!toolCall.retryOfCallId || toolCall.status !== 'completed') continue
    const retried = byCallId.get(toolCall.retryOfCallId)
    if (!retried || retried.status !== 'failed') continue
    foldedCallIds.add(retried.callId)
    recoveredByCallId.set(toolCall.callId, [
      ...(retried.attempts ?? [toolCallAsAttempt(retried)]),
      ...(recoveredByCallId.get(toolCall.callId) ?? [])
    ])
  }
  return execution.toolCalls
    .filter((toolCall) => !foldedCallIds.has(toolCall.callId))
    .map((toolCall) => ({
      ...toolCall,
      recoveredAttempts: [
        ...(recoveredByCallId.get(toolCall.callId) ?? []),
        ...(toolCall.attempts ?? [])
      ].filter((attempt) => attempt.status === 'failed')
    }))
}

function countUnrecoveredToolFailures(
  toolCalls: readonly DisplayToolCall[]
): number {
  return toolCalls.filter((toolCall) => toolCall.status === 'failed').length
}

function toolCallAsAttempt(
  toolCall: ToolCallProjection
): ToolCallAttemptProjection {
  return {
    attempt: toolCall.attempt ?? 1,
    status: 'failed',
    toolExecutionId: toolCall.toolExecutionId,
    errorCode: toolCall.errorCode,
    error: toolCall.error,
    diagnosticId: toolCall.diagnosticId,
    startedAt: toolCall.startedAt,
    completedAt: toolCall.completedAt
  }
}

function toolAttemptKey(attempt: ToolCallAttemptProjection): string {
  return [
    attempt.attempt,
    attempt.toolExecutionId,
    attempt.completedAt,
    attempt.errorCode
  ]
    .filter((part) => part !== undefined)
    .join(':')
}

function Disclosure({
  label,
  children
}: {
  label: string
  children: ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="assistant-disclosure">
      <button
        type="button"
        className="assistant-disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        <span>{label}</span>
      </button>
      {open ? <div className="assistant-disclosure-content">{children}</div> : null}
    </div>
  )
}

function toolErrorLabel(
  errorCode: string | undefined,
  fallback: string
): string {
  const labels: Record<string, string> = {
    tool_timeout: '工具执行超时',
    tool_output_limit: '工具输出超过限制',
    tool_memory_limit: '工具内存超过限制',
    tool_sandbox_unavailable: '当前设备无法提供安全执行环境',
    sandbox_unavailable: '当前设备无法提供安全执行环境',
    tool_sandbox_manifest_invalid: '工具安全策略校验失败',
    skill_connector_unavailable: '技能连接器不可用',
    run_suspended: '任务暂停，工具未继续执行'
  }
  return errorCode ? labels[errorCode] ?? fallback : fallback
}

function statusLabel(
  status: AssistantTurnProjection['status'],
  t: Translator
): string {
  return {
    running: t('chat.execution.status.running'),
    waiting_permission: t('chat.execution.status.waitingPermission'),
    waiting_input: t('chat.execution.status.waitingInput'),
    retrying: t('chat.execution.status.retrying'),
    paused: t('chat.execution.status.paused'),
    recovery_blocked: t('chat.execution.status.recoveryBlocked'),
    completed: t('chat.execution.status.completed'),
    failed: t('chat.execution.status.failed'),
    cancelled: t('chat.execution.status.cancelled')
  }[status]
}

function recoveryReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    provider_rate_limited: '模型服务繁忙，将按计划重试',
    provider_timeout: '模型响应超时，将按计划重试',
    clarification_required: '需要补充信息后继续',
    max_agent_turns: '已达到当前执行分段上限，正在自动续跑',
    continuation_limit_reached: '已完成两次自动续跑，需要确认后继续',
    repeated_tool_call: '检测到重复工具调用，需要确认后继续',
    deterministic_tool_failure: '检测到确定性工具失败循环，需要确认后继续',
    consecutive_tool_failures: '连续工具执行失败，需要确认后继续',
    user_requested: '任务已由用户暂停',
    profile_unavailable: '所需智能体版本不可用',
    capability_unavailable: '所需能力版本不可用',
    model_unavailable: '所需模型不可用',
    permission_expired: '原授权已失效',
    credential_unavailable: '所需凭据不可用',
    side_effect_unknown: '外部操作结果需要确认',
    checkpoint_unavailable: '没有可用的恢复检查点',
    resume_unavailable: '恢复服务暂时不可用'
  }
  return labels[reason] ?? '任务暂时无法继续'
}

function recoveryMetaLabel(
  recovery: NonNullable<AssistantTurnProjection['recovery']>,
  t: Translator
): string {
  const parts: string[] = []
  if (Number.isInteger(recovery.attempt) && recovery.attempt! > 0) {
    parts.push(`第 ${recovery.attempt} 次重试`)
  }
  if (
    Number.isInteger(recovery.remainingAttempts) &&
    recovery.remainingAttempts! >= 0
  ) {
    parts.push(`剩余 ${recovery.remainingAttempts} 次`)
  }
  if (Number.isInteger(recovery.nextRetryAt)) {
    const delayMs = Math.max(0, recovery.nextRetryAt! - Date.now())
    parts.push(
      delayMs > 0
        ? `下次重试 ${formatDuration(delayMs, t)}后`
        : '下次重试即将开始'
    )
  }
  return parts.join(' · ')
}

function recoveryActionLabel(
  action: 'resume' | 'branch' | 'cancel',
  t: Translator
): string {
  return {
    resume: t('chat.execution.action.resume'),
    branch: t('chat.execution.action.branch'),
    cancel: t('chat.execution.action.cancel')
  }[action]
}

function recoveryResultLabel(
  result: AgentRunRecoveryResult,
  t: Translator
): string {
  if (result.status === 'branched') {
    return t('chat.execution.result.branched')
  }
  if (result.status === 'resumed') {
    return t('chat.execution.result.resumed')
  }
  if (result.status === 'cancelled') {
    return t('chat.execution.result.cancelled')
  }
  return t('chat.execution.actionFailed')
}

function recoveryActionIcon(
  action: 'resume' | 'branch' | 'cancel'
): JSX.Element {
  const Icon = {
    resume: RotateCcw,
    branch: GitBranch,
    cancel: X
  }[action]
  return <Icon aria-hidden="true" />
}

function formatDuration(durationMs: number, t: Translator): string {
  if (durationMs < 1_000) {
    return t('chat.execution.duration.milliseconds', {
      value: durationMs
    })
  }
  const totalSeconds = Math.floor(durationMs / 1_000)
  if (totalSeconds >= 60) {
    const days = Math.floor(totalSeconds / 86_400)
    const hours = Math.floor((totalSeconds % 86_400) / 3_600)
    const minutes = Math.floor((totalSeconds % 3_600) / 60)
    const seconds = totalSeconds % 60
    return [
      days > 0
        ? t('chat.execution.duration.unit.day', { value: days })
        : undefined,
      hours > 0
        ? t('chat.execution.duration.unit.hour', { value: hours })
        : undefined,
      minutes > 0
        ? t('chat.execution.duration.unit.minute', { value: minutes })
        : undefined,
      seconds > 0
        ? t('chat.execution.duration.unit.second', { value: seconds })
        : undefined
    ]
      .filter(Boolean)
      .join(' ')
  }
  return t('chat.execution.duration.seconds', {
    value: (durationMs / 1_000).toFixed(1)
  })
}

function aggregateLabel(category: ToolCallCategory, count: number): string {
  const unit = {
    web_search: `搜索 ${count} 次网页`,
    command: `执行 ${count} 条命令`,
    filesystem: `操作 ${count} 次文件`,
    mcp: `调用 ${count} 次 MCP`,
    connector: `调用 ${count} 次连接器`,
    skill: `调用 ${count} 次技能`,
    agent: `委派 ${count} 次任务`,
    other: `调用 ${count} 次工具`
  }
  return unit[category]
}

function delegationStatusLabel(
  status: DelegationProjection['status']
): string {
  return {
    requested: '执行中',
    completed: '已完成',
    partial: '部分完成',
    failed: '失败',
    cancelled: '已取消'
  }[status]
}

function delegationTaskStatusLabel(
  status: DelegationProjection['tasks'][number]['status']
): string {
  return {
    requested: '等待执行',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }[status]
}

function toolDisplayName(
  name: string,
  category: ToolCallCategory,
  t: Translator
): string {
  if (category !== 'skill') return name
  const readable = name
    .replace(/^rf_skill_/, '')
    .replace(/_[a-f0-9]{8}$/i, '')
    .replace(/^(?:builtin|uploaded)_skill_/, '')
    .replaceAll('_', ' ')
    .trim()
  return readable
    ? t('chat.execution.tool.skillNamed', { name: readable })
    : t('chat.execution.tool.skill')
}

function toolStatusLabel(
  status: AssistantTurnProjection['toolCalls'][number]['status']
): string {
  return {
    requested: '等待执行',
    running: '执行中',
    waiting_permission: '等待授权',
    completed: '已完成',
    failed: '失败'
  }[status]
}
