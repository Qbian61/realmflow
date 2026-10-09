export type ResponseLanguageSnapshot = {
  locale: 'zh-CN' | 'en' | 'ja'
  source:
    | 'explicit_user_instruction'
    | 'latest_user_message'
    | 'application_locale'
  confidence: number
  allowMixedLanguage: boolean
}

export type ResponseLanguageAssessment =
  | 'match'
  | 'mismatch'
  | 'indeterminate'

export type ProviderRoundText = {
  kind: 'answer' | 'summary'
  text: string
  language: ResponseLanguageAssessment
}

export function resolveResponseLanguage(
  input: string,
  applicationLocale: ResponseLanguageSnapshot['locale'] = 'zh-CN'
): ResponseLanguageSnapshot {
  const explicit = explicitLocale(input)
  if (explicit) {
    return {
      locale: explicit,
      source: 'explicit_user_instruction',
      confidence: 1,
      allowMixedLanguage: false
    }
  }
  const natural = input
    .replace(/```[\s\S]*?```|`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+|(?:[./~][\w.-]+)+/g, ' ')
  const japanese = (natural.match(/[\u3040-\u30ff]/g) ?? []).length
  const chinese = (natural.match(/[\u3400-\u9fff]/g) ?? []).length
  const english = (natural.match(/[A-Za-z]/g) ?? []).length
  if (japanese >= 2) {
    return snapshot('ja', japanese, chinese + english)
  }
  if (chinese >= 2) {
    return snapshot('zh-CN', chinese, japanese + english)
  }
  if (english >= 4) {
    return snapshot('en', english, japanese + chinese)
  }
  return {
    locale: applicationLocale,
    source: 'application_locale',
    confidence: 0.5,
    allowMixedLanguage: false
  }
}

export function responseLanguagePolicy(
  snapshot: ResponseLanguageSnapshot
): string {
  return {
    'zh-CN':
      '回复语言策略：所有面向用户的正文、执行摘要、过程旁白和错误解释必须使用简体中文。代码、命令、路径、API 名称、产品名称和引用原文保持原语言。',
    en:
      'Response language policy: Use English for all user-facing answers, execution summaries, progress narration, and error explanations. Preserve code, commands, paths, API names, product names, and quoted source text in their original language.',
    ja:
      '応答言語ポリシー：ユーザー向けの回答、実行要約、進行説明、エラー説明は日本語で記述してください。コード、コマンド、パス、API 名、製品名、引用原文は元の言語を維持してください。'
  }[snapshot.locale]
}

export function assessResponseLanguage(
  text: string,
  snapshot: ResponseLanguageSnapshot
): ResponseLanguageAssessment {
  if (snapshot.allowMixedLanguage) return 'match'
  const natural = stripNonProse(text)
  const kana = (natural.match(/[\u3040-\u30ff]/g) ?? []).length
  const han = (natural.match(/[\u3400-\u9fff]/g) ?? []).length
  const latin = (natural.match(/[A-Za-z]/g) ?? []).length
  if (kana + han + latin < 4) return 'indeterminate'

  if (snapshot.locale === 'ja') {
    if (kana >= 2) return 'match'
    return latin >= 8 || han >= 4 ? 'mismatch' : 'indeterminate'
  }
  if (snapshot.locale === 'zh-CN') {
    if (han >= 2 && kana === 0) return 'match'
    return kana >= 2 || latin >= 8 ? 'mismatch' : 'indeterminate'
  }
  if (latin >= 8) return 'match'
  return kana >= 2 || han >= 4 ? 'mismatch' : 'indeterminate'
}

export class ProviderRoundTextBuffer {
  private text = ''
  private hasToolCall = false

  constructor(private readonly language: ResponseLanguageSnapshot) {}

  append(delta: string): void {
    this.text += delta
  }

  markToolCall(): void {
    this.hasToolCall = true
  }

  flush(): ProviderRoundText | undefined {
    const text = this.text.trim()
    if (!text) return undefined
    const language = assessResponseLanguage(text, this.language)
    return {
      kind: this.hasToolCall ? 'summary' : 'answer',
      text:
        this.hasToolCall && language === 'mismatch'
          ? ''
          : text,
      language
    }
  }
}

function snapshot(
  locale: ResponseLanguageSnapshot['locale'],
  primary: number,
  secondary: number
): ResponseLanguageSnapshot {
  return {
    locale,
    source: 'latest_user_message',
    confidence: primary / Math.max(1, primary + secondary),
    allowMixedLanguage: secondary / Math.max(1, primary) > 0.35
  }
}

function stripNonProse(input: string): string {
  return input
    .replace(/```[\s\S]*?```|`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(?:^|\s)(?:[./~][\w.-]+)+(?=\s|$)/g, ' ')
    .replace(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g, ' ')
}

function explicitLocale(
  input: string
): ResponseLanguageSnapshot['locale'] | undefined {
  if (
    /(?:使用|用|以)(?:简体)?中文(?:回复|回答)|answer\s+in\s+chinese/i.test(
      input
    )
  ) {
    return 'zh-CN'
  }
  if (/日本語で(?:返信|回答)|answer\s+in\s+japanese/i.test(input)) {
    return 'ja'
  }
  if (/用英语(?:回复|回答)|answer\s+in\s+english/i.test(input)) {
    return 'en'
  }
  return undefined
}
