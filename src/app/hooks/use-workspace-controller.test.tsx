import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type {
  ChatSessionRepository,
  RepositorySnapshot,
  WorkspaceNavigationRepository
} from '../../application/ports/repositories'
import type { ChatSession } from '../../domain/chat-session'
import type { WorkspaceNavigation } from '../../domain/workspace'
import { useWorkspaceController } from './use-workspace-controller'
import type {
  BusinessApi,
  CreateConversationCommand,
  ConversationDto,
  ConversationEventDto,
  RequirementDto,
  SpaceDto
} from '../../../shared/business'

const initialNavigation: WorkspaceNavigation = {
  spaces: [
    {
      path: '/spaces/initial',
      label: '初始空间',
      description: '初始数据'
    }
  ],
  requirementsBySpace: {
    '/spaces/initial': []
  }
}

const remoteNavigation: WorkspaceNavigation = {
  spaces: [
    {
      path: '/spaces/remote',
      label: '远端空间',
      description: '其他窗口的数据'
    }
  ],
  requirementsBySpace: {
    '/spaces/remote': []
  }
}

function createSessionRepository(): ChatSessionRepository {
  const snapshot: RepositorySnapshot<ChatSession[]> = {
    value: [],
    revision: 0
  }
  return {
    hydrate: async () => snapshot,
    getSnapshot: () => snapshot,
    save: async (value, expectedRevision) => ({
      status: 'saved',
      snapshot: {
        value,
        revision: expectedRevision + 1
      }
    })
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

const sessionRepository = createSessionRepository()

function ControllerHarness({
  navigationRepository
}: {
  navigationRepository: WorkspaceNavigationRepository
}): JSX.Element {
  const controller = useWorkspaceController({
    navigationRepository,
    sessionRepository
  })
  return (
    <>
      <div>{controller.spaces.map((space) => space.label).join(',')}</div>
      <button onClick={() => controller.createSpace('本地空间')}>新增</button>
      {controller.persistenceIssues.length > 0 ? (
        <div role="status">{controller.persistenceIssues.join(',')}</div>
      ) : null}
    </>
  )
}

describe('useWorkspaceController persistence', () => {
  it('refreshes Main-owned queries after a create command', async () => {
    let spaces: SpaceDto[] = []
    const business = {
      listSpaces: vi.fn(async () => spaces),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createSpace: vi.fn(async ({ id, name }) => {
        const created: SpaceDto = {
          id,
          path: `/work/${name}`,
          label: name,
          description: '',
          sortOrder: 0,
          revision: 1,
          createdAt: 1,
          updatedAt: 1
        }
        spaces = [created]
        return created
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <>
          <div>{controller.spaces.map((space) => space.label).join(',')}</div>
          <button onClick={() => controller.createSpace('Main 空间')}>
            新增
          </button>
        </>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(business.listSpaces).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    expect(await screen.findByText('Main 空间')).toBeInTheDocument()
    expect(business.createSpace).toHaveBeenCalledOnce()
    expect(business.listSpaces).toHaveBeenCalledTimes(2)
  })

  it('shows a work-root notice without opening a folder picker', async () => {
    const onOperationNotice = vi.fn()
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createSpace: vi.fn().mockRejectedValue(
        new Error('Select a work root before creating a space')
      ),
      chooseWorkRoot: vi.fn()
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business,
        onOperationNotice
      })
      return (
        <>
          <button onClick={() => controller.createSpace('Main 空间')}>
            新增
          </button>
          {controller.persistenceIssues.length > 0 ? (
            <div role="status">保存失败</div>
          ) : null}
        </>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(business.listSpaces).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    await waitFor(() =>
      expect(onOperationNotice).toHaveBeenCalledWith('work-root-required')
    )
    expect(business.chooseWorkRoot).not.toHaveBeenCalled()
    expect(business.createSpace).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reports ordinary space creation failures as transient operation notices', async () => {
    const onOperationNotice = vi.fn()
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createSpace: vi.fn().mockRejectedValue(new Error('database unavailable')),
      chooseWorkRoot: vi.fn()
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business,
        onOperationNotice
      })
      return (
        <>
          <button onClick={() => controller.createSpace('Main 空间')}>
            新增
          </button>
          {controller.persistenceIssues.length > 0 ? (
            <div role="status">保存失败</div>
          ) : null}
        </>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(business.listSpaces).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    await waitFor(() =>
      expect(onOperationNotice).toHaveBeenCalledWith('space-create-failed')
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(business.chooseWorkRoot).not.toHaveBeenCalled()
    expect(business.createSpace).toHaveBeenCalledOnce()
  })

  it('relocates a space through Main and refreshes only after success', async () => {
    let spaces: SpaceDto[] = [
      {
        id: 'space-1',
        path: '/work/old-space',
        label: 'Product Space',
        description: '',
        sortOrder: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const business = {
      listSpaces: vi.fn(async () => spaces),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      chooseSpaceRelocation: vi.fn(async () => {
        spaces = [{ ...spaces[0], path: '/work/moved-space', revision: 2 }]
        return spaces[0]
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      const space = controller.spaces[0]
      return (
        <>
          <div>{space?.physicalPath}</div>
          <button
            onClick={() => controller.relocateSpace(space?.path ?? '')}
          >
            重新定位
          </button>
        </>
      )
    }

    render(<BusinessHarness />)
    expect(await screen.findByText('/work/old-space')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新定位' }))

    expect(await screen.findByText('/work/moved-space')).toBeInTheDocument()
    expect(business.chooseSpaceRelocation).toHaveBeenCalledWith({
      id: 'space-1',
      expectedRevision: 1
    })
    expect(business.listSpaces).toHaveBeenCalledTimes(2)
  })

  it('does not refresh navigation when space relocation is cancelled', async () => {
    const spaces: SpaceDto[] = [
      {
        id: 'space-1',
        path: '/work/old-space',
        label: 'Product Space',
        description: '',
        sortOrder: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const business = {
      listSpaces: vi.fn(async () => spaces),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      chooseSpaceRelocation: vi.fn(async () => null)
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      const space = controller.spaces[0]
      return (
        <>
          <div>{space?.physicalPath}</div>
          <button onClick={() => controller.relocateSpace(space?.path ?? '')}>
            重新定位
          </button>
        </>
      )
    }

    render(<BusinessHarness />)
    expect(await screen.findByText('/work/old-space')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新定位' }))

    await waitFor(() =>
      expect(business.chooseSpaceRelocation).toHaveBeenCalledOnce()
    )
    expect(business.listSpaces).toHaveBeenCalledOnce()
    expect(screen.getByText('/work/old-space')).toBeInTheDocument()
  })

  it('keeps the current path and reports a transient notice when relocation fails', async () => {
    const onOperationNotice = vi.fn()
    const spaces: SpaceDto[] = [
      {
        id: 'space-1',
        path: '/work/old-space',
        label: 'Product Space',
        description: '',
        sortOrder: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const business = {
      listSpaces: vi.fn(async () => spaces),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      chooseSpaceRelocation: vi.fn(async () => {
        throw new Error('database unavailable')
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business,
        onOperationNotice
      })
      const space = controller.spaces[0]
      return (
        <>
          <div>{space?.physicalPath}</div>
          <button onClick={() => controller.relocateSpace(space?.path ?? '')}>
            重新定位
          </button>
          {controller.persistenceIssues.length > 0 ? (
            <div role="status">{controller.persistenceIssues.join(',')}</div>
          ) : null}
        </>
      )
    }

    render(<BusinessHarness />)
    expect(await screen.findByText('/work/old-space')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新定位' }))

    await waitFor(() =>
      expect(onOperationNotice).toHaveBeenCalledWith('space-relocate-failed')
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('/work/old-space')).toBeInTheDocument()
    expect(business.listSpaces).toHaveBeenCalledOnce()
  })

  it('renames a requirement through Main with its current revision and refreshes', async () => {
    const spaces: SpaceDto[] = [
      {
        id: 'space-1',
        path: '/work/Product-Space--space-1',
        label: 'Product Space',
        description: '',
        sortOrder: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ]
    let requirements: RequirementDto[] = [
      {
        id: 'requirement-1',
        workspaceId: 'space-1',
        title: 'Login Flow',
        status: 'pending',
        sortOrder: 0,
        revision: 3,
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const business = {
      listSpaces: vi.fn(async () => spaces),
      listRequirements: vi.fn(async () => requirements),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      updateRequirement: vi.fn(async (command) => {
        requirements = [
          {
            ...requirements[0],
            title: command.title!,
            revision: 4,
            updatedAt: 2
          }
        ]
        return requirements[0]
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <>
          <div>
            {controller.requirementsBySpace['/spaces/space-1']
              ?.map((requirement) => requirement.title)
              .join(',')}
          </div>
          <button
            onClick={() =>
              controller.renameRequirement(
                '/spaces/space-1',
                'requirement-1',
                '  Renamed Login Flow  '
              )
            }
          >
            重命名需求
          </button>
        </>
      )
    }

    render(<BusinessHarness />)
    expect(await screen.findByText('Login Flow')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重命名需求' }))

    expect(await screen.findByText('Renamed Login Flow')).toBeInTheDocument()
    expect(business.updateRequirement).toHaveBeenCalledWith({
      id: 'requirement-1',
      expectedRevision: 3,
      title: 'Renamed Login Flow'
    })
    expect(business.listRequirements).toHaveBeenCalledTimes(2)
  })

  it('keeps the current requirement title when Main rejects a rename', async () => {
    const onOperationNotice = vi.fn()
    const spaces: SpaceDto[] = [
      {
        id: 'space-1',
        path: '/work/Product-Space--space-1',
        label: 'Product Space',
        description: '',
        sortOrder: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const requirements: RequirementDto[] = [
      {
        id: 'requirement-1',
        workspaceId: 'space-1',
        title: 'Login Flow',
        status: 'pending',
        sortOrder: 0,
        revision: 3,
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const business = {
      listSpaces: vi.fn(async () => spaces),
      listRequirements: vi.fn(async () => requirements),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      updateRequirement: vi.fn(async () => {
        throw new Error('database unavailable')
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business,
        onOperationNotice
      })
      return (
        <>
          <div>
            {controller.requirementsBySpace['/spaces/space-1']
              ?.map((requirement) => requirement.title)
              .join(',')}
          </div>
          <button
            onClick={() =>
              controller.renameRequirement(
                '/spaces/space-1',
                'requirement-1',
                'Renamed Login Flow'
              )
            }
          >
            重命名需求
          </button>
          {controller.persistenceIssues.length > 0 ? (
            <div role="status">{controller.persistenceIssues.join(',')}</div>
          ) : null}
        </>
      )
    }

    render(<BusinessHarness />)
    expect(await screen.findByText('Login Flow')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重命名需求' }))

    await waitFor(() =>
      expect(onOperationNotice).toHaveBeenCalledWith(
        'requirement-rename-failed'
      )
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('Login Flow')).toBeInTheDocument()
    expect(screen.queryByText('Renamed Login Flow')).not.toBeInTheDocument()
    expect(business.listRequirements).toHaveBeenCalledOnce()
  })

  it('applies the committed conversation returned by Main and refreshes the list', async () => {
    const created: ConversationDto = {
      id: 'conversation-created',
      kind: 'general',
      title: 'Committed chat',
      sortOrder: 10,
      messages: [
        {
          id: 'message-1',
          role: 'user',
          status: 'completed',
          content: 'Committed prompt',
          sortOrder: 0,
          createdAt: 10
        }
      ],
      revision: 1,
      createdAt: 10,
      updatedAt: 10
    }
    const createConversation = vi.fn(async () => created)
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createConversation
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <>
          <div>{controller.sessions.map((session) => session.title).join(',')}</div>
          <button
            onClick={() => void controller.createSession('', 'Committed prompt')}
          >
            新建会话
          </button>
        </>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(business.listRecentConversations).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))

    expect(await screen.findByText('Committed chat')).toBeInTheDocument()
    expect(createConversation).toHaveBeenCalledWith({
      id: expect.any(String),
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      reasoningMode: 'auto',
      applicationLocale: 'zh-CN',
      title: 'Committed prompt',
      prompt: 'Committed prompt'
    })
    expect(business.listRecentConversations).toHaveBeenCalledTimes(2)
    expect(business.listRecentConversations).toHaveBeenLastCalledWith({})
  })

  it('creates a folder conversation with an opaque binding and adopts its canonical path', async () => {
    const created: ConversationDto = {
      id: 'conversation-folder',
      kind: 'general',
      folderPath: '/private/tmp/canonical-task',
      title: 'Folder chat',
      sortOrder: 10,
      messages: [],
      revision: 1,
      createdAt: 10,
      updatedAt: 10
    }
    const createConversation = vi.fn(
      async (_command: CreateConversationCommand) => created
    )
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createConversation
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <>
          <div>{controller.sessions[0]?.folderPath}</div>
          <button
            onClick={() =>
              void controller.createSession(
                'folder:folder-binding-opaque',
                'Inspect folder'
              )
            }
          >
            新建文件夹会话
          </button>
        </>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(business.listRecentConversations).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '新建文件夹会话' }))

    expect(await screen.findByText('/private/tmp/canonical-task')).toBeInTheDocument()
    expect(createConversation).toHaveBeenCalledWith({
      id: expect.any(String),
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      folderBindingId: 'folder-binding-opaque',
      reasoningMode: 'auto',
      applicationLocale: 'zh-CN',
      title: 'Inspect folder',
      prompt: 'Inspect folder'
    })
    expect(createConversation.mock.calls[0][0]).not.toHaveProperty(
      'folderPath'
    )
  })

  it('maps the all-workspaces selection to a persisted global knowledge scope', async () => {
    const createConversation = vi.fn(async (command: CreateConversationCommand) => ({
      id: command.id,
      kind: 'general' as const,
      knowledgeScope: { kind: 'all_workspaces' as const },
      title: command.title,
      sortOrder: 10,
      messages: [],
      revision: 1,
      createdAt: 10,
      updatedAt: 10
    }))
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createConversation
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <button
          onClick={() =>
            void controller.createSession('all-workspaces', 'Compare rules')
          }
        >
          新建全空间会话
        </button>
      )
    }

    render(<BusinessHarness />)
    fireEvent.click(screen.getByRole('button', { name: '新建全空间会话' }))

    await waitFor(() =>
      expect(createConversation).toHaveBeenCalledWith({
        id: expect.any(String),
        kind: 'general',
        knowledgeScope: { kind: 'all_workspaces' },
        reasoningMode: 'auto',
        applicationLocale: 'zh-CN',
        title: 'Compare rules',
        prompt: 'Compare rules'
      })
    )
  })

  it('applies the committed append snapshot and refreshes the list', async () => {
    const conversation: ConversationDto = {
      id: 'conversation-1',
      kind: 'general',
      title: 'Existing chat',
      sortOrder: 1,
      messages: [],
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    }
    const updated: ConversationDto = {
      ...conversation,
      revision: 5,
      updatedAt: 5,
      messages: [
        {
          id: 'message-2',
          role: 'user',
          status: 'completed',
          content: 'Committed reply',
          sortOrder: 0,
          createdAt: 5
        }
      ]
    }
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [conversation],
        folderPaths: []
      })),
      appendConversationMessage: vi.fn(async () => updated)
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <>
          <div>
            {controller.sessions.flatMap((session) =>
              session.messages.map((message) => message.content)
            )}
          </div>
          <button
            onClick={() =>
              void controller.appendSessionMessage(
                'conversation-1',
                'Committed reply'
              )
            }
          >
            追加消息
          </button>
        </>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(business.listRecentConversations).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '追加消息' }))

    expect(await screen.findByText('Committed reply')).toBeInTheDocument()
    expect(business.listRecentConversations).toHaveBeenCalledTimes(2)
    expect(business.listRecentConversations).toHaveBeenLastCalledWith({})
  })

  it('projects streamed conversation snapshots before the append command settles', async () => {
    const conversation: ConversationDto = {
      id: 'conversation-stream',
      kind: 'general',
      title: 'Streaming chat',
      sortOrder: 1,
      messages: [],
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    }
    const completion = deferred<ConversationDto>()
    let streamListener: ((event: ConversationEventDto) => void) | undefined
    const unsubscribe = vi.fn()
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [conversation],
        folderPaths: []
      })),
      appendConversationMessage: vi.fn(() => completion.promise),
      onConversationEvent: vi.fn((listener) => {
        streamListener = listener
        return unsubscribe
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      const messages = controller.sessions[0]?.messages ?? []
      return (
        <>
          <div>{messages.map((message) => message.content).join('|')}</div>
          <button
            onClick={() =>
              void controller.appendSessionMessage(
                'conversation-stream',
                'Question'
              )
            }
          >
            追加消息
          </button>
        </>
      )
    }

    const view = render(<BusinessHarness />)
    await waitFor(() => expect(streamListener).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button', { name: '追加消息' }))

    act(() => {
      streamListener?.({
        conversation: {
          ...conversation,
          revision: 3,
          messages: [
            {
              id: 'user-1',
              role: 'user',
              status: 'completed',
              content: 'Question',
              sortOrder: 0,
              createdAt: 2
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              status: 'pending',
              content: 'First chunk',
              runId: 'run-1',
              sortOrder: 1,
              createdAt: 2
            }
          ]
        }
      })
    })

    expect(screen.getByText('Question|First chunk')).toBeInTheDocument()
    expect(business.appendConversationMessage).toHaveBeenCalledOnce()

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('releases a new conversation for navigation after its first committed snapshot', async () => {
    const completion = deferred<ConversationDto>()
    let streamListener: ((event: ConversationEventDto) => void) | undefined
    const createConversation = vi.fn(
      (_command: CreateConversationCommand) => completion.promise
    )
    const navigable = vi.fn()
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createConversation,
      onConversationEvent: vi.fn((listener) => {
        streamListener = listener
        return vi.fn()
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <button
          onClick={() =>
            void controller
              .createSession('', 'Stream from the first token')
              .then(navigable)
          }
        >
          新建会话
        </button>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(streamListener).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    const command = createConversation.mock.calls[0]?.[0]
    expect(command).toBeDefined()
    if (!command) throw new Error('Expected a create conversation command')

    act(() => {
      streamListener?.({
        conversation: {
          id: command.id,
          kind: 'general',
          title: command.title,
          sortOrder: 2,
          messages: [
            {
              id: `${command.id}:message:1`,
              role: 'user',
              status: 'completed',
              content: command.prompt,
              sortOrder: 0,
              createdAt: 2
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              status: 'pending',
              content: '',
              sortOrder: 1,
              createdAt: 2
            }
          ],
          revision: 1,
          createdAt: 2,
          updatedAt: 2
        }
      })
    })

    await waitFor(() => expect(navigable).toHaveBeenCalledWith(command.id))
    expect(createConversation).toHaveBeenCalledOnce()
  })

  it('does not expose a conversation when Main rejects its creation', async () => {
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [],
        folderPaths: []
      })),
      createConversation: vi.fn(async () => {
        throw new Error('database unavailable')
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      return (
        <>
          <div>{controller.sessions.map((session) => session.title).join(',')}</div>
          <button
            onClick={() => {
              void controller.createSession('', 'Unsaved chat').catch(() => undefined)
            }}
          >
            新建会话
          </button>
          {controller.persistenceIssues.length > 0 ? (
            <div role="status">{controller.persistenceIssues.join(',')}</div>
          ) : null}
        </>
      )
    }

    render(<BusinessHarness />)
    await waitFor(() => expect(business.listRecentConversations).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))

    await waitFor(() => expect(business.createConversation).toHaveBeenCalledOnce())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved chat')).not.toBeInTheDocument()
  })

  it('does not expose a message when Main rejects its append command', async () => {
    const conversation: ConversationDto = {
      id: 'conversation-1',
      kind: 'general',
      title: 'Existing chat',
      sortOrder: 1,
      messages: [],
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    }
    const business = {
      listSpaces: vi.fn(async () => []),
      listRequirements: vi.fn(async () => []),
      listRecentConversations: vi.fn(async () => ({
        conversations: [conversation],
        folderPaths: []
      })),
      appendConversationMessage: vi.fn(async () => {
        throw new Error('database unavailable')
      })
    } as unknown as BusinessApi

    function BusinessHarness(): JSX.Element {
      const controller = useWorkspaceController({
        navigationRepository: createNavigationRepository(initialNavigation),
        sessionRepository,
        business
      })
      const session = controller.sessions[0]
      return (
        <>
          <div>{session?.title}</div>
          <div>{session?.messages.map((message) => message.content).join(',')}</div>
          <button
            onClick={() =>
              void controller
                .appendSessionMessage('conversation-1', 'Unsaved reply')
                .catch(() => undefined)
            }
          >
            追加消息
          </button>
          {controller.persistenceIssues.length > 0 ? (
            <div role="status">{controller.persistenceIssues.join(',')}</div>
          ) : null}
        </>
      )
    }

    render(<BusinessHarness />)
    expect(await screen.findByText('Existing chat')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '追加消息' }))

    await waitFor(() =>
      expect(business.appendConversationMessage).toHaveBeenCalledOnce()
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved reply')).not.toBeInTheDocument()
  })

  it('applies an external snapshot without writing it back', async () => {
    let listener: (() => void) | undefined
    let snapshot: RepositorySnapshot<WorkspaceNavigation> = {
      value: initialNavigation,
      revision: 1
    }
    const save = vi.fn(async (value: WorkspaceNavigation, expectedRevision: number) => ({
      status: 'saved' as const,
      snapshot: {
        value,
        revision: expectedRevision + 1
      }
    }))
    const repository: WorkspaceNavigationRepository = {
      hydrate: async () => snapshot,
      getSnapshot: () => snapshot,
      save,
      subscribe: (nextListener) => {
        listener = nextListener
        return () => {
          listener = undefined
        }
      }
    }

    render(<ControllerHarness navigationRepository={repository} />)
    expect(save).not.toHaveBeenCalled()

    snapshot = {
      value: remoteNavigation,
      revision: 3
    }
    act(() => listener?.())

    expect(await screen.findByText('远端空间')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('uses the latest snapshot after a save conflict without retrying stale state', async () => {
    const save = vi.fn(async () => ({
      status: 'conflict' as const,
      snapshot: {
        value: remoteNavigation,
        revision: 2
      }
    }))
    const repository: WorkspaceNavigationRepository = {
      hydrate: async () => ({
        value: initialNavigation,
        revision: 1
      }),
      getSnapshot: () => ({
        value: initialNavigation,
        revision: 1
      }),
      save
    }

    render(<ControllerHarness navigationRepository={repository} />)
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    expect(await screen.findByText('远端空间')).toBeInTheDocument()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  })

  it('exposes unavailable repositories without blocking in-memory state', async () => {
    const repository: WorkspaceNavigationRepository = {
      hydrate: async () => ({
        value: initialNavigation,
        revision: 1
      }),
      getSnapshot: () => ({
        value: initialNavigation,
        revision: 1
      }),
      save: async (value, expectedRevision) => ({
        status: 'unavailable',
        snapshot: {
          value,
          revision: expectedRevision
        }
      })
    }

    render(<ControllerHarness navigationRepository={repository} />)
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    expect(await screen.findByRole('status')).toHaveTextContent('navigation')
    expect(screen.getByText(/初始空间/)).toBeInTheDocument()
  })
})

function createNavigationRepository(
  value: WorkspaceNavigation
): WorkspaceNavigationRepository {
  const snapshot = { value, revision: 0 }
  return {
    hydrate: async () => snapshot,
    getSnapshot: () => snapshot,
    save: async (nextValue, expectedRevision) => ({
      status: 'saved',
      snapshot: { value: nextValue, revision: expectedRevision + 1 }
    })
  }
}
