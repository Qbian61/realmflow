import { describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { createWebToolHandlers } from './builtin-web-tool-handlers'
import { WebProviderRuntime } from '../web/web-provider-runtime'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION } from '../../../../shared/web-provider'

describe('builtin web Tool handlers', () => {
  it('fetches public HTML and returns deterministic readable text', async () => {
    const request = vi.fn(async () =>
      new Response(
        `<!doctype html>
          <html>
            <head><title>RealmFlow Guide</title></head>
            <body>
              <nav>Ignore navigation</nav>
              <main>
                <h1>RealmFlow Guide</h1>
                <p>Build local-first workflows.</p>
                <a href="/docs">Read docs</a>
              </main>
              <script>secret()</script>
            </body>
          </html>`,
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        }
      )
    )

    await expect(
      run(
        {
          url: 'https://example.com/guide?token=secret-token',
          mode: 'readable',
          maxBytes: 10_000
        },
        request
      )
    ).resolves.toMatchObject({
      url: 'https://example.com/guide?token=[redacted]',
      finalUrl: 'https://example.com/guide?token=[redacted]',
      status: 200,
      contentType: 'text/html; charset=utf-8',
      title: 'RealmFlow Guide',
      text: expect.stringContaining('# RealmFlow Guide'),
      excerpt: expect.stringContaining('Build local-first workflows.'),
      truncated: false,
      bytesRead: expect.any(Number),
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    })
    const text = (await run(
      {
        url: 'https://example.com/guide',
        mode: 'readable',
        maxBytes: 10_000
      },
      request
    )) as { text: string }
    expect(text.text).toContain('[Read docs](https://example.com/docs)')
    expect(text.text).not.toContain('secret()')
  })

  it('returns raw text for structured text resources without HTML conversion', async () => {
    const request = vi.fn(async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )

    await expect(
      run(
        {
          url: 'https://api.example.com/data',
          mode: 'raw_text'
        },
        request
      )
    ).resolves.toMatchObject({
      finalUrl: 'https://api.example.com/data',
      contentType: 'application/json',
      text: '{"ok":true}',
      title: '',
      truncated: false
    })
  })

  it('blocks localhost and private network targets before fetching', async () => {
    const request = vi.fn(async () => new Response('should not fetch'))

    await expect(
      run({ url: 'http://127.0.0.1:8080/private' }, request)
    ).rejects.toMatchObject({
      code: 'web_private_network_blocked'
    })
    await expect(
      run({ url: 'http://[::1]/private' }, request)
    ).rejects.toMatchObject({
      code: 'web_private_network_blocked'
    })
    await expect(
      run({ url: 'https://localhost/private' }, request)
    ).rejects.toMatchObject({
      code: 'web_private_network_blocked'
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('redacts credentials and token-like query values from outputs and errors', async () => {
    const redirected = vi.fn(async () => {
      const response = new Response('<html><title>Secret</title></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })
      Object.defineProperty(response, 'url', {
        value: 'https://user:pass@example.com/next?api_key=secret-key'
      })
      return response
    })

    await expect(
      run(
        {
          url: 'https://user:pass@example.com/start?token=secret-token'
        },
        redirected
      )
    ).resolves.toMatchObject({
      url: 'https://[redacted]@example.com/start?token=[redacted]',
      finalUrl: 'https://[redacted]@example.com/next?api_key=[redacted]'
    })

    const failing = vi.fn(async () => {
      throw new Error(
        'Failed https://user:pass@example.com/start?token=secret-token'
      )
    })
    await expect(
      run(
        {
          url: 'https://user:pass@example.com/start?token=secret-token'
        },
        failing
      )
    ).rejects.toMatchObject({
      message: 'web_fetch_failed'
    })
  })

  it('returns a structured unconfigured result without contacting a search provider', async () => {
    const request = vi.fn(async () => new Response('{}'))

    await expect(
      runSearch({ query: 'realmflow local first' }, request)
    ).resolves.toEqual({
      status: 'failed',
      error: {
        code: 'provider_unconfigured',
        message: 'provider_unconfigured'
      },
      provider: 'disabled',
      results: [],
      cached: false
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('normalizes SearXNG results and caches repeated queries for a short TTL', async () => {
    const request = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'RealmFlow',
              url: 'https://user:pass@example.com/docs?token=secret',
              content: 'Local-first workflow docs',
              engine: 'docs',
              publishedDate: '2026-10-01'
            },
            {
              title: 'Ignored',
              url: 'file:///tmp/ignored',
              content: 'not web'
            }
          ]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    )
    const cache = new Map()

    await expect(
      runSearch(
        {
          query: 'realmflow',
          limit: 3,
          language: 'en',
          locale: 'en-US',
          recency: 'month',
          safeSearch: 'strict'
        },
        request,
        {
          searxngBaseUrl: 'https://search.example.com',
          cache,
          now: () => 1000
        }
      )
    ).resolves.toMatchObject({
      status: 'ok',
      provider: 'searxng',
      cached: false,
      results: [
        {
          title: 'RealmFlow',
          url: 'https://[redacted]@example.com/docs?token=[redacted]',
          snippet: 'Local-first workflow docs',
          source: 'docs',
          publishedDate: '2026-10-01',
          provider: 'searxng',
          rank: 1,
          confidence: { score: 1 }
        }
      ],
      queryHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    })
    await expect(
      runSearch(
        {
          query: 'realmflow',
          limit: 3,
          language: 'en',
          locale: 'en-US',
          recency: 'month',
          safeSearch: 'strict'
        },
        request,
        {
          searxngBaseUrl: 'https://search.example.com',
          cache,
          now: () => 2000
        }
      )
    ).resolves.toMatchObject({
      status: 'ok',
      provider: 'searxng',
      cached: true,
      results: [
        {
          title: 'RealmFlow',
          url: 'https://[redacted]@example.com/docs?token=[redacted]'
        }
      ]
    })
    expect(request).toHaveBeenCalledOnce()
    const requestCalls = request.mock.calls as unknown as Array<
      [string | URL | Request, RequestInit?]
    >
    const requestedUrl = String(requestCalls[0]?.[0])
    expect(requestedUrl).toContain('https://search.example.com/search?')
    expect(requestedUrl).toContain('q=realmflow')
    expect(requestedUrl).toContain('format=json')
    expect(requestedUrl).toContain('language=en')
    expect(requestedUrl).toContain('safesearch=2')
  })

  it('surfaces provider failures without leaking configured credentials', async () => {
    const request = vi.fn(async () => {
      throw new Error('GET https://user:pass@search.example.com/search failed')
    })

    await expect(
      runSearch({ query: 'realmflow' }, request, {
        searxngBaseUrl: 'https://user:pass@search.example.com'
      })
    ).resolves.toEqual({
      status: 'failed',
      error: {
        code: 'provider_error',
        message: 'provider_error'
      },
      provider: 'searxng',
      results: [],
      cached: false
    })
  })

  async function run(
    arguments_: JsonObject,
    request: typeof fetch
  ): Promise<JsonObject> {
    const handler = createWebToolHandlers(new WebProviderRuntime({ fetch: request })).find(
      (candidate) => candidate.name === 'web.fetch'
    )
    if (!handler) throw new Error('Missing handler')
    return handler.execute({
      arguments: arguments_,
      requestedBy: { type: 'model', id: 'model-1' },
      context: {
        owner: { type: 'application', id: 'realmflow' },
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots: [],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }

  const runtimes = new WeakMap<Map<string, unknown>, WebProviderRuntime>()
  async function runSearch(
    arguments_: JsonObject,
    request: typeof fetch,
    options: {
      searxngBaseUrl?: string
      cache?: Map<string, unknown>
      now?: () => number
    } = {}
  ): Promise<JsonObject> {
    let runtime = options.cache ? runtimes.get(options.cache) : undefined
    if (!runtime) {
      runtime = new WebProviderRuntime({ fetch: request, now: options.now })
      if (options.cache) runtimes.set(options.cache, runtime)
    }
    const handler = createWebToolHandlers(runtime).find((candidate) => candidate.name === 'web.search')
    if (!handler) throw new Error('Missing handler')
    return handler.execute({
      arguments: arguments_,
      webConfiguration: {
        ...DEFAULT_WEB_PROVIDER_CONFIGURATION,
        searchProvider: options.searxngBaseUrl ? 'searxng' : 'disabled',
        searxngBaseUrl: options.searxngBaseUrl ?? ''
      },
      requestedBy: { type: 'model', id: 'model-1' },
      context: {
        owner: { type: 'application', id: 'realmflow' },
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots: [],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }
})
