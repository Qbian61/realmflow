import type {
  TranslationKey,
  TranslationValues
} from '../../localization/translate'

export type ToastLevel =
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'system'

export type ToastRequest = {
  level: ToastLevel
  messageKey: TranslationKey
  values?: TranslationValues
  dedupeKey?: string
}

export type ToastMessage = ToastRequest & {
  id: string
  createdAt: number
}
