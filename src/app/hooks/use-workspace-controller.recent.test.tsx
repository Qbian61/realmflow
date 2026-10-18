import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type {
  BusinessApi,
  ConversationDto,
  RecentConversationDto,
  RecentConversationListDto
} from '../../../shared/business'
import type {
  ChatSessionRepository,
  WorkspaceNavigationRepository
} from '../../application/ports/repositories'
import type { RecentConversationFilters } from '../../features/sessions/recent-conversation-filters'
import { useWorkspaceController } from './use-workspace-controller'

type RecentControllerView = {
  recentSessions: RecentConversationDto[]
  recentFolderPaths: string[]
  recentFilters: RecentConversationFilters
  recentTotalCount: number
  recentSessionsHasMore: boolean
  loadMoreRecentSessions: () => Promise<void>
  updateRecentFilters: (patch: Partial<RecentConversationFilters>) => void
}

describe('useWorkspaceController recent conversations', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('restores the saved filters for the initial Main query', async () => {
    window.localStorage.setItem(
      'realmflow:recent-conversation-filters',
      JSON.stringify({
        version: 1,
        kind: 'general',
        workspaceId: '',
        folderPath: '/work/tasks',
        timeRange: 'week'
      })
    )
    const business = createBusiness()

    render(<RecentHarness business={business} />)

    await waitFor(() =>
      expect(business.listRecentConversations).toHaveBeenCalledWith({
        kind: 'general',
        folderPath: '/work/tasks',
        updatedAfter: expect.any(Number),
        limit: 50
      })
    )
  })

  it('appends one cursor page at a time and preserves the total count', async () => {
    const nextPage = deferred<RecentConversationListDto>()
    const business = createBusiness()
    business.listRecentConversations = vi
      .fn()
      .mockResolvedValueOnce(
        recentResult(
          [conversation('recent-1', 'Recent 1')],
          [],
          { totalCount: 2, nextCursor: 'cursor-1' }
        )
      )
      .mockImplementationOnce(() => nextPage.promise)

    render(<RecentHarness business={business} />)
    expect(await screen.findByTestId('recent')).toHaveTextContent('Recent 1')
    expect(screen.getByTestId('recent-total')).toHaveTextContent('2|more')

    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))

    await waitFor(() =>
      expect(business.listRecentConversations).toHaveBeenCalledTimes(2)
    )
    expect(business.listRecentConversations).toHaveBeenLastCalledWith({
      cursor: 'cursor-1',
      limit: 50
    })

    nextPage.resolve(
      recentResult([conversation('recent-2', 'Recent 2')], [], {
        totalCount: 2
      })
    )
    expect(await screen.findByTestId('recent')).toHaveTextContent(
      'Recent 1,Recent 2'
    )
    expect(screen.getByTestId('recent-total')).toHaveTextContent('2|done')
  })

  it('keeps only the latest result when filter requests finish out of order', async () => {
    const workspaceResult = deferred<RecentConversationListDto>()
    const folderResult = deferred<RecentConversationListDto>()
    const business = createBusiness()
    business.listRecentConversations = vi
      .fn()
      .mockResolvedValueOnce(recentResult([conversation('initial', 'Initial')]))
      .mockImplementationOnce(() => workspaceResult.promise)
      .mockImplementationOnce(() => folderResult.promise)

    render(<RecentHarness business={business} />)
    expect(await screen.findByTestId('recent')).toHaveTextContent('Initial')

    fireEvent.click(screen.getByRole('button', { name: '筛选空间' }))
    fireEvent.click(screen.getByRole('button', { name: '筛选文件夹' }))
    await waitFor(() =>
      expect(business.listRecentConversations).toHaveBeenCalledTimes(3)
    )

    folderResult.resolve(recentResult([conversation('folder', 'Folder result')]))
    expect(await screen.findByTestId('recent')).toHaveTextContent('Folder result')

    workspaceResult.resolve(
      recentResult([conversation('workspace', 'Stale workspace result')])
    )
    await waitFor(() =>
      expect(screen.getByTestId('recent')).not.toHaveTextContent(
        'Stale workspace result'
      )
    )
  })

  it('retains the previous result and reports a failed filtered query', async () => {
    const business = createBusiness()
    business.listRecentConversations = vi
      .fn()
      .mockResolvedValueOnce(recentResult([conversation('initial', 'Initial')]))
      .mockRejectedValueOnce(new Error('database unavailable'))

    render(<RecentHarness business={business} />)
    expect(await screen.findByTestId('recent')).toHaveTextContent('Initial')

    fireEvent.click(screen.getByRole('button', { name: '筛选空间' }))

    expect(await screen.findByRole('status')).toHaveTextContent('sessions')
    expect(screen.getByTestId('recent')).toHaveTextContent('Initial')
  })

  it('does not remove cached conversation details when a filter excludes them', async () => {
    const initial = conversation('initial', 'Initial')
    const business = createBusiness()
    business.getConversation = vi.fn(async () => fullConversation(initial))
    business.listRecentConversations = vi
      .fn()
      .mockResolvedValueOnce(recentResult([initial]))
      .mockResolvedValueOnce(recentResult([]))

    render(<RecentHarness business={business} activeSessionId={initial.id} />)
    expect(await screen.findByTestId('details')).toHaveTextContent('Initial')

    fireEvent.click(screen.getByRole('button', { name: '筛选空间' }))

    await waitFor(() => expect(screen.getByTestId('recent')).toBeEmptyDOMElement())
    expect(screen.getByTestId('details')).toHaveTextContent('Initial')
  })

  it('refreshes the recent query with current filters after a committed create', async () => {
    window.localStorage.setItem(
      'realmflow:recent-conversation-filters',
      JSON.stringify({
        version: 1,
        kind: 'general',
        workspaceId: '',
        folderPath: '',
        timeRange: 'all'
      })
    )
    const created = conversation('created', 'Committed chat')
    const business = createBusiness()
    business.createConversation = vi.fn(async () => fullConversation(created))
    business.listRecentConversations = vi
      .fn()
      .mockResolvedValueOnce(recentResult([]))
      .mockResolvedValueOnce(recentResult([created]))

    render(<RecentHarness business={business} />)
    await waitFor(() =>
      expect(business.listRecentConversations).toHaveBeenCalledTimes(1)
    )
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))

    expect(await screen.findByTestId('recent')).toHaveTextContent(
      'Committed chat'
    )
    expect(business.listRecentConversations).toHaveBeenLastCalledWith({
      kind: 'general',
      limit: 50
    })
  })

  it('uses the Main snapshot and refreshes after renaming a conversation', async () => {
    const original = conversation('conversation-1', 'Original')
    const renamed = { ...original, title: 'Renamed', revision: 2, updatedAt: 2 }
    const business = createBusiness()
    business.renameConversation = vi.fn(async () => fullConversation(renamed))
    business.listRecentConversations = vi
      .fn()
      .mockResolvedValueOnce(recentResult([original]))
      .mockResolvedValueOnce(recentResult([renamed]))

    render(<RecentHarness business={business} />)
    expect(await screen.findByTestId('recent')).toHaveTextContent('Original')
    fireEvent.click(screen.getByRole('button', { name: '重命名会话' }))

    expect(await screen.findByTestId('recent')).toHaveTextContent('Renamed')
    expect(business.renameConversation).toHaveBeenCalledWith({
      id: original.id,
      expectedRevision: 1,
      title: 'Renamed'
    })
  })

  it('keeps the conversation and reports a failed delete', async () => {
    const original = conversation('conversation-1', 'Original')
    const business = createBusiness()
    business.deleteConversation = vi
      .fn()
      .mockRejectedValue(new Error('database unavailable'))
    business.listRecentConversations = vi.fn(async () =>
      recentResult([original])
    )
    const onOperationNotice = vi.fn()

    render(
      <RecentHarness
        business={business}
        onOperationNotice={onOperationNotice}
      />
    )
    expect(await screen.findByTestId('recent')).toHaveTextContent('Original')
    fireEvent.click(screen.getByRole('button', { name: '删除会话' }))

    await waitFor(() =>
      expect(onOperationNotice).toHaveBeenCalledWith(
        'conversation-delete-failed'
      )
    )
    expect(screen.getByTestId('recent')).toHaveTextContent('Original')
  })
})

