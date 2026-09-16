import type { PersistenceApi } from '../../../shared/persistence'
import type {
  RendererRepositories,
  Repository
} from '../../application/ports/repositories'
import { createDefaultChatSessions } from '../../domain/chat-session'
import { createEmptySpaceResourceStore } from '../../domain/space-resource'
import { createDefaultWorkspaceNavigation } from '../../domain/workspace'
import {
  createChatSessionRepository,
  decodeChatSessions,
  encodeChatSessions
} from './chat-session-repository'
import { createMainProcessRepository } from './main-process-repository'
import {
  createPersistenceCoordinator,
  type StorageEventSource
} from './persistence-coordinator'
import type { PersistenceDataset } from './persistence-registry'
import {
  createSpaceResourceRepository,
  decodeSpaceResourceStore,
  encodeSpaceResourceStore
} from './space-resource-repository'
import type { StorageAdapter } from './versioned-repository'
import {
  createWorkspaceNavigationRepository,
  decodeWorkspaceNavigation,
  encodeWorkspaceNavigation
} from './workspace-navigation-repository'

export async function createRendererRepositories(
  persistence: PersistenceApi = window.realmflow!.persistence,
  legacyStorage: StorageAdapter = window.localStorage
): Promise<RendererRepositories> {
  const [workspaceNavigation, chatSessions, spaceResources] =
    await Promise.all([
      createMainProcessRepository({
        dataset: 'workspaceNavigation',
        persistence,
        legacySnapshot: () =>
          createWorkspaceNavigationRepository(legacyStorage).load(),
        fallback: createDefaultWorkspaceNavigation,
        decode: decodeWorkspaceNavigation,
        encode: encodeWorkspaceNavigation
      }),
      createMainProcessRepository({
        dataset: 'chatSessions',
        persistence,
        legacySnapshot: () =>
          createChatSessionRepository(legacyStorage).load(),
        fallback: createDefaultChatSessions,
        decode: decodeChatSessions,
        encode: encodeChatSessions
      }),
      createMainProcessRepository({
        dataset: 'spaceResources',
        persistence,
        legacySnapshot: () =>
          createSpaceResourceRepository(legacyStorage).load(),
        fallback: createEmptySpaceResourceStore,
        decode: decodeSpaceResourceStore,
        encode: encodeSpaceResourceStore
      })
    ])

  return { workspaceNavigation, chatSessions, spaceResources }
}

export function createLocalRendererRepositories(
  storage: StorageAdapter = window.localStorage,
  events: StorageEventSource = window as unknown as StorageEventSource
): RendererRepositories {
  const coordinator = createPersistenceCoordinator(storage, events)
  const observable = <T>(
    dataset: PersistenceDataset,
    repository: {
      load: Repository<T>['load']
      save: (
        value: T,
        expectedRevision: number
      ) => Awaited<ReturnType<Repository<T>['save']>>
    }
  ): Repository<T> => {
    const initial = repository.load()
    const initialization = repository.save(
      initial.value,
      initial.revision
    )
    return {
      load: repository.load,
      save: async (value, expectedRevision) =>
        repository.save(value, expectedRevision),
      saveSync: repository.save,
      skipInitialSave: true,
      serializeSaves: false,
      initializationUnavailable:
        initialization.status === 'unavailable',
      subscribe: (listener) =>
        coordinator.subscribe((changedDataset) => {
          if (changedDataset === dataset) listener()
        })
    }
  }

  return {
    workspaceNavigation: observable(
      'workspaceNavigation',
      createWorkspaceNavigationRepository(storage)
    ),
    chatSessions: observable(
      'chatSessions',
      createChatSessionRepository(storage)
    ),
    spaceResources: observable(
      'spaceResources',
      createSpaceResourceRepository(storage)
    )
  }
}
