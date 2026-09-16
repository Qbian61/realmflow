export type ChatSessionMessage = {
  id: string
  content: string
  createdAt: number
  role?: 'user' | 'assistant'
}

export type ChatSession = {
  id: string
  title: string
  spacePath: string
  messages: ChatSessionMessage[]
  createdAt: number
  updatedAt: number
}

type ChatSessionStore = {
  version: 4
  sessions: ChatSession[]
}

const LEGACY_CHAT_SESSION_STORAGE_KEYS = [
  'realmflow:chat-sessions:v3',
  'realmflow:chat-sessions:v2',
  'realmflow:chat-sessions:v1'
]
export const CHAT_SESSION_STORAGE_KEY = 'realmflow:chat-sessions:v4'

const defaultChatSessions = (): ChatSession[] => [
  {
    id: 'test-conversation',
    title: '测试对话',
    spacePath: '/spaces/xxx',
    createdAt: 1,
    updatedAt: 1,
    messages: [
      {
        id: 'test-conversation-message-1',
        role: 'user',
        content: '如何设计空间内的需求管理流程？',
        createdAt: 1
      },
      {
        id: 'test-conversation-message-2',
        role: 'assistant',
        content:
          '可以从需求状态、优先级和负责人三个维度统一管理。状态变化应实时同步到空间统计，优先级用于排序和识别风险，负责人用于明确当前推进人。',
        createdAt: 2
      }
    ]
  },
  {
    id: 'test-conversation-2',
    title: '测试对话 2',
    spacePath: '/spaces/xxx',
    createdAt: 1,
    updatedAt: 1,
    messages: [
      {
        id: 'test-conversation-2-message-1',
        role: 'user',
        content: '如何制定需求测试计划？',
        createdAt: 1
      },
      {
        id: 'test-conversation-2-message-2',
        role: 'assistant',
        content:
          '可以先从验收标准拆分主流程和异常流程，再按风险安排自动化、人工验证与回归范围。每条用例应关联需求，并记录执行结果和阻塞原因。',
        createdAt: 2
      }
    ]
  }
]

export function ensureDefaultChatSessions(
  sessions: ChatSession[]
): ChatSession[] {
  const missingSessions = defaultChatSessions().filter(
    (defaultSession) =>
      !sessions.some((session) => session.id === defaultSession.id)
  )
  if (missingSessions.length === 0) return sessions
  return [...sessions, ...missingSessions].sort(
    (left, right) => right.updatedAt - left.updatedAt
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChatSessionMessage(value: unknown): value is ChatSessionMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'number' &&
    (value.role === undefined ||
      value.role === 'user' ||
      value.role === 'assistant')
  )
}

function isChatSession(value: unknown): value is ChatSession {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.spacePath === 'string' &&
    value.spacePath.startsWith('/spaces/') &&
    Array.isArray(value.messages) &&
    value.messages.every(isChatSessionMessage) &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  )
}

export function readChatSessions(): ChatSession[] {
  try {
    const rawValue =
      window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY) ??
      LEGACY_CHAT_SESSION_STORAGE_KEYS.map((key) =>
        window.localStorage.getItem(key)
      ).find((value) => value !== null)
    if (!rawValue) return defaultChatSessions()
    const value: unknown = JSON.parse(rawValue)
    if (
      !isRecord(value) ||
      (value.version !== 1 &&
        value.version !== 2 &&
        value.version !== 3 &&
        value.version !== 4) ||
      !Array.isArray(value.sessions) ||
      !value.sessions.every(isChatSession)
    ) {
      return defaultChatSessions()
    }
    return ensureDefaultChatSessions([...value.sessions]).sort(
      (left, right) => right.updatedAt - left.updatedAt
    )
  } catch {
    return defaultChatSessions()
  }
}

export function saveChatSessions(sessions: ChatSession[]): void {
  try {
    window.localStorage.setItem(
      CHAT_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        sessions
      } satisfies ChatSessionStore)
    )
    for (const key of LEGACY_CHAT_SESSION_STORAGE_KEYS) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Conversations remain usable when local storage is unavailable.
  }
}

export function titleFromPrompt(prompt: string): string {
  const value = prompt.trim()
  return value.length > 24 ? `${value.slice(0, 24)}…` : value
}
