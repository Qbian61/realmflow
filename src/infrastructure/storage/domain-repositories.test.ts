import {
  CHAT_SESSION_STORAGE_KEY,
  createChatSessionRepository
} from './chat-session-repository'
import {
  SPACE_RESOURCE_STORAGE_KEY,
  createSpaceResourceRepository
} from './space-resource-repository'
import {
  WORKSPACE_NAVIGATION_STORAGE_KEY,
  createWorkspaceNavigationRepository
} from './workspace-navigation-repository'
import type { StorageAdapter } from './versioned-repository'

function createStorage(
  initial: Record<string, string> = {}
): StorageAdapter & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    }
  }
}

describe('domain repositories', () => {
  it('repairs invalid workspace navigation with the default model', () => {
    const storage = createStorage({
      [WORKSPACE_NAVIGATION_STORAGE_KEY]: JSON.stringify({
        version: 1,
        spaces: 'invalid'
      })
    })

    const navigation = createWorkspaceNavigationRepository(storage).load()

    expect(navigation.revision).toBe(0)
    expect(navigation.value.spaces[0]).toMatchObject({
      path: '/spaces/xxx',
      label: 'xxx 空间'
    })
    expect(
      navigation.value.requirementsBySpace['/spaces/xxx'][0].title
    ).toBe(
      '测试需求'
    )
  })

  it('migrates legacy chat sessions and guarantees default conversations', () => {
    const storage = createStorage({
      'realmflow:chat-sessions:v3': JSON.stringify({
        version: 3,
        sessions: [
          {
            id: 'custom',
            title: '自定义对话',
            spacePath: '/spaces/xxx',
            messages: [],
            createdAt: 5,
            updatedAt: 5
          }
        ]
      })
    })
    const repository = createChatSessionRepository(storage)

    const sessions = repository.load()
    repository.save(sessions.value, sessions.revision)

    expect(sessions.revision).toBe(0)
    expect(sessions.value.map((session) => session.id)).toEqual([
      'custom',
      'test-conversation',
      'test-conversation-2'
    ])
    expect(storage.values.has(CHAT_SESSION_STORAGE_KEY)).toBe(true)
    expect(storage.values.has('realmflow:chat-sessions:v3')).toBe(false)
  })

  it('drops invalid resource buckets without losing valid spaces', () => {
    const storage = createStorage({
      [SPACE_RESOURCE_STORAGE_KEY]: JSON.stringify({
        version: 1,
        resourcesBySpace: {
          '/spaces/valid': [
            {
              id: 'doc-1',
              name: '技术方案',
              type: 'document',
              locator: 'https://example.com/design',
              detail: '在线文档',
              updatedAt: 1
            }
          ],
          '/spaces/invalid': [{ id: 1 }]
        }
      })
    })

    const store = createSpaceResourceRepository(storage).load()

    expect(store.revision).toBe(0)
    expect(Object.keys(store.value.resourcesBySpace)).toEqual(['/spaces/valid'])
    expect(store.value.resourcesBySpace['/spaces/valid'][0].name).toBe(
      '技术方案'
    )
  })
})
