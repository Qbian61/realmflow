import { describe, expect, it } from 'vitest'
import {
  calculateMcpServerIdentity,
  normalizeMcpServerConfiguration
} from './mcp-server'

describe('MCP server configuration', () => {
  it('normalizes stdio identity without embedding credential values', () => {
    const configuration = normalizeMcpServerConfiguration({
      id: 'local-search',
      name: 'Local Search',
      enabled: true,
      transport: {
        kind: 'stdio',
        command: '/usr/bin/node',
        arguments: ['server.js'],
        environmentCredentialIds: {
          API_TOKEN: 'credential-mcp-token'
        }
      }
    })

    expect(configuration.identity).toBe(
      calculateMcpServerIdentity(configuration)
    )
    expect(configuration.identity).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(configuration)).not.toContain('secret-value')
  })

  it('accepts HTTPS and loopback HTTP but rejects remote plaintext HTTP', () => {
    expect(
      normalizeMcpServerConfiguration({
        id: 'remote-search',
        name: 'Remote Search',
        enabled: true,
        transport: {
          kind: 'streamable_http',
          url: 'https://mcp.example.com/rpc',
          headerCredentialIds: {
            Authorization: 'credential-mcp-auth'
          }
        }
      }).transport.kind
    ).toBe('streamable_http')
    expect(
      normalizeMcpServerConfiguration({
        id: 'local-http',
        name: 'Local HTTP',
        enabled: true,
        transport: {
          kind: 'streamable_http',
          url: 'http://127.0.0.1:3000/mcp',
          headerCredentialIds: {}
        }
      }).transport.kind
    ).toBe('streamable_http')
    expect(() =>
      normalizeMcpServerConfiguration({
        id: 'unsafe',
        name: 'Unsafe',
        enabled: true,
        transport: {
          kind: 'streamable_http',
          url: 'http://mcp.example.com/rpc',
          headerCredentialIds: {}
        }
      })
    ).toThrow('MCP Server URL must use HTTPS or loopback HTTP')
  })

  it('rejects inline secrets, relative commands and unsupported URL credentials', () => {
    expect(() =>
      normalizeMcpServerConfiguration({
        id: 'relative',
        name: 'Relative',
        enabled: true,
        transport: {
          kind: 'stdio',
          command: 'node',
          arguments: [],
          environmentCredentialIds: {}
        }
      })
    ).toThrow('MCP stdio command must be absolute')
    expect(() =>
      normalizeMcpServerConfiguration({
        id: 'inline',
        name: 'Inline',
        enabled: true,
        transport: {
          kind: 'stdio',
          command: '/usr/bin/node',
          arguments: [],
          environmentCredentialIds: { API_TOKEN: 'secret-value' }
        }
      })
    ).toThrow('MCP credential reference is invalid')
    expect(() =>
      normalizeMcpServerConfiguration({
        id: 'url-credentials',
        name: 'URL credentials',
        enabled: true,
        transport: {
          kind: 'streamable_http',
          url: 'https://user:password@mcp.example.com/rpc',
          headerCredentialIds: {}
        }
      })
    ).toThrow('MCP Server URL must not include credentials')
  })
})
