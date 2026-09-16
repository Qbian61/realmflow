import type {
  ChatSession,
  ChatSessionMessage
} from '../../domain/chat-session'
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
  | { type: 'space-moved'; sourcePath: string; targetPath: string }
  | {
      type: 'requirement-created'
      spacePath: string
      requirement: WorkspaceRequirement
    }
  | { type: 'requirement-deleted'; spacePath: string; requirementId: string }
  | {
      type: 'requirement-moved'
      spacePath: string
      sourceId: string
      targetId: string
    }
  | { type: 'session-created'; session: ChatSession }
  | {
      type: 'session-message-appended'
      sessionId: string
      message: ChatSessionMessage
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
          action.targetPath,
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
            action.targetId,
            (requirement) => requirement.id
          )
        }
      }
    case 'session-created':
      return { ...state, sessions: [action.session, ...state.sessions] }
    case 'session-message-appended': {
      const session = state.sessions.find(
        (item) => item.id === action.sessionId
      )
      if (!session) return state
      const updatedSession = {
        ...session,
        messages: [...session.messages, action.message],
        updatedAt: action.message.createdAt
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
  targetId: string,
  getId: (item: T) => string
): T[] {
  const sourceIndex = items.findIndex((item) => getId(item) === sourceId)
  const targetIndex = items.findIndex((item) => getId(item) === targetId)
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex
  ) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}
