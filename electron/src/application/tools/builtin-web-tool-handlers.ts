import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  type BuiltinToolHandler,
  type BuiltinToolHandlerInput
} from './builtin-tool-adapter'

type FetchPort = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export type WebToolDependencies = {
  fetch?: FetchPort
  search?: WebSearchDependencies
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 256 * 1024
const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_SEARCH_LIMIT = 5
const DEFAULT_SEARCH_TTL_MS = 5 * 60 * 1000
const SENSITIVE_QUERY_KEY =
  /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth|authorization|credential|key|password|secret|session|token)(?:$|[_-])/i

type WebSearchDependencies = {
  searxngBaseUrl?: string
  cache?: Map<string, WebSearchCacheEntry>
  now?: () => number
  ttlMs?: number
}

export type WebSearchCacheEntry = {
  expiresAt: number
  output: JsonObject
}

const webSearchCache = new Map<string, WebSearchCacheEntry>()

export function createWebToolHandlers(
  dependencies: WebToolDependencies = {}
): BuiltinToolHandler[] {
  const request = dependencies.fetch ?? fetch
  const search = normalizeSearchDependencies(dependencies.search)
  return [
    {
      name: 'web.fetch',
      version: '1.0.0',
      execute: (input) => executeWebFetch(input, request)
    },
    {
      name: 'web.search',
      version: '1.0.0',
      execute: (input) => executeWebSearch(input, request, search)
    }
  ]
}

async function executeWebFetch(
  input: BuiltinToolHandlerInput,
  request: FetchPort
): Promise<JsonObject> {
  const target = parseWebUrl(requiredString(input.arguments.url, 'url'))
  const mode = optionalMode(input.arguments.mode)
  const timeoutMs = optionalInteger(
    input.arguments.timeoutMs,
    'timeoutMs',
    DEFAULT_TIMEOUT_MS,
    1_000,
    30_000
  )
  const maxBytes = optionalInteger(
    input.arguments.maxBytes,
    'maxBytes',
    DEFAULT_MAX_BYTES,
    1_024,
    1_048_576
  )
  const maxRedirects = optionalInteger(
    input.arguments.maxRedirects,
    'maxRedirects',
    DEFAULT_MAX_REDIRECTS,
    0,
    10
  )
  const response = await fetchWithRedirects({
    target,
    request,
    signal: input.signal,
    timeoutMs,
    maxRedirects
  })
  const contentType = response.response.headers.get('content-type') ?? ''
  const contentLength = response.response.headers.get('content-length')
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > maxBytes
  ) {
    throw toolError(
      'web_response_too_large',
      `Response exceeded the ${maxBytes} byte limit`
    )
  }
  const body = await readBody(response.response, maxBytes, input.signal)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(body.bytes)
  const readable = mode === 'readable' && isHtml(contentType)
  const title = readable ? extractTitle(text) : ''
  const outputText = readable
    ? htmlToReadableText(text, response.finalUrl)
    : text
  const cleanText = normalizeWhitespace(outputText)
  return {
    url: sanitizeUrl(target),
    finalUrl: sanitizeUrl(response.finalUrl),
    status: response.response.status,
    contentType,
    title,
    text: cleanText,
    excerpt: cleanText.slice(0, 1000),
    truncated: body.truncated,
    bytesRead: body.bytesRead,
    contentHash: `sha256:${createHash('sha256').update(body.bytes).digest('hex')}`
  }
}

