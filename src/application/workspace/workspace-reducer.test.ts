import type { ChatSession } from '../../domain/chat-session'
import type { AssistantTurnProjection } from '../../../domain/assistant-turn'
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
    turns: [],
    messages: [],
    createdAt: 1,
    updatedAt: 1
  },
  {
    id: 'session-b',
    title: 'B session',
    spacePath: '/spaces/b',
    turns: [],
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
      targetIndex: 0
    })
    const requirementsMoved = workspaceReducer(spacesMoved, {
      type: 'requirement-moved',
      spacePath: '/spaces/a',
      sourceId: 'a-2',
      targetIndex: 0
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

  it('renames one requirement without moving or replacing sibling requirements', () => {
    const initial = createWorkspaceState(navigation, sessions)

    const renamed = workspaceReducer(initial, {
      type: 'requirement-renamed',
      spacePath: '/spaces/a',
      requirementId: 'a-1',
      title: 'Renamed A1'
    })

    expect(renamed.requirementsBySpace['/spaces/a']).toEqual([
      { id: 'a-1', title: 'Renamed A1' },
      navigation.requirementsBySpace['/spaces/a'][1]
    ])
    expect(renamed.requirementsBySpace['/spaces/b']).toBe(
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
        turns: [],
        messages: [],
        createdAt: 2,
        updatedAt: 2
      }
    })
    const updated = workspaceReducer(created, {
      type: 'session-turn-appended',
      sessionId: 'session-a',
      turn: {
        id: 'turn-1',
        sessionId: 'session-a',
        index: 0,
        userMessageId: 'message-1',
        assistantMessageId: 'message-2',
        status: 'pending',
        createdAt: 3
      },
      messages: [
        {
          id: 'message-1',
          turnId: 'turn-1',
          content: 'next',
          createdAt: 3,
          role: 'user'
        },
        {
          id: 'message-2',
          turnId: 'turn-1',
          content: '',
          createdAt: 3,
          role: 'assistant',
          status: 'pending'
        }
      ]
    })

    expect(created.sessions[0].id).toBe('session-c')
    expect(updated.sessions[0]).toMatchObject({
      id: 'session-a',
      updatedAt: 3
    })
    expect(updated.sessions[0].messages[0].content).toBe('next')
    expect(updated.sessions[0].turns[0].id).toBe('turn-1')
  })

  it('applies a live assistant turn projection to the matching turn and assistant message', () => {
    const projection = assistantProjection('run-1', 'turn-1', 'message-2')
    const initial = createWorkspaceState(navigation, [
      {
        id: 'session-a',
        title: 'A session',
        spacePath: '/spaces/a',
        turns: [
          {
            id: 'turn-1',
            sessionId: 'session-a',
            index: 0,
            userMessageId: 'message-1',
            assistantMessageId: 'message-2',
            runId: 'run-1',
            status: 'running',
            createdAt: 3
          }
        ],
        messages: [
          {
            id: 'message-1',
            turnId: 'turn-1',
            role: 'user',
            content: 'run command',
            createdAt: 3
          },
          {
            id: 'message-2',
            turnId: 'turn-1',
            role: 'assistant',
            status: 'pending',
            content: '',
            runId: 'run-1',
            createdAt: 3
          }
        ],
        createdAt: 3,
        updatedAt: 3
      }
    ])

    const updated = workspaceReducer(initial, {
      type: 'session-turn-projection-updated',
      sessionId: 'session-a',
      turnId: 'turn-1',
      projection
    })

    expect(updated.sessions[0].turns[0].status).toBe('waiting_permission')
    expect(updated.sessions[0].messages[1].execution).toBe(projection)
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

function assistantProjection(
  runId: string,
  turnId: string,
  assistantMessageId: string
): AssistantTurnProjection {
  return {
    schemaVersion: 2,
    runId,
    turnId,
    assistantMessageId,
    startedAt: 3,
    status: 'waiting_permission',
    answer: '',
    tree: [],
    collapsedDefaults: [],
    executionSummaries: [],
    references: [],
    toolCalls: [],
    delegations: [],
    compactions: [],
    lastSequence: 4,
    elapsedAt: 4
  }
}
