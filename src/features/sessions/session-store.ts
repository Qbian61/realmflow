import {
  ensureDefaultChatSessions,
  titleFromPrompt,
  type ChatSession,
  type ChatSessionMessage
} from '../../domain/chat-session'
import {
  CHAT_SESSION_STORAGE_KEY,
  createChatSessionRepository
} from '../../infrastructure/storage/chat-session-repository'
import type {
  RepositorySaveResult,
  RepositorySnapshot
} from '../../application/ports/repositories'

export type { ChatSession, ChatSessionMessage }
export {
  CHAT_SESSION_STORAGE_KEY,
  ensureDefaultChatSessions,
  titleFromPrompt
}

export function readChatSessions(): RepositorySnapshot<ChatSession[]> {
  return createChatSessionRepository().load()
}

export function saveChatSessions(
  sessions: ChatSession[],
  expectedRevision: number
): Promise<RepositorySaveResult<ChatSession[]>> {
  return Promise.resolve(
    createChatSessionRepository().save(sessions, expectedRevision)
  )
}
