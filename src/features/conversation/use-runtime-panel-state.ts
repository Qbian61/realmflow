import { useEffect, useRef, useState } from 'react'
import type { AgentRuntimeApi, AgentRuntimeStatus, RuntimeGoal } from '../../../shared/agent-runtime-state'
import type { TranslationKey } from '../../localization/translate'

type GoalDraft = Pick<RuntimeGoal, 'objective' | 'status' | 'revision'>
const emptyGoal: GoalDraft = { objective: '', status: 'active', revision: 0 }

export function useRuntimePanelState(api: AgentRuntimeApi, runId: string) {
  const [saved, setSaved] = useState<AgentRuntimeStatus>()
  const [goal, setGoal] = useState<GoalDraft>(emptyGoal)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<TranslationKey>()
  const [success, setSuccess] = useState(false)
  const [reload, setReload] = useState(0)
  const writing = useRef(false)
  const version = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; version.current++ }
  }, [])
  useEffect(() => {
    let active = true
    let first = true
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      const at = version.current
      try {
        if (writing.current) return
        const result = await api.get(runId)
        if (!active || writing.current || version.current !== at) return
        setSaved(result)
        if (first) {
          setGoal(result.state.goal ?? emptyGoal)
          setError(undefined)
          setSuccess(false)
          first = false
        }
      } catch {
        if (active && version.current === at) setError('agentRuntime.loadFailed')
      } finally {
        if (active) timer = setTimeout(() => { void load() }, 1500)
      }
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [api, runId, reload])

  async function submit(kind: 'goal' | 'steer') {
    if (!saved || writing.current) return
    writing.current = true
    version.current++
    setBusy(true)
    setError(undefined)
    setSuccess(false)
    try {
      const requestId = `runtime-${crypto.randomUUID()}`
      const result = kind === 'goal'
        ? await api.updateGoal({ runId, requestId, objective: goal.objective, status: goal.status, expectedRevision: goal.revision })
        : await api.steer({ runId, requestId, message })
      if (!mounted.current) return
      setSaved(result)
      if (kind === 'goal') setGoal(result.state.goal ?? emptyGoal)
      else setMessage('')
      setSuccess(true)
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error && reason.message.includes('runtime_revision_conflict')
        ? 'agentRuntime.conflict' : 'agentRuntime.failed')
    } finally {
      writing.current = false
      version.current++
      if (mounted.current) setBusy(false)
    }
  }
  return {
    saved, goal, setGoal, message, setMessage, busy, error, success,
    refresh: () => setReload((value) => value + 1),
    saveGoal: () => submit('goal'), steer: () => submit('steer')
  }
}
