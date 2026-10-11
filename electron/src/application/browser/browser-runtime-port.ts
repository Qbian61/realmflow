import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type BrowserAction =
  | 'navigate' | 'snapshot' | 'click' | 'fill' | 'select' | 'press'
  | 'evaluate' | 'wait_for' | 'screenshot' | 'upload' | 'download'

export type BrowserEffectEvidence = {
  sessionId?: string
  url: string
  privateSession: boolean
  targetDigest: string
  semantic: 'read' | 'control' | 'sensitive' | 'publish'
}

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
  conversationId?: string
  ownerScopeDigest?: string
  authorityDigest?: string
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
  describe?(
    session: BrowserSession, action: BrowserAction, args: JsonObject, signal: AbortSignal
  ): Promise<BrowserEffectEvidence>
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
