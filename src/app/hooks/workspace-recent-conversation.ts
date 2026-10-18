import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BusinessApi,
  RecentConversationDto,
  RecentConversationQuery
} from '../../../shared/business'
import type { ChatSession } from '../../domain/chat-session'
import {
  readRecentConversationFilters,
  toRecentConversationQuery,
  updateRecentConversationFilters,
  writeRecentConversationFilters,
  type RecentConversationFilters
} from '../../features/sessions/recent-conversation-filters'

const RECENT_CONVERSATION_PAGE_SIZE = 50

export function useRecentConversations({
  business,
  initialSessions,
  onAvailabilityChange,
  onInitialLoadComplete
}: {
  business?: BusinessApi
  initialSessions: ChatSession[]
  onAvailabilityChange: (available: boolean) => void
  onInitialLoadComplete: () => void
}) {
  const [recentSessions, setRecentSessions] = useState<RecentConversationDto[]>(
    () => initialSessions
      .filter((session) => session.kind !== 'requirement_node')
      .map(toRecentConversation)
  )
  const [recentTotalCount, setRecentTotalCount] = useState(
    recentSessions.length
  )
  const [recentNextCursor, setRecentNextCursor] = useState<string>()
  const [recentFolderPaths, setRecentFolderPaths] = useState<string[]>([])
  const [recentFilters, setRecentFilters] = useState(
    readRecentConversationFilters
  )
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(
    Boolean(business)
  )
  const requestSequenceRef = useRef(0)
  const queryRef = useRef<RecentConversationQuery>()
  const nextCursorRef = useRef<string>()
  const loadMoreRequestRef = useRef<{
    sequence: number
    cursor: string
  }>()
  const filtersRef = useRef(recentFilters)
  const onAvailabilityChangeRef = useRef(onAvailabilityChange)
  const onInitialLoadCompleteRef = useRef(onInitialLoadComplete)
  onAvailabilityChangeRef.current = onAvailabilityChange
  onInitialLoadCompleteRef.current = onInitialLoadComplete

  const refreshRecentConversations = useCallback(
    async (
      filters: RecentConversationFilters = filtersRef.current
    ): Promise<void> => {
      if (!business) return
      const requestSequence = ++requestSequenceRef.current
      const query = {
        ...toRecentConversationQuery(filters),
        limit: RECENT_CONVERSATION_PAGE_SIZE
      }
      queryRef.current = query
      nextCursorRef.current = undefined
      setRecentNextCursor(undefined)
      setRecentSessionsLoading(true)
      try {
        const result = await business.listRecentConversations(query)
        if (requestSequence !== requestSequenceRef.current) return
        setRecentSessions(result.conversations)
        setRecentFolderPaths(result.folderPaths)
        setRecentTotalCount(
          result.totalCount ?? result.conversations.length
        )
        nextCursorRef.current = result.nextCursor
        setRecentNextCursor(result.nextCursor)
        onAvailabilityChangeRef.current(true)
      } catch {
        if (requestSequence === requestSequenceRef.current) {
          onAvailabilityChangeRef.current(false)
        }
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setRecentSessionsLoading(false)
          onInitialLoadCompleteRef.current()
        }
      }
    },
    [business]
  )

  const loadMoreRecentSessions = useCallback(async (): Promise<void> => {
    const cursor = nextCursorRef.current
    const query = queryRef.current
    const sequence = requestSequenceRef.current
    if (!business || !cursor || !query) return
    if (
      loadMoreRequestRef.current?.sequence === sequence &&
      loadMoreRequestRef.current.cursor === cursor
    ) {
      return
    }
    loadMoreRequestRef.current = { sequence, cursor }
    setRecentSessionsLoading(true)
    try {
      const result = await business.listRecentConversations({
        ...query,
        cursor,
        limit: RECENT_CONVERSATION_PAGE_SIZE
      })
      if (
        sequence !== requestSequenceRef.current ||
        cursor !== nextCursorRef.current
      ) {
        return
      }
      setRecentSessions((current) => {
        const knownIds = new Set(current.map(({ id }) => id))
        return [
          ...current,
          ...result.conversations.filter(({ id }) => !knownIds.has(id))
        ]
      })
      setRecentFolderPaths(result.folderPaths)
      setRecentTotalCount((current) => result.totalCount ?? current)
      nextCursorRef.current = result.nextCursor
      setRecentNextCursor(result.nextCursor)
      onAvailabilityChangeRef.current(true)
    } catch {
      if (sequence === requestSequenceRef.current) {
        onAvailabilityChangeRef.current(false)
      }
    } finally {
      if (
        loadMoreRequestRef.current?.sequence === sequence &&
        loadMoreRequestRef.current.cursor === cursor
      ) {
        loadMoreRequestRef.current = undefined
      }
      if (sequence === requestSequenceRef.current) {
        setRecentSessionsLoading(false)
      }
    }
  }, [business])

  const updateRecentFilters = useCallback(
    (patch: Partial<RecentConversationFilters>): void => {
      setRecentFilters((current) => {
        const next = updateRecentConversationFilters(current, patch)
        filtersRef.current = next
        writeRecentConversationFilters(next)
        return next
      })
    },
    []
  )

  useEffect(() => {
    if (!business) return
    void refreshRecentConversations(recentFilters)
    return () => {
      requestSequenceRef.current += 1
    }
  }, [business, recentFilters, refreshRecentConversations])

  return {
    recentSessions,
    recentFolderPaths,
    recentFilters,
    recentTotalCount,
    recentSessionsHasMore: Boolean(recentNextCursor),
    recentSessionsLoading,
    loadMoreRecentSessions,
    updateRecentFilters,
    refreshRecentConversations
  }
}

export function toRecentConversation(
  session: ChatSession
): RecentConversationDto {
  if (session.kind === 'requirement_node') {
    throw new Error('Requirement-node conversations are not recent conversations')
  }
  const latestTurn = session.turns.at(-1)
  const latestAnswer = latestTurn
    ? session.messages.find(({ id }) => id === latestTurn.assistantMessageId)
    : undefined
  return {
    id: session.id,
    approvalProfileId: session.approvalProfileId ?? 'protected',
    kind: session.kind ?? 'general',
    ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
    ...(session.folderPath ? { folderPath: session.folderPath } : {}),
    ...(session.modelProfileId ? { modelProfileId: session.modelProfileId } : {}),
    title: session.title,
    sortOrder: session.sortOrder ?? 0,
    revision: session.revision ?? 0,
    turnCount: session.turns.length,
    ...(latestTurn ? { latestTurnStatus: latestTurn.status } : {}),
    ...(latestAnswer?.content
      ? { latestAnswerPreview: latestAnswer.content.slice(0, 280) }
      : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  }
}
