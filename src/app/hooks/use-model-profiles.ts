import { useEffect, useState } from 'react'

export function useModelProfiles(): {
  options: Array<{ value: string; label: string }>
  selectedId: string
  select: (id: string) => void
} {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: 'RealmFlow Agent' }
  ])
  const [selectedId, select] = useState('')

  useEffect(() => {
    const business = window.realmflow?.business
    if (!business?.listModels) return
    let disposed = false
    void business
      .listModels()
      .then(({ profiles }) => {
        if (disposed) return
        const enabled = profiles
          .filter((profile) => profile.enabled)
          .map((profile) => ({
            value: profile.id,
            label: profile.displayName
          }))
        setOptions(
          enabled.length > 0
            ? enabled
            : [{ value: '', label: 'RealmFlow Agent' }]
        )
        select((current) => current || enabled[0]?.value || '')
      })
      .catch(() => undefined)
    return () => {
      disposed = true
    }
  }, [])

  return { options, selectedId, select }
}
