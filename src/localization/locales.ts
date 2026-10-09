export const SUPPORTED_LOCALES = ['zh-CN', 'en', 'ja'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'zh-CN'

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語'
}

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    SUPPORTED_LOCALES.some((locale) => locale === value)
  )
}
