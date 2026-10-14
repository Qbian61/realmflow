// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION as defaults } from '../../../../shared/web-provider'
import type { WebProviderConfiguration } from '../../../../shared/web-provider'
import { WebProviderRuntime, type WebProviderRuntimeDependencies } from './web-provider-runtime'
import { readWebResponse } from './web-response'

const configuration: WebProviderConfiguration = {
  ...defaults, revision: 1, searchProvider: 'searxng',
  searxngBaseUrl: 'http://127.0.0.1:18884/instance'
}
const signal = () => new AbortController().signal
async function runtime(options: WebProviderRuntimeDependencies = {}) {
  return new WebProviderRuntime(options)
}
const payload = async () => Response.json({ results: [
  { title: 'Guide', url: 'https://example.com/guide', content: 'A useful guide', engine: 'docs' }
] })

afterEach(() => vi.useRealTimers())
describe('Web Provider runtime', () => {
  it('keeps search disabled even when environment variables exist', async () => {
    vi.stubEnv('SEARXNG_URL', 'https://implicit.example')
    const fetch = vi.fn<typeof globalThis.fetch>(payload)
    try {
      const service = await runtime({ fetch })
      expect(await service.search({ query: 'guide' }, defaults, signal())).toMatchObject({
        status: 'failed', provider: 'disabled', error: { code: 'provider_unconfigured' }
      })
      expect(fetch).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })

  it('uses the explicit local endpoint and normalizes source, rank, hash and truncation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(payload)
    const service = await runtime({ fetch })
    expect(await service.search({ query: 'guide', safeSearch: 'strict' }, configuration, signal()))
      .toMatchObject({
        status: 'ok', provider: 'searxng', truncated: false,
        contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        results: [{ source: 'docs', rank: 1, url: 'https://example.com/guide' }]
      })
    expect(String(fetch.mock.calls[0]?.[0])).toContain('http://127.0.0.1:18884/instance/search?')
    expect(String(fetch.mock.calls[0]?.[0])).toContain('safesearch=2')
  })

  it('isolates bounded cache entries by complete endpoint, arguments and revision', async () => {
    const fetch = vi.fn(payload)
    const service = await runtime({ fetch, cacheLimit: 2 })
    const search = (query: string, config = configuration) => service.search({ query }, config, signal())
    await search('a')
    expect(await search('a')).toMatchObject({ cached: true })
    await search('a', { ...configuration, revision: 2 })
    await search('a', { ...configuration, searxngBaseUrl: 'http://127.0.0.1:18884/other' })
    expect(await search('a')).toMatchObject({ cached: false })
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('uses only the selected Brave endpoint and resolves its authorized credential handle', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ web: { results: [
      { title: 'Brave guide', url: 'https://example.com', description: 'Guide' }
    ] } }))
    const resolveCredential = vi.fn(() => 'test-provider-key')
    const service = await runtime({ fetch, resolveCredential })
    const brave = { ...configuration, searchProvider: 'brave', hasBraveCredential: true,
      braveCredentialHandle: 'web-credential-brave' } as const
    expect(await service.search({ query: 'guide', language: 'en', recency: 'week' }, brave, signal()))
      .toMatchObject({ status: 'ok', provider: 'brave', results: [{ provider: 'brave', rank: 1 }] })
    expect(resolveCredential).toHaveBeenCalledWith('web-credential-brave', 1)
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toContain('https://api.search.brave.com/res/v1/web/search?')
    expect(String(url)).toContain('freshness=pw')
    expect(new Headers(init?.headers).get('x-subscription-token')).toBe('test-provider-key')
  })

  it('does not follow provider redirects or echo credentials from transport errors', async () => {
    const fetch = vi.fn(async (_url, init) => {
      expect(init.redirect).toBe('manual')
      return new Response(null, { status: 302, headers: { location: 'https://other.example' } })
    })
    const service = await runtime({ fetch, resolveCredential: () => 'test-key' })
    const brave = { ...configuration, searchProvider: 'brave', hasBraveCredential: true,
      braveCredentialHandle: 'web-credential-brave' } as const
    expect(await service.search({ query: 'guide' }, brave, signal()))
      .toMatchObject({ status: 'failed', error: { code: 'provider_error' } })
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockRejectedValueOnce(new Error('test-key'))
    expect(JSON.stringify(await service.search({ query: 'guide' }, brave, signal()))).not.toContain('test-key')
  })

  it('rejects malformed or oversized responses and does not cache errors', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ unexpected: [] }))
      .mockResolvedValueOnce(new Response('x'.repeat(300_000)))
      .mockImplementation(payload)
    const service = await runtime({ fetch })
    for (let index = 0; index < 2; index++) {
      expect(await service.search({ query: 'guide' }, configuration, signal()))
        .toMatchObject({ status: 'failed', cached: false })
    }
    expect(await service.search({ query: 'guide' }, configuration, signal())).toMatchObject({ status: 'ok' })
  })

  it('keeps the deadline active until a stalled response body finishes', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => new Response(new ReadableStream({ start() {} })))
    const service = await runtime({ fetch, timeoutMs: 100 })
    const result = service.search({ query: 'guide' }, configuration, signal())
    await vi.advanceTimersByTimeAsync(101)
    expect(await result).toMatchObject({ status: 'failed', error: { code: 'web_timeout' } })
  })

  it('honors cancellation while reading the body and never caches cancelled requests', async () => {
    const fetch = vi.fn(async () => new Response(new ReadableStream({ start() {} })))
    const service = await runtime({ fetch })
    const controller = new AbortController()
    const result = service.search({ query: 'guide' }, configuration, controller.signal)
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
  })

  it('extracts malformed HTML with decoded entities and safe links', async () => {
    const service = await runtime({ fetch: async () => new Response(
      '<title>Guide &#9731;</title><main><h1>Guide</h1><p>Use &#x41; &copy;'
      + '<p><a href=/docs>Docs</a><a href=javascript:alert(1)>unsafe</a>'
      + '<script>secret()</script><nav>menu</nav></main>',
      { headers: { 'content-type': 'text/html' } }
    ) })
    expect(await service.fetch({ url: 'https://example.com' }, defaults, signal())).toMatchObject({
      provider: 'native', title: 'Guide ☃', text: expect.stringContaining('Use A ©')
    })
    const output = await service.fetch({ url: 'https://example.com' }, defaults, signal())
    expect(output.text).toContain('[Docs](https://example.com/docs)')
    expect(output.text).not.toMatch(/secret|javascript:|menu/)
  })

  it('returns an explicit browser continuation for JS shells only when configured', async () => {
    const fetch = vi.fn(async () => new Response('<html><body><div id="root"></div><script src="app.js"></script></body></html>',
      { headers: { 'content-type': 'text/html' } }))
    const service = await runtime({ fetch })
    const output = await service.fetch({ url: 'https://example.com/app' },
      { ...defaults, browserContinuation: true }, signal())
    expect(output).toMatchObject({
      status: 200, provider: 'native', outcome: 'browser_required',
      continuation: { url: 'https://example.com/app',
        tools: ['builtin.browser.create', 'builtin.browser.navigate', 'builtin.browser.snapshot'] }
    })
    expect(await service.fetch({ url: 'https://example.com/app' }, defaults, signal()))
      .not.toHaveProperty('continuation')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('blocks arbitrary local fetch targets and cross-origin redirects beyond the approved origin', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302,
      headers: { location: 'https://unapproved.example/target' } }))
    const service = await runtime({ fetch })
    await expect(service.fetch({ url: 'http://127.0.0.1' }, defaults, signal()))
      .rejects.toMatchObject({ code: 'web_private_network_blocked' })
    expect(fetch).not.toHaveBeenCalled()
    await expect(service.fetch({ url: 'https://example.com' }, defaults, signal()))
      .rejects.toMatchObject({ code: 'web_redirect_origin_changed' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('blocks public hostnames that resolve to private network addresses before fetching', async () => {
    const fetch = vi.fn(async () => new Response('should not fetch'))
    const service = await runtime({
      fetch,
      resolveHost: async () => [{ address: '127.0.0.1', family: 4 }]
    })

    await expect(
      service.fetch({ url: 'https://rebind.example/private' }, defaults, signal())
    ).rejects.toMatchObject({ code: 'web_private_network_blocked' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    'http://[::127.0.0.1]/private',
    'http://[64:ff9b::a9fe:a9fe]/metadata',
    'http://[2002:0a00:0001::]/private'
  ])('blocks IPv6 literal aliases for private targets before fetching %s', async (url) => {
    const fetch = vi.fn(async () => new Response('should not fetch'))
    const service = await runtime({ fetch })

    await expect(service.fetch({ url }, defaults, signal()))
      .rejects.toMatchObject({ code: 'web_private_network_blocked' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks resolved IPv6 aliases for metadata addresses before fetching', async () => {
    const fetch = vi.fn(async () => new Response('should not fetch'))
    const service = await runtime({
      fetch,
      resolveHost: async () => [{ address: '64:ff9b::a9fe:a9fe', family: 6 }]
    })

    await expect(
      service.fetch({ url: 'https://metadata-alias.example' }, defaults, signal())
    ).rejects.toMatchObject({ code: 'web_private_network_blocked' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('revalidates DNS after same-origin redirects before the next request', async () => {
    const fetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: '/next' }
    }))
    let lookups = 0
    const service = await runtime({
      fetch,
      resolveHost: async () =>
        lookups++ === 0
          ? [{ address: '93.184.216.34', family: 4 }]
          : [{ address: '10.0.0.8', family: 4 }]
    })

    await expect(
      service.fetch({ url: 'https://example.com/start' }, defaults, signal())
    ).rejects.toMatchObject({ code: 'web_private_network_blocked' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('classifies private-network redirects before following them', async () => {
    const fetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/private' }
    }))
    const service = await runtime({
      fetch,
      resolveHost: async () => [{ address: '93.184.216.34', family: 4 }]
    })

    await expect(
      service.fetch({ url: 'https://example.com/start' }, defaults, signal())
    ).rejects.toMatchObject({ code: 'web_private_network_blocked' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('drops sensitive request headers before following same-origin redirects', async () => {
    const seenHeaders: Headers[] = []
    const fetch = vi.fn(async (_url, init) => {
      seenHeaders.push(new Headers(init?.headers))
      return seenHeaders.length === 1
        ? new Response(null, { status: 302, headers: { location: '/next' } })
        : new Response('ok')
    })

    await readWebResponse({
      request: fetch,
      url: new URL('https://example.com/start'),
      signal: signal(),
      timeoutMs: 1000,
      maxBytes: 1024,
      maxRedirects: 1,
      publicOnly: true,
      resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
      headers: {
        accept: 'text/html',
        authorization: 'Bearer secret-token',
        cookie: 'session=secret',
        'x-subscription-token': 'provider-secret'
      }
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(seenHeaders[0]?.get('authorization')).toBe('Bearer secret-token')
    expect(seenHeaders[1]?.get('authorization')).toBeNull()
    expect(seenHeaders[1]?.get('cookie')).toBeNull()
    expect(seenHeaders[1]?.get('x-subscription-token')).toBeNull()
    expect(seenHeaders[1]?.get('accept')).toBe('text/html')
  })
})
