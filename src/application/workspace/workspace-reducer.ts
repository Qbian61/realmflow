import type {
  ChatSession,
  ChatSessionMessage
} from '../../domain/chat-session'
import type { AssistantTurnProjection } from '../../../domain/assistant-turn'
import type { ConversationTurn } from '../../../domain/conversation-turn'
import type {
  WorkspaceNavigation,
  WorkspaceRequirement,
  WorkspaceSpace
} from '../../domain/workspace'

export type WorkspaceState = WorkspaceNavigation & {
  sessions: ChatSession[]
}

export type WorkspaceAction =
  | { type: 'space-created'; space: WorkspaceSpace }
  | { type: 'space-renamed'; spacePath: string; label: string }
  | { type: 'space-deleted'; spacePath: string }
  | { type: 'space-moved'; sourcePath: string; targetIndex: number }
  | {
      type: 'requirement-created'
      spacePath: string
      requirement: WorkspaceRequirement
    }
  | {
      type: 'requirement-renamed'
      spacePath: string
      requirementId: string
      title: string
    }
  | { type: 'requirement-deleted'; spacePath: string; requirementId: string }
  | {
      type: 'requirement-moved'
      spacePath: string
      sourceId: string
      targetIndex: number
    }
  | { type: 'session-created'; session: ChatSession }
  | { type: 'session-synced'; session: ChatSession }
  | {
      type: 'session-turn-appended'
      sessionId: string
      turn: ConversationTurn
      messages: [ChatSessionMessage, ChatSessionMessage]
    }
  | {
      type: 'session-turn-projection-updated'
      sessionId: string
      turnId: string
      projection: AssistantTurnProjection
    }
  | { type: 'navigation-replaced'; navigation: WorkspaceNavigation }
  | { type: 'sessions-replaced'; sessions: ChatSession[] }

export function createWorkspaceState(
  navigation: WorkspaceNavigation,
  sessions: ChatSession[]
): WorkspaceState {
  return { ...navigation, sessions }
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case 'space-created':
      return { ...state, spaces: [action.space, ...state.spaces] }
    case 'space-renamed':
      return {
        ...state,
        spaces: state.spaces.map((space) =>
          space.path === action.spacePath
            ? { ...space, label: action.label }
            : space
        )
      }
    case 'space-deleted': {
      const requirementsBySpace = { ...state.requirementsBySpace }
      delete requirementsBySpace[action.spacePath]
      return {
        spaces: state.spaces.filter(
          (space) => space.path !== action.spacePath
        ),
        requirementsBySpace,
        sessions: state.sessions.filter(
          (session) => session.spacePath !== action.spacePath
        )
      }
    }
    case 'space-moved':
      return {
        ...state,
        spaces: moveById(
          state.spaces,
          action.sourcePath,
          action.targetIndex,
          (space) => space.path
        )
      }
    case 'requirement-created':
      return {
        ...state,
        requirementsBySpace: {
          ...state.requirementsBySpace,
          [action.spacePath]: [
            action.requirement,
            ...(state.requirementsBySpace[action.spacePath] ?? [])
          ]
        }
      }
    case 'requirement-renamed':
      return {
        ...state,
        requirementsBySpace: {
          ...state.requirementsBySpace,
          [action.spacePath]: (
            state.requirementsBySpace[action.spacePath] ?? []
          ).map((requirement) =>
            requirement.id === action.requirementId
              ? { ...requirement, title: action.title }
              : requirement
          )
        }
      }
    case 'requirement-deleted':
      return {
        ...state,
        requirementsBySpace: {
          ...state.requirementsBySpace,
          [action.spacePath]: (
            state.requirementsBySpace[action.spacePath] ?? []
          ).filter(
            (requirement) => requirement.id !== action.requirementId
          )
        }
      }
    case 'requirement-moved':
      return {
        ...state,
        requirementsBySpace: {
          ...state.requirementsBySpace,
          [action.spacePath]: moveById(
            state.requirementsBySpace[action.spacePath] ?? [],
            action.sourceId,
            action.targetIndex,
            (requirement) => requirement.id
          )
        }
      }
    case 'session-created':
      return { ...state, sessions: [action.session, ...state.sessions] }
    case 'session-synced':
      return {
        ...state,
        sessions: [
          action.session,
          ...state.sessions.filter((session) => session.id !== action.session.id)
        ]
      }
    case 'session-turn-appended': {
      const session = state.sessions.find(
        (item) => item.id === action.sessionId
      )
      if (!session) return state
      const updatedSession = {
        ...session,
        turns: [...session.turns, action.turn],
        messages: [...session.messages, ...action.messages],
        updatedAt: action.turn.createdAt
      }
      return {
        ...state,
        sessions: [
          updatedSession,
          ...state.sessions.filter((item) => item.id !== action.sessionId)
        ]
      }
    }
    case 'session-turn-projection-updated': {
      const session = state.sessions.find(
        (item) => item.id === action.sessionId
      )
      if (!session) return state
      const turn = session.turns.find((item) => item.id === action.turnId)
      if (!turn) return state
      const updatedTurn = applyProjectionToTurn(turn, action.projection)
      const updatedSession = {
        ...session,
        turns: session.turns.map((item) =>
          item.id === action.turnId ? updatedTurn : item
        ),
        messages: session.messages.map((message) =>
          message.id === action.projection.assistantMessageId &&
          message.turnId === action.turnId &&
          message.role === 'assistant'
            ? applyProjectionToAssistantMessage(message, action.projection)
            : message
        ),
        updatedAt:
          action.projection.elapsedAt ??
          action.projection.completedAt ??
          action.projection.startedAt
      }
      return {
        ...state,
        sessions: [
          updatedSession,
          ...state.sessions.filter((item) => item.id !== action.sessionId)
        ]
      }
    }
    case 'sessions-replaced':
      return { ...state, sessions: action.sessions }
    case 'navigation-replaced':
      return { ...state, ...action.navigation }
  }
}

function moveById<T>(
  items: T[],
  sourceId: string,
  targetIndex: number,
  getId: (item: T) => string
): T[] {
  const sourceIndex = items.findIndex((item) => getId(item) === sourceId)
  const boundedTarget = Math.max(0, Math.min(targetIndex, items.length - 1))
  if (
    sourceIndex < 0 ||
    sourceIndex === boundedTarget
  ) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(boundedTarget, 0, moved)
  return next
}

function applyProjectionToTurn(
  turn: ConversationTurn,
  projection: AssistantTurnProjection
): ConversationTurn {
  const next: ConversationTurn = {
    ...turn,
    status: projection.status
  }
  if (projection.completedAt === undefined) {
    delete next.completedAt
  } else {
    next.completedAt = projection.completedAt
  }
  return next
}

function applyProjectionToAssistantMessage(
  message: ChatSessionMessage,
  projection: AssistantTurnProjection
): ChatSessionMessage {
  return {
    ...message,
    status: assistantMessageStatusFromProjection(projection),
    content: projection.status === 'completed' ? projection.answer : message.content,
    execution: projection,
    ...(projection.completedAt === undefined
      ? {}
      : { completedAt: projection.completedAt })
  }
}

function assistantMessageStatusFromProjection(
  projection: AssistantTurnProjection
): ChatSessionMessage['status'] {
  if (projection.status === 'completed') return 'completed'
  if (projection.status === 'failed' || projection.status === 'cancelled') {
    return 'failed'
  }
  return 'pending'
}
