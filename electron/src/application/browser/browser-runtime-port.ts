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

export type BrowserToolRuntimePort = {
  createSession(call: BrowserCallContext): Promise<BrowserSession>
  attachSession(
    profileId: string,
    call: BrowserCallContext
  ): Promise<BrowserSession>
  closeSession(id: string, call: BrowserCallContext): Promise<void>
  execute(
    id: string,
    action: BrowserAction,
    args: JsonObject,
    call: BrowserCallContext
  ): Promise<JsonObject>
  describe?(
    id: string,
    action: BrowserAction,
    args: JsonObject,
    call: BrowserCallContext
  ): Promise<BrowserEffectEvidence>
  describeCurrent?(
    action: BrowserAction,
    args: JsonObject,
    call: BrowserCallContext
  ): Promise<BrowserEffectEvidence>
  resolveCurrentSessionId?(call: BrowserCallContext): Promise<string>
  closeCurrent?(call: BrowserCallContext): Promise<string>
  executeCurrent?(
    action: BrowserAction,
    args: JsonObject,
    call: BrowserCallContext
  ): Promise<JsonObject>
  ensureCurrentSession?(
    call: BrowserCallContext
  ): Promise<BrowserSession & { created: boolean }>
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

export function browserError(
  code: string,
  message: string
): Error & { code: string } {
  return Object.assign(new Error(message), { code: `browser_${code}` })
}
