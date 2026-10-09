import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  PendingToolPermissionView,
  ToolPermissionApi
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
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

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
          candidate.expiresAt > Date.now() &&
          !dismissed.has(requestKey(candidate))
      ),
    [dismissed, requests]
  )

  if (!api || !request) return null

  const later = (): void => {
    setError(undefined)
    setDismissed((current) => {
      const next = new Set(current)
      next.add(requestKey(request))
      return next
    })
  }
  const decide = async (decision: 'allow_once' | 'deny'): Promise<void> => {
    setPending(true)
    setError(undefined)
    try {
      await api.resolve({
        requestId: request.id,
        expectedRevision: request.requestRevision,
        decision
      })
      setDismissed((current) => {
        const next = new Set(current)
        next.add(requestKey(request))
        return next
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

  return (
    <ToolPermissionDialog
      request={request}
      pending={pending}
      error={error}
      onLater={later}
      onAllow={() => void decide('allow_once')}
      onDeny={() => void decide('deny')}
    />
  )
}

function requestKey(request: PendingToolPermissionView): string {
  return `${request.id}:${request.requestRevision}`
}
