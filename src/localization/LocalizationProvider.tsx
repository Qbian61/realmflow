import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  loadLocalePreference,
  saveLocalePreference
} from './locale-preference'
import { isLocale, type Locale } from './locales'
import {
  translate,
  type TranslationKey,
  type TranslationValues,
  type Translator
} from './translate'

export type LocaleChangeResult =
  | { outcome: 'changed'; locale: Locale }
  | { outcome: 'unchanged'; locale: Locale }
  | { outcome: 'invalid'; reason: 'unsupported_locale' }
  | { outcome: 'failed'; reason: 'storage_unavailable' }

type LocalizationContextValue = {
  locale: Locale
  setLocale: (locale: unknown) => LocaleChangeResult
  t: Translator
}

const LocalizationContext = createContext<LocalizationContextValue | null>(
  null
)

export function LocalizationProvider({
  children,
  storage = window.localStorage
}: {
  children: ReactNode
  storage?: Storage
}): JSX.Element {
  const [locale, setActiveLocale] = useState<Locale>(() =>
    loadLocalePreference(storage)
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback(
    (nextLocale: unknown): LocaleChangeResult => {
      if (!isLocale(nextLocale)) {
        return { outcome: 'invalid', reason: 'unsupported_locale' }
      }
      if (nextLocale === locale) {
        return { outcome: 'unchanged', locale }
      }
      const saved = saveLocalePreference(nextLocale, storage)
      if (saved.outcome !== 'saved') return saved
      setActiveLocale(nextLocale)
      return { outcome: 'changed', locale: nextLocale }
    },
    [locale, storage]
  )

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      translate(locale, key, values),
    [locale]
  )

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  )
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext)
  if (!context) {
    throw new Error('useLocalization must be used within LocalizationProvider')
  }
  return context
}
