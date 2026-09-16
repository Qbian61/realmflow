import { useEffect, useReducer, useRef, useState } from 'react'
import type {
  ChatSessionRepository,
  WorkspaceNavigationRepository
} from '../../application/ports/repositories'
import {
  createWorkspaceState,
  workspaceReducer
} from '../../application/workspace/workspace-reducer'
import { titleFromPrompt } from '../../domain/chat-session'

export type WorkspacePersistenceIssue = 'navigation' | 'sessions'

export function useWorkspaceController({
  navigationRepository,
  sessionRepository
}: {
  navigationRepository: WorkspaceNavigationRepository
  sessionRepository: ChatSessionRepository
}) {
  const [initialNavigation] = useState(navigationRepository.load)
  const [initialSessions] = useState(sessionRepository.load)
  const [state, dispatch] = useReducer(
    workspaceReducer,
    createWorkspaceState(initialNavigation.value, initialSessions.value)
  )
  const [persistenceIssues, setPersistenceIssues] = useState<
    WorkspacePersistenceIssue[]
  >(() => [
    ...(navigationRepository.initializationUnavailable
      ? ['navigation' as const]
      : []),
    ...(sessionRepository.initializationUnavailable
      ? ['sessions' as const]
      : [])
  ])
  const navigationRevisionRef = useRef(initialNavigation.revision)
  const sessionRevisionRef = useRef(initialSessions.revision)
  const skipNextNavigationSaveRef = useRef(
    navigationRepository.skipInitialSave ?? false
  )
  const skipNextSessionSaveRef = useRef(
    sessionRepository.skipInitialSave ?? false
  )
  const navigationSaveQueueRef = useRef<Promise<void> | null>(null)
  const sessionSaveQueueRef = useRef<Promise<void> | null>(null)
  const spaceSequenceRef = useRef(
    highestSequence(
      initialNavigation.value.spaces.map((space) => space.path),
      /\/local-(\d+)$/
    )
  )
  const requirementSequenceRef = useRef(
    highestSequence(
      Object.values(initialNavigation.value.requirementsBySpace)
        .flat()
        .map((requirement) => requirement.id),
      /^requirement-(\d+)$/
    )
  )
  const sessionSequenceRef = useRef(Date.now())

  useEffect(() => {
    if (skipNextNavigationSaveRef.current) {
      skipNextNavigationSaveRef.current = false
      return
    }
    const navigation = {
      spaces: state.spaces,
      requirementsBySpace: state.requirementsBySpace
    }
    const applyNavigationResult = (
      result: Awaited<ReturnType<WorkspaceNavigationRepository['save']>>
    ): void => {
      if (result.status === 'saved') {
        updatePersistenceIssue('navigation', false)
        navigationRevisionRef.current = result.snapshot.revision
      } else if (result.status === 'conflict') {
        updatePersistenceIssue('navigation', false)
        navigationRevisionRef.current = result.snapshot.revision
        skipNextNavigationSaveRef.current = true
        dispatch({
          type: 'navigation-replaced',
          navigation: result.snapshot.value
        })
      } else {
        updatePersistenceIssue('navigation', true)
      }
    }
    if (navigationRepository.saveSync) {
      applyNavigationResult(
        navigationRepository.saveSync(
          navigation,
          navigationRevisionRef.current
        )
      )
      return
    }
    const saveNavigation = async (): Promise<void> => {
      applyNavigationResult(
        await navigationRepository.save(
          navigation,
          navigationRevisionRef.current
        )
      )
    }
    if (!navigationRepository.serializeSaves) {
      void saveNavigation().catch(() =>
        updatePersistenceIssue('navigation', true)
      )
      return
    }
    const previousSave = navigationSaveQueueRef.current
    const queuedSave = previousSave
      ? previousSave.then(saveNavigation)
      : saveNavigation()
    navigationSaveQueueRef.current = queuedSave
    void queuedSave.then(
      () => {
        if (navigationSaveQueueRef.current === queuedSave) {
          navigationSaveQueueRef.current = null
        }
      },
      () => {
        if (navigationSaveQueueRef.current === queuedSave) {
          navigationSaveQueueRef.current = null
        }
        updatePersistenceIssue('navigation', true)
      }
    )
  }, [
    navigationRepository,
    state.requirementsBySpace,
    state.spaces
  ])

  useEffect(() => {
    if (skipNextSessionSaveRef.current) {
      skipNextSessionSaveRef.current = false
      return
    }
    const sessions = state.sessions
    const applySessionResult = (
      result: Awaited<ReturnType<ChatSessionRepository['save']>>
    ): void => {
      if (result.status === 'saved') {
        updatePersistenceIssue('sessions', false)
        sessionRevisionRef.current = result.snapshot.revision
      } else if (result.status === 'conflict') {
        updatePersistenceIssue('sessions', false)
        sessionRevisionRef.current = result.snapshot.revision
        skipNextSessionSaveRef.current = true
        dispatch({
          type: 'sessions-replaced',
          sessions: result.snapshot.value
        })
      } else {
        updatePersistenceIssue('sessions', true)
      }
    }
    if (sessionRepository.saveSync) {
      applySessionResult(
        sessionRepository.saveSync(
          sessions,
          sessionRevisionRef.current
        )
      )
      return
    }
    const saveSessions = async (): Promise<void> => {
      applySessionResult(
        await sessionRepository.save(
          sessions,
          sessionRevisionRef.current
        )
      )
    }
    if (!sessionRepository.serializeSaves) {
      void saveSessions().catch(() =>
        updatePersistenceIssue('sessions', true)
      )
      return
    }
    const previousSave = sessionSaveQueueRef.current
    const queuedSave = previousSave
      ? previousSave.then(saveSessions)
      : saveSessions()
    sessionSaveQueueRef.current = queuedSave
    void queuedSave.then(
      () => {
        if (sessionSaveQueueRef.current === queuedSave) {
          sessionSaveQueueRef.current = null
        }
      },
      () => {
        if (sessionSaveQueueRef.current === queuedSave) {
          sessionSaveQueueRef.current = null
        }
        updatePersistenceIssue('sessions', true)
      }
    )
  }, [sessionRepository, state.sessions])

  useEffect(
    () =>
      navigationRepository.subscribe?.(() => {
        const snapshot = navigationRepository.load()
        navigationRevisionRef.current = snapshot.revision
        skipNextNavigationSaveRef.current = true
        dispatch({
          type: 'navigation-replaced',
          navigation: snapshot.value
        })
      }),
    [navigationRepository]
  )

  useEffect(
    () =>
      sessionRepository.subscribe?.(() => {
        const snapshot = sessionRepository.load()
        sessionRevisionRef.current = snapshot.revision
        skipNextSessionSaveRef.current = true
        dispatch({
          type: 'sessions-replaced',
          sessions: snapshot.value
        })
      }),
    [sessionRepository]
  )

  return {
    ...state,
    persistenceIssues,
    createSpace(label: string) {
      spaceSequenceRef.current += 1
      dispatch({
        type: 'space-created',
        space: {
          path: `/spaces/local-${spaceSequenceRef.current}`,
          label,
          description: '管理空间中的需求与工作内容'
        }
      })
    },
    renameSpace(spacePath: string, label: string) {
      dispatch({ type: 'space-renamed', spacePath, label })
    },
    deleteSpace(spacePath: string) {
      dispatch({ type: 'space-deleted', spacePath })
    },
    moveSpace(sourcePath: string, targetPath: string) {
      dispatch({ type: 'space-moved', sourcePath, targetPath })
    },
    createRequirement(spacePath: string, title: string) {
      requirementSequenceRef.current += 1
      dispatch({
        type: 'requirement-created',
        spacePath,
        requirement: {
          id: `requirement-${requirementSequenceRef.current}`,
          title
        }
      })
    },
    deleteRequirement(spacePath: string, requirementId: string) {
      dispatch({ type: 'requirement-deleted', spacePath, requirementId })
    },
    moveRequirement(
      spacePath: string,
      sourceId: string,
      targetId: string
    ) {
      dispatch({
        type: 'requirement-moved',
        spacePath,
        sourceId,
        targetId
      })
    },
    createSession(spacePath: string, prompt: string): string {
      sessionSequenceRef.current += 1
      const now = Date.now()
      const sessionId = `conversation-${sessionSequenceRef.current}`
      dispatch({
        type: 'session-created',
        session: {
          id: sessionId,
          title: titleFromPrompt(prompt),
          spacePath,
          messages: [
            {
              id: `${sessionId}-message-1`,
              content: prompt,
              createdAt: now,
              role: 'user'
            }
          ],
          createdAt: now,
          updatedAt: now
        }
      })
      return sessionId
    },
    appendSessionMessage(sessionId: string, content: string) {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) return
      dispatch({
        type: 'session-message-appended',
        sessionId,
        message: {
          id: `${sessionId}-message-${session.messages.length + 1}`,
          content,
          createdAt: Date.now(),
          role: 'user'
        }
      })
    }
  }

  function updatePersistenceIssue(
    issue: WorkspacePersistenceIssue,
    unavailable: boolean
  ): void {
    setPersistenceIssues((current) => {
      const exists = current.includes(issue)
      if (unavailable === exists) return current
      return unavailable
        ? [...current, issue]
        : current.filter((item) => item !== issue)
    })
  }
}

function highestSequence(values: string[], pattern: RegExp): number {
  return values.reduce((highest, value) => {
    const sequence = Number(value.match(pattern)?.[1] ?? 0)
    return Math.max(highest, sequence)
  }, 0)
}
