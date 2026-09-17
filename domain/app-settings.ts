export type AppLocale = 'zh-CN' | 'en-US' | 'ja-JP'
export type AppTheme = 'light' | 'dark' | 'system'

export type WorkRoot = {
  id: string
  path: string
  isCurrent: boolean
  createdAt: number
  lastUsedAt: number
}

export type AppSettings = {
  locale: AppLocale
  theme: AppTheme
  currentWorkRootId?: string
}
