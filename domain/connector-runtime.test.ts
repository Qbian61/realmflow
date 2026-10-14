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
      inputSchema: inputSchemaForProtocol(protocol.kind),
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

  it('rejects HTTP actions whose path placeholders are missing from required scalar inputs', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        },
        protocol: {
          kind: 'http',
          baseUrl: 'https://api.example.com',
          method: 'GET',
          pathTemplate: '/documents/{documentId}',
          authentication: { type: 'none' },
          allowedRedirectOrigins: []
        }
      })
    ).toThrow(
      'Connector HTTP path parameter must be a required scalar input property'
    )
  })

  it('rejects HTTP write bodies that can drift from declared input properties', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            channelId: { type: 'string' },
            payload: { type: 'object' }
          },
          required: ['channelId']
        },
        protocol: {
          kind: 'http',
          baseUrl: 'https://api.example.com',
          method: 'POST',
          pathTemplate: '/channels/{channelId}/messages',
          authentication: { type: 'none' },
          allowedRedirectOrigins: []
        }
      })
    ).toThrow('Connector HTTP request body schema must match input schema')
  })

  it('rejects HTTP actions that expose credential references as model inputs', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            'api-token': { type: 'string' }
          },
          required: ['api-token'],
          additionalProperties: false
        },
        protocol: {
          kind: 'http',
          baseUrl: 'https://api.example.com',
          method: 'GET',
          pathTemplate: '/search',
          authentication: { type: 'bearer', credentialRef: 'api-token' },
          allowedRedirectOrigins: []
        }
      })
    ).toThrow(
      'Connector HTTP credentials must not be model input properties'
    )
  })

  it('rejects GET HTTP actions whose query parameters are not URL-encodable', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            filter: { type: 'object' }
          },
          additionalProperties: false
        },
        protocol: {
          kind: 'http',
          baseUrl: 'https://api.example.com',
          method: 'GET',
          pathTemplate: '/search',
          authentication: { type: 'none' },
          allowedRedirectOrigins: []
        }
      })
    ).toThrow('Connector HTTP query parameter schema must be encodable')
  })

  it('rejects Database actions whose protocol parameters drift from the input schema', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            unused: { type: 'string' }
          },
          required: ['id'],
          additionalProperties: false
        },
        protocol: {
          kind: 'database',
          driver: 'postgres',
          access: 'read',
          statement: 'SELECT title FROM documents WHERE id = :id',
          parameterNames: ['id'],
          allowedTables: ['documents'],
          maxRows: 10,
          connectionRef: 'database-primary'
        }
      })
    ).toThrow('Connector Database parameters must match input schema')
  })

  it('rejects Database actions with duplicated parameter names', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          },
          required: ['id'],
          additionalProperties: false
        },
        protocol: {
          kind: 'database',
          driver: 'postgres',
          access: 'read',
          statement: 'SELECT title FROM documents WHERE id = :id',
          parameterNames: ['id', 'id'],
          allowedTables: ['documents'],
          maxRows: 10,
          connectionRef: 'database-primary'
        }
      })
    ).toThrow('Connector parameter is duplicated')
  })

  it('rejects Database actions whose declared parameters are not referenced by the statement', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            unused: { type: 'string' }
          },
          required: ['id', 'unused'],
          additionalProperties: false
        },
        protocol: {
          kind: 'database',
          driver: 'postgres',
          access: 'read',
          statement: 'SELECT title FROM documents WHERE id = :id',
          parameterNames: ['id', 'unused'],
          allowedTables: ['documents'],
          maxRows: 10,
          connectionRef: 'database-primary'
        }
      })
    ).toThrow('Connector Database parameters must match statement')
  })

  it('rejects Database actions whose statement references undeclared parameters', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          },
          required: ['id'],
          additionalProperties: false
        },
        protocol: {
          kind: 'database',
          driver: 'postgres',
          access: 'read',
          statement:
            'SELECT title FROM documents WHERE id = :id AND tenant_id = :tenantId',
          parameterNames: ['id'],
          allowedTables: ['documents'],
          maxRows: 10,
          connectionRef: 'database-primary'
        }
      })
    ).toThrow('Connector Database parameters must match statement')
  })

  it('rejects Database read actions whose statement references tables outside the allowlist', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          },
          required: ['id'],
          additionalProperties: false
        },
        protocol: {
          kind: 'database',
          driver: 'postgres',
          access: 'read',
          statement: 'SELECT token FROM credentials WHERE id = :id',
          parameterNames: ['id'],
          allowedTables: ['documents'],
          maxRows: 10,
          connectionRef: 'database-primary'
        }
      })
    ).toThrow('Connector Database table is not allowlisted')
  })

  it('rejects CLI actions whose declared arguments cannot be encoded', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            payload: { type: 'object' }
          },
          required: ['payload'],
          additionalProperties: false
        },
        protocol: {
          kind: 'cli',
          executable: '/usr/bin/git',
          subcommand: ['status'],
          argumentNames: ['payload'],
          workingDirectory: 'workspace',
          environmentCredentialRefs: {}
        }
      })
    ).toThrow('Connector CLI argument schema must be encodable')
  })

  it('rejects CLI actions whose protocol arguments drift from the input schema', () => {
    expect(() =>
      normalizeConnectorAction({
        ...baseAction(),
        inputSchema: {
          type: 'object',
          properties: {
            short: { type: 'boolean' },
            porcelain: { type: 'string' }
          },
          additionalProperties: false
        },
        protocol: {
          kind: 'cli',
          executable: '/usr/bin/git',
          subcommand: ['status'],
          argumentNames: ['short'],
          workingDirectory: 'workspace',
          environmentCredentialRefs: {}
        }
      })
    ).toThrow('Connector CLI arguments must match input schema')
  })

  it('accepts every CLI input type that the adapter can encode', () => {
    const action = normalizeConnectorAction({
      ...baseAction(),
      inputSchema: {
        type: 'object',
        properties: {
          short: { type: 'boolean' },
          branch: { type: 'string' },
          limit: { type: 'number' },
          paths: {
            type: 'array',
            items: { type: 'string' }
          },
          revisions: {
            type: 'array',
            items: { type: 'number' }
          }
        },
        additionalProperties: false
      },
      protocol: {
        kind: 'cli',
        executable: '/usr/bin/git',
        subcommand: ['log'],
        argumentNames: ['short', 'branch', 'limit', 'paths', 'revisions'],
        workingDirectory: 'workspace',
        environmentCredentialRefs: {}
      }
    })

    expect(action.protocol).toMatchObject({
      kind: 'cli',
      argumentNames: ['branch', 'limit', 'paths', 'revisions', 'short']
    })
  })
})

function baseAction(): Omit<ConnectorAction, 'protocol'> {
  return {
    id: 'read',
    name: 'Read',
    description: 'Read data.',
    operation: 'read',
    inputSchema: { type: 'object', additionalProperties: false },
    outputSchema: { type: 'object' },
    risk: 'medium',
    effects: [],
    timeoutMs: 5_000,
    maxOutputBytes: 64_000
  }
}

function inputSchemaForProtocol(
  kind: ConnectorAction['protocol']['kind']
): ConnectorAction['inputSchema'] {
  if (kind === 'http') {
    return {
      type: 'object',
      properties: {
        channelId: { type: 'string' }
      },
      required: ['channelId'],
      additionalProperties: false
    }
  }
  if (kind === 'database') {
    return {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id'],
      additionalProperties: false
    }
  }
  if (kind === 'cli') {
    return {
      type: 'object',
      properties: {
        short: { type: 'boolean' }
      },
      additionalProperties: false
    }
  }
  return { type: 'object' }
}
