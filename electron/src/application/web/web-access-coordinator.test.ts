import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION } from '../../../../shared/web-provider'
import { WebAccessCoordinator } from './web-access-coordinator'

const signal = new AbortController().signal

describe('WebAccessCoordinator', () => {
  it('returns provider search results without opening a browser', async () => {
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn().mockResolvedValue({
          status: 'ok',
          provider: 'searxng',
          results: [{ title: 'RealmFlow', url: 'https://example.com' }]
        }),
        fetch: vi.fn()
      }
    })

    await expect(
      coordinator.search(
        { query: 'RealmFlow' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal
      )
    ).resolves.toMatchObject({
      status: 'ok',
      provider: 'searxng',
      access: {
        preferredChannel: 'provider',
        actualChannel: 'provider',
        degraded: false
      }
    })
  })

  it('does not open a browser fallback when the provider is unavailable', async () => {
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn().mockResolvedValue({
          status: 'failed',
          provider: 'disabled',
          error: { code: 'provider_unconfigured' },
          results: []
        }),
        fetch: vi.fn()
      }
    })

    await expect(
      coordinator.search(
        { query: 'RealmFlow local first' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal
      )
    ).rejects.toMatchObject({
      code: 'web_access_failed',
      logicalFailure: true,
      diagnostics: {
        attempts: [
          {
            channel: 'provider',
            status: 'failed',
            reason: 'provider_unconfigured'
          }
        ]
      }
    })
  })

  it('returns browser continuation from fetch without controlling a browser session', async () => {
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn(),
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          provider: 'native',
          outcome: 'browser_required',
          url: 'https://example.com/app',
          continuation: {
            url: 'https://example.com/app',
            tools: [
              'builtin.browser.create',
              'builtin.browser.navigate',
              'builtin.browser.snapshot'
            ],
            instruction:
              'Request browser tools through the normal permission flow.'
          }
        })
      }
    })

    await expect(
      coordinator.fetch(
        { url: 'https://example.com/app' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal
      )
    ).resolves.toMatchObject({
      outcome: 'browser_required',
      continuation: {
        url: 'https://example.com/app',
        tools: [
          'builtin.browser.create',
          'builtin.browser.navigate',
          'builtin.browser.snapshot'
        ]
      },
      access: {
        preferredChannel: 'provider',
        actualChannel: 'provider',
        degraded: false,
        attempts: [
          { channel: 'provider', status: 'succeeded' }
        ]
      }
    })
  })

  it('never falls back for credential-bearing fetch URLs', async () => {
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn(),
        fetch: vi.fn().mockRejectedValue(
          Object.assign(new Error('web_fetch_failed'), {
            code: 'web_fetch_failed'
          })
        )
      }
    })

    await expect(
      coordinator.fetch(
        { url: 'https://user:secret@example.com/private' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal
      )
    ).rejects.toMatchObject({ code: 'web_fetch_failed' })
  })
})
