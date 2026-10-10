import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type BrowserAction =
  | 'navigate' | 'snapshot' | 'click' | 'fill' | 'select' | 'press'
  | 'evaluate' | 'wait_for' | 'screenshot' | 'upload' | 'download'

export type BrowserSession = {
  id: string
  profileId: string
  ownerKey: string
  status: 'active' | 'closed' | 'interrupted'
  revision: number
  createdAt: number
  updatedAt: number
  executionId: string
}

export type BrowserCallContext = {
  ownerKey: string
  executionId: string
  runId?: string
  scopeRoots: string[]
  signal: AbortSignal
}

export interface BrowserSessionRepository {
  list(): BrowserSession[]
  get(id: string): BrowserSession | undefined
  insert(session: BrowserSession): void
  update(session: BrowserSession, expectedRevision: number): void
}

export interface BrowserDriver {
  open(session: BrowserSession, signal: AbortSignal): Promise<void>
  close(sessionId: string): Promise<void>
  execute(
    session: BrowserSession,
    action: BrowserAction,
    args: JsonObject,
    signal: AbortSignal,
    scopeRoots: string[]
  ): Promise<JsonObject>
}
