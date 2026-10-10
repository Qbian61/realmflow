import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { WebProviderConfiguration } from '../../../../shared/web-provider'
import { hashWebContent, parseWebUrl, sanitizeWebUrl, webError } from './web-response'

export const BRAVE_SEARCH_ORIGIN = 'https://api.search.brave.com'
export type WebSearchCommand = {
  query: string
  limit: number
  language?: string
  locale?: string
  recency?: string
  safeSearch?: string
}
export type WebSearchProvider = {
  id: 'searxng' | 'brave'
  request(command: WebSearchCommand, config: WebProviderConfiguration): URL
  results(payload: unknown): unknown[]
}

export const webSearchProviders: Record<'searxng' | 'brave', WebSearchProvider> = {
  searxng: {
    id: 'searxng',
    request(command, config) {
      const url = parseWebUrl(config.searxngBaseUrl)
      if (!url.pathname.endsWith('/search')) url.pathname = `${url.pathname.replace(/\/+$/, '')}/search`
      url.searchParams.set('q', command.query)
      url.searchParams.set('format', 'json')
      if (command.language) url.searchParams.set('language', command.language)
      if (command.locale) url.searchParams.set('locale', command.locale)
      if (command.recency && command.recency !== 'any') url.searchParams.set('time_range', command.recency)
      if (command.safeSearch) url.searchParams.set('safesearch',
        command.safeSearch === 'strict' ? '2' : command.safeSearch === 'moderate' ? '1' : '0')
      return url
    },
    results(payload) {
      if (!isRecord(payload) || !Array.isArray(payload.results)) throw webError('web_response_invalid')
      return payload.results
    }
  },
  brave: {
    id: 'brave',
    request(command) {
      const url = new URL('/res/v1/web/search', BRAVE_SEARCH_ORIGIN)
      url.searchParams.set('q', command.query)
      url.searchParams.set('count', String(command.limit))
      if (command.language) url.searchParams.set('search_lang', command.language)
      if (command.locale) url.searchParams.set('ui_lang', command.locale)
      if (command.safeSearch) url.searchParams.set('safesearch', command.safeSearch)
      const freshness = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[command.recency ?? '']
      if (freshness) url.searchParams.set('freshness', freshness)
      return url
    },
    results(payload) {
      if (!isRecord(payload) || !isRecord(payload.web) || !Array.isArray(payload.web.results)) {
        throw webError('web_response_invalid')
      }
      return payload.web.results
    }
  }
}

export function normalizeWebSearchResults(items: unknown[], provider: string, limit: number): JsonObject[] {
  const results: JsonObject[] = []
  for (const item of items) {
    if (results.length >= limit) break
    if (!isRecord(item) || typeof item.url !== 'string') continue
    let url: string
    try { url = sanitizeWebUrl(parseWebUrl(item.url)) } catch { continue }
    const title = text(item.title, 300) || url
    const rawSnippet = provider === 'brave' ? item.description : item.content
    const snippet = text(rawSnippet, 1000)
    const rank = results.length + 1
    results.push({
      title, url, snippet, provider, rank,
      source: text(item.engine, 100) || provider,
      publishedDate: text(item.publishedDate ?? item.published_date ?? item.page_age, 100),
      confidence: { score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 1 / rank },
      contentHash: hashWebContent(JSON.stringify({ title, url, snippet })),
      truncated: typeof rawSnippet === 'string' && rawSnippet.length > 1000
    })
  }
  return results
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/https?:\/\/[^\s<>]+/gi, (url) => {
    try { return sanitizeWebUrl(parseWebUrl(url)) } catch { return '[invalid URL]' }
  }).trim().slice(0, max)
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function webText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw webError('web_arguments_invalid')
  return value.trim()
}
export function webInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw webError('web_arguments_invalid')
  return value
}
export function webEnum(value: unknown, choices: readonly string[]): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !choices.includes(value)) throw webError('web_arguments_invalid')
  return value
}
