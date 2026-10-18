import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  RotateCcw,
  X
} from 'lucide-react'
import {
  type AssistantTurnProjection,
} from '../../../domain/assistant-turn'
import { useEffect, useState } from 'react'
import type { AgentRunRecoveryResult } from '../../../shared/ai-run'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { Translator } from '../../localization/translate'
import { AssistantDisplayTree } from './AssistantDisplayTree'
import { useAssistantDisclosureState } from './use-assistant-disclosure-state'

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
  const disclosure = useAssistantDisclosureState()
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
  if (!execution) return null
  const duration = Math.max(
    0,
    (execution.completedAt ?? execution.elapsedAt ?? Date.now()) -
      execution.startedAt
  )
  const rootKey = `progress:${execution.runId}`
  const defaultOpen =
    execution.status !== 'completed' && execution.status !== 'cancelled'
  const open = disclosure.isOpen(rootKey, defaultOpen)
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
      <div className="assistant-task-disclosure-header">
        <button
          type="button"
          className="assistant-task-disclosure-trigger"
          aria-expanded={open}
          onClick={() => disclosure.toggle(rootKey, defaultOpen)}
          onKeyDown={(event) =>
            disclosure.handleKeyDown(event, rootKey, defaultOpen)
          }
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
        <span className="assistant-task-divider-line" aria-hidden="true" />
      </div>
      {open ? <div className="assistant-task-disclosure-content">
      <AssistantDisplayTree
        nodes={execution.tree}
        disclosure={disclosure}
      />
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
      {execution.error ? (
        <p className="assistant-execution-error">
          {execution.error}
        </p>
      ) : null}
      </div> : null}
    </section>
  )
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

function formatDuration(durationMs: number, _t: Translator): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`
  }
  const totalSeconds = Math.floor(durationMs / 1_000)
  if (totalSeconds >= 60) {
    const days = Math.floor(totalSeconds / 86_400)
    const hours = Math.floor((totalSeconds % 86_400) / 3_600)
    const minutes = Math.floor((totalSeconds % 3_600) / 60)
    const seconds = totalSeconds % 60
    return [
      days > 0 ? `${days}d` : undefined,
      hours > 0 ? `${hours}h` : undefined,
      minutes > 0 ? `${minutes}m` : undefined,
      `${seconds}s`
    ]
      .filter(Boolean)
      .join(' ')
  }
  return `${(durationMs / 1_000).toFixed(1)}s`
}
