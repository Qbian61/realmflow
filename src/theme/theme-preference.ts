import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference
} from './themes'

export const THEME_PREFERENCE_KEY = 'realmflow:theme:v1'

type StoredThemePreference = {
  version: 1
  theme: ThemePreference
}

export type ThemePreferenceSaveResult =
  | { outcome: 'saved' }
  | { outcome: 'invalid'; reason: 'unsupported_theme' }
  | { outcome: 'failed'; reason: 'storage_unavailable' }

export function parseThemePreference(value: string | null): ThemePreference | null {
  if (value === null) return null

  try {
    const parsed = JSON.parse(value) as unknown
    if (!isStoredThemePreference(parsed)) return null
    return parsed.theme
  } catch {
    return null
  }
}

export function loadThemePreference(
  storage: Storage = window.localStorage
): ThemePreference {
  try {
    return (
      parseThemePreference(storage.getItem(THEME_PREFERENCE_KEY)) ??
      DEFAULT_THEME
    )
  } catch {
    return DEFAULT_THEME
  }
}

export function saveThemePreference(
  theme: unknown,
  storage: Storage = window.localStorage
): ThemePreferenceSaveResult {
  if (!isThemePreference(theme)) {
    return { outcome: 'invalid', reason: 'unsupported_theme' }
  }

  try {
    const preference: StoredThemePreference = { version: 1, theme }
    storage.setItem(THEME_PREFERENCE_KEY, JSON.stringify(preference))
    return { outcome: 'saved' }
  } catch {
    return { outcome: 'failed', reason: 'storage_unavailable' }
  }
}

function isStoredThemePreference(
  value: unknown
): value is StoredThemePreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === 1 && isThemePreference(record.theme)
}
