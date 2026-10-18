import { createHash } from 'node:crypto'
import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type McpRemoteTool = {
  name: string
  description?: string
  inputSchema: JsonObject
}

export type McpProgress = {
  progress: number
  total?: number
  message?: string
}

export type McpToolCallResult = {
  isError?: boolean
  structuredContent?: JsonObject
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'audio'; data: string; mimeType: string }
    | {
        type: 'resource'
        uri: string
        text?: string
        blob?: string
        mimeType?: string
      }
  >
  metrics?: { durationMs?: number }
}

export interface McpClientConnection {
  readonly serverIdentity: {
    name: string
    version: string
    protocolVersion: string
  }
  listTools(): Promise<McpRemoteTool[]>
  callTool(
    input: { name: string; arguments: JsonObject },
    options: {
      signal: AbortSignal
      progressToken: string
      onProgress(progress: McpProgress): Promise<void>
    }
  ): Promise<McpToolCallResult>
  cancel(requestId: string): Promise<void>
  ping(): Promise<void>
  close(): Promise<void>
}

export interface McpClientFactory {
  connect(
    configuration: McpServerConfiguration
  ): Promise<McpClientConnection>
}

export function calculateMcpToolSchemaDigest(tool: McpRemoteTool): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
        name: tool.name
      })
    )
    .digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
