import type { ConversationKnowledgeScope } from '../../domain/conversation-knowledge-scope'
import type { ConversationMessageAttachment } from '../../domain/conversation-input'
import type { ConversationProcessingSnapshot } from '../../domain/conversation-processor'
import type { AssistantTurnProjection } from '../../domain/assistant-turn'
import {
  validateConversationTurns,
  type ConversationTurn
} from '../../domain/conversation-turn'
import type {
  AssistantMessageFollowUp,
  ConversationMessageSource
} from '../../domain/follow-up-suggestion'
import { isRecord } from './workspace'

export type ChatSessionMessage = {
  id: string
  turnId: string
  role: 'user' | 'assistant'
  status?: 'pending' | 'completed' | 'failed'
  runId?: string
  modelName?: string
  error?: string
  questionId?: string
  todoId?: string
  toolCallId?: string
  artifactId?: string
  processing?: ConversationProcessingSnapshot
  execution?: AssistantTurnProjection
  source?: ConversationMessageSource
  followUp?: AssistantMessageFollowUp
  attachments?: readonly ConversationMessageAttachment[]
  content: string
  createdAt: number
  completedAt?: number
}

export type ChatSession = {
  approvalProfileId?: import("../../domain/approval-profile").ApprovalProfileId
  id: string
  kind?: 'general' | 'space' | 'requirement_node'
  knowledgeScope?: ConversationKnowledgeScope
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  modelProfileId?: string
  title: string
  spacePath: string
  turns: ConversationTurn[]
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
      knowledgeScope: { kind: 'workspace', workspaceId: 'xxx' },
      title: '测试对话',
      spacePath: '/spaces/xxx',
      createdAt: 1,
      updatedAt: 1,
      turns: [
        {
          id: 'test-conversation-turn-1',
          sessionId: 'test-conversation',
          index: 0,
          userMessageId: 'test-conversation-message-1',
          assistantMessageId: 'test-conversation-message-2',
          status: 'completed',
          createdAt: 1,
          completedAt: 2
        }
      ],
      messages: [
        {
          id: 'test-conversation-message-1',
          turnId: 'test-conversation-turn-1',
          role: 'user',
          status: 'completed',
          content: '如何设计空间内的需求管理流程？',
          createdAt: 1
        },
        {
          id: 'test-conversation-message-2',
          turnId: 'test-conversation-turn-1',
          role: 'assistant',
          status: 'completed',
          content:
            '可以从需求状态、优先级和负责人三个维度统一管理。状态变化应实时同步到空间统计，优先级用于排序和识别风险，负责人用于明确当前推进人。',
          createdAt: 2
        }
      ]
    },
    {
      id: 'test-conversation-2',
      knowledgeScope: { kind: 'workspace', workspaceId: 'xxx' },
      title: '测试对话 2',
      spacePath: '/spaces/xxx',
      createdAt: 1,
      updatedAt: 1,
      turns: [
        {
          id: 'test-conversation-2-turn-1',
          sessionId: 'test-conversation-2',
          index: 0,
          userMessageId: 'test-conversation-2-message-1',
          assistantMessageId: 'test-conversation-2-message-2',
          status: 'completed',
          createdAt: 1,
          completedAt: 2
        }
      ],
      messages: [
        {
          id: 'test-conversation-2-message-1',
          turnId: 'test-conversation-2-turn-1',
          role: 'user',
          status: 'completed',
          content: '如何制定需求测试计划？',
          createdAt: 1
        },
        {
          id: 'test-conversation-2-message-2',
          turnId: 'test-conversation-2-turn-1',
          role: 'assistant',
          status: 'completed',
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
    (value.modelProfileId === undefined ||
      typeof value.modelProfileId === 'string') &&
    Array.isArray(value.turns) &&
    validateSessionTurns(value.id, value.turns) &&
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
    typeof value.turnId === 'string' &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'number' &&
    (value.completedAt === undefined ||
      typeof value.completedAt === 'number') &&
    (value.role === 'user' || value.role === 'assistant') &&
    (value.status === undefined ||
      value.status === 'pending' ||
      value.status === 'completed' ||
      value.status === 'failed') &&
    (value.runId === undefined || typeof value.runId === 'string') &&
    (value.modelName === undefined || typeof value.modelName === 'string') &&
    (value.error === undefined || typeof value.error === 'string')
    &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) &&
        value.attachments.every(isConversationMessageAttachment))) &&
    (value.execution === undefined ||
      (isRecord(value.execution) &&
        value.execution.runId === value.runId &&
        typeof value.execution.lastSequence === 'number')) &&
    (value.processing === undefined ||
      (isRecord(value.processing) &&
        value.processing.schemaVersion === 1 &&
        isRecord(value.processing.rawUserInput) &&
        value.processing.rawUserInput.content === value.content))
  )
}

function isConversationMessageAttachment(
  value: unknown
): value is ConversationMessageAttachment {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.mimeType === 'string' &&
    (value.mediaKind === 'image' || value.mediaKind === 'document') &&
    Number.isSafeInteger(value.sizeBytes) &&
    (value.sizeBytes as number) >= 0 &&
    (value.status === 'registered' ||
      value.status === 'ready' ||
      value.status === 'failed') &&
    (value.errorCode === undefined || typeof value.errorCode === 'string') &&
    (value.errorMessage === undefined || typeof value.errorMessage === 'string')
  )
}

function validateSessionTurns(
  sessionId: string,
  value: unknown[]
): value is ConversationTurn[] {
  try {
    const turns = value as ConversationTurn[]
    validateConversationTurns(turns)
    return turns.every((turn) => turn.sessionId === sessionId)
  } catch {
    return false
  }
}

export function titleFromPrompt(prompt: string): string {
  const value = prompt.trim()
  return value.length > 24 ? `${value.slice(0, 24)}…` : value
}