function RecentHarness({
  business,
  activeSessionId,
  onOperationNotice
}: {
  business: BusinessApi
  activeSessionId?: string
  onOperationNotice?: Parameters<
    typeof useWorkspaceController
  >[0]['onOperationNotice']
}): JSX.Element {
  const controller = useWorkspaceController({
    navigationRepository,
    sessionRepository,
    business,
    activeSessionId,
    onOperationNotice
  })
  const recent = controller as typeof controller & RecentControllerView
  return (
    <>
      <div data-testid="recent">
        {recent.recentSessions?.map((session) => session.title).join(',')}
      </div>
      <div data-testid="details">
        {controller.sessions.map((session) => session.title).join(',')}
      </div>
      <div data-testid="recent-total">
        {recent.recentTotalCount}|
        {recent.recentSessionsHasMore ? 'more' : 'done'}
      </div>
      <button
        type="button"
        onClick={() =>
          recent.updateRecentFilters?.({
            workspaceId: 'space-1'
          })
        }
      >
        筛选空间
      </button>
      <button
        type="button"
        onClick={() =>
          recent.updateRecentFilters?.({
            folderPath: '/work/tasks'
          })
        }
      >
        筛选文件夹
      </button>
      <button
        type="button"
        onClick={() => void controller.createSession('', 'Committed chat')}
      >
        新建会话
      </button>
      <button
        type="button"
        onClick={() =>
          void controller.renameConversation('conversation-1', 'Renamed')
        }
      >
        重命名会话
      </button>
      <button
        type="button"
        onClick={() => void controller.deleteConversation('conversation-1')}
      >
        删除会话
      </button>
      <button
        type="button"
        onClick={() => void recent.loadMoreRecentSessions?.()}
      >
        加载更多
      </button>
      {controller.persistenceIssues.length > 0 ? (
        <div role="status">{controller.persistenceIssues.join(',')}</div>
      ) : null}
    </>
  )
}

