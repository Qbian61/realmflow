export type SidecarHealth = {
  status: 'ok'
  service: 'realmflow-agent'
}

export type SidecarInfo = {
  name: 'RealmFlow Agent'
  version: string
  transport: 'HTTP/SSE'
}

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export class SidecarClient {
  private readonly baseUrl: string

  constructor(
    baseUrl: string,
    private readonly request: Fetch = fetch
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  async getHealth(): Promise<SidecarHealth> {
    const payload = await this.getJson('/health')
    if (
      !isRecord(payload) ||
      payload.status !== 'ok' ||
      payload.service !== 'realmflow-agent'
    ) {
      throw new Error('Invalid Sidecar health response')
    }
    return payload as SidecarHealth
  }

  async getInfo(): Promise<SidecarInfo> {
    const payload = await this.getJson('/api/v1/info')
    if (
      !isRecord(payload) ||
      payload.name !== 'RealmFlow Agent' ||
      typeof payload.version !== 'string' ||
      payload.version.length === 0 ||
      payload.transport !== 'HTTP/SSE'
    ) {
      throw new Error('Invalid Sidecar info response')
    }
    return payload as SidecarInfo
  }

  private async getJson(path: string): Promise<unknown> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(2_000)
    })
    if (!response.ok) {
      throw new Error(`Sidecar request failed with status ${response.status}`)
    }
    return response.json() as Promise<unknown>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
