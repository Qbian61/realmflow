import { describe, expect, it, vi } from 'vitest'
import { normalizeMcpServerConfiguration } from '../../../../domain/mcp-server'
import { SdkMcpClientFactory } from './sdk-mcp-client-factory'

describe('SdkMcpClientFactory', () => {
  it('starts stdio with bounded environment and resolved credential references', async () => {
    const harness = createHarness()
    const factory = new SdkMcpClientFactory(harness.dependencies)
    const configuration = normalizeMcpServerConfiguration({
      id: 'local-search',
      name: 'Local Search',
      enabled: true,
      transport: {
        kind: 'stdio',
        command: '/usr/bin/node',
        arguments: ['server.js'],
        environmentCredentialIds: {
          API_TOKEN: 'credential-api-token'
        }
      }
    })

    const connection = await factory.connect(configuration)

    expect(harness.resolveCredential).toHaveBeenCalledWith(
      'credential-api-token'
    )
    expect(harness.createStdioTransport).toHaveBeenCalledWith({
      command: '/managed/sandbox',
      args: ['--isolated', '/usr/bin/node', 'server.js'],
      env: {
        HOME: '/Users/test',
        PATH: '/usr/bin',
        API_TOKEN: 'resolved-secret'
      },
      stderr: 'pipe',
      maxBufferSize: 4 * 1024 * 1024
    })
    expect(harness.wrapStdio).toHaveBeenCalledWith({
      executable: '/usr/bin/node',
      arguments: ['server.js'],
      cwd: process.cwd()
    })
    expect(harness.client.connect).toHaveBeenCalledWith(
      harness.transport
    )
    expect(connection.serverIdentity).toEqual({
      name: 'remote-server',
      version: '2.0.0',
      protocolVersion: '2025-11-25'
    })
  })

  it('starts Streamable HTTP with credential headers and audits the connection', async () => {
    const harness = createHarness()
    const factory = new SdkMcpClientFactory(harness.dependencies)
    const configuration = normalizeMcpServerConfiguration({
      id: 'remote-search',
      name: 'Remote Search',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        headerCredentialIds: {
          Authorization: 'credential-http-auth'
        }
      }
    })

    await factory.connect(configuration)

    expect(harness.createHttpTransport).toHaveBeenCalledWith(
      new URL('https://mcp.example.com/rpc'),
      {
        requestInit: {
          headers: { Authorization: 'resolved-secret' }
        },
        redirectPolicy: 'same-origin',
        reconnectionOptions: {
          initialReconnectionDelay: 500,
          maxReconnectionDelay: 10_000,
          reconnectionDelayGrowFactor: 2,
          maxRetries: 3
        }
      }
    )
    expect(harness.auditStart).toHaveBeenCalledWith({
      serverId: 'remote-search',
      transportKind: 'streamable_http'
    })
    expect(harness.auditFinish).toHaveBeenCalledWith(
      'audit-1',
      'succeeded'
    )
  })

  it('maps SDK calls, progress and cancellation to the MCP Client Port', async () => {
    const harness = createHarness()
    const factory = new SdkMcpClientFactory(harness.dependencies)
    const configuration = normalizeMcpServerConfiguration({
      id: 'remote-search',
      name: 'Remote Search',
      enabled: true,
      transport: {
        kind: 'streamable_http',
        url: 'https://mcp.example.com/rpc',
        headerCredentialIds: {}
      }
    })
    const connection = await factory.connect(configuration)
    const progress = vi.fn()
    const controller = new AbortController()

    await expect(connection.listTools()).resolves.toEqual([
      {
        name: 'search',
        description: 'Search',
        inputSchema: { type: 'object' }
      }
    ])
    await expect(
      connection.callTool(
        { name: 'search', arguments: { query: 'realmflow' } },
        {
          signal: controller.signal,
          progressToken: 'attempt-1',
          onProgress: progress
        }
      )
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'ok' }]
    })
    expect(progress).toHaveBeenCalledWith({
      progress: 1,
      total: 2,
      message: 'Working'
    })

    harness.client.callTool.mockImplementationOnce(
      async (_input, _schema, options) => {
        harness.setLastCallSignal(options.signal)
        await new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('cancelled')),
            { once: true }
          )
        })
        return { content: [] }
      }
    )
    const pending = connection.callTool(
      { name: 'search', arguments: { query: 'cancel me' } },
      {
        signal: controller.signal,
        progressToken: 'attempt-1',
        onProgress: progress
      }
    )
    await connection.cancel('attempt-1')
    expect(harness.lastCallSignal?.aborted).toBe(true)
    await expect(pending).rejects.toThrow('cancelled')
  })
})

function createHarness() {
  const transport = { close: vi.fn() }
  let lastCallSignal: AbortSignal | undefined
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    getServerVersion: vi.fn().mockReturnValue({
      name: 'remote-server',
      version: '2.0.0'
    }),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'search',
          description: 'Search',
          inputSchema: { type: 'object' }
        }
      ]
    }),
    callTool: vi.fn().mockImplementation(async (_input, _schema, options) => {
      lastCallSignal = options.signal
      await options.onprogress({
        progress: 1,
        total: 2,
        message: 'Working'
      })
      return { content: [{ type: 'text', text: 'ok' }] }
    }),
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  }
  const createStdioTransport = vi.fn().mockReturnValue(transport)
  const createHttpTransport = vi.fn().mockReturnValue(transport)
  const resolveCredential = vi.fn().mockResolvedValue('resolved-secret')
  const auditStart = vi.fn().mockResolvedValue('audit-1')
  const auditFinish = vi.fn().mockResolvedValue(undefined)
  const wrapStdio = vi.fn().mockResolvedValue({
    executable: '/managed/sandbox',
    arguments: ['--isolated', '/usr/bin/node', 'server.js']
  })
  return {
    transport,
    client,
    createStdioTransport,
    createHttpTransport,
    resolveCredential,
    auditStart,
    auditFinish,
    wrapStdio,
    get lastCallSignal() {
      return lastCallSignal
    },
    setLastCallSignal(signal: AbortSignal) {
      lastCallSignal = signal
    },
    dependencies: {
      credentials: { resolve: resolveCredential },
      environment: () => ({
        HOME: '/Users/test',
        PATH: '/usr/bin',
        SECRET_FROM_PARENT: 'must-not-leak'
      }),
      audit: { start: auditStart, finish: auditFinish },
      sandbox: { wrapStdio },
      sdk: {
        protocolVersion: '2025-11-25',
        createClient: vi.fn().mockReturnValue(client),
        createStdioTransport,
        createHttpTransport
      }
    }
  }
}
