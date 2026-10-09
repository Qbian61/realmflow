import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type ToolOutboxMessage = {
  id: string
  topic: string
  messageKey: string
  payload: JsonObject
  headers: JsonObject
  status: 'leased'
  availableAt: number
  leaseOwner: string
  leaseExpiresAt: number
  attempts: number
  createdAt: number
  updatedAt: number
}

export interface ToolOutboxRepository {
  claim(input: {
    owner: string
    now: number
    leaseMs: number
    limit: number
  }): Promise<ToolOutboxMessage[]>
  markPublished(input: {
    id: string
    owner: string
    at: number
  }): Promise<'published' | 'not_owned'>
  recordFailure(input: {
    id: string
    owner: string
    at: number
    retryAt: number
    maxAttempts: number
    errorSummary: string
  }): Promise<'retry_scheduled' | 'dead_lettered' | 'not_owned'>
}
