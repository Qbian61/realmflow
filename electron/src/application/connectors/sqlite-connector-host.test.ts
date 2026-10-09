import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { EffectiveConnectorSnapshot } from './connector-gateway'
import { SqliteConnectorHost } from './sqlite-connector-host'

let directory: string | undefined

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe('SqliteConnectorHost', () => {
  it('opens only the bound database inside the path permission ceiling', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-connector-sqlite-'))
    const databasePath = join(directory, 'docs.sqlite')
    const database = new Database(databasePath)
    database.exec(
      "CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT); INSERT INTO documents VALUES ('doc-1', 'Roadmap')"
    )
    database.close()
    const host = new SqliteConnectorHost({
      resolveCredential: async () => databasePath
    })
    const session = await host.open({ snapshot: snapshot(directory) })

    await expect(
      session.query({
        statement: 'SELECT id, title FROM documents WHERE id = :id',
        parameters: { id: 'doc-1' },
        readOnly: true,
        timeoutMs: 2_000,
        maxRows: 10
      })
    ).resolves.toEqual([{ id: 'doc-1', title: 'Roadmap' }])
    session.close()
  })

  it('rejects a database outside the permission ceiling', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-connector-sqlite-'))
    const host = new SqliteConnectorHost({
      resolveCredential: async () => '/tmp/outside.sqlite'
    })

    await expect(
      host.open({ snapshot: snapshot(directory) })
    ).rejects.toMatchObject({ code: 'connector_database_path_denied' })
  })
})

function snapshot(pathPrefix: string): EffectiveConnectorSnapshot {
  return {
    capabilityId: 'connector.database',
    capabilityVersion: '1.0.0',
    capabilityDigest: 'c'.repeat(64),
    installationId: 'installation-database',
    scope: { kind: 'global' },
    credentialHandles: { database: 'mcp:database-path' },
    permissionCeiling: {
      capabilities: ['connector.use', 'credential.use', 'filesystem.read'],
      maximumRisk: 'medium',
      pathPrefixes: [pathPrefix],
      networkTargets: []
    },
    action: {
      id: 'read',
      name: 'Read',
      description: 'Read docs.',
      operation: 'read',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'medium',
      effects: ['filesystem.read'],
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
        connectionRef: 'database'
      }
    }
  }
}
