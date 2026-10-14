import type {
  JsonObject
} from '../../../../domain/tool-protocol-validation'
import type {
  WebProviderConfiguration
} from '../../../../shared/web-provider'

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

type WebAccessAttempt = {
  channel: 'provider'
  status: 'succeeded' | 'failed'
  reason?: string
}

export class WebAccessCoordinator {
  constructor(
    private readonly dependencies: {
      provider: WebProviderPort
    }
  ) {}

  async search(
    args: JsonObject,
    configuration: WebProviderConfiguration,
    signal: AbortSignal
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
    throw logicalFailure(attempts)
  }

  async fetch(
    args: JsonObject,
    configuration: WebProviderConfiguration,
    signal: AbortSignal
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
      throw logicalFailure(attempts)
    }
    if (provider.outcome !== 'browser_required') {
      return {
        ...provider,
        access: accessDetails('provider', false, [
          { channel: 'provider', status: 'succeeded' }
        ])
      }
    }
    return {
      ...provider,
      access: accessDetails('provider', false, [
        { channel: 'provider', status: 'succeeded' }
      ])
    }
  }
}

function accessDetails(
  actualChannel: 'provider',
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
