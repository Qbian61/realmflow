import { databaseStatementTables } from '../../../../domain/connector-runtime'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ConnectorProtocolAdapter,
  EffectiveConnectorSnapshot
} from './connector-gateway'

type DatabaseSession = {
  query(input: {
    statement: string
    parameters: JsonObject
    readOnly: boolean
    timeoutMs: number
    maxRows: number
  }): Promise<JsonObject[]>
  close(): Promise<void> | void
}

type DatabaseConnectorAdapterDependencies = {
  hosts: {
    open(input: {
      snapshot: EffectiveConnectorSnapshot
    }): Promise<DatabaseSession>
  }
}

export class DatabaseConnectorAdapter implements ConnectorProtocolAdapter {
  constructor(
    private readonly dependencies: DatabaseConnectorAdapterDependencies
  ) {}

  async invoke(input: {
    snapshot: EffectiveConnectorSnapshot
    arguments: JsonObject
    idempotencyKey?: string
    correlationId: string
    causationId: string
    signal?: AbortSignal
  }): Promise<{ output: JsonObject }> {
    const protocol = input.snapshot.action.protocol
    if (protocol.kind !== 'database') {
      throw new Error('Database Connector action is invalid')
    }
    const keys = Object.keys(input.arguments).sort()
    const parameterNames = [...protocol.parameterNames].sort()
    if (
      keys.length !== parameterNames.length ||
      keys.some((key, index) => key !== parameterNames[index])
    ) {
      throw new Error('Database Connector parameters are invalid')
    }
    const referencedTables = databaseStatementTables(protocol.statement)
    if (
      referencedTables.length === 0 ||
      referencedTables.some(
        (table) => !protocol.allowedTables.includes(table)
      )
    ) {
      throw new Error('Database Connector table is not allowlisted')
    }
    if (!input.snapshot.credentialHandles[protocol.connectionRef]) {
      throw new Error('Database Connector connection is unavailable')
    }
    const session = await this.dependencies.hosts.open({
      snapshot: input.snapshot
    })
    try {
      const rows = await session.query({
        statement: protocol.statement,
        parameters: structuredClone(input.arguments),
        readOnly: protocol.access === 'read',
        timeoutMs: input.snapshot.action.timeoutMs,
        maxRows: protocol.maxRows
      })
      if (rows.length > protocol.maxRows) {
        throw new Error('Database Connector result exceeded its row limit')
      }
      return {
        output: {
          rows,
          rowCount: rows.length
        }
      }
    } finally {
      await session.close()
    }
  }
}
