export const RUNNABLE_CODE_LANGUAGES = [
  'javascript',
  'python',
  'shell'
] as const

export type RunnableCodeLanguage =
  (typeof RUNNABLE_CODE_LANGUAGES)[number]

export type CodeSnippet = {
  language: string
  content: string
  suggestedName: string
}

export type CodeSnippetRunResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  truncated: boolean
  durationMs: number
}

export type CodeSnippetApi = {
  run: (snippet: CodeSnippet) => Promise<CodeSnippetRunResult>
  save: (snippet: CodeSnippet) => Promise<string | null>
}

export function normalizeCodeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase()
  if (['js', 'jsx', 'node'].includes(normalized)) return 'javascript'
  if (['py', 'python3'].includes(normalized)) return 'python'
  if (['sh', 'bash', 'zsh'].includes(normalized)) return 'shell'
  if (['ts', 'tsx'].includes(normalized)) return 'typescript'
  return normalized || 'plaintext'
}

export function isRunnableCodeLanguage(
  language: string
): language is RunnableCodeLanguage {
  return RUNNABLE_CODE_LANGUAGES.includes(
    normalizeCodeLanguage(language) as RunnableCodeLanguage
  )
}
