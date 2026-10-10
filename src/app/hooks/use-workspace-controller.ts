import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ChatSessionRepository, WorkspaceNavigationRepository } from '../../application/ports/repositories'
import {
  createWorkspaceState,
  workspaceReducer
} from '../../application/workspace/workspace-reducer'
import { titleFromPrompt } from '../../domain/chat-session'
import type { BusinessApi } from '../../../shared/business'
import type { ReasoningPreference } from '../../../domain/reasoning-router'
import type { ConversationAttachmentSubmission } from '../../../shared/conversation-attachments'
import {
  readRecentConversationFilters,
  toRecentConversationQuery,
  updateRecentConversationFilters,
  writeRecentConversationFilters,
  type RecentConversationFilters
} from '../../features/sessions/recent-conversation-filters'
import {
  mapBusinessNavigation,
  mapConversation
} from '../mappers/business-mappers'
import { executeCreateSpace } from './workspace-command-errors'
import { createConversationManagementActions } from './workspace-conversation-management'
import { highestSequence, moveToIndex } from './workspace-list-utils'
import { useActiveConversation } from './use-active-conversation'
export type WorkspacePersistenceIssue = 'navigation' | 'sessions'
export type WorkspaceOperationNotice =
  | 'work-root-required'
  | 'space-create-failed' | 'space-rename-failed' | 'space-relocate-failed'
  | 'space-delete-failed' | 'space-move-failed' | 'requirement-create-failed'
  | 'requirement-rename-failed' | 'requirement-delete-failed'
  | 'requirement-move-failed' | 'conversation-rename-failed' | 'conversation-delete-failed'
