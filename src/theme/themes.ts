export const SUPPORTED_THEME_PREFERENCES = [
  'light',
  'dark',
  'system'
] as const

export type ThemePreference = (typeof SUPPORTED_THEME_PREFERENCES)[number]
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

export const DEFAULT_THEME: ThemePreference = 'system'
export const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'
export const THEME_META_COLORS: Record<ResolvedTheme, string> = {
  light: '#f1f1f1',
  dark: '#141516'
}

type MatchMedia = (query: string) => Pick<MediaQueryList, 'matches'>

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' &&
    SUPPORTED_THEME_PREFERENCES.some((theme) => theme === value)
  )
}

export function resolveTheme(
  preference: ThemePreference,
  matchMedia?: MatchMedia
): ResolvedTheme {
  if (preference !== 'system') return preference

  const query =
    matchMedia ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : undefined)
  if (!query) return 'light'

  try {
    return query(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}
