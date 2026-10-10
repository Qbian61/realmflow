import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { WebProviderConfiguration } from '../../../../shared/web-provider'
import { normalizeWebText, readableWebContent } from './web-readable-content'
import {
  hashWebContent, parseWebUrl, readWebResponse, sanitizeWebUrl, webError,
  type WebRequestPort
} from './web-response'
import {
  normalizeWebSearchResults, webEnum, webInteger, webSearchProviders, webText
} from './web-search-providers'

export type WebFetchProvider = {
  id: string
  fetch(args: JsonObject, configuration: WebProviderConfiguration, signal: AbortSignal): Promise<JsonObject>
}
export type WebProviderRuntimeDependencies = {
  fetch?: WebRequestPort
  resolveCredential?: (handle: string, revision: number) => string
  now?: () => number
  timeoutMs?: number
  cacheLimit?: number
  ttlMs?: number
}

/** One instance per Main composition. Neither environment nor model arguments select credentials. */
export class WebProviderRuntime implements WebFetchProvider {
  readonly id = 'native'
  private readonly cache = new Map<string, { expiresAt: number; output: JsonObject }>()
  private readonly request: WebRequestPort
  constructor(private readonly dependencies: WebProviderRuntimeDependencies = {}) {
    this.request = dependencies.fetch ?? fetch
  }

  async search(args: JsonObject, config: WebProviderConfiguration, signal: AbortSignal): Promise<JsonObject> {
    signal.throwIfAborted()
    const query = webText(args.query, 500)
    const provider = config.searchProvider
    // Provider selection is a user setting, not a model-controlled override.
    if (args.provider !== undefined) throw webError('web_arguments_invalid')
    const command = {
      query,
      limit: webInteger(args.limit, 5, 1, 20),
      language: args.language === undefined ? undefined : webText(args.language, 16),
      locale: args.locale === undefined ? undefined : webText(args.locale, 32),
      recency: webEnum(args.recency, ['day', 'week', 'month', 'year', 'any']),
      safeSearch: webEnum(args.safeSearch, ['strict', 'moderate', 'off'])
    }
    if (provider === 'disabled') return failed(provider, 'provider_unconfigured')
    const key = hashWebContent(JSON.stringify({ command, config }))
    const now = (this.dependencies.now ?? Date.now)()
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > now) return { ...structuredClone(cached.output), cached: true }
    this.cache.delete(key)
    try {
      const adapter = webSearchProviders[provider]
      const url = adapter.request(command, config)
      const headers: Record<string, string> = { accept: 'application/json' }
      if (provider === 'brave') {
        if (!config.hasBraveCredential || !config.braveCredentialHandle || !this.dependencies.resolveCredential) {
          return failed(provider, 'web_credential_unavailable')
        }
        headers['x-subscription-token'] = this.dependencies.resolveCredential(config.braveCredentialHandle, config.revision)
      }
      const response = await readWebResponse({
        request: this.request, url, signal, headers,
        timeoutMs: this.dependencies.timeoutMs ?? 15_000,
        maxBytes: 256 * 1024, maxRedirects: 0
      })
      if (!response.response.ok || response.truncated) return failed(provider, 'provider_error')
      const payload: unknown = JSON.parse(new TextDecoder().decode(response.bytes))
      const results = normalizeWebSearchResults(adapter.results(payload), provider, command.limit)
      const output: JsonObject = {
        status: 'ok', provider, sourceUrl: sanitizeWebUrl(url),
        queryHash: hashWebContent(query), contentHash: hashWebContent(JSON.stringify(results)),
        results, cached: false, truncated: false
      }
      signal.throwIfAborted()
      for (const [cacheKey, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(cacheKey)
      const limit = Math.max(1, this.dependencies.cacheLimit ?? 64)
      while (this.cache.size >= limit) this.cache.delete(this.cache.keys().next().value!)
      this.cache.set(key, { expiresAt: now + (this.dependencies.ttlMs ?? 300_000), output: structuredClone(output) })
      return output
    } catch (error) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      return failed(provider, error instanceof Error && error.message === 'web_timeout' ? 'web_timeout' : 'provider_error')
    }
  }

  async fetch(args: JsonObject, config: WebProviderConfiguration, signal: AbortSignal): Promise<JsonObject> {
    const target = parseWebUrl(webText(args.url, 8192))
    const mode = webEnum(args.mode, ['readable', 'raw_text']) ?? 'readable'
    const response = await readWebResponse({
      request: this.request, url: target, signal,
      timeoutMs: webInteger(args.timeoutMs, this.dependencies.timeoutMs ?? 15_000, 1000, 30_000),
      maxBytes: webInteger(args.maxBytes, 256 * 1024, 1024, 1_048_576),
      maxRedirects: webInteger(args.maxRedirects, 5, 0, 10),
      publicOnly: true,
      headers: { accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8' }
    })
    const contentType = response.response.headers.get('content-type') ?? ''
    const html = /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)
    const rawText = new TextDecoder().decode(response.bytes)
    const readable = mode === 'readable' && html
      ? readableWebContent(rawText, response.finalUrl)
      : { title: '', text: normalizeWebText(rawText) }
    const needsBrowser = config.browserContinuation && mode === 'readable' && html &&
      response.response.ok && readable.text.length < 80 && /<script\b/i.test(rawText)
    return {
      provider: 'native', outcome: needsBrowser ? 'browser_required' : 'fetched',
      url: sanitizeWebUrl(target), finalUrl: sanitizeWebUrl(response.finalUrl),
      sourceUrl: sanitizeWebUrl(response.finalUrl), status: response.response.status, contentType,
      ...readable, excerpt: readable.text.slice(0, 1000),
      truncated: response.truncated, bytesRead: response.bytes.byteLength,
      contentHash: hashWebContent(response.bytes),
      ...(needsBrowser ? { continuation: {
        url: sanitizeWebUrl(response.finalUrl),
        tools: ['builtin.browser.create', 'builtin.browser.navigate', 'builtin.browser.snapshot'],
        instruction: 'Static content is insufficient. Request browser create, navigate, then snapshot through the normal tool permission flow.'
      } } : {})
    }
  }
}

function failed(provider: string, code: string): JsonObject {
  return { status: 'failed', provider, error: { code, message: code }, results: [], cached: false }
}
