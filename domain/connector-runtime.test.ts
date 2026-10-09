import { describe, expect, it } from 'vitest'
import {
  normalizeConnectorAction,
  type ConnectorAction
} from './connector-runtime'

describe('Connector Runtime actions', () => {
  it.each([
    {
      protocol: {
        kind: 'http',
        baseUrl: 'https://api.example.com',
        method: 'POST',
        pathTemplate: '/messages/{channelId}',
        authentication: { type: 'bearer', credentialRef: 'api-token' },
        allowedRedirectOrigins: ['https://api.example.com']
      }
    },
    {
      protocol: {
        kind: 'mcp',
        serverRef: 'docs',
        remoteToolName: 'documents.search',
        protocolVersion: '2025-06-18',
        schemaDigest: 'a'.repeat(64)
      }
    },
    {
      protocol: {
        kind: 'database',
        driver: 'sqlite',
        access: 'read',
        statement: 'SELECT title FROM documents WHERE id = :id',
        parameterNames: ['id'],
        allowedTables: ['documents'],
        maxRows: 100,
        connectionRef: 'database-primary'
      }
    },
    {
      protocol: {
        kind: 'cli',
        executable: '/usr/bin/git',
        subcommand: ['status'],
        argumentNames: ['short'],
        workingDirectory: 'workspace',
        environmentCredentialRefs: {}
      }
    }
  ])('normalizes a declared $protocol.kind action', ({ protocol }) => {
    const action = normalizeConnectorAction({
      id: 'search',
      name: 'Search',
      description: 'Search approved content.',
      operation: 'read',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'medium',
      effects: [],
      timeoutMs: 5_000,
      maxOutputBytes: 64_000,
      protocol
    })

    expect(action.protocol.kind).toBe(protocol.kind)
    expect(Object.isFrozen(action)).toBe(true)
  })

  it('requires idempotency and recovery for external writes', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        operation: 'write',
        effects: ['external.message.send'],
        protocol: {
          kind: 'http',
          baseUrl: 'https://api.example.com',
          method: 'POST',
          pathTemplate: '/messages',
          authentication: { type: 'none' },
          allowedRedirectOrigins: []
        }
      })
    ).toThrow('write action requires idempotency')

    expect(
      normalizeConnectorAction({
        ...baseAction(),
        operation: 'write',
        effects: ['external.message.send'],
        idempotency: {
          mode: 'required',
          headerName: 'Idempotency-Key',
          recoveryActionId: 'message-status'
        },
        protocol: {
          kind: 'http',
          baseUrl: 'https://api.example.com',
          method: 'POST',
          pathTemplate: '/messages',
          authentication: { type: 'none' },
          allowedRedirectOrigins: []
        }
      }).idempotency
    ).toEqual({
      mode: 'required',
      headerName: 'Idempotency-Key',
      recoveryActionId: 'message-status'
    })
  })

  it('rejects arbitrary targets, SQL writes, and shell syntax', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        protocol: {
          kind: 'http',
          baseUrl: 'https://api.example.com',
          method: 'GET',
          pathTemplate: 'https://attacker.example/data',
          authentication: { type: 'none' },
          allowedRedirectOrigins: []
        }
      })
    ).toThrow('HTTP path')

    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        protocol: {
          kind: 'database',
          driver: 'postgres',
          access: 'read',
          statement: 'UPDATE documents SET title = :title',
          parameterNames: ['title'],
          allowedTables: ['documents'],
          maxRows: 10,
          connectionRef: 'database-primary'
        }
      })
    ).toThrow('read-only')

    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        protocol: {
          kind: 'cli',
          executable: '/usr/bin/git',
          subcommand: ['status;rm', '-rf'],
          argumentNames: [],
          workingDirectory: 'workspace',
          environmentCredentialRefs: {}
        }
      })
    ).toThrow('CLI subcommand')
  })
})

function baseAction(): Omit<ConnectorAction, 'protocol'> {
  return {
    id: 'read',
    name: 'Read',
    description: 'Read data.',
    operation: 'read',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'medium',
    effects: [],
    timeoutMs: 5_000,
    maxOutputBytes: 64_000
  }
}
