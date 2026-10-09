import type { RecentConversationQuery } from '../../../shared/business'

export type RecentConversationKindFilter = 'all' | 'general' | 'space'
export type RecentConversationTimeRange = 'all' | 'day' | 'week' | 'month'

export type RecentConversationFilters = {
  kind: RecentConversationKindFilter
  workspaceId: string
  folderPath: string
  timeRange: RecentConversationTimeRange
}

export const RECENT_CONVERSATION_FILTERS_KEY =
  'realmflow:recent-conversation-filters'

export const DEFAULT_RECENT_CONVERSATION_FILTERS: RecentConversationFilters = {
  kind: 'all',
  workspaceId: '',
  folderPath: '',
  timeRange: 'all'
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000
const TIME_RANGE_DAYS: Record<
  Exclude<RecentConversationTimeRange, 'all'>,
  number
> = {
  day: 1,
  week: 7,
  month: 30
}

export function readRecentConversationFilters(
  storage: Storage = window.localStorage
): RecentConversationFilters {
  try {
    const value = storage.getItem(RECENT_CONVERSATION_FILTERS_KEY)
    if (value === null) return { ...DEFAULT_RECENT_CONVERSATION_FILTERS }
    const parsed: unknown = JSON.parse(value)
    return isStoredFilters(parsed)
      ? {
          kind: parsed.kind,
          workspaceId: parsed.workspaceId,
          folderPath: parsed.folderPath,
          timeRange: parsed.timeRange
        }
      : { ...DEFAULT_RECENT_CONVERSATION_FILTERS }
  } catch {
    return { ...DEFAULT_RECENT_CONVERSATION_FILTERS }
  }
}

export function writeRecentConversationFilters(
  filters: RecentConversationFilters,
  storage: Storage = window.localStorage
): void {
  storage.setItem(
    RECENT_CONVERSATION_FILTERS_KEY,
    JSON.stringify({ version: 1, ...filters })
  )
}

export function updateRecentConversationFilters(
  current: RecentConversationFilters,
  patch: Partial<RecentConversationFilters>
): RecentConversationFilters {
  const next = { ...current, ...patch }
  if (patch.workspaceId) {
    return { ...next, kind: 'space', folderPath: '' }
  }
  if (patch.folderPath) {
    return { ...next, kind: 'general', workspaceId: '' }
  }
  if (patch.kind === 'general') return { ...next, workspaceId: '' }
  if (patch.kind === 'space') return { ...next, folderPath: '' }
  return next
}

export function toRecentConversationQuery(
  filters: RecentConversationFilters,
  now = Date.now()
): RecentConversationQuery {
  return {
    ...(filters.kind === 'all' ? {} : { kind: filters.kind }),
    ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
    ...(filters.folderPath ? { folderPath: filters.folderPath } : {}),
    ...(filters.timeRange === 'all'
      ? {}
      : {
          updatedAfter:
            now - TIME_RANGE_DAYS[filters.timeRange] * DAY_IN_MILLISECONDS
        })
  }
}

function isStoredFilters(value: unknown): value is {
  version: 1
  kind: RecentConversationKindFilter
  workspaceId: string
  folderPath: string
  timeRange: RecentConversationTimeRange
} {
  if (!value || typeof value !== 'object') return false
  const stored = value as Record<string, unknown>
  if (
    stored.version !== 1 ||
    !['all', 'general', 'space'].includes(String(stored.kind)) ||
    typeof stored.workspaceId !== 'string' ||
    typeof stored.folderPath !== 'string' ||
    !['all', 'day', 'week', 'month'].includes(String(stored.timeRange))
  ) {
    return false
  }
  if (stored.workspaceId && stored.folderPath) return false
  if (stored.workspaceId && stored.kind !== 'space') return false
  if (stored.folderPath && stored.kind !== 'general') return false
  return true
}
