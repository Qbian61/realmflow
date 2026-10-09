import type { Locale } from './locales'
import { en } from './messages/en'
import { ja } from './messages/ja'
import { zhCN } from './messages/zh-CN'

export type TranslationKey = keyof typeof zhCN
export type TranslationValues = Readonly<Record<string, string | number>>
export type Translator = (
  key: TranslationKey,
  values?: TranslationValues
) => string

const catalogs: Readonly<
  Record<Locale, Partial<Record<TranslationKey, string>>>
> = {
  'zh-CN': zhCN,
  en,
  ja
}

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g

export function translate(
  locale: Locale,
  key: TranslationKey,
  values: TranslationValues = {}
): string {
  const template = catalogs[locale][key] ?? zhCN[key] ?? key
  return template.replace(
    PLACEHOLDER_PATTERN,
    (placeholder, name: string) =>
      (name in values ? String(values[name]) : placeholder)
  )
}
