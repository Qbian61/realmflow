import { useEffect } from 'react'
import type { BusinessApi, ScheduleRunDto } from '../../../shared/business'

export function useScheduleRunRefresh(
  business: BusinessApi | undefined,
  active: boolean,
  onRuns: (runs: ScheduleRunDto[]) => void,
): void {
  useEffect(() => {
    if (!active || !business) return
    let disposed = false
    let refreshing = false
    const refresh = (): void => {
      if (refreshing) return
      refreshing = true
      void business.listScheduleRuns({ limit: 50 })
        .then(runs => { if (!disposed) onRuns(runs) })
        .catch(() => {})
        .finally(() => { refreshing = false })
    }
    const unsubscribe = window.realmflow?.toolPermissions?.onChanged(refresh)
    const timer = window.setInterval(refresh, 2000)
    return () => { disposed = true; unsubscribe?.(); window.clearInterval(timer) }
  }, [business, active, onRuns])
}
