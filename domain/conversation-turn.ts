import type { AssistantTurnProjection } from './assistant-turn'
import type { ConversationMessageAttachment } from './conversation-input'
import type {
  AssistantMessageFollowUp,
  ConversationMessageSource
} from './follow-up-suggestion'

export const CONVERSATION_TURN_STATUSES = [
  'pending',
  'initializing',
  'running',
  'retrying',
  'waiting_permission',
  'waiting_input',
  'paused',
  'recovery_blocked',
  'completed',
  'failed',
  'cancelled'
] as const

export type ConversationTurnStatus =
  (typeof CONVERSATION_TURN_STATUSES)[number]

export type ConversationTurn = {
  id: string
  sessionId: string
  index: number
  userMessageId: string
  assistantMessageId: string
  runId?: string
  status: ConversationTurnStatus
  createdAt: number
  completedAt?: number
}

export type ConversationTurnMessage = {
  id: string
  sessionId: string
  turnId: string
  role: 'user' | 'assistant'
  status: 'pending' | 'completed' | 'failed'
  content: string
  modelName?: string
  error?: string
  source?: ConversationMessageSource
  followUp?: AssistantMessageFollowUp
  attachments?: readonly ConversationMessageAttachment[]
  createdAt: number
  completedAt?: number
}

export type ConversationTurnView = {
  id: string
  index: number
  status: ConversationTurnStatus
  userMessage: ConversationTurnMessage
  assistantMessage: ConversationTurnMessage
  execution?: AssistantTurnProjection
  isLast: boolean
  isHistory: boolean
}

const TERMINAL_STATUSES = new Set<ConversationTurnStatus>([
  'completed',
  'failed',
  'cancelled'
])

export function isTerminalConversationTurnStatus(
  status: ConversationTurnStatus
): boolean {
  return TERMINAL_STATUSES.has(status)
}

export function validateConversationTurn(
  turn: ConversationTurn
): Readonly<ConversationTurn> {
  requireIdentifier(turn.id, 'Conversation turn')
  requireIdentifier(turn.sessionId, 'Conversation turn session')
  requireIdentifier(turn.userMessageId, 'Conversation turn user message')
  requireIdentifier(
    turn.assistantMessageId,
    'Conversation turn assistant message'
  )
  if (turn.userMessageId === turn.assistantMessageId) {
    throw new Error(
      'Conversation turn must bind distinct user and assistant messages'
    )
  }
  if (!Number.isSafeInteger(turn.index) || turn.index < 0) {
    throw new Error('Conversation turn index must be a non-negative integer')
  }
  if (!CONVERSATION_TURN_STATUSES.includes(turn.status)) {
    throw new Error('Conversation turn status is invalid')
  }
  requireTimestamp(turn.createdAt, 'Conversation turn creation timestamp')
  if (turn.runId !== undefined) {
    requireIdentifier(turn.runId, 'Conversation turn run')
  }

  if (isTerminalConversationTurnStatus(turn.status)) {
    if (turn.completedAt === undefined) {
      throw new Error(
        'Terminal conversation turn requires a completion timestamp'
      )
    }
    requireTimestamp(
      turn.completedAt,
      'Conversation turn completion timestamp'
    )
    if (turn.completedAt < turn.createdAt) {
      throw new Error(
        'Conversation turn completion timestamp cannot be before creation'
      )
    }
  } else if (turn.completedAt !== undefined) {
    throw new Error(
      'Non-terminal conversation turn cannot have a completion timestamp'
    )
  }

  return turn
}

export function validateConversationTurns(
  turns: readonly ConversationTurn[]
): readonly ConversationTurn[] {
  const turnIds = new Set<string>()
  const sessionIndexes = new Set<string>()
  const messageBindings = new Set<string>()

  for (const turn of turns) {
    validateConversationTurn(turn)
    if (turnIds.has(turn.id)) {
      throw new Error('Conversation turn ID must be unique')
    }
    turnIds.add(turn.id)

    const indexKey = `${turn.sessionId}\0${turn.index}`
    if (sessionIndexes.has(indexKey)) {
      throw new Error(
        'Conversation turn index must be unique within its session'
      )
    }
    sessionIndexes.add(indexKey)

    for (const messageId of [
      turn.userMessageId,
      turn.assistantMessageId
    ]) {
      if (messageBindings.has(messageId)) {
        throw new Error(
          'Conversation turn message binding must be globally unique'
        )
      }
      messageBindings.add(messageId)
    }
  }

  return turns
}

function requireIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} ID is required`)
  }
}

function requireTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}
