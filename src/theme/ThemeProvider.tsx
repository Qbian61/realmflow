import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState
} from 'react'
import {
  loadThemePreference,
  parseThemePreference,
  saveThemePreference,
  THEME_PREFERENCE_KEY
} from './theme-preference'
import {
  isThemePreference,
  resolveTheme,
  SYSTEM_THEME_QUERY,
  THEME_META_COLORS,
  type ResolvedTheme,
  type ThemePreference
} from './themes'

export type ThemeChangeResult =
  | { outcome: 'changed'; theme: ThemePreference }
  | { outcome: 'unchanged'; theme: ThemePreference }
  | { outcome: 'invalid'; reason: 'unsupported_theme' }
  | { outcome: 'failed'; reason: 'storage_unavailable' }

type ThemeContextValue = {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (theme: unknown) => ThemeChangeResult
}

type ThemeState = {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
}

type MatchMedia = (query: string) => MediaQueryList

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({
  children,
  storage = window.localStorage,
  matchMedia
}: {
  children: ReactNode
  storage?: Storage
  matchMedia?: MatchMedia
}): JSX.Element {
  const resolve = useCallback(
    (preference: ThemePreference) => resolveTheme(preference, matchMedia),
    [matchMedia]
  )
  const [theme, setThemeState] = useState<ThemeState>(() => {
    const preference = loadThemePreference(storage)
    return { preference, resolvedTheme: resolve(preference) }
  })

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme.resolvedTheme
    root.dataset.themePreference = theme.preference
    root.style.colorScheme = theme.resolvedTheme
    let themeColor = document.head.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    )
    if (!themeColor) {
      themeColor = document.createElement('meta')
      themeColor.name = 'theme-color'
      document.head.append(themeColor)
    }
    themeColor.content = THEME_META_COLORS[theme.resolvedTheme]
  }, [theme])

  useEffect(() => {
    if (theme.preference !== 'system') return

    const query = getSystemThemeQuery(matchMedia)
    if (!query) {
      setThemeState((current) =>
        current.preference === 'system' && current.resolvedTheme !== 'light'
          ? { ...current, resolvedTheme: 'light' }
          : current
      )
      return
    }

    const update = (matches: boolean) => {
      setThemeState((current) => {
        if (current.preference !== 'system') return current
        const resolvedTheme = matches ? 'dark' : 'light'
        return current.resolvedTheme === resolvedTheme
          ? current
          : { ...current, resolvedTheme }
      })
    }
    const handleChange = (event: MediaQueryListEvent) => update(event.matches)

    update(query.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [matchMedia, theme.preference])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== THEME_PREFERENCE_KEY ||
        (event.storageArea && event.storageArea !== storage)
      ) {
        return
      }
      const preference = parseThemePreference(event.newValue)
      if (!preference) return

      setThemeState((current) =>
        current.preference === preference
          ? current
          : { preference, resolvedTheme: resolve(preference) }
      )
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [resolve, storage])

  const setTheme = useCallback(
    (nextTheme: unknown): ThemeChangeResult => {
      if (!isThemePreference(nextTheme)) {
        return { outcome: 'invalid', reason: 'unsupported_theme' }
      }
      if (nextTheme === theme.preference) {
        return { outcome: 'unchanged', theme: theme.preference }
      }

      const saved = saveThemePreference(nextTheme, storage)
      if (saved.outcome !== 'saved') return saved

      setThemeState({
        preference: nextTheme,
        resolvedTheme: resolve(nextTheme)
      })
      return { outcome: 'changed', theme: nextTheme }
    },
    [resolve, storage, theme.preference]
  )

  const value = useMemo(
    () => ({
      preference: theme.preference,
      resolvedTheme: theme.resolvedTheme,
      setTheme
    }),
    [setTheme, theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

function getSystemThemeQuery(matchMedia?: MatchMedia): MediaQueryList | null {
  const query =
    matchMedia ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : undefined)
  if (!query) return null

  try {
    return query(SYSTEM_THEME_QUERY)
  } catch {
    return null
  }
}
