import { resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  ConnectorGatewayError,
  type EffectiveConnectorSnapshot
} from './connector-gateway'

type SqliteConnectorHostDependencies = {
  resolveCredential(handle: string): Promise<string>
}

export class SqliteConnectorHost {
  constructor(private readonly dependencies: SqliteConnectorHostDependencies) {}

  async open(input: {
    snapshot: EffectiveConnectorSnapshot
  }): Promise<{
    query(command: {
      statement: string
      parameters: JsonObject
      readOnly: boolean
      timeoutMs: number
      maxRows: number
    }): Promise<JsonObject[]>
    close(): void
  }> {
    const protocol = input.snapshot.action.protocol
    if (protocol.kind !== 'database' || protocol.driver !== 'sqlite') {
      throw new ConnectorGatewayError(
        'connector_database_driver_unavailable',
        'Connector Database driver is unavailable',
        false
      )
    }
    const handle = input.snapshot.credentialHandles[protocol.connectionRef]
    if (!handle) {
      throw new ConnectorGatewayError(
        'connector_database_binding_unavailable',
        'Connector Database binding is unavailable',
        false
      )
    }
    const databasePath = resolve(
      await this.dependencies.resolveCredential(handle)
    )
    if (
      !input.snapshot.permissionCeiling.pathPrefixes.some((prefix) =>
        pathWithin(databasePath, resolve(prefix))
      )
    ) {
      throw new ConnectorGatewayError(
        'connector_database_path_denied',
        'Connector Database path is outside the permission ceiling',
        false
      )
    }
    const database = new Database(databasePath, {
      readonly: protocol.access === 'read',
      fileMustExist: true,
      timeout: input.snapshot.action.timeoutMs
    })
    if (protocol.access === 'read') database.pragma('query_only = ON')
    return {
      query: async (command) => {
        const statement = database.prepare(command.statement)
        if (command.readOnly) {
          return statement
            .all(command.parameters)
            .slice(0, command.maxRows)
            .map(jsonRow)
        }
        const result = statement.run(command.parameters)
        return [
          {
            changes: result.changes,
            lastInsertRowid:
              typeof result.lastInsertRowid === 'bigint'
                ? result.lastInsertRowid.toString()
                : result.lastInsertRowid
          }
        ]
      },
      close: () => database.close()
    }
  }
}

function pathWithin(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}${sep}`)
}

function jsonRow(value: unknown): JsonObject {
  const row = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(row).map(([key, item]) => [
      key,
      typeof item === 'bigint' ? item.toString() : item
    ])
  ) as JsonObject
}