async function executeWebSearch(
  input: BuiltinToolHandlerInput,
  request: FetchPort,
  search: Required<WebSearchDependencies>
): Promise<JsonObject> {
  const query = requiredString(input.arguments.query, 'query').trim()
  if (query.length > 500) {
    throw toolError('web_arguments_invalid', 'query is outside the allowed range')
  }
  const provider = optionalProvider(input.arguments.provider)
  const limit = optionalInteger(
    input.arguments.limit,
    'limit',
    DEFAULT_SEARCH_LIMIT,
    1,
    20
  )
  const language = optionalString(input.arguments.language, 'language', 2, 16)
  const locale = optionalString(input.arguments.locale, 'locale', 2, 32)
  const recency = optionalEnum(input.arguments.recency, 'recency', [
    'day',
    'week',
    'month',
    'year',
    'any'
  ])
  const safeSearch = optionalEnum(input.arguments.safeSearch, 'safeSearch', [
    'strict',
    'moderate',
    'off'
  ])
  if (provider !== 'searxng') {
    return failedSearch(provider, 'provider_unconfigured', 'Only SearXNG search is supported.')
  }
  if (!search.searxngBaseUrl) {
    return failedSearch(
      'searxng',
      'provider_unconfigured',
      'Configure a SearXNG search provider to use web search.'
    )
  }
  const baseUrl = parseWebUrl(search.searxngBaseUrl)
  const cacheKey = searchCacheKey({
    provider,
    origin: `${baseUrl.protocol}//${baseUrl.host}`,
    query,
    limit,
    language,
    locale,
    recency,
    safeSearch
  })
  const now = search.now()
  const cached = search.cache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return { ...cached.output, cached: true }
  }
  const searchUrl = searxngSearchUrl(baseUrl, {
    query,
    limit,
    language,
    locale,
    recency,
    safeSearch
  })
  try {
    const response = await requestWithTimeout({
      request,
      url: stripCredentials(searchUrl),
      parentSignal: input.signal,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      init: {
        method: 'GET',
        redirect: 'follow',
        headers: {
          accept: 'application/json',
          'user-agent': 'RealmFlow-WebSearch/1.0'
        }
      }
    })
    if (!response.ok) {
      return failedSearch(
        provider,
        'provider_error',
        `SearXNG request failed with status ${response.status}`
      )
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return failedSearch(provider, 'provider_error', 'SearXNG returned invalid JSON')
    }
    const normalized = normalizeSearxngResults(payload, limit)
    const output = {
      status: 'ok',
      provider,
      queryHash: `sha256:${createHash('sha256').update(query).digest('hex')}`,
      results: normalized,
      cached: false
    } satisfies JsonObject
    search.cache.set(cacheKey, {
      expiresAt: now + search.ttlMs,
      output
    })
    return output
  } catch (error) {
    if (isToolError(error) && error.code === 'web_fetch_failed') {
      return failedSearch(provider, 'provider_error', error.message)
    }
    if (isToolError(error)) throw error
    return failedSearch(
      provider,
      'provider_error',
      sanitizeText(error instanceof Error ? error.message : 'Web search failed')
    )
  }
}

async function fetchWithRedirects(input: {
  target: URL
  request: FetchPort
  signal: AbortSignal
  timeoutMs: number
  maxRedirects: number
}): Promise<{ response: Response; finalUrl: URL }> {
  let current = input.target
  for (let redirectCount = 0; redirectCount <= input.maxRedirects; redirectCount++) {
    assertPublicHttpUrl(current)
    const response = await requestWithTimeout({
      request: input.request,
      url: stripCredentials(current),
      parentSignal: input.signal,
      timeoutMs: input.timeoutMs,
      init: {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept:
            'text/html,application/xhtml+xml,application/json,text/plain,text/markdown,text/csv,*/*;q=0.8',
          'user-agent': 'RealmFlow-WebFetch/1.0'
        }
      }
    })
    if (!isRedirect(response.status)) {
      const responseUrl =
        typeof response.url === 'string' && response.url
          ? parseWebUrl(response.url)
          : current
      assertPublicHttpUrl(responseUrl)
      return { response, finalUrl: responseUrl }
    }
    const location = response.headers.get('location')
    if (!location) return { response, finalUrl: current }
    if (redirectCount === input.maxRedirects) {
      throw toolError('web_redirect_limit', 'Redirect limit exceeded')
    }
    current = parseWebUrl(new URL(location, current).href)
  }
  throw toolError('web_redirect_limit', 'Redirect limit exceeded')
}

async function readBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<{ bytes: Uint8Array; bytesRead: number; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(), bytesRead: 0, truncated: false }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytesRead = 0
  let truncated = false
  try {
    while (true) {
      if (signal.aborted) throw signal.reason
      const next = await reader.read()
      if (next.done) break
      const chunk = next.value
      const remaining = maxBytes - bytesRead
      if (chunk.byteLength > remaining) {
        if (remaining > 0) {
          chunks.push(chunk.slice(0, remaining))
          bytesRead += remaining
        }
        truncated = true
        await reader.cancel()
        break
      }
      chunks.push(chunk)
      bytesRead += chunk.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(bytesRead)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, bytesRead, truncated }
}

