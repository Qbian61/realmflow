import type { TerminalEvent, TerminalSession } from '../../../../shared/terminal'

const MAX_OUTPUT_LENGTH = 1024 * 1024

export type WorkbenchTerminalSession = TerminalSession & {
  output: string
  status: 'running' | 'exited'
  exitCode?: number
}

export type TerminalSessionState = {
  sessions: WorkbenchTerminalSession[]
  activeSessionId?: string
}

export type TerminalSessionAction =
  | { type: 'session-opened'; session: TerminalSession }
  | { type: 'session-selected'; sessionId: string }
  | { type: 'session-renamed'; sessionId: string; title: string }
  | {
      type: 'session-moved'
      sessionId: string
      targetIndex: number
    }
  | { type: 'session-closed'; sessionId: string }
  | { type: 'terminal-event-received'; event: TerminalEvent }

export function createTerminalSessionState(): TerminalSessionState {
  return { sessions: [], activeSessionId: undefined }
}

export function terminalSessionReducer(
  state: TerminalSessionState,
  action: TerminalSessionAction
): TerminalSessionState {
  switch (action.type) {
    case 'session-opened':
      return {
        sessions: [
          ...state.sessions,
          {
            ...action.session,
            output: '',
            status: 'running'
          }
        ],
        activeSessionId: action.session.id
      }
    case 'session-selected':
      return state.sessions.some(({ id }) => id === action.sessionId)
        ? { ...state, activeSessionId: action.sessionId }
        : state
    case 'session-renamed': {
      const title = action.title.trim()
      if (!title) return state
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === action.sessionId ? { ...session, title } : session
        )
      }
    }
    case 'session-moved': {
      const sourceIndex = state.sessions.findIndex(
        ({ id }) => id === action.sessionId
      )
      const targetIndex = Math.max(
        0,
        Math.min(action.targetIndex, state.sessions.length - 1)
      )
      if (sourceIndex < 0 || sourceIndex === targetIndex) return state
      const sessions = [...state.sessions]
      const [session] = sessions.splice(sourceIndex, 1)
      sessions.splice(targetIndex, 0, session)
      return { ...state, sessions }
    }
    case 'session-closed': {
      const index = state.sessions.findIndex(({ id }) => id === action.sessionId)
      if (index < 0) return state
      const sessions = state.sessions.filter(({ id }) => id !== action.sessionId)
      const nextActive =
        state.activeSessionId === action.sessionId
          ? sessions[Math.min(index, sessions.length - 1)]?.id
          : state.activeSessionId
      return { sessions, activeSessionId: nextActive }
    }
    case 'terminal-event-received':
      return {
        ...state,
        sessions: state.sessions.map((session) => {
          if (session.id !== action.event.sessionId) return session
          if (action.event.type === 'exit') {
            return {
              ...session,
              status: 'exited',
              exitCode: action.event.exitCode
            }
          }
          return {
            ...session,
            output: `${session.output}${action.event.data}`.slice(
              -MAX_OUTPUT_LENGTH
            )
          }
        })
      }
  }
}
