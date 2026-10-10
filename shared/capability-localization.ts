import { browserCapabilityDisplay } from './browser-capability-localization'

export type CapabilityLocale = 'zh-CN' | 'en' | 'ja'

export type CapabilityDisplayText = {
  name: string
  description: string
}

export type LocalizedCapabilityDisplay = CapabilityDisplayText & {
  requestedLocale: string
  resolvedLocale: string
}

export type LocalizedCapabilityMetadata = Readonly<
  Record<string, CapabilityDisplayText>
>

export function resolveCapabilityDisplay(
  canonical: CapabilityDisplayText,
  localizedMetadata: LocalizedCapabilityMetadata | undefined,
  requestedLocale: string,
  defaultLocale = 'en'
): LocalizedCapabilityDisplay {
  const language = requestedLocale.split('-')[0]
  const candidates = [
    requestedLocale,
    language,
    defaultLocale
  ]
  for (const locale of candidates) {
    const display = localizedMetadata?.[locale]
    if (display) {
      return {
        ...display,
        requestedLocale,
        resolvedLocale: locale
      }
    }
  }
  return {
    ...canonical,
    requestedLocale,
    resolvedLocale: 'canonical'
  }
}

export function localizeBuiltinCapability(
  id: string,
  canonical: CapabilityDisplayText,
  locale: CapabilityLocale
): LocalizedCapabilityDisplay {
  if (locale === 'en') {
    return {
      ...canonical,
      requestedLocale: locale,
      resolvedLocale: 'en'
    }
  }
  const browser = browserCapabilityDisplay(id, locale)
  if (browser) return { ...browser, requestedLocale: locale, resolvedLocale: locale }
  const name = localizedName(id, canonical.name, locale)
  return {
    name,
    description:
      locale === 'zh-CN'
        ? `RealmFlow 内置能力：${name}`
        : `RealmFlow 組み込み機能：${name}`,
    requestedLocale: locale,
    resolvedLocale: locale
  }
}

export function localizeCapability(
  id: string,
  canonical: CapabilityDisplayText,
  source: string,
  locale: CapabilityLocale,
  localizedMetadata?: LocalizedCapabilityMetadata
): LocalizedCapabilityDisplay {
  if (localizedMetadata) {
    return resolveCapabilityDisplay(
      canonical,
      localizedMetadata,
      locale,
      'en'
    )
  }
  return source === 'builtin'
    ? localizeBuiltinCapability(id, canonical, locale)
    : {
        ...canonical,
        requestedLocale: locale,
        resolvedLocale: 'canonical'
      }
}

function localizedName(
  id: string,
  canonicalName: string,
  locale: Exclude<CapabilityLocale, 'en'>
): string {
  const exact = EXACT_NAMES[locale][id]
  if (exact) return exact
  const tokens = canonicalName
    .replace(/[._/-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const dictionary = WORDS[locale]
  const translated = tokens.map((token) => dictionary[token.toLowerCase()])
  if (translated.every(Boolean)) {
    return locale === 'zh-CN'
      ? translated.join('')
      : translated.join('・')
  }
  const suffix = id.split('.').at(-1)?.replaceAll('_', ' ') ?? canonicalName
  return locale === 'zh-CN'
    ? `内置能力 · ${suffix}`
    : `組み込み機能 · ${suffix}`
}

const EXACT_NAMES: Readonly<
  Record<Exclude<CapabilityLocale, 'en'>, Readonly<Record<string, string>>>
> = {
  'zh-CN': {
    'builtin.documents.read': '读取文档',
    'builtin.files.read': '读取文件',
    'builtin.files.write': '写入文件'
  },
  ja: {
    'builtin.documents.read': 'ドキュメントを読み取る',
    'builtin.files.read': 'ファイルを読み取る',
    'builtin.files.write': 'ファイルを書き込む'
  }
}

const WORDS: Readonly<
  Record<Exclude<CapabilityLocale, 'en'>, Readonly<Record<string, string>>>
> = {
  'zh-CN': {
    read: '读取',
    write: '写入',
    create: '创建',
    update: '更新',
    delete: '删除',
    list: '列出',
    search: '搜索',
    export: '导出',
    import: '导入',
    verify: '验证',
    file: '文件',
    files: '文件',
    document: '文档',
    documents: '文档',
    spreadsheet: '电子表格',
    presentation: '演示文稿',
    archive: '压缩包',
    knowledge: '知识',
    workflow: '工作流',
    requirement: '需求',
    artifact: '产物',
    artifacts: '产物',
    connector: '连接器',
    agent: '智能体',
    skill: '技能'
  },
  ja: {
    read: '読み取り',
    write: '書き込み',
    create: '作成',
    update: '更新',
    delete: '削除',
    list: '一覧',
    search: '検索',
    export: 'エクスポート',
    import: 'インポート',
    verify: '検証',
    file: 'ファイル',
    files: 'ファイル',
    document: 'ドキュメント',
    documents: 'ドキュメント',
    spreadsheet: 'スプレッドシート',
    presentation: 'プレゼンテーション',
    archive: 'アーカイブ',
    knowledge: 'ナレッジ',
    workflow: 'ワークフロー',
    requirement: '要件',
    artifact: '成果物',
    artifacts: '成果物',
    connector: 'コネクター',
    agent: 'エージェント',
    skill: 'スキル'
  }
}
