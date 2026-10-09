import type {
  RendererRepositories,
  Repository,
  RepositorySnapshot
} from '../../application/ports/repositories'
import { createDefaultChatSessions } from '../../domain/chat-session'
import { createDefaultWorkspaceNavigation } from '../../domain/workspace'

export function createInMemoryRendererRepositories(): RendererRepositories {
  return {
    workspaceNavigation: createInMemoryRepository(
      createDefaultWorkspaceNavigation()
    ),
    chatSessions: createInMemoryRepository(createDefaultChatSessions())
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
