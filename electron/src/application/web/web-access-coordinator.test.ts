import { describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION } from '../../../../shared/web-provider'
import { WebAccessCoordinator } from './web-access-coordinator'

const signal = new AbortController().signal
const call = {
  ownerKey: 'conversation-1',
  executionId: 'execution-1',
  runId: 'run-1',
  conversationId: 'conversation-1',
  authorityDigest: 'a'.repeat(64),
  scopeRoots: [],
  signal
}

describe('WebAccessCoordinator', () => {
  it('returns provider search results without opening a browser', async () => {
    const browser = browserRuntime()
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn().mockResolvedValue({
          status: 'ok',
          provider: 'searxng',
          results: [{ title: 'RealmFlow', url: 'https://example.com' }]
        }),
        fetch: vi.fn()
      },
      browser
    })

    await expect(
      coordinator.search(
        { query: 'RealmFlow' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal,
        call
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
    expect(browser.ensureCurrentSession).not.toHaveBeenCalled()
  })

  it('falls back once to the current run browser when the provider is unavailable', async () => {
    const browser = browserRuntime()
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn().mockResolvedValue({
          status: 'failed',
          provider: 'disabled',
          error: { code: 'provider_unconfigured' },
          results: []
        }),
        fetch: vi.fn()
      },
      browser
    })

    await expect(
      coordinator.search(
        { query: 'RealmFlow local first' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal,
        call
      )
    ).resolves.toMatchObject({
      status: 'ok',
      provider: 'browser',
      results: [expect.objectContaining({ title: 'Browser results' })],
      access: {
        preferredChannel: 'provider',
        actualChannel: 'browser',
        degraded: true,
        fallbackReason: 'provider_unconfigured',
        leaseCreated: true
      }
    })
    expect(browser.ensureCurrentSession).toHaveBeenCalledOnce()
    expect(browser.executeCurrent).toHaveBeenCalledOnce()
  })

  it('reports one logical failure when provider and browser both fail', async () => {
    const browser = browserRuntime()
    browser.executeCurrent.mockRejectedValue(new Error('navigation failed'))
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn().mockResolvedValue({
          status: 'failed',
          provider: 'disabled',
          error: { code: 'provider_unconfigured' },
          results: []
        }),
        fetch: vi.fn()
      },
      browser
    })

    await expect(
      coordinator.search(
        { query: 'RealmFlow' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal,
        call
      )
    ).rejects.toMatchObject({
      code: 'web_access_failed',
      logicalFailure: true,
      diagnostics: expect.objectContaining({
        attempts: expect.arrayContaining([
          expect.objectContaining({ channel: 'provider', status: 'failed' }),
          expect.objectContaining({ channel: 'browser', status: 'failed' })
        ])
      })
    })
  })

  it('never falls back for credential-bearing fetch URLs', async () => {
    const browser = browserRuntime()
    const coordinator = new WebAccessCoordinator({
      provider: {
        search: vi.fn(),
        fetch: vi.fn().mockRejectedValue(
          Object.assign(new Error('web_fetch_failed'), {
            code: 'web_fetch_failed'
          })
        )
      },
      browser
    })

    await expect(
      coordinator.fetch(
        { url: 'https://user:secret@example.com/private' },
        DEFAULT_WEB_PROVIDER_CONFIGURATION,
        signal,
        call
      )
    ).rejects.toMatchObject({ code: 'web_fetch_failed' })
    expect(browser.ensureCurrentSession).not.toHaveBeenCalled()
  })
})

function browserRuntime() {
  return {
    ensureCurrentSession: vi.fn().mockResolvedValue({
      id: 'browser-current',
      created: true
    }),
    executeCurrent: vi.fn().mockResolvedValue({
      url: 'https://search.example.com/?q=RealmFlow',
      title: 'Browser results',
      text: 'RealmFlow is a local-first workflow client.'
    } satisfies JsonObject)
  }
}
