import { act, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type {
  ChatSessionRepository,
  RepositorySnapshot,
  WorkspaceNavigationRepository
} from '../../application/ports/repositories'
import type { ChatSession } from '../../domain/chat-session'
import type { WorkspaceNavigation } from '../../domain/workspace'
import { useWorkspaceController } from './use-workspace-controller'

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
    load: () => snapshot,
    save: async (value, expectedRevision) => ({
      status: 'saved',
      snapshot: {
        value,
        revision: expectedRevision + 1
      }
    })
  }
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
      {controller.persistenceIssues.length > 0 ? (
        <div role="status">{controller.persistenceIssues.join(',')}</div>
      ) : null}
    </>
  )
}

describe('useWorkspaceController persistence', () => {
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
      load: () => snapshot,
      save,
      subscribe: (nextListener) => {
        listener = nextListener
        return () => {
          listener = undefined
        }
      }
    }

    render(<ControllerHarness navigationRepository={repository} />)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    snapshot = {
      value: remoteNavigation,
      revision: 3
    }
    act(() => listener?.())

    expect(await screen.findByText('远端空间')).toBeInTheDocument()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
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
      load: () => ({
        value: initialNavigation,
        revision: 1
      }),
      save
    }

    render(<ControllerHarness navigationRepository={repository} />)

    expect(await screen.findByText('远端空间')).toBeInTheDocument()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  })

  it('exposes unavailable repositories without blocking in-memory state', async () => {
    const repository: WorkspaceNavigationRepository = {
      load: () => ({
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

    expect(await screen.findByRole('status')).toHaveTextContent('navigation')
    expect(screen.getByText('初始空间')).toBeInTheDocument()
  })
})
