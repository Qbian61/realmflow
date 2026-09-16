import {
  createDefaultChatSessions,
  ensureDefaultChatSessions,
  isChatSession,
  type ChatSession
} from '../../domain/chat-session'
import { isRecord } from '../../domain/workspace'
import {
  createVersionedRepository,
  type StorageAdapter,
  type VersionedRepository
} from './versioned-repository'
import { PERSISTENCE_DATASETS } from './persistence-registry'

const LEGACY_CHAT_SESSION_STORAGE_KEYS = [
  ...PERSISTENCE_DATASETS.chatSessions.legacyKeys
]
export const CHAT_SESSION_STORAGE_KEY = PERSISTENCE_DATASETS.chatSessions.key

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

export function createChatSessionRepository(
  storage: StorageAdapter = window.localStorage
): VersionedRepository<ChatSession[]> {
  return createVersionedRepository({
    storage,
    key: CHAT_SESSION_STORAGE_KEY,
    legacyKeys: LEGACY_CHAT_SESSION_STORAGE_KEYS,
    fallback: createDefaultChatSessions,
    decode: decodeChatSessions,
    encode: encodeChatSessions
  })
}
