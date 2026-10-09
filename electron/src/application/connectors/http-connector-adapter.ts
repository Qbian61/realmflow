import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  ConnectorRequestError,
  type ConnectorRequestAuthentication,
  type ConnectorRequestInput,
  type ConnectorResponse
} from '../../network/network-gateway'
import {
  ConnectorGatewayError,
  type ConnectorProtocolAdapter,
  type EffectiveConnectorSnapshot
} from './connector-gateway'

type HttpConnectorAdapterDependencies = {
  network: {
    requestConnector(input: ConnectorRequestInput): Promise<ConnectorResponse>
  }
  resolveCredential(handle: string): Promise<string>
}

export class HttpConnectorAdapter implements ConnectorProtocolAdapter {
  constructor(private readonly dependencies: HttpConnectorAdapterDependencies) {}

  async invoke(input: {
    snapshot: EffectiveConnectorSnapshot
    arguments: JsonObject
    idempotencyKey?: string
    correlationId: string
    causationId: string
    signal?: AbortSignal
  }): Promise<{ output: JsonObject }> {
    const protocol = input.snapshot.action.protocol
    if (protocol.kind !== 'http') {
      throw new Error('HTTP Connector action is invalid')
    }
    const url = buildUrl(
      protocol.baseUrl,
      protocol.pathTemplate,
      protocol.method,
      input.arguments
    )
    assertNetworkTarget(input.snapshot, url)
    const authentication = await this.resolveAuthentication(
      protocol.authentication,
      input.snapshot
    )
    const body =
      protocol.method === 'GET' || protocol.method === 'HEAD'
        ? undefined
        : JSON.stringify(remainingArguments(protocol.pathTemplate, input.arguments))
    try {
      const response = await this.dependencies.network.requestConnector({
        connectorId: input.snapshot.installationId,
        url,
        method: protocol.method,
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body
            }),
        authentication,
        timeoutMs: input.snapshot.action.timeoutMs,
        maxRetries: input.snapshot.action.operation === 'read' ? 2 : 0,
        idempotencyKey:
          input.idempotencyKey ??
          `${input.correlationId}:${input.causationId}`,
        owner: {
          type: 'application',
          id: input.snapshot.installationId
        },
        callType: 'connector',
        ...(input.signal ? { signal: input.signal } : {})
      })
      return { output: parseJsonObject(response.body) }
    } catch (error) {
      if (error instanceof ConnectorRequestError) {
        throw new ConnectorGatewayError(
          `connector_${error.code}`,
          'Connector HTTP request failed',
          ['target_unavailable', 'request_timeout', 'audit_unavailable'].includes(
            error.code
          ),
          error.code !== 'audit_unavailable'
        )
      }
      throw error
    }
  }

  private async resolveAuthentication(
    authentication: HttpProtocol['authentication'],
    snapshot: EffectiveConnectorSnapshot
  ): Promise<ConnectorRequestAuthentication> {
    if (authentication.type === 'none') return { type: 'none' }
    const handle = snapshot.credentialHandles[authentication.credentialRef]
    if (!handle) {
      throw new ConnectorGatewayError(
        'connector_credential_unavailable',
        'Connector credential is unavailable',
        false
      )
    }
    const credential = await this.dependencies.resolveCredential(handle)
    return authentication.type === 'bearer'
      ? { type: 'bearer', credential }
      : {
          type: 'api_key_header',
          headerName: authentication.headerName,
          credential
        }
  }
}

type HttpProtocol = Extract<
  EffectiveConnectorSnapshot['action']['protocol'],
  { kind: 'http' }
>

function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  method: HttpProtocol['method'],
  arguments_: JsonObject
): string {
  const used = new Set<string>()
  const path = pathTemplate.replace(/\{([A-Za-z0-9._:-]+)\}/g, (_, name) => {
    const value = arguments_[name]
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new ConnectorGatewayError(
        'connector_path_parameter_invalid',
        'Connector path parameter is invalid',
        false
      )
    }
    used.add(name)
    return encodeURIComponent(String(value))
  })
  if (path.includes('{') || path.includes('}')) {
    throw new ConnectorGatewayError(
      'connector_path_parameter_invalid',
      'Connector path parameter is invalid',
      false
    )
  }
  const url = new URL(`${baseUrl}${path}`)
  if (method === 'GET' || method === 'HEAD') {
    for (const [name, value] of Object.entries(arguments_)) {
      if (used.has(name) || value === undefined || value === null) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        url.searchParams.append(name, String(value))
      } else if (
        Array.isArray(value) &&
        value.every((item) =>
          ['string', 'number', 'boolean'].includes(typeof item)
        )
      ) {
        for (const item of value) url.searchParams.append(name, String(item))
      } else {
        throw new ConnectorGatewayError(
          'connector_query_parameter_invalid',
          'Connector query parameter is invalid',
          false
        )
      }
    }
  }
  return url.toString()
}

function remainingArguments(
  pathTemplate: string,
  arguments_: JsonObject
): JsonObject {
  const names = new Set(
    [...pathTemplate.matchAll(/\{([A-Za-z0-9._:-]+)\}/g)].map(
      (match) => match[1]
    )
  )
  return Object.fromEntries(
    Object.entries(arguments_).filter(([name]) => !names.has(name))
  ) as JsonObject
}

function assertNetworkTarget(
  snapshot: EffectiveConnectorSnapshot,
  url: string
): void {
  const target = new URL(url)
  const allowed = snapshot.permissionCeiling.networkTargets.some((entry) => {
    const candidate = new URL(entry)
    return (
      candidate.origin === target.origin &&
      (candidate.pathname === '/' ||
        target.pathname.startsWith(candidate.pathname.replace(/\/+$/, '')))
    )
  })
  if (!allowed) {
    throw new ConnectorGatewayError(
      'connector_target_denied',
      'Connector network target is outside the permission ceiling',
      false
    )
  }
}

function parseJsonObject(bytes: Uint8Array): JsonObject {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object')
    }
    return value as JsonObject
  } catch {
    throw new ConnectorGatewayError(
      'connector_response_invalid',
      'Connector HTTP response is not a JSON object',
      false,
      true
    )
  }
}
