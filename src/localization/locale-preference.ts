import { DEFAULT_LOCALE, isLocale, type Locale } from './locales'

export const LOCALE_PREFERENCE_KEY = 'realmflow:locale:v1'

type LocalePreference = {
  version: 1
  locale: Locale
}

export type LocalePreferenceSaveResult =
  | { outcome: 'saved' }
  | { outcome: 'invalid'; reason: 'unsupported_locale' }
  | { outcome: 'failed'; reason: 'storage_unavailable' }

export function loadLocalePreference(
  storage: Storage = window.localStorage
): Locale {
  try {
    const value = JSON.parse(
      storage.getItem(LOCALE_PREFERENCE_KEY) ?? 'null'
    ) as unknown
    if (!isLocalePreference(value)) return DEFAULT_LOCALE
    return value.locale
  } catch {
    return DEFAULT_LOCALE
  }
}

export function saveLocalePreference(
  locale: unknown,
  storage: Storage = window.localStorage
): LocalePreferenceSaveResult {
  if (!isLocale(locale)) {
    return { outcome: 'invalid', reason: 'unsupported_locale' }
  }

  try {
    const preference: LocalePreference = { version: 1, locale }
    storage.setItem(LOCALE_PREFERENCE_KEY, JSON.stringify(preference))
    return { outcome: 'saved' }
  } catch {
    return { outcome: 'failed', reason: 'storage_unavailable' }
  }
}

function isLocalePreference(value: unknown): value is LocalePreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === 1 && isLocale(record.locale)
}
