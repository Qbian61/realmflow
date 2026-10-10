// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION as defaults } from '../../../../shared/web-provider'
import type { WebProviderConfiguration } from '../../../../shared/web-provider'
import { WebProviderRuntime, type WebProviderRuntimeDependencies } from './web-provider-runtime'

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
})
