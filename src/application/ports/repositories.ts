import type { ChatSession } from '../../domain/chat-session'
import type { SpaceResourceStore } from '../../domain/space-resource'
import type { WorkspaceNavigation } from '../../domain/workspace'

export type RepositorySnapshot<T> = {
  value: T
  revision: number
}

export type RepositorySaveResult<T> =
  | {
      status: 'saved'
      snapshot: RepositorySnapshot<T>
    }
  | {
      status: 'conflict'
      snapshot: RepositorySnapshot<T>
    }
  | {
      status: 'unavailable'
      snapshot: RepositorySnapshot<T>
    }

export interface Repository<T> {
  hydrate: () => Promise<RepositorySnapshot<T>>
  getSnapshot: () => RepositorySnapshot<T>
  save: (
    value: T,
    expectedRevision: number
  ) => Promise<RepositorySaveResult<T>>
  subscribe?: (listener: () => void) => () => void
}

export type WorkspaceNavigationRepository = Repository<WorkspaceNavigation>
export type ChatSessionRepository = Repository<ChatSession[]>
export type SpaceResourceRepository = Repository<SpaceResourceStore>

export type RendererRepositories = {
  workspaceNavigation: WorkspaceNavigationRepository
  chatSessions: ChatSessionRepository
  spaceResources: SpaceResourceRepository
}
