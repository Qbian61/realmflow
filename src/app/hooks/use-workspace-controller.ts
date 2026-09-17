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
import type {
  BusinessApi,
  ConversationDto,
  RequirementDto,
  SpaceDto
} from '../../../shared/business'

export type WorkspacePersistenceIssue = 'navigation' | 'sessions'

export function useWorkspaceController({
  navigationRepository,
  sessionRepository,
  business
}: {
  navigationRepository: WorkspaceNavigationRepository
  sessionRepository: ChatSessionRepository
  business?: BusinessApi
}) {
  const [initialNavigation] = useState(() =>
    business
      ? { value: { spaces: [], requirementsBySpace: {} }, revision: 0 }
      : navigationRepository.getSnapshot()
  )
  const [initialSessions] = useState(() =>
    business
      ? { value: [], revision: 0 }
      : sessionRepository.getSnapshot()
  )
  const [state, dispatch] = useReducer(
    workspaceReducer,
    createWorkspaceState(initialNavigation.value, initialSessions.value)
  )
  const [persistenceIssues, setPersistenceIssues] = useState<
    WorkspacePersistenceIssue[]
  >([])
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

  useEffect(() => {
    if (!business) return
    let disposed = false
    const hydrate = async (): Promise<void> => {
      const [spaces, conversations] = await Promise.all([
        business.listSpaces(),
        business.listRecentConversations()
      ])
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
      dispatch({
        type: 'sessions-replaced',
        sessions: conversations
          .filter((session) => session.kind !== 'requirement_node')
          .map(mapConversation)
      })
      setPersistenceIssues([])
    }
    void hydrate().catch(() => {
      if (!disposed) setPersistenceIssues(['navigation', 'sessions'])
    })
    return () => {
      disposed = true
    }
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

  const refreshBusinessSessions = async (): Promise<void> => {
    if (!business) return
    const conversations = await business.listRecentConversations()
    dispatch({
      type: 'sessions-replaced',
      sessions: conversations
        .filter((session) => session.kind !== 'requirement_node')
        .map(mapConversation)
    })
  }

  return {
    ...state,
    persistenceIssues,
    createSpace(label: string) {
      if (business) {
        void business
          .createSpace({
            id: crypto.randomUUID(),
            name: label
          })
          .then(refreshBusinessNavigation)
          .catch(() => updatePersistenceIssue('navigation', true))
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
          .catch(() => updatePersistenceIssue('navigation', true))
        return
      }
      dispatch({ type: 'space-renamed', spacePath, label })
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
          .catch(() => updatePersistenceIssue('navigation', true))
        return
      }
      dispatch({ type: 'space-deleted', spacePath })
    },
    moveSpace(sourcePath: string, targetPath: string) {
      if (business) {
        const reordered = moveBefore(state.spaces, sourcePath, targetPath)
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
          .catch(() => updatePersistenceIssue('navigation', true))
        return
      }
      dispatch({ type: 'space-moved', sourcePath, targetPath })
    },
    createRequirement(spacePath: string, title: string) {
      if (business) {
        const space = state.spaces.find((item) => item.path === spacePath)
        if (!space?.id) return
        void business
          .listWorkflowTemplates()
          .then((templates) => {
            const template = templates[0]
            if (!template) throw new Error('No published workflow template')
            return business.createRequirement({
              id: crypto.randomUUID(),
              workspaceId: space.id!,
              title,
              templateVersionId: template.id
            })
          })
          .then(refreshBusinessNavigation)
          .catch(() => updatePersistenceIssue('navigation', true))
        return
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
          .catch(() => updatePersistenceIssue('navigation', true))
        return
      }
      dispatch({ type: 'requirement-deleted', spacePath, requirementId })
    },
    moveRequirement(
      spacePath: string,
      sourceId: string,
      targetId: string
    ) {
      if (business) {
        const reordered = moveBefore(
          state.requirementsBySpace[spacePath] ?? [],
          sourceId,
          targetId,
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
          .catch(() => updatePersistenceIssue('navigation', true))
        return
      }
      dispatch({
        type: 'requirement-moved',
        spacePath,
        sourceId,
        targetId
      })
    },
    createSession(
      spacePath: string,
      prompt: string,
      modelProfileId?: string
    ): string {
      sessionSequenceRef.current += 1
      const now = Date.now()
      const sessionId = business
        ? crypto.randomUUID()
        : `conversation-${sessionSequenceRef.current}`
      const space = state.spaces.find((item) => item.path === spacePath)
      const folderPath = spacePath.startsWith('folder:')
        ? spacePath.slice('folder:'.length)
        : undefined
      dispatch({
        type: 'session-created',
        session: {
          id: sessionId,
          title: titleFromPrompt(prompt),
            spacePath: space?.path ?? '',
            ...(folderPath ? { folderPath } : {}),
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
      if (business) {
        void business
          .createConversation({
            id: sessionId,
            kind: space?.id ? 'space' : 'general',
            ...(space?.id ? { workspaceId: space.id } : {}),
            ...(folderPath ? { folderPath } : {}),
            ...(modelProfileId ? { modelProfileId } : {}),
            title: titleFromPrompt(prompt),
            prompt
          })
          .then(refreshBusinessSessions)
          .catch(() => updatePersistenceIssue('sessions', true))
      }
      return sessionId
    },
    appendSessionMessage(
      sessionId: string,
      content: string,
      modelProfileId?: string
    ) {
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
      if (business) {
        void business
          .appendConversationMessage({
            sessionId,
            messageId: crypto.randomUUID(),
            content,
            expectedRevision: session.revision ?? 0,
            ...(modelProfileId ? { modelProfileId } : {})
          })
          .then(refreshBusinessSessions)
          .catch(() => updatePersistenceIssue('sessions', true))
      }
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

function mapBusinessNavigation(
  spaces: SpaceDto[],
  requirements: Array<readonly [string, RequirementDto[]]>
) {
  return {
    spaces: spaces.map((space) => ({
      id: space.id,
      path: `/spaces/${space.id}`,
      physicalPath: space.path,
      label: space.label,
      description: space.description,
      sortOrder: space.sortOrder,
      revision: space.revision
    })),
    requirementsBySpace: Object.fromEntries(
      requirements.map(([workspaceId, items]) => [
        `/spaces/${workspaceId}`,
        items.map((requirement) => ({
          id: requirement.id,
          workspaceId: requirement.workspaceId,
          title: requirement.title,
          status: requirement.status,
          updatedAt: requirement.updatedAt,
          sortOrder: requirement.sortOrder,
          revision: requirement.revision
        }))
      ])
    )
  }
}

function mapConversation(conversation: ConversationDto) {
  return {
    id: conversation.id,
    kind: conversation.kind,
    ...(conversation.workspaceId
      ? { workspaceId: conversation.workspaceId }
      : {}),
    ...(conversation.requirementId
      ? { requirementId: conversation.requirementId }
      : {}),
    ...(conversation.nodeRunId ? { nodeRunId: conversation.nodeRunId } : {}),
    ...(conversation.folderPath ? { folderPath: conversation.folderPath } : {}),
    title: conversation.title,
    spacePath: conversation.workspaceId
      ? `/spaces/${conversation.workspaceId}`
      : '',
    messages: conversation.messages.map((message) => ({
      ...message,
      role: message.role
    })),
    sortOrder: conversation.sortOrder,
    revision: conversation.revision,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  }
}

function moveBefore<T>(
  items: T[],
  sourceKey: string,
  targetKey: string,
  getKey: (item: T) => string = (item) =>
    (item as { path: string }).path
): T[] {
  const sourceIndex = items.findIndex((item) => getKey(item) === sourceKey)
  const targetIndex = items.findIndex((item) => getKey(item) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items
  }
  const next = [...items]
  const [source] = next.splice(sourceIndex, 1)
  next.splice(next.findIndex((item) => getKey(item) === targetKey), 0, source)
  return next
}
