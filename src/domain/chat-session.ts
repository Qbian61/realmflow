import { isRecord } from './workspace'

export type ChatSessionMessage = {
  id: string
  content: string
  createdAt: number
  role?: 'user' | 'assistant' | 'tool'
  sortOrder?: number
}

export type ChatSession = {
  id: string
  kind?: 'general' | 'space' | 'requirement_node'
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  title: string
  spacePath: string
  messages: ChatSessionMessage[]
  sortOrder?: number
  revision?: number
  createdAt: number
  updatedAt: number
}

export function createDefaultChatSessions(): ChatSession[] {
  return [
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
}

export function ensureDefaultChatSessions(
  sessions: ChatSession[]
): ChatSession[] {
  const missingSessions = createDefaultChatSessions().filter(
    (defaultSession) =>
      !sessions.some((session) => session.id === defaultSession.id)
  )
  if (missingSessions.length === 0) return sessions
  return [...sessions, ...missingSessions].sort(
    (left, right) => right.updatedAt - left.updatedAt
  )
}

export function isChatSession(value: unknown): value is ChatSession {
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

function isChatSessionMessage(value: unknown): value is ChatSessionMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'number' &&
    (value.role === undefined ||
      value.role === 'user' ||
      value.role === 'assistant' ||
      value.role === 'tool')
  )
}

export function titleFromPrompt(prompt: string): string {
  const value = prompt.trim()
  return value.length > 24 ? `${value.slice(0, 24)}…` : value
}
