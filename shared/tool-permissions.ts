import type { ToolRisk } from '../domain/tool-definition'

export type ToolPermissionStatus =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'cancelled'

export type ToolPermissionReason =
  | 'delete'
  | 'out_of_scope'
  | 'process'
  | 'system'
  | 'external'

export type PendingToolPermissionResource = {
  kind: 'path' | 'process' | 'application' | 'network'
  label: string
}

export type ToolPermissionRequestProjection = {
  schemaVersion: 2
  id: string
  executionId: string
  runId: string
  callId: string
  toolId: string
  toolName: string
  status: ToolPermissionStatus
  reason: ToolPermissionReason
  risk: ToolRisk
  effectsDigest: string
  argumentsDigest: string
  bindingRevision: number
  requestRevision: number
  requestedAt: number
  expiresAt: number
  resources: PendingToolPermissionResource[]
  resolvedAt?: number
  decision?: 'allow_once' | 'deny'
}

export type PendingToolPermissionView = ToolPermissionRequestProjection

export type PermissionDecisionCommand = {
  requestId: string
  expectedRevision: number
  decision: 'allow_once' | 'deny'
}

export type ToolPermissionApi = {
  listPending(): Promise<PendingToolPermissionView[]>
  resolve(
    command: PermissionDecisionCommand
  ): Promise<ToolPermissionRequestProjection>
  onChanged(listener: () => void): () => void
}
