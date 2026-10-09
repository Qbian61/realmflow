import {
  MODEL_STATISTICS_GROUPS,
  type ModelStatisticsGroupBy
} from '../../../shared/model-statistics'

export const MODEL_STATISTICS_PREFERENCES_KEY =
  'realmflow:model-statistics-filters:v1'

export const MODEL_STATISTICS_TIME_RANGES = [
  '7d',
  '30d',
  '90d',
  'all'
] as const

export type ModelStatisticsTimeRange =
  (typeof MODEL_STATISTICS_TIME_RANGES)[number]

export type ModelStatisticsPreferences = {
  timeRange: ModelStatisticsTimeRange
  groupBy: ModelStatisticsGroupBy
  providerId?: string
  modelProfileId?: string
  workspaceId?: string
  requirementId?: string
  nodeId?: string
  conversationId?: string
}

export const DEFAULT_MODEL_STATISTICS_PREFERENCES: ModelStatisticsPreferences =
  {
    timeRange: '30d',
    groupBy: 'model'
  }

const ID_KEYS = [
  'providerId',
  'modelProfileId',
  'workspaceId',
  'requirementId',
  'nodeId',
  'conversationId'
] as const

export function loadModelStatisticsPreferences(
  storage: Storage = window.localStorage
): ModelStatisticsPreferences {
  try {
    const value = JSON.parse(
      storage.getItem(MODEL_STATISTICS_PREFERENCES_KEY) ?? 'null'
    ) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return DEFAULT_MODEL_STATISTICS_PREFERENCES
    }
    const record = value as Record<string, unknown>
    if (
      !MODEL_STATISTICS_TIME_RANGES.includes(
        record.timeRange as ModelStatisticsTimeRange
      ) ||
      !MODEL_STATISTICS_GROUPS.includes(
        record.groupBy as ModelStatisticsGroupBy
      )
    ) {
      return DEFAULT_MODEL_STATISTICS_PREFERENCES
    }
    const result: ModelStatisticsPreferences = {
      timeRange: record.timeRange as ModelStatisticsTimeRange,
      groupBy: record.groupBy as ModelStatisticsGroupBy
    }
    for (const key of ID_KEYS) {
      const field = record[key]
      if (typeof field === 'string' && field.trim()) {
        result[key] = field.trim()
      }
    }
    return result
  } catch {
    return DEFAULT_MODEL_STATISTICS_PREFERENCES
  }
}

export function saveModelStatisticsPreferences(
  preferences: ModelStatisticsPreferences,
  storage: Storage = window.localStorage
): void {
  storage.setItem(
    MODEL_STATISTICS_PREFERENCES_KEY,
    JSON.stringify(preferences)
  )
}
