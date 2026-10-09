import { describe, expect, it, vi } from 'vitest'
import type { EffectiveConnectorSnapshot } from './connector-gateway'
import { DatabaseConnectorAdapter } from './database-connector-adapter'

describe('DatabaseConnectorAdapter', () => {
  it('executes the fixed statement with bound parameters in a read-only transaction', async () => {
    const query = vi.fn(async () => [{ id: 'doc-1', title: 'Roadmap' }])
    const adapter = new DatabaseConnectorAdapter({
      hosts: {
        open: vi.fn(async () => ({ query, close: vi.fn() }))
      }
    })

    const result = await adapter.invoke({
      snapshot: snapshot(),
      arguments: { id: 'doc-1' },
      correlationId: 'run-1',
      causationId: 'call-1'
    })

    expect(query).toHaveBeenCalledWith({
      statement: 'SELECT id, title FROM documents WHERE id = :id',
      parameters: { id: 'doc-1' },
      readOnly: true,
      timeoutMs: 2_000,
      maxRows: 10
    })
    expect(result.output).toEqual({
      rows: [{ id: 'doc-1', title: 'Roadmap' }],
      rowCount: 1
    })
  })

  it('rejects undeclared parameters before opening the database', async () => {
    const open = vi.fn()
    const adapter = new DatabaseConnectorAdapter({ hosts: { open } })

    await expect(
      adapter.invoke({
        snapshot: snapshot(),
        arguments: { id: 'doc-1', sql: 'DELETE FROM documents' },
        correlationId: 'run-1',
        causationId: 'call-1'
      })
    ).rejects.toThrow('parameters')
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects statements that reference a table outside the allowlist', async () => {
    const open = vi.fn()
    const adapter = new DatabaseConnectorAdapter({ hosts: { open } })
    const value = snapshot()
    if (value.action.protocol.kind !== 'database') throw new Error('fixture')
    value.action.protocol.statement =
      'SELECT token FROM credentials WHERE id = :id'

    await expect(
      adapter.invoke({
        snapshot: value,
        arguments: { id: 'doc-1' },
        correlationId: 'run-1',
        causationId: 'call-1'
      })
    ).rejects.toThrow('table')
    expect(open).not.toHaveBeenCalled()
  })
})

function snapshot(): EffectiveConnectorSnapshot {
  return {
    capabilityId: 'connector.database',
    capabilityVersion: '1.0.0',
    capabilityDigest: 'a'.repeat(64),
    installationId: 'installation-1',
    scope: { kind: 'global' },
    credentialHandles: { 'database-primary': 'credential-db-primary' },
    permissionCeiling: {
      capabilities: ['connector.use', 'credential.use'],
      maximumRisk: 'medium',
      pathPrefixes: [],
      networkTargets: []
    },
    action: {
      id: 'document-read',
      name: 'Read document',
      description: 'Read one document.',
      operation: 'read',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'medium',
      effects: [],
      timeoutMs: 2_000,
      maxOutputBytes: 4_096,
      protocol: {
        kind: 'database',
        driver: 'sqlite',
        access: 'read',
        statement: 'SELECT id, title FROM documents WHERE id = :id',
        parameterNames: ['id'],
        allowedTables: ['documents'],
        maxRows: 10,
        connectionRef: 'database-primary'
      }
    }
  }
}
