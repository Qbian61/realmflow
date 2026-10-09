import {
  createTerminalSessionState,
  terminalSessionReducer
} from './terminal-session-reducer'

describe('terminalSessionReducer', () => {
  it('moves a session to an exact index without changing the active session', () => {
    let state = createTerminalSessionState()
    for (const id of ['terminal-1', 'terminal-2', 'terminal-3']) {
      state = terminalSessionReducer(state, {
        type: 'session-opened',
        session: {
          id,
          title: id,
          cwd: `/tmp/${id}`,
          shell: 'zsh'
        }
      })
    }

    state = terminalSessionReducer(state, {
      type: 'session-moved',
      sessionId: 'terminal-3',
      targetIndex: 0
    })

    expect(state.sessions.map(({ id }) => id)).toEqual([
      'terminal-3',
      'terminal-1',
      'terminal-2'
    ])
    expect(state.activeSessionId).toBe('terminal-3')
  })

  it('manages selection, local names, output bounds, and exit state', () => {
    let state = terminalSessionReducer(createTerminalSessionState(), {
      type: 'session-opened',
      session: {
        id: 'terminal-1',
        title: 'project',
        cwd: '/tmp/project',
        shell: 'zsh'
      }
    })
    state = terminalSessionReducer(state, {
      type: 'session-renamed',
      sessionId: 'terminal-1',
      title: 'API server'
    })
    state = terminalSessionReducer(state, {
      type: 'terminal-event-received',
      event: {
        sessionId: 'terminal-1',
        type: 'data',
        data: 'x'.repeat(1024 * 1024 + 20)
      }
    })
    state = terminalSessionReducer(state, {
      type: 'terminal-event-received',
      event: { sessionId: 'terminal-1', type: 'exit', exitCode: 2 }
    })

    expect(state.activeSessionId).toBe('terminal-1')
    expect(state.sessions[0]).toMatchObject({
      title: 'API server',
      status: 'exited',
      exitCode: 2
    })
    expect(state.sessions[0].output.length).toBeLessThanOrEqual(1024 * 1024)

    state = terminalSessionReducer(state, {
      type: 'session-closed',
      sessionId: 'terminal-1'
    })
    expect(state).toEqual({ sessions: [], activeSessionId: undefined })
  })
})
