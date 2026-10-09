import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  calculateMcpToolSchemaDigest,
  type McpClientFactory
} from '../tools/mcp-tool-adapter'
import {
  ConnectorGatewayError,
  type ConnectorProtocolAdapter,
  type EffectiveConnectorSnapshot
} from './connector-gateway'

type McpConnectorAdapterDependencies = {
  servers: {
    get(serverId: string): Promise<McpServerConfiguration | undefined>
  }
  clients: McpClientFactory
}

export class McpConnectorAdapter implements ConnectorProtocolAdapter {
  constructor(private readonly dependencies: McpConnectorAdapterDependencies) {}

  async invoke(input: {
    snapshot: EffectiveConnectorSnapshot
    arguments: JsonObject
    idempotencyKey?: string
    correlationId: string
    causationId: string
    signal?: AbortSignal
  }): Promise<{ output: JsonObject }> {
    const protocol = input.snapshot.action.protocol
    if (protocol.kind !== 'mcp') {
      throw new Error('MCP Connector action is invalid')
    }
    const server = await this.dependencies.servers.get(protocol.serverRef)
    if (!server?.enabled) {
      throw new ConnectorGatewayError(
        'connector_mcp_unavailable',
        'Connector MCP Server is unavailable',
        true
      )
    }
    const connection = await this.dependencies.clients.connect(server)
    try {
      if (
        connection.serverIdentity.protocolVersion !== protocol.protocolVersion
      ) {
        throw schemaDrift()
      }
      const remote = (await connection.listTools()).find(
        ({ name }) => name === protocol.remoteToolName
      )
      if (
        !remote ||
        calculateMcpToolSchemaDigest(remote) !== protocol.schemaDigest
      ) {
        throw schemaDrift()
      }
      const result = await connection.callTool(
        {
          name: protocol.remoteToolName,
          arguments: input.arguments
        },
        {
          signal: input.signal ?? new AbortController().signal,
          progressToken: input.causationId,
          onProgress: async () => undefined
        }
      )
      if (result.isError) {
        throw new ConnectorGatewayError(
          'connector_mcp_tool_error',
          'Connector MCP Tool reported an error',
          false,
          true
        )
      }
      return {
        output:
          result.structuredContent ??
          ({ content: result.content } as unknown as JsonObject)
      }
    } catch (error) {
      if (error instanceof ConnectorGatewayError) throw error
      throw new ConnectorGatewayError(
        'connector_mcp_execution_failed',
        'Connector MCP Tool execution failed',
        true,
        true
      )
    } finally {
      await connection.close()
    }
  }
}

function schemaDrift(): ConnectorGatewayError {
  return new ConnectorGatewayError(
    'connector_schema_drift',
    'Connector MCP schema changed and must be re-imported',
    false
  )
}
