import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  PendingToolPermissionView,
  ToolPermissionApi,
  ToolPermissionDecision
} from '../../../shared/tool-permissions'
import { useLocalization } from '../../localization/LocalizationProvider'
import { ToolPermissionDialog } from './ToolPermissionDialog'

export function PermissionPromptHost({
  api = window.realmflow?.toolPermissions
}: {
  api?: ToolPermissionApi
}): JSX.Element | null {
  const { t } = useLocalization()
  const [requests, setRequests] = useState<PendingToolPermissionView[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [target, setTarget] = useState<HTMLElement | null>(null)

  const refresh = useCallback(async () => {
    if (!api) return
    const next = await api.listPending()
    setRequests(
      [...next].sort(
        (left, right) =>
          left.requestedAt - right.requestedAt ||
          left.id.localeCompare(right.id)
      )
    )
  }, [api])

  useEffect(() => {
    if (!api) return
    void refresh()
    return api.onChanged(() => {
      void refresh()
    })
  }, [api, refresh])

  const request = useMemo(
    () =>
      requests.find(
        (candidate) =>
          candidate.status === 'requested' &&
          candidate.expiresAt > Date.now()
      ),
    [requests]
  )

  useEffect(() => {
    const updateTarget = (): void => {
      const candidates = [...document.querySelectorAll<HTMLElement>('[data-permission-run-ids]')]
      setTarget(candidates.find(element => {
        let ids: unknown
        try { ids = JSON.parse(element.dataset.permissionRunIds ?? '[]') } catch { return false }
        if (!Array.isArray(ids)) return false
        return ids.includes(request?.runId ?? '') &&
          !element.closest('[hidden], [aria-hidden="true"]')
      }) ?? null)
    }
    updateTarget()
    const observer = new MutationObserver(updateTarget)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-permission-run-ids', 'hidden', 'aria-hidden'] })
    return () => observer.disconnect()
  }, [request?.runId])

  useEffect(() => {
    const form = target?.parentElement?.querySelector<HTMLFormElement>('form.composer')
    if (!form || !request) return
    const wasHidden = form.hidden
    const wasInert = form.hasAttribute('inert')
    form.hidden = true
    form.setAttribute('inert', '')
    return () => {
      form.hidden = wasHidden
      if (!wasInert) form.removeAttribute('inert')
    }
  }, [target, request?.id])

  if (!api || !request) return null

  const decide = async (decision: ToolPermissionDecision): Promise<void> => {
    setPending(true)
    setError(undefined)
    try {
      await api.resolve({
        requestId: request.id,
        expectedRevision: request.requestRevision,
        decision
      })
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error &&
        /revision|conflict|expired/.test(cause.message)
          ? t('permission.error.changed')
          : t('permission.error.failed')
      )
      await refresh()
    } finally {
      setPending(false)
    }
  }

  const card = (
    <ToolPermissionDialog
      request={request}
      pending={pending}
      error={error}
      onAllow={() => void decide('allow_once')}
      onAllowSession={() => void decide('allow_session')}
      onAllowAlways={() => void decide('allow_always')}
      onDeny={() => void decide('deny')}
    />
  )
  return target ? createPortal(card, target) : (
    <div className="tool-permission-card-fallback">{card}</div>
  )
}
