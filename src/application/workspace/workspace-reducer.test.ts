import type { ChatSession } from '../../domain/chat-session'
import type { WorkspaceNavigation } from '../../domain/workspace'
import {
  createWorkspaceState,
  workspaceReducer
} from './workspace-reducer'

const navigation: WorkspaceNavigation = {
  spaces: [
    { path: '/spaces/a', label: 'A', description: 'A space' },
    { path: '/spaces/b', label: 'B', description: 'B space' }
  ],
  requirementsBySpace: {
    '/spaces/a': [
      { id: 'a-1', title: 'A1' },
      { id: 'a-2', title: 'A2' }
    ],
    '/spaces/b': [{ id: 'b-1', title: 'B1' }]
  }
}

const sessions: ChatSession[] = [
  {
    id: 'session-a',
    title: 'A session',
    spacePath: '/spaces/a',
    messages: [],
    createdAt: 1,
    updatedAt: 1
  },
  {
    id: 'session-b',
    title: 'B session',
    spacePath: '/spaces/b',
    messages: [],
    createdAt: 1,
    updatedAt: 1
  }
]

describe('workspaceReducer', () => {
  it('creates, renames and deletes a space with its requirements and sessions', () => {
    const initial = createWorkspaceState(navigation, sessions)
    const created = workspaceReducer(initial, {
      type: 'space-created',
      space: { path: '/spaces/c', label: 'C', description: 'C space' }
    })
    const renamed = workspaceReducer(created, {
      type: 'space-renamed',
      spacePath: '/spaces/c',
      label: 'Core'
    })
    const removed = workspaceReducer(renamed, {
      type: 'space-deleted',
      spacePath: '/spaces/a'
    })

    expect(created.spaces.map((space) => space.path)).toEqual([
      '/spaces/c',
      '/spaces/a',
      '/spaces/b'
    ])
    expect(renamed.spaces[0].label).toBe('Core')
    expect(removed.spaces.map((space) => space.path)).toEqual([
      '/spaces/c',
      '/spaces/b'
    ])
    expect(removed.requirementsBySpace['/spaces/a']).toBeUndefined()
    expect(removed.sessions.map((session) => session.id)).toEqual(['session-b'])
  })

  it('reorders spaces and requirements without crossing space boundaries', () => {
    const initial = createWorkspaceState(navigation, sessions)
    const spacesMoved = workspaceReducer(initial, {
      type: 'space-moved',
      sourcePath: '/spaces/b',
      targetPath: '/spaces/a'
    })
    const requirementsMoved = workspaceReducer(spacesMoved, {
      type: 'requirement-moved',
      spacePath: '/spaces/a',
      sourceId: 'a-2',
      targetId: 'a-1'
    })

    expect(spacesMoved.spaces.map((space) => space.path)).toEqual([
      '/spaces/b',
      '/spaces/a'
    ])
    expect(
      requirementsMoved.requirementsBySpace['/spaces/a'].map(
        (requirement) => requirement.id
      )
    ).toEqual(['a-2', 'a-1'])
    expect(requirementsMoved.requirementsBySpace['/spaces/b']).toEqual(
      navigation.requirementsBySpace['/spaces/b']
    )
  })

  it('creates and appends sessions while keeping the latest session first', () => {
    const initial = createWorkspaceState(navigation, sessions)
    const created = workspaceReducer(initial, {
      type: 'session-created',
      session: {
        id: 'session-c',
        title: 'C session',
        spacePath: '/spaces/a',
        messages: [],
        createdAt: 2,
        updatedAt: 2
      }
    })
    const updated = workspaceReducer(created, {
      type: 'session-message-appended',
      sessionId: 'session-a',
      message: {
        id: 'message-1',
        content: 'next',
        createdAt: 3,
        role: 'user'
      }
    })

    expect(created.sessions[0].id).toBe('session-c')
    expect(updated.sessions[0]).toMatchObject({
      id: 'session-a',
      updatedAt: 3
    })
    expect(updated.sessions[0].messages[0].content).toBe('next')
  })

  it('replaces persisted navigation without discarding live sessions', () => {
    const initial = createWorkspaceState(navigation, sessions)
    const replacement: WorkspaceNavigation = {
      spaces: [{ path: '/spaces/c', label: 'C', description: 'C space' }],
      requirementsBySpace: {
        '/spaces/c': [{ id: 'c-1', title: 'C1' }]
      }
    }

    const updated = workspaceReducer(initial, {
      type: 'navigation-replaced',
      navigation: replacement
    })

    expect(updated).toEqual({ ...replacement, sessions })
  })
})
