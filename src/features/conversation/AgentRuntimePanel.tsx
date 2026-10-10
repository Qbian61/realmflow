import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AgentRuntimeApi } from '../../../shared/agent-runtime-state'
import { Button, Field, InlineAlert } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import { useRuntimePanelState } from './use-runtime-panel-state'
import './AgentRuntimePanel.css'

const labels = {
  active: 'agentRuntime.active', running: 'agentRuntime.active', blocked: 'agentRuntime.blocked',
  completed: 'agentRuntime.completed', cancelled: 'agentRuntime.cancelled',
  registered: 'agentRuntime.pending', pending: 'agentRuntime.pending', failed: 'agentRuntime.taskFailed'
} as const

export function AgentRuntimePanel({ runId, api = window.realmflow?.agentRuntime }: {
  runId: string
  api?: AgentRuntimeApi
}): JSX.Element | null {
  const { t } = useLocalization()
  const [open, setOpen] = useState(false)
  if (!api) return null
  return <section className="agent-runtime-panel">
    <Button variant="neutral" size="compact" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
      {t('agentRuntime.title')}
    </Button>
    {open ? <RuntimePanelBody key={runId} runId={runId} api={api} /> : null}
  </section>
}

function RuntimePanelBody({ runId, api }: { runId: string; api: AgentRuntimeApi }): JSX.Element {
  const { t } = useLocalization()
  const panel = useRuntimePanelState(api, runId)
  const { saved, goal, setGoal, message, setMessage, busy, error } = panel
  const terminal = saved && ['completed', 'failed', 'cancelled'].includes(saved.status)
  const disabled = busy || !saved || Boolean(terminal)
  return <div className="agent-runtime-body">
    {error ? <InlineAlert tone="danger" title={t(error)} /> : null}
    {!saved && !error ? <p role="status">{t('agentRuntime.loading')}</p> : null}
    <div className="agent-runtime-heading">
      <p>{saved?.state.goal?.objective ?? t('agentRuntime.noGoal')}</p>
      <Button variant="neutral" size="compact" disabled={busy} onClick={panel.refresh}>{t('agentRuntime.refresh')}</Button>
    </div>
    {saved ? <>
      <form onSubmit={(event) => { event.preventDefault(); void panel.saveGoal() }}>
        <Field name="runtime-goal" label={t('agentRuntime.goal')} disabled={disabled}>
          <textarea rows={2} maxLength={2000} required value={goal.objective}
            onChange={(event) => setGoal({ ...goal, objective: event.target.value })} />
        </Field>
        <div className="agent-runtime-actions">
          <Field name="runtime-goal-status" label={t('agentRuntime.goalStatus')} disabled={disabled}>
            <select value={goal.status} onChange={(event) => setGoal({
              ...goal, status: event.target.value as typeof goal.status
            })}>
              {(['active', 'blocked', 'completed', 'cancelled'] as const).map((status) =>
                <option key={status} value={status}>{t(labels[status])}</option>)}
            </select>
          </Field>
          <Button type="submit" variant="neutral" size="compact"
            disabled={disabled || !goal.objective.trim() || error === 'agentRuntime.conflict'}>
            {t(busy ? 'agentRuntime.saving' : 'agentRuntime.saveGoal')}
          </Button>
          {panel.success ? <span role="status">{t('agentRuntime.saved')}</span> : null}
        </div>
      </form>
      {saved.state.cards.length ? <div className="agent-runtime-records">
        <h4>{t('agentRuntime.progress')}</h4>
        {saved.state.cards.map((card) => <div key={card.id}>
          <div className="agent-runtime-record-heading"><strong>{card.title}</strong><span>{t(labels[card.status])}</span></div>
          <p>{card.message}</p>
          {card.total !== undefined ? <span>{card.completed ?? 0} / {card.total}</span> : null}
        </div>)}
      </div> : null}
      {saved.delegations.length ? <div className="agent-runtime-records">
        <h4>{t('agentRuntime.children')}</h4>
        {saved.delegations.map((child) => <div key={child.runId}>
          <div className="agent-runtime-record-heading">
            <Link to={`/sessions/${encodeURIComponent(child.sessionId)}`}>{child.objective}</Link>
            <span>{t(labels[child.status])}</span>
          </div>
          {child.result ? <p>{child.result.summary}</p> : null}
        </div>)}
      </div> : null}
      <form onSubmit={(event) => { event.preventDefault(); void panel.steer() }}>
        <Field name="runtime-steer" label={t('agentRuntime.steer')} description={t('agentRuntime.steerHint')} disabled={disabled}>
          <textarea rows={2} maxLength={12000} required value={message} onChange={(event) => setMessage(event.target.value)} />
        </Field>
        <Button type="submit" variant="neutral" size="compact" disabled={disabled || !message.trim()}>{t('agentRuntime.send')}</Button>
      </form>
      {saved.state.instructions.length ? <div className="agent-runtime-records">
        <h4>{t('agentRuntime.instructions')}</h4>
        {saved.state.instructions.map((instruction) => <div key={instruction.id}>
          <div className="agent-runtime-record-heading"><p>{instruction.message}</p>
            <span>{t(instruction.status === 'applied' ? 'agentRuntime.applied' : 'agentRuntime.queued')}</span></div>
        </div>)}
      </div> : null}
    </> : null}
  </div>
}