function htmlToReadableText(html: string, baseUrl: URL): string {
  const selected =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html
  let value = selected
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, text) => {
      return `\n${'#'.repeat(Number(level))} ${decodeHtml(stripTags(text))}\n`
    })
    .replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, text) => {
      const label = decodeHtml(stripTags(text)).trim()
      const url = sanitizeUrl(new URL(decodeHtml(href), baseUrl))
      return label ? `[${label}](${url})` : url
    })
    .replace(/<(?:p|div|section|article|li|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  value = decodeHtml(value)
  return value
}

function extractTitle(html: string): string {
  return normalizeWhitespace(
    decodeHtml(stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''))
  ).slice(0, 300)
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ')
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalizeWhitespace(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

function isHtml(contentType: string): boolean {
  return /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)
}

function optionalMode(value: unknown): 'readable' | 'raw_text' {
  if (value === undefined) return 'readable'
  if (value === 'readable' || value === 'raw_text') return value
  throw toolError('web_arguments_invalid', 'Web fetch mode is invalid')
}

function optionalProvider(value: unknown): 'searxng' {
  if (value === undefined) return 'searxng'
  if (value === 'searxng') return value
  throw toolError('web_arguments_invalid', 'Web search provider is invalid')
}

function optionalEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[]
): T | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T
  throw toolError('web_arguments_invalid', `${name} is invalid`)
}

function optionalString(
  value: unknown,
  name: string,
  min: number,
  max: number
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw toolError('web_arguments_invalid', `${name} is invalid`)
  }
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) {
    throw toolError('web_arguments_invalid', `${name} is outside the allowed range`)
  }
  return trimmed
}

function optionalInteger(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined) return fallback
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw toolError('web_arguments_invalid', `${name} is outside the allowed range`)
  }
  return value
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw toolError('web_arguments_invalid', `${name} is required`)
  }
  return value
}

function parseWebUrl(value: string): URL {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw toolError('web_url_invalid', 'Only HTTP and HTTPS URLs are supported')
    }
    return url
  } catch (error) {
    if (isToolError(error)) throw error
    throw toolError('web_url_invalid', 'Web fetch URL is invalid')
  }
}

function assertPublicHttpUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw toolError('web_url_invalid', 'Only HTTP and HTTPS URLs are supported')
  }
  if (isPrivateHost(url.hostname)) {
    throw toolError(
      'web_private_network_blocked',
      'Private network targets are blocked by default'
    )
  }
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '0.0.0.0'
  ) {
    return true
  }
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) return isPrivateIpv4(normalized)
  if (ipVersion === 6) return isPrivateIpv6(normalized)
  return false
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part))
  const [first = 0, second = 0] = parts
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  )
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  )
}

function stripCredentials(url: URL): URL {
  const next = new URL(url.href)
  next.username = ''
  next.password = ''
  return next
}

export function sanitizedWebOrigin(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Web URL is unavailable')
  }
  const url = parseWebUrl(value)
  assertPublicHttpUrl(url)
  return `${url.protocol}//${url.host}`
}

function sanitizeUrl(url: URL): string {
  const auth = url.username || url.password ? '[redacted]@' : ''
  const query = [...url.searchParams.entries()]
    .map(([key, value]) =>
      `${encodeURIComponent(key)}=${SENSITIVE_QUERY_KEY.test(key) ? '[redacted]' : encodeURIComponent(value)}`
    )
    .join('&')
  return `${url.protocol}//${auth}${url.host}${url.pathname}${query ? `?${query}` : ''}${url.hash ? '#[redacted]' : ''}`
}

function normalizeSearchDependencies(
  value: WebSearchDependencies = {}
): Required<WebSearchDependencies> {
  return {
    searxngBaseUrl:
      value.searxngBaseUrl ??
      process.env.REALMFLOW_SEARXNG_URL ??
      process.env.SEARXNG_URL ??
      '',
    cache: value.cache ?? webSearchCache,
    now: value.now ?? (() => Date.now()),
    ttlMs: value.ttlMs ?? DEFAULT_SEARCH_TTL_MS
  }
}

