import type { PersistenceApi } from '../../../shared/persistence'
import type {
  RendererRepositories,
  Repository,
  RepositorySnapshot
} from '../../application/ports/repositories'
import { createDefaultChatSessions } from '../../domain/chat-session'
import { createEmptySpaceResourceStore } from '../../domain/space-resource'
import { createDefaultWorkspaceNavigation } from '../../domain/workspace'
import {
  decodeChatSessions,
  encodeChatSessions
} from './chat-session-repository'
import { createMainProcessRepository } from './main-process-repository'
import {
  decodeSpaceResourceStore,
  encodeSpaceResourceStore
} from './space-resource-repository'
import {
  decodeWorkspaceNavigation,
  encodeWorkspaceNavigation
} from './workspace-navigation-repository'

export async function createRendererRepositories(
  persistence: PersistenceApi
): Promise<RendererRepositories> {
  const [workspaceNavigation, chatSessions, spaceResources] =
    await Promise.all([
      createMainProcessRepository({
        dataset: 'workspaceNavigation',
        persistence,
        fallback: createDefaultWorkspaceNavigation,
        decode: decodeWorkspaceNavigation,
        encode: encodeWorkspaceNavigation
      }),
      createMainProcessRepository({
        dataset: 'chatSessions',
        persistence,
        fallback: createDefaultChatSessions,
        decode: decodeChatSessions,
        encode: encodeChatSessions
      }),
      createMainProcessRepository({
        dataset: 'spaceResources',
        persistence,
        fallback: createEmptySpaceResourceStore,
        decode: decodeSpaceResourceStore,
        encode: encodeSpaceResourceStore
      })
    ])

  return { workspaceNavigation, chatSessions, spaceResources }
}

export function createInMemoryRendererRepositories(): RendererRepositories {
  return {
    workspaceNavigation: createInMemoryRepository(
      createDefaultWorkspaceNavigation()
    ),
    chatSessions: createInMemoryRepository(createDefaultChatSessions()),
    spaceResources: createInMemoryRepository(createEmptySpaceResourceStore())
  }
}

function createInMemoryRepository<T>(initialValue: T): Repository<T> {
  let snapshot: RepositorySnapshot<T> = {
    value: structuredClone(initialValue),
    revision: 0
  }
  const listeners = new Set<() => void>()
  return {
    async hydrate() {
      return structuredClone(snapshot)
    },
    getSnapshot() {
      return structuredClone(snapshot)
    },
    async save(value, expectedRevision) {
      if (expectedRevision !== snapshot.revision) {
        return {
          status: 'conflict',
          snapshot: structuredClone(snapshot)
        }
      }
      snapshot = {
        value: structuredClone(value),
        revision: expectedRevision + 1
      }
      listeners.forEach((listener) => listener())
      return {
        status: 'saved',
        snapshot: structuredClone(snapshot)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
