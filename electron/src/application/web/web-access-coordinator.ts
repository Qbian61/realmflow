import type {
  JsonObject
} from '../../../../domain/tool-protocol-validation'
import type {
  WebProviderConfiguration
} from '../../../../shared/web-provider'
import type {
  BrowserCallContext
} from '../browser/browser-runtime-port'

type WebProviderPort = {
  search(
    args: JsonObject,
    configuration: WebProviderConfiguration,
    signal: AbortSignal
  ): Promise<JsonObject>
  fetch(
    args: JsonObject,
    configuration: WebProviderConfiguration,
    signal: AbortSignal
  ): Promise<JsonObject>
}

type BrowserFallbackPort = {
  ensureCurrentSession(
    call: BrowserCallContext
  ): Promise<{ id: string; created: boolean }>
  executeCurrent(
    action: 'navigate',
    args: JsonObject,
    call: BrowserCallContext
  ): Promise<JsonObject>
}

type WebAccessAttempt = {
  channel: 'provider' | 'browser'
  status: 'succeeded' | 'failed'
  reason?: string
}

export class WebAccessCoordinator {
  constructor(
    private readonly dependencies: {
      provider: WebProviderPort
      browser?: BrowserFallbackPort
      searchOrigin?: string
    }
  ) {}

  async search(
    args: JsonObject,
    configuration: WebProviderConfiguration,
    signal: AbortSignal,
    call: BrowserCallContext
  ): Promise<JsonObject> {
    const attempts: WebAccessAttempt[] = []
    const provider = await this.dependencies.provider.search(
      args,
      configuration,
      signal
    )
    if (provider.status === 'ok') {
      attempts.push({ channel: 'provider', status: 'succeeded' })
      return {
        ...provider,
        access: accessDetails('provider', false, attempts)
      }
    }
    const reason = webFailureCode(provider) ?? 'provider_error'
    attempts.push({ channel: 'provider', status: 'failed', reason })
    if (!this.dependencies.browser) {
      throw logicalFailure(attempts)
    }
    try {
      const query = requiredString(args.query, 'query')
      const target = new URL(
        this.dependencies.searchOrigin ??
          'https://www.google.com/search'
      )
      target.searchParams.set('q', query)
      const session = await this.dependencies.browser.ensureCurrentSession(
        call
      )
      const snapshot = await this.dependencies.browser.executeCurrent(
        'navigate',
        {
          target: { kind: 'current_run' },
          url: target.toString()
        },
        call
      )
      attempts.push({ channel: 'browser', status: 'succeeded' })
      return {
        status: 'ok',
        provider: 'browser',
        results: [browserSearchResult(snapshot)],
        cached: false,
        access: {
          ...accessDetails('browser', true, attempts),
          fallbackReason: reason,
          leaseCreated: session.created
        }
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason
      attempts.push({
        channel: 'browser',
        status: 'failed',
        reason: safeCode(error)
      })
      throw logicalFailure(attempts)
    }
  }

  async fetch(
    args: JsonObject,
    configuration: WebProviderConfiguration,
    signal: AbortSignal,
    call: BrowserCallContext
  ): Promise<JsonObject> {
    const requestedUrl = requiredString(args.url, 'url')
    if (!allowsBrowserFallback(requestedUrl)) {
      return this.dependencies.provider.fetch(args, configuration, signal)
    }
    const attempts: WebAccessAttempt[] = []
    let provider: JsonObject
    try {
      provider = await this.dependencies.provider.fetch(
        args,
        configuration,
        signal
      )
    } catch (error) {
      if (!isRecoverableFetchFailure(error)) throw error
      attempts.push({
        channel: 'provider',
        status: 'failed',
        reason: safeCode(error)
      })
      return this.browserFetch(
        requestedUrl,
        call,
        attempts,
        signal
      )
    }
    if (provider.outcome !== 'browser_required') {
      return {
        ...provider,
        access: accessDetails('provider', false, [
          { channel: 'provider', status: 'succeeded' }
        ])
      }
    }
    attempts.push({
      channel: 'provider',
      status: 'failed',
      reason: 'browser_required'
    })
    const continuation = provider.continuation
    const target =
      isObject(continuation) && typeof continuation.url === 'string'
        ? continuation.url
        : requestedUrl
    return this.browserFetch(target, call, attempts, signal)
  }

  private async browserFetch(
    url: string,
    call: BrowserCallContext,
    attempts: WebAccessAttempt[],
    signal: AbortSignal
  ): Promise<JsonObject> {
    if (!this.dependencies.browser) throw logicalFailure(attempts)
    try {
      const session = await this.dependencies.browser.ensureCurrentSession(
        call
      )
      const snapshot = await this.dependencies.browser.executeCurrent(
        'navigate',
        { target: { kind: 'current_run' }, url },
        call
      )
      attempts.push({ channel: 'browser', status: 'succeeded' })
      return {
        provider: 'browser',
        outcome: 'fetched',
        ...snapshot,
        access: {
          ...accessDetails('browser', true, attempts),
          fallbackReason: attempts[0]?.reason ?? 'provider_error',
          leaseCreated: session.created
        }
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason
      attempts.push({
        channel: 'browser',
        status: 'failed',
        reason: safeCode(error)
      })
      throw logicalFailure(attempts)
    }
  }
}

function browserSearchResult(snapshot: JsonObject): JsonObject {
  return {
    title:
      typeof snapshot.title === 'string'
        ? snapshot.title
        : 'Browser search results',
    url: typeof snapshot.url === 'string' ? snapshot.url : '',
    snippet:
      typeof snapshot.text === 'string'
        ? snapshot.text.slice(0, 1_000)
        : '',
    source: 'browser',
    provider: 'browser',
    rank: 1,
    confidence: { score: 0.5 }
  }
}

function accessDetails(
  actualChannel: 'provider' | 'browser',
  degraded: boolean,
  attempts: readonly WebAccessAttempt[]
): JsonObject {
  return {
    preferredChannel: 'provider',
    actualChannel,
    degraded,
    attempts: attempts.map((attempt) => ({ ...attempt }))
  }
}

function logicalFailure(attempts: readonly WebAccessAttempt[]): Error & {
  code: 'web_access_failed'
  logicalFailure: true
  diagnostics: JsonObject
} {
  return Object.assign(new Error('Web access failed'), {
    code: 'web_access_failed' as const,
    logicalFailure: true as const,
    diagnostics: {
      attempts: attempts.map((attempt) => ({ ...attempt }))
    }
  })
}

function webFailureCode(output: JsonObject): string | undefined {
  return isObject(output.error) && typeof output.error.code === 'string'
    ? output.error.code
    : undefined
}

function allowsBrowserFallback(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !isPrivateHostname(url.hostname)
    )
  } catch {
    return false
  }
}

function isPrivateHostname(hostname: string): boolean {
  const value = hostname.toLocaleLowerCase()
  return (
    value === 'localhost' ||
    value === '::1' ||
    value.endsWith('.local') ||
    /^127\./.test(value) ||
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^169\.254\./.test(value) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(value)
  )
}

function isRecoverableFetchFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'web_fetch_failed' ||
      error.code === 'web_redirect_blocked' ||
      error.code === 'web_timeout')
  )
}

function safeCode(error: unknown): string {
  return error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'operation_failed'
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Web ${field} is required`)
  }
  return value
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
