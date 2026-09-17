import { randomBytes } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ModelExecutionConfig } from '../../../domain/model'

const MAX_REQUEST_BYTES = 1024 * 1024
const GRANT_TTL_MS = 2 * 60 * 1000

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

type ModelGrant = {
  model: ModelExecutionConfig
  expiresAt: number
}

type NetworkGatewayOptions = {
  request?: Fetch
  createToken?: () => string
  now?: () => number
}

export type SidecarModelExecutionConfig =
  | {
      providerType: 'local'
      modelId: string
    }
  | {
      providerType: 'openai_compatible'
      modelId: string
      gateway: {
        url: string
        token: string
      }
    }

export class NetworkGateway {
  private readonly request: Fetch
  private readonly createToken: () => string
  private readonly now: () => number
  private readonly grants = new Map<string, ModelGrant>()
  private server: Server | undefined
  private baseUrl: string | undefined

  constructor(options: NetworkGatewayOptions = {}) {
    this.request = options.request ?? fetch
    this.createToken =
      options.createToken ?? (() => randomBytes(32).toString('base64url'))
    this.now = options.now ?? Date.now
  }

  async start(): Promise<void> {
    if (this.server) return
    const server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    this.server = server
    this.baseUrl = `http://127.0.0.1:${address.port}`
  }

  async stop(): Promise<void> {
    this.grants.clear()
    this.baseUrl = undefined
    const server = this.server
    this.server = undefined
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  getBaseUrl(): string {
    if (!this.baseUrl) throw new Error('Network gateway is unavailable')
    return this.baseUrl
  }

  authorize(model: ModelExecutionConfig): SidecarModelExecutionConfig {
    if (model.providerType === 'local') {
      return {
        providerType: model.providerType,
        modelId: model.modelId
      }
    }
    if (!model.apiKey) {
      throw new Error('Provider credential is required')
    }
    const token = this.createToken()
    this.grants.set(token, {
      model,
      expiresAt: this.now() + GRANT_TTL_MS
    })
    return {
      providerType: model.providerType,
      modelId: model.modelId,
      gateway: {
        url: `${this.getBaseUrl()}/v1/model/chat-completions`,
        token
      }
    }
  }

  revoke(model: SidecarModelExecutionConfig): void {
    if ('gateway' in model) this.grants.delete(model.gateway.token)
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    if (
      request.method !== 'POST' ||
      request.url !== '/v1/model/chat-completions'
    ) {
      writeJson(response, 404, { error: 'Not found' })
      return
    }
    const token = bearerToken(request.headers.authorization)
    const grant = token ? this.consumeGrant(token) : undefined
    if (!grant) {
      writeJson(response, 401, { error: 'Invalid network grant' })
      return
    }
    try {
      const body = await readJsonBody(request)
      const messages = requireMessages(body)
      const providerResponse = await this.request(
        `${grant.model.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${grant.model.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: grant.model.modelId,
            messages
          }),
          signal: AbortSignal.timeout(120_000)
        }
      )
      response.statusCode = providerResponse.status
      response.setHeader(
        'Content-Type',
        providerResponse.headers.get('Content-Type') ?? 'application/json'
      )
      response.end(await providerResponse.text())
    } catch (error) {
      writeJson(response, 502, {
        error:
          error instanceof Error ? error.message : 'Provider request failed'
      })
    }
  }

  private consumeGrant(token: string): ModelGrant | undefined {
    const grant = this.grants.get(token)
    this.grants.delete(token)
    if (!grant || grant.expiresAt < this.now()) return undefined
    return grant
  }
}

function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length)
  if (!token) return undefined
  return token
}

async function readJsonBody(
  request: IncomingMessage
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid network gateway request')
  }
  return parsed as Record<string, unknown>
}

function requireMessages(
  body: Record<string, unknown>
): Array<{ role: string; content: string }> {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new Error('Model messages are required')
  }
  return body.messages.map((message) => {
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      typeof (message as { role?: unknown }).role !== 'string' ||
      typeof (message as { content?: unknown }).content !== 'string'
    ) {
      throw new Error('Invalid model message')
    }
    return {
      role: (message as { role: string }).role,
      content: (message as { content: string }).content
    }
  })
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>
): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}
