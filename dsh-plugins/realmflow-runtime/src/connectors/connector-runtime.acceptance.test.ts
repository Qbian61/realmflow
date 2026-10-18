import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../test-manifest-fixture'
import { DshConnectorRuntime } from './connector-runtime'

describe('DshConnectorRuntime connector-class acceptance', () => {
  it('executes HTTP, database, and CLI connector classes from one DSH manifest', async () => {
    const manifest = createDshRunManifest({
      connectors: [
        {
          kind: 'connector',
          id: 'connector-http-docs',
          type: 'http',
          baseUrl: 'https://api.example.com',
          adapter: {
            adapterId: 'realmflow.http',
            version: '1.0.0',
            digest: '3'.repeat(64),
            entrypoint: 'connectors/http.js'
          },
          authentication: {
            kind: 'none'
          }
        },
        {
          kind: 'connector',
          id: 'connector-database-docs',
          type: 'database',
          adapter: {
            adapterId: 'realmflow.database',
            version: '1.0.0',
            digest: '4'.repeat(64),
            entrypoint: 'connectors/database.js'
          },
          authentication: {
            kind: 'none'
          }
        },
        {
          kind: 'connector',
          id: 'connector-cli-docs',
          type: 'cli',
          adapter: {
            adapterId: 'realmflow.cli',
            version: '1.0.0',
            digest: '5'.repeat(64),
            entrypoint: 'connectors/cli.js'
          },
          authentication: {
            kind: 'none'
          }
        }
      ]
    })
    const adapter = {
      invoke: vi.fn(async (connector, request) => ({
        connectorId: connector.id,
        connectorType: connector.type,
        target: request.target
      }))
    }
    const runtime = new DshConnectorRuntime({ manifest, adapter })

    await expect(
      runtime.invoke({
        connectorId: 'connector-http-docs',
        actionId: 'docs.search',
        callId: 'connector-call-http',
        path: '/v1/docs/search',
        input: { query: 'realmflow' }
      })
    ).resolves.toEqual({
      connectorId: 'connector-http-docs',
      connectorType: 'http',
      target: {
        kind: 'http',
        path: '/v1/docs/search',
        url: 'https://api.example.com/v1/docs/search'
      }
    })

    await expect(
      runtime.invoke({
        connectorId: 'connector-database-docs',
        actionId: 'docs.lookup',
        callId: 'connector-call-database',
        input: { slug: 'runtime' }
      })
    ).resolves.toEqual({
      connectorId: 'connector-database-docs',
      connectorType: 'database',
      target: {
        kind: 'database'
      }
    })

    await expect(
      runtime.invoke({
        connectorId: 'connector-cli-docs',
        actionId: 'docs.render',
        callId: 'connector-call-cli',
        input: { file: 'README.md' }
      })
    ).resolves.toEqual({
      connectorId: 'connector-cli-docs',
      connectorType: 'cli',
      target: {
        kind: 'cli'
      }
    })

    expect(adapter.invoke).toHaveBeenCalledTimes(3)
  })
})
