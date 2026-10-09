import type { McpServerConfiguration } from '../../../../domain/mcp-server'
import type { EncryptedCredential } from '../../models/credential-vault'

export type McpServerValidation = {
  status: 'available' | 'unavailable'
  message: string
  checkedAt: number
}

export type McpServerRecord = {
  configuration: McpServerConfiguration
  revision: number
  createdAt: number
  updatedAt: number
  hasCredentials: Record<string, boolean>
  validation?: McpServerValidation
}

export type StoredMcpCredential = EncryptedCredential & {
  id: string
  serverId: string
  bindingName: string
  createdAt: number
  updatedAt: number
}

export type SaveMcpServerResult =
  | { status: 'applied' | 'replayed'; record: McpServerRecord }
  | { status: 'conflict'; record: McpServerRecord }
  | { status: 'idempotency_conflict' }

export type DeleteMcpServerResult =
  | { status: 'applied' | 'replayed'; id: string }
  | { status: 'conflict'; record: McpServerRecord }
  | { status: 'not_found'; id: string }
  | { status: 'idempotency_conflict' }

export interface McpServerStore {
  list(): Promise<McpServerRecord[]>
  get(id: string): Promise<McpServerRecord | undefined>
  getCredential(id: string): Promise<StoredMcpCredential | undefined>
  save(input: {
    configuration: McpServerConfiguration
    expectedRevision: number
    credentials: StoredMcpCredential[]
    idempotencyKey: string
    fingerprint: string
    at: number
  }): Promise<SaveMcpServerResult>
  delete(input: {
    id: string
    expectedRevision: number
    idempotencyKey: string
    fingerprint: string
    at: number
  }): Promise<DeleteMcpServerResult>
  saveValidation(input: {
    id: string
    expectedRevision: number
    validation: McpServerValidation
  }): Promise<McpServerRecord>
}
