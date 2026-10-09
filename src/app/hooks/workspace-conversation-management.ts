import type { Dispatch } from 'react'
import type { BusinessApi } from '../../../shared/business'
import type { WorkspaceAction } from '../../application/workspace/workspace-reducer'
import type { ChatSession } from '../../domain/chat-session'
import type { RecentConversationFilters } from '../../features/sessions/recent-conversation-filters'
import { mapConversation } from '../mappers/business-mappers'

type Dependencies = {
  business?: BusinessApi
  sessions: ChatSession[]
  dispatch: Dispatch<WorkspaceAction>
  filters: RecentConversationFilters
  refresh: (filters: RecentConversationFilters) => Promise<void>
  markAvailable: () => void
  notify: (
    notice: 'conversation-rename-failed' | 'conversation-delete-failed'
  ) => void
}

export function createConversationManagementActions({
  business,
  sessions,
  dispatch,
  filters,
  refresh,
  markAvailable,
  notify
}: Dependencies) {
  return {
    async renameConversation(
      sessionId: string,
      title: string
    ): Promise<ChatSession | undefined> {
      const session = sessions.find((item) => item.id === sessionId)
      const normalizedTitle = title.trim()
      if (!session || !normalizedTitle || normalizedTitle.length > 240) {
        return undefined
      }
      if (!business) {
        const renamed = {
          ...session,
          title: normalizedTitle,
          revision: (session.revision ?? 0) + 1,
          updatedAt: Date.now()
        }
        dispatch({ type: 'session-synced', session: renamed })
        return renamed
      }
      try {
        const renamed = mapConversation(
          await business.renameConversation({
            id: sessionId,
            expectedRevision: session.revision ?? 0,
            title: normalizedTitle
          })
        )
        dispatch({ type: 'session-synced', session: renamed })
        await refresh(filters)
        markAvailable()
        return renamed
      } catch {
        notify('conversation-rename-failed')
        return undefined
      }
    },

    async deleteConversation(sessionId: string): Promise<boolean> {
      const session = sessions.find((item) => item.id === sessionId)
      if (!session) return false
      if (!business) {
        dispatch({
          type: 'sessions-replaced',
          sessions: sessions.filter((item) => item.id !== sessionId)
        })
        return true
      }
      try {
        const result = await business.deleteConversation({
          id: sessionId,
          expectedRevision: session.revision ?? 0
        })
        if (result.status === 'conflict') {
          dispatch({
            type: 'session-synced',
            session: mapConversation(result.conversation)
          })
          notify('conversation-delete-failed')
          return false
        }
        await refresh(filters)
        markAvailable()
        return result.status === 'deleted' || result.status === 'not_found'
      } catch {
        notify('conversation-delete-failed')
        return false
      }
    }
  }
}
