import {
  DEFAULT_RECENT_CONVERSATION_FILTERS,
  readRecentConversationFilters,
  toRecentConversationQuery,
  updateRecentConversationFilters,
  writeRecentConversationFilters
} from './recent-conversation-filters'

describe('recent conversation filters', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('uses defaults when preferences are missing or corrupt', () => {
    expect(readRecentConversationFilters()).toEqual(
      DEFAULT_RECENT_CONVERSATION_FILTERS
    )

    window.localStorage.setItem(
      'realmflow:recent-conversation-filters',
      '{"version":2,"kind":"space"}'
    )
    expect(readRecentConversationFilters()).toEqual(
      DEFAULT_RECENT_CONVERSATION_FILTERS
    )

    window.localStorage.setItem(
      'realmflow:recent-conversation-filters',
      '{"version":1,"kind":"invalid"}'
    )
    expect(readRecentConversationFilters()).toEqual(
      DEFAULT_RECENT_CONVERSATION_FILTERS
    )
  })

  it('round trips a valid versioned preference', () => {
    const filters = {
      kind: 'general',
      workspaceId: '',
      folderPath: '/work/realmflow',
      timeRange: 'week'
    } as const

    writeRecentConversationFilters(filters)

    expect(readRecentConversationFilters()).toEqual(filters)
    expect(
      JSON.parse(
        window.localStorage.getItem(
          'realmflow:recent-conversation-filters'
        ) ?? ''
      )
    ).toEqual({ version: 1, ...filters })
  })

  it('normalizes a selected workspace to space conversations', () => {
    expect(
      updateRecentConversationFilters(
        {
          kind: 'general',
          workspaceId: '',
          folderPath: '/work/old',
          timeRange: 'all'
        },
        { workspaceId: 'space-1' }
      )
    ).toEqual({
      kind: 'space',
      workspaceId: 'space-1',
      folderPath: '',
      timeRange: 'all'
    })
  })

  it('normalizes a selected folder to general conversations', () => {
    expect(
      updateRecentConversationFilters(
        {
          kind: 'space',
          workspaceId: 'space-1',
          folderPath: '',
          timeRange: 'month'
        },
        { folderPath: '/work/tasks' }
      )
    ).toEqual({
      kind: 'general',
      workspaceId: '',
      folderPath: '/work/tasks',
      timeRange: 'month'
    })
  })

  it('clears incompatible context when the type changes', () => {
    const workspaceFilters = {
      kind: 'space',
      workspaceId: 'space-1',
      folderPath: '',
      timeRange: 'all'
    } as const
    const folderFilters = {
      kind: 'general',
      workspaceId: '',
      folderPath: '/work/tasks',
      timeRange: 'all'
    } as const

    expect(
      updateRecentConversationFilters(workspaceFilters, { kind: 'general' })
    ).toEqual({ ...workspaceFilters, kind: 'general', workspaceId: '' })
    expect(
      updateRecentConversationFilters(folderFilters, { kind: 'space' })
    ).toEqual({ ...folderFilters, kind: 'space', folderPath: '' })
  })

  it('maps filters to an inclusive recent query', () => {
    expect(
      toRecentConversationQuery(
        {
          kind: 'general',
          workspaceId: '',
          folderPath: '/work/tasks',
          timeRange: 'week'
        },
        Date.UTC(2026, 8, 20)
      )
    ).toEqual({
      kind: 'general',
      folderPath: '/work/tasks',
      updatedAfter: Date.UTC(2026, 8, 13)
    })
  })
})