function createBusiness(): BusinessApi {
  return {
    listSpaces: vi.fn(async () => []),
    listRequirements: vi.fn(async () => []),
    listRecentConversations: vi.fn(async () => recentResult([]))
  } as unknown as BusinessApi
}

function recentResult(
  conversations: RecentConversationDto[],
  folderPaths: string[] = [],
  page: { totalCount?: number; nextCursor?: string } = {}
): RecentConversationListDto {
  return {
    conversations,
    folderPaths,
    totalCount: page.totalCount ?? conversations.length,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {})
  }
}

function conversation(id: string, title: string): RecentConversationDto {
  return {
    id,
    approvalProfileId: 'protected',
    kind: 'general',
    title,
    sortOrder: 0,
    revision: 1,
    turnCount: 0,
    createdAt: 1,
    updatedAt: 1
  }
}

function fullConversation(
  conversation: RecentConversationDto
): ConversationDto {
  return {
    id: conversation.id,
    approvalProfileId: conversation.approvalProfileId,
    kind: conversation.kind,
    ...(conversation.workspaceId
      ? { workspaceId: conversation.workspaceId }
      : {}),
    ...(conversation.folderPath
      ? { folderPath: conversation.folderPath }
      : {}),
    title: conversation.title,
    sortOrder: conversation.sortOrder,
    turns: [],
    messages: [],
    revision: conversation.revision,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

const navigationRepository: WorkspaceNavigationRepository = {
  hydrate: async () => ({
    value: { spaces: [], requirementsBySpace: {} },
    revision: 0
  }),
  getSnapshot: () => ({
    value: { spaces: [], requirementsBySpace: {} },
    revision: 0
  }),
  save: async (value, expectedRevision) => ({
    status: 'saved',
    snapshot: { value, revision: expectedRevision + 1 }
  })
}

const sessionRepository: ChatSessionRepository = {
  hydrate: async () => ({ value: [], revision: 0 }),
  getSnapshot: () => ({ value: [], revision: 0 }),
  save: async (value, expectedRevision) => ({
    status: 'saved',
    snapshot: { value, revision: expectedRevision + 1 }
  })
}