export function useWorkspaceController({
  navigationRepository,
  sessionRepository,
  business,
  activeSessionId,
  applicationLocale = 'zh-CN',
  onOperationNotice = () => undefined
}: {
  navigationRepository: WorkspaceNavigationRepository
  sessionRepository: ChatSessionRepository
  business?: BusinessApi
  activeSessionId?: string
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
  onOperationNotice?: (notice: WorkspaceOperationNotice) => void
}) {
  const [initialNavigation] = useState(() =>
    business
      ? { value: { spaces: [], requirementsBySpace: {} }, revision: 0 }
      : navigationRepository.getSnapshot()
  )
  const [initialSessions] = useState(() =>
    business ? { value: [], revision: 0 } : sessionRepository.getSnapshot()
  )
  const [state, dispatch] = useReducer(
    workspaceReducer,
    createWorkspaceState(initialNavigation.value, initialSessions.value)
  )
  const [persistenceIssues, setPersistenceIssues] = useState<
    WorkspacePersistenceIssue[]
  >([])
  const [sessionsLoading, setSessionsLoading] = useState(Boolean(business))
  const hasActiveSession = state.sessions.some(({ id }) => id === activeSessionId)
  const resolvedSessionId = useActiveConversation({
    sessionId: activeSessionId, business, alreadyLoaded: hasActiveSession,
    onLoaded: (conversation) =>
      dispatch({ type: 'session-synced', session: mapConversation(conversation) }),
    onUnavailable: () => updatePersistenceIssue('sessions', true)
  })
  const [recentSessions, setRecentSessions] = useState(() =>
    initialSessions.value.filter((session) => session.kind !== 'requirement_node')
  )
  const [recentFolderPaths, setRecentFolderPaths] = useState<string[]>([])
  const [recentFilters, setRecentFilters] = useState(
    readRecentConversationFilters
  )
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(
    Boolean(business)
  )
  const navigationRevisionRef = useRef(initialNavigation.revision)
  const sessionRevisionRef = useRef(initialSessions.revision)
  const skipNextNavigationSaveRef = useRef(true)
  const skipNextSessionSaveRef = useRef(true)
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
  const pendingConversationReadyRef = useRef(
    new Map<string, (sessionId: string) => void>()
  )
  const recentRequestSequenceRef = useRef(0)
  const recentFiltersRef = useRef(recentFilters)
  const refreshRecentConversations = useCallback(
    async (filters: RecentConversationFilters): Promise<void> => {
      if (!business) return
      const requestSequence = ++recentRequestSequenceRef.current
      setRecentSessionsLoading(true)
      try {
        const query = toRecentConversationQuery(filters)
        const result = await business.listRecentConversations(query)
        if (requestSequence !== recentRequestSequenceRef.current) return
        const conversations = result.conversations.map(mapConversation)
        setRecentSessions(conversations)
        setRecentFolderPaths(result.folderPaths)
        for (const session of [...conversations].reverse())
          dispatch({ type: 'session-synced', session })
        updatePersistenceIssue('sessions', false)
      } catch {
        if (requestSequence === recentRequestSequenceRef.current)
          updatePersistenceIssue('sessions', true)
      } finally {
        if (requestSequence === recentRequestSequenceRef.current) {
          setRecentSessionsLoading(false)
          setSessionsLoading(false)
        }
      }
    },
    [business]
  )
  useEffect(() => {
    if (!business) return
    let disposed = false
    const hydrateNavigation = async (): Promise<void> => {
      const spaces = await business.listSpaces()
      const requirements = await Promise.all(
        spaces.map(async (space) => [
          space.id,
          await business.listRequirements({ workspaceId: space.id })
        ] as const)
      )
      if (disposed) return
      dispatch({
        type: 'navigation-replaced',
        navigation: mapBusinessNavigation(spaces, requirements)
      })
      updatePersistenceIssue('navigation', false)
    }
    void hydrateNavigation().catch(() => {
      if (!disposed) updatePersistenceIssue('navigation', true)
    })
    return () => {
      disposed = true
    }
  }, [business])
  useEffect(() => {
    if (!business) return
    void refreshRecentConversations(recentFilters)
    return () => {
      recentRequestSequenceRef.current += 1
    }
  }, [business, recentFilters, refreshRecentConversations])
  useEffect(() => {
    if (!business?.onConversationEvent) return
    return business.onConversationEvent(({ conversation }) => {
      dispatch({
        type: 'session-synced',
        session: mapConversation(conversation)
      })
      pendingConversationReadyRef.current.get(conversation.id)?.(
        conversation.id
      )
      pendingConversationReadyRef.current.delete(conversation.id)
    })
  }, [business])
  useEffect(() => {
    if (business) return
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
    const saveNavigation = async (): Promise<void> => {
      applyNavigationResult(
        await navigationRepository.save(
          navigation,
          navigationRevisionRef.current
        )
      )
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
    if (business) return
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
    const saveSessions = async (): Promise<void> => {
      applySessionResult(
        await sessionRepository.save(
          sessions,
          sessionRevisionRef.current
        )
      )
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
    () => {
      if (business) return
      return navigationRepository.subscribe?.(() => {
        const snapshot = navigationRepository.getSnapshot()
        navigationRevisionRef.current = snapshot.revision
        skipNextNavigationSaveRef.current = true
        dispatch({
          type: 'navigation-replaced',
          navigation: snapshot.value
        })
      })
    },
    [business, navigationRepository]
  )
  useEffect(
    () => {
      if (business) return
      return sessionRepository.subscribe?.(() => {
        const snapshot = sessionRepository.getSnapshot()
        sessionRevisionRef.current = snapshot.revision
        skipNextSessionSaveRef.current = true
        dispatch({
          type: 'sessions-replaced',
          sessions: snapshot.value
        })
      })
    },
    [business, sessionRepository]
  )
  const refreshBusinessNavigation = async (): Promise<void> => {
    if (!business) return
    const spaces = await business.listSpaces()
    const requirements = await Promise.all(
      spaces.map(async (space) => [
        space.id,
        await business.listRequirements({ workspaceId: space.id })
      ] as const)
    )
    dispatch({
      type: 'navigation-replaced',
      navigation: mapBusinessNavigation(spaces, requirements)
    })
  }
  const conversationManagement = createConversationManagementActions({
    business,
    sessions: state.sessions,
    dispatch,
    filters: recentFiltersRef.current,
    refresh: refreshRecentConversations,
    markAvailable: () => updatePersistenceIssue('sessions', false),
    notify: onOperationNotice
  })
  return {
    ...state,
    persistenceIssues,
    sessionsLoading: sessionsLoading || Boolean(
      business?.getConversation && activeSessionId && !hasActiveSession && resolvedSessionId !== activeSessionId
    ),
    recentSessions: business
      ? recentSessions
      : state.sessions.filter((session) => session.kind !== 'requirement_node'),
    recentFolderPaths,
    recentFilters,
    recentSessionsLoading,
    updateRecentFilters(patch: Partial<RecentConversationFilters>) {
      setRecentFilters((current) => {
        const next = updateRecentConversationFilters(current, patch)
        recentFiltersRef.current = next
        writeRecentConversationFilters(next)
        return next
      })
    },
    createSpace(label: string) {
      if (business) {
        void executeCreateSpace(
          business,
          { id: crypto.randomUUID(), name: label },
          refreshBusinessNavigation
        )
          .then((outcome) => {
            if (outcome === 'work-root-required') {
              onOperationNotice(outcome)
            }
            updatePersistenceIssue('navigation', false)
          })
          .catch(() => onOperationNotice('space-create-failed'))
        return
      }
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
      if (business) {
        const space = state.spaces.find((item) => item.path === spacePath)
        if (!space?.id || space.revision === undefined) return
        void business
          .updateSpace({
            id: space.id,
            expectedRevision: space.revision,
            label
          })
          .then(refreshBusinessNavigation)
          .catch(() => onOperationNotice('space-rename-failed'))
        return
      }
      dispatch({ type: 'space-renamed', spacePath, label })
    },
    relocateSpace(spacePath: string) {
      if (!business) return
      const space = state.spaces.find((item) => item.path === spacePath)
      if (!space?.id || space.revision === undefined) return
      void business
        .chooseSpaceRelocation({
          id: space.id,
          expectedRevision: space.revision
        })
        .then((result) => (result ? refreshBusinessNavigation() : undefined))
        .catch(() => onOperationNotice('space-relocate-failed'))
    },
    deleteSpace(spacePath: string) {
      if (business) {
        const space = state.spaces.find((item) => item.path === spacePath)
        if (!space?.id || space.revision === undefined) return
        void business
          .deleteSpace({
            id: space.id,
            expectedRevision: space.revision
          })
          .then(refreshBusinessNavigation)
          .catch(() => onOperationNotice('space-delete-failed'))
        return
      }
      dispatch({ type: 'space-deleted', spacePath })
    },
    moveSpace(sourcePath: string, targetIndex: number) {
      if (business) {
        const reordered = moveToIndex(state.spaces, sourcePath, targetIndex)
        void Promise.all(
          reordered.map((space, sortOrder) => {
            if (!space.id || space.revision === undefined) return Promise.resolve()
            return business.updateSpace({
              id: space.id,
              expectedRevision: space.revision,
              sortOrder
            })
          })
        )
          .then(refreshBusinessNavigation)
          .catch(() => onOperationNotice('space-move-failed'))
        return
      }
      dispatch({ type: 'space-moved', sourcePath, targetIndex })
    },
    createRequirement(
      spacePath: string,
      title: string,
      templateVersionId?: string
    ) {
      if (business) {
        const space = state.spaces.find((item) => item.path === spacePath)
        if (!space?.id || !templateVersionId) {
          onOperationNotice('requirement-create-failed')
          return Promise.reject(
            new Error('A published workflow template version is required')
          )
        }
        return business
          .createRequirement({
            id: crypto.randomUUID(),
            workspaceId: space.id,
            title,
            templateVersionId
          })
          .then(refreshBusinessNavigation)
          .catch((error: unknown) => {
            onOperationNotice('requirement-create-failed')
            throw error
          })
      }
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
    renameRequirement(
      spacePath: string,
      requirementId: string,
      title: string
    ) {
      const normalizedTitle = title.trim()
      if (!normalizedTitle) return
      if (business) {
        const requirement = state.requirementsBySpace[spacePath]?.find(
          (item) => item.id === requirementId
        )
        if (!requirement || requirement.revision === undefined) return
        void business
          .updateRequirement({
            id: requirement.id,
            expectedRevision: requirement.revision,
            title: normalizedTitle
          })
          .then(refreshBusinessNavigation)
          .catch(() => onOperationNotice('requirement-rename-failed'))
        return
      }
      dispatch({
        type: 'requirement-renamed',
        spacePath,
        requirementId,
        title: normalizedTitle
      })
    },
    deleteRequirement(spacePath: string, requirementId: string) {
      if (business) {
        const requirement = state.requirementsBySpace[spacePath]?.find(
          (item) => item.id === requirementId
        )
        if (!requirement || requirement.revision === undefined) return
        void business
          .deleteRequirement({
            id: requirement.id,
            expectedRevision: requirement.revision
          })
          .then(refreshBusinessNavigation)
          .catch(() => onOperationNotice('requirement-delete-failed'))
        return
      }
      dispatch({ type: 'requirement-deleted', spacePath, requirementId })
    },
    moveRequirement(
      spacePath: string,
      sourceId: string,
      targetIndex: number
    ) {
      if (business) {
        const reordered = moveToIndex(
          state.requirementsBySpace[spacePath] ?? [],
          sourceId,
          targetIndex,
          (requirement) => requirement.id
        )
        void Promise.all(
          reordered.map((requirement, sortOrder) => {
            if (requirement.revision === undefined) return Promise.resolve()
            return business.updateRequirement({
              id: requirement.id,
              expectedRevision: requirement.revision,
              sortOrder
            })
          })
        )
          .then(refreshBusinessNavigation)
          .catch(() => onOperationNotice('requirement-move-failed'))
        return
      }
      dispatch({
        type: 'requirement-moved',
        spacePath,
        sourceId,
        targetIndex
      })
    },
    async createSession(
      spacePath: string,
      prompt: string,
      modelProfileId?: string,
      reasoningMode: ReasoningPreference = 'auto',
      attachments?: ConversationAttachmentSubmission
    ): Promise<string> {
      sessionSequenceRef.current += 1
      const now = Date.now()
      const sessionId = business
        ? crypto.randomUUID()
        : `conversation-${sessionSequenceRef.current}`
      const space = state.spaces.find((item) => item.path === spacePath)
      const folderBindingId = spacePath.startsWith('folder:')
        ? spacePath.slice('folder:'.length)
        : undefined
      const knowledgeScope = space?.id
        ? ({ kind: 'workspace', workspaceId: space.id } as const)
        : spacePath === 'all-workspaces'
          ? ({ kind: 'all_workspaces' } as const)
          : ({ kind: 'none' } as const)
      if (business) {
        const firstCommittedSnapshot = new Promise<string>((resolve) => {
          pendingConversationReadyRef.current.set(sessionId, resolve)
        })
        try {
          const completed = business
            .createConversation({
              id: sessionId,
              kind: space?.id ? 'space' : 'general',
              knowledgeScope,
              ...(space?.id ? { workspaceId: space.id } : {}),
              ...(folderBindingId ? { folderBindingId } : {}),
              ...(modelProfileId ? { modelProfileId } : {}),
              ...(attachments ? { attachments } : {}),
              applicationLocale,
              reasoningMode,
              title: titleFromPrompt(prompt),
              prompt
            })
            .then(async (conversation) => {
              dispatch({
                type: 'session-synced',
                session: mapConversation(conversation)
              })
              updatePersistenceIssue('sessions', false)
              await refreshRecentConversations(recentFiltersRef.current)
              return sessionId
            })
          return await Promise.race([firstCommittedSnapshot, completed])
        } catch (error) {
          throw error
        } finally {
          pendingConversationReadyRef.current.delete(sessionId)
        }
      } else {
        dispatch({
          type: 'session-created',
          session: {
            id: sessionId,
            knowledgeScope,
            title: titleFromPrompt(prompt),
            spacePath: space?.path ?? '',
            ...(folderBindingId ? { folderPath: folderBindingId } : {}),
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
      }
      return sessionId
    },
    async appendSessionMessage(
      sessionId: string,
      content: string,
      modelProfileId?: string,
      reasoningMode: ReasoningPreference = 'auto',
      attachments?: ConversationAttachmentSubmission
    ): Promise<void> {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) return
      if (business) {
        const conversation = await business.appendConversationMessage({
            sessionId,
            messageId: crypto.randomUUID(),
            content,
            expectedRevision: session.revision ?? 0,
            ...(modelProfileId ? { modelProfileId } : {}),
            ...(attachments ? { attachments } : {}),
            applicationLocale,
            reasoningMode
        })
        dispatch({
          type: 'session-synced',
          session: mapConversation(conversation)
        })
        updatePersistenceIssue('sessions', false)
        await refreshRecentConversations(recentFiltersRef.current)
      } else {
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
    },
    ...conversationManagement
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
