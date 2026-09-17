import {
  ensureDefaultChatSessions,
  isChatSession,
  type ChatSession
} from '../../domain/chat-session'
import { isRecord } from '../../domain/workspace'

export function decodeChatSessions(value: unknown): ChatSession[] | null {
  if (
    !isRecord(value) ||
    ![1, 2, 3, 4].includes(Number(value.version)) ||
    !Array.isArray(value.sessions) ||
    !value.sessions.every(isChatSession)
  ) {
    return null
  }
  return ensureDefaultChatSessions([...value.sessions]).sort(
    (left, right) => right.updatedAt - left.updatedAt
  )
}

export function encodeChatSessions(sessions: ChatSession[]): unknown {
  return { version: 4, sessions }
}
