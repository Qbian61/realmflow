import type { ConversationKnowledgeScope } from '../../../domain/conversation-knowledge-scope'
import type { ConversationTurn } from '../../../domain/conversation-turn'
import type {
  ChatSession,
  ChatSessionMessage
} from '../../domain/chat-session'

export function createLocalSessionDraft(input: {
  sessionId: string
  title: string
  spacePath: string
  knowledgeScope: ConversationKnowledgeScope
  folderBindingId?: string
  prompt: string
  createdAt: number
}): ChatSession {
  const turnId = `${input.sessionId}-turn-1`
  const userMessageId = `${input.sessionId}-message-1`
  const assistantMessageId = `${input.sessionId}-message-2`
  return {
    id: input.sessionId,
    knowledgeScope: input.knowledgeScope,
    title: input.title,
    spacePath: input.spacePath,
    ...(input.folderBindingId
      ? { folderPath: input.folderBindingId }
      : {}),
    turns: [
      {
        id: turnId,
        sessionId: input.sessionId,
        index: 0,
        userMessageId,
        assistantMessageId,
        status: 'pending',
        createdAt: input.createdAt
      }
    ],
    messages: [
      {
        id: userMessageId,
        turnId,
        content: input.prompt,
        createdAt: input.createdAt,
        role: 'user'
      },
      {
        id: assistantMessageId,
        turnId,
        content: '',
        createdAt: input.createdAt,
        role: 'assistant',
        status: 'pending'
      }
    ],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }
}

export function createLocalSessionTurn(input: {
  sessionId: string
  turnIndex: number
  content: string
  createdAt: number
}): {
  turn: ConversationTurn
  messages: [ChatSessionMessage, ChatSessionMessage]
} {
  const turnId = `${input.sessionId}-turn-${input.turnIndex + 1}`
  const userMessageId = `${turnId}-user`
  const assistantMessageId = `${turnId}-assistant`
  return {
    turn: {
      id: turnId,
      sessionId: input.sessionId,
      index: input.turnIndex,
      userMessageId,
      assistantMessageId,
      status: 'pending',
      createdAt: input.createdAt
    },
    messages: [
      {
        id: userMessageId,
        turnId,
        content: input.content,
        createdAt: input.createdAt,
        role: 'user'
      },
      {
        id: assistantMessageId,
        turnId,
        content: '',
        createdAt: input.createdAt,
        role: 'assistant',
        status: 'pending'
      }
    ]
  }
}
