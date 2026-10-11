import { useEffect, useState } from 'react'
import type { ApprovalProfileId } from '../../../domain/approval-profile'

export function useDefaultApprovalProfile(): ApprovalProfileId {
  const [profile, setProfile] = useState<ApprovalProfileId>('protected')
  useEffect(() => {
    let active = true
    const api = window.realmflow?.toolPermissions
    const refresh = () => {
      void api?.getDefault?.().then(value => { if (active) setProfile(value.approvalProfileId) }).catch(() => {})
    }
    refresh()
    const unsubscribe = api?.onChanged?.(refresh)
    return () => { active = false; unsubscribe?.() }
  }, [])
  return profile
}