function searxngSearchUrl(
  baseUrl: URL,
  input: {
    query: string
    limit: number
    language?: string
    locale?: string
    recency?: string
    safeSearch?: string
  }
): URL {
  const url = new URL(baseUrl.href)
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/search'
  } else if (!url.pathname.endsWith('/search')) {
    url.pathname = `${url.pathname.replace(/\/+$/u, '')}/search`
  }
  url.searchParams.set('q', input.query)
  url.searchParams.set('format', 'json')
  if (input.language) url.searchParams.set('language', input.language)
  if (input.locale) url.searchParams.set('locale', input.locale)
  if (input.recency && input.recency !== 'any') {
    url.searchParams.set('time_range', input.recency)
  }
  if (input.safeSearch) {
    url.searchParams.set(
      'safesearch',
      input.safeSearch === 'strict'
        ? '2'
        : input.safeSearch === 'moderate'
          ? '1'
          : '0'
    )
  }
  return url
}

function normalizeSearxngResults(payload: unknown, limit: number): JsonObject[] {
  const results =
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as { results?: unknown }).results)
      ? (payload as { results: unknown[] }).results
      : []
  const normalized: JsonObject[] = []
  for (const item of results) {
    if (normalized.length >= limit) break
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const url = typeof record.url === 'string' ? safeParseResultUrl(record.url) : undefined
    if (!url) continue
    const rank = normalized.length + 1
    const title =
      typeof record.title === 'string' && record.title.trim()
        ? sanitizeText(record.title.trim())
        : sanitizeUrl(url)
    const snippet =
      typeof record.content === 'string'
        ? sanitizeText(record.content).slice(0, 1000)
        : ''
    const source =
      typeof record.engine === 'string' && record.engine.trim()
        ? sanitizeText(record.engine.trim())
        : 'searxng'
    const publishedDate =
      typeof record.publishedDate === 'string'
        ? record.publishedDate
        : typeof record.published_date === 'string'
          ? record.published_date
          : ''
    const score =
      typeof record.score === 'number' && Number.isFinite(record.score)
        ? record.score
        : 1 / rank
    normalized.push({
      title,
      url: sanitizeUrl(url),
      snippet,
      source,
      publishedDate,
      provider: 'searxng',
      rank,
      confidence: { score }
    })
  }
  return normalized
}

function safeParseResultUrl(value: string): URL | undefined {
  try {
    const url = parseWebUrl(value)
    return url
  } catch {
    return undefined
  }
}

function searchCacheKey(input: JsonObject): string {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
}

function failedSearch(
  provider: string,
  code: string,
  message: string
): JsonObject {
  return {
    status: 'failed',
    error: { code, message: sanitizeText(message) },
    provider,
    results: [],
    cached: false
  }
}

async function withSanitizedErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isToolError(error)) throw error
    throw toolError(
      'web_fetch_failed',
      sanitizeText(error instanceof Error ? error.message : 'Web fetch failed')
    )
  }
}

function sanitizeText(value: string): string {
  return value.replace(
    /https?:\/\/(?:[^:@/\s]+(?::[^@/\s]*)?@)?[^\s]+/gi,
    (match) => sanitizeUrl(parseWebUrl(match))
  )
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

async function requestWithTimeout(input: {
  request: FetchPort
  url: URL
  init: RequestInit
  parentSignal: AbortSignal
  timeoutMs: number
}): Promise<Response> {
  const signal = timeoutSignal(input.parentSignal, input.timeoutMs)
  try {
    return await withSanitizedErrors(() =>
      input.request(input.url, { ...input.init, signal: signal.signal })
    )
  } finally {
    signal.dispose()
  }
}

function timeoutSignal(
  parent: AbortSignal,
  timeoutMs: number
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => {
    clearTimeout(timer)
    controller.abort(parent.reason)
  }
  if (parent.aborted) abort()
  else parent.addEventListener('abort', abort, { once: true })
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer)
    parent.removeEventListener('abort', abort)
  }, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      parent.removeEventListener('abort', abort)
    }
  }
}

function toolError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  return error
}

function isToolError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'string'
}
