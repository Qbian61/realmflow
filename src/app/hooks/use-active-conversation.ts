import { useEffect, useRef, useState } from 'react'
import type { BusinessApi, ConversationDto } from '../../../shared/business'

export function useActiveConversation(input: {
  sessionId?: string
  business?: BusinessApi
  alreadyLoaded: boolean
  onLoaded(conversation: ConversationDto): void
  onUnavailable(): void
}): string | undefined {
  const { sessionId, business, alreadyLoaded, onLoaded, onUnavailable } = input
  const [resolvedSessionId, setResolvedSessionId] = useState<string>()
  const callbacks = useRef({ onLoaded, onUnavailable })
  callbacks.current = { onLoaded, onUnavailable }
  useEffect(() => {
    if (!sessionId || !business?.getConversation || alreadyLoaded) return
    let active = true
    void business.getConversation({ sessionId }).then((conversation) => {
      if (active && conversation) callbacks.current.onLoaded(conversation)
    }).catch(() => {
      if (active) callbacks.current.onUnavailable()
    }).finally(() => {
      if (active) setResolvedSessionId(sessionId)
    })
    return () => { active = false }
  }, [sessionId, business, alreadyLoaded])
  return resolvedSessionId
}
