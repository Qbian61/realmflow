import {
  decodeChatSessions,
  encodeChatSessions
} from './chat-session-repository'
import {
  decodeSpaceResourceStore,
  encodeSpaceResourceStore
} from './space-resource-repository'
import {
  decodeWorkspaceNavigation,
  encodeWorkspaceNavigation
} from './workspace-navigation-repository'

describe('renderer persistence codecs', () => {
  it('round-trips workspace navigation', () => {
    const navigation = {
      spaces: [
        {
          path: '/spaces/one',
          label: 'One',
          description: 'Workspace'
        }
      ],
      requirementsBySpace: {
        '/spaces/one': [{ id: 'requirement-1', title: 'Requirement' }]
      }
    }

    expect(decodeWorkspaceNavigation(encodeWorkspaceNavigation(navigation))).toEqual(
      navigation
    )
    expect(
      decodeWorkspaceNavigation({ version: 1, spaces: 'invalid' })
    ).toBeNull()
  })

  it('validates chat sessions and keeps required defaults', () => {
    const decoded = decodeChatSessions({
      version: 4,
      sessions: [
        {
          id: 'custom',
          title: 'Custom',
          spacePath: '/spaces/one',
          messages: [],
          createdAt: 5,
          updatedAt: 5
        }
      ]
    })

    expect(decoded?.map((session) => session.id)).toEqual([
      'custom',
      'test-conversation',
      'test-conversation-2'
    ])
    expect(encodeChatSessions(decoded ?? [])).toMatchObject({ version: 4 })
  })

  it('rejects an invalid resource bucket instead of persisting it', () => {
    expect(
      decodeSpaceResourceStore({
        version: 1,
        resourcesBySpace: {
          '/spaces/invalid': [{ id: 1 }]
        }
      })
    ).toEqual({ resourcesBySpace: {} })
    expect(
      encodeSpaceResourceStore({ resourcesBySpace: {} })
    ).toEqual({ version: 1, resourcesBySpace: {} })
  })
})
