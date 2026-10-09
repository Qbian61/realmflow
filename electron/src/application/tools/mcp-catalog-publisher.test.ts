import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeMcpServerConfiguration } from '../../../../domain/mcp-server'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteToolEventStore } from '../../infrastructure/sqlite/tool-event-store'
import { SqliteToolProjectionStore } from '../../infrastructure/sqlite/tool-projection-store'
import { McpCatalogPublisher } from './mcp-catalog-publisher'
import { McpDiscoveryService } from './mcp-discovery-service'
import { ToolProjectionRunner } from './tool-projection-runner'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-mcp-catalog-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('McpCatalogPublisher', () => {
  it('publishes synthetic MCP definitions through the Tool Event Store', async () => {
    const events = new SqliteToolEventStore(database)
    const projections = new SqliteToolProjectionStore(database)
    const runner = new ToolProjectionRunner(events, projections, () => 200)
    let nextId = 0
    const publisher = new McpCatalogPublisher({
      events,
      projections: runner,
      now: () => 100,
      createId: () => `mcp-event-${++nextId}`
    })
    const service = new McpDiscoveryService({
      clients: {
        connect: async () => ({
          serverIdentity: {
            name: 'test-server',
            version: '1.0.0',
            protocolVersion: '2025-11-25'
          },
          listTools: async () => [
            {
              name: 'search',
              description: 'Search',
              inputSchema: { type: 'object' }
            }
          ],
          callTool: async () => ({ content: [] }),
          cancel: async () => {},
          ping: async () => {},
          close: async () => {}
        })
      },
      publisher
    })
    const server = normalizeMcpServerConfiguration({
      id: 'test-server',
      name: 'Test Server',
      enabled: true,
      transport: {
        kind: 'stdio',
        command: '/usr/bin/node',
        arguments: [],
        environmentCredentialIds: {}
      }
    })

    await service.discoverAndPublish(server, 'mcp-import-test-server')
    await service.discoverAndPublish(server, 'mcp-import-test-server')

    const catalog = await projections.getCatalog()
    expect(catalog.packages).toMatchObject([
      {
        packageId: 'mcp.test-server',
        origin: 'mcp',
        status: 'enabled'
      }
    ])
    expect(catalog.tools).toMatchObject([
      {
        id: 'mcp.test-server.search',
        definition: { origin: 'mcp' },
        status: 'enabled'
      }
    ])
    expect(
      await events.loadStream(
        `extension-${catalog.packages[0].packageId}-${catalog.packages[0].version}`
      )
    ).toHaveLength(3)
  })
})
