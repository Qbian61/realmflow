export type AnalyticsView = 'product' | 'models' | 'governance'

export type ProductAnalyticsPreferences = {
  view: AnalyticsView
  workspaceId?: string
}

const STORAGE_KEY = 'realmflow:analytics-view:v1'

const DEFAULT_PREFERENCES: ProductAnalyticsPreferences = {
  view: 'product'
}

export function loadProductAnalyticsPreferences(
  storage: Storage = window.localStorage
): ProductAnalyticsPreferences {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as unknown
    if (
      value === null ||
      Array.isArray(value) ||
      typeof value !== 'object'
    ) {
      return DEFAULT_PREFERENCES
    }
    const record = value as Record<string, unknown>
    if (
      Object.keys(record).some(
        (key) => !['version', 'view', 'workspaceId'].includes(key)
      ) ||
      record.version !== 1 ||
      (record.view !== 'product' &&
        record.view !== 'models' &&
        record.view !== 'governance') ||
      (record.workspaceId !== undefined &&
        (typeof record.workspaceId !== 'string' ||
          !record.workspaceId.trim() ||
          record.workspaceId !== record.workspaceId.trim()))
    ) {
      return DEFAULT_PREFERENCES
    }
    return {
      view: record.view,
      ...(typeof record.workspaceId === 'string'
        ? { workspaceId: record.workspaceId }
        : {})
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function saveProductAnalyticsPreferences(
  preferences: ProductAnalyticsPreferences,
  storage: Storage = window.localStorage
): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      view: preferences.view,
      ...(preferences.workspaceId
        ? { workspaceId: preferences.workspaceId }
        : {})
    })
  )
}
