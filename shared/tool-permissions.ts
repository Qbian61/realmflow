import type { ToolRisk } from '../domain/tool-definition'
import type { ApprovalProfileId, EffectiveRisk } from '../domain/approval-profile'

export type ToolPermissionDecision = 'deny' | 'allow_once' | 'allow_session' | 'allow_requirement' | 'allow_space' | 'allow_always'

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
  | 'write'

export type PendingToolPermissionResource = {
  kind: 'path' | 'process' | 'application' | 'network'
  label: string
}

export type ToolPermissionRequestProjection = {
  schemaVersion: 3
  approvalProfileId: ApprovalProfileId
  approvalProfileDigest: string
  effectiveRisk: EffectiveRisk
  maxGrant: 'once' | 'session' | 'space' | 'persistent'
  workspaceId?: string
  requirementId?: string
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
  decision?: ToolPermissionDecision
}

export type PendingToolPermissionView = ToolPermissionRequestProjection

export type PermissionDecisionCommand = {
  requestId: string
  expectedRevision: number
  decision: ToolPermissionDecision
}

export type ReusableToolPermissionView = {
  id: string
  mode: Exclude<ToolPermissionDecision, 'deny' | 'allow_once'>
  toolId: string
  toolName: string
  effectiveRisk: EffectiveRisk
  approvalProfileId: ApprovalProfileId
  grantedAt: number
  sessionId: string
  workspaceId?: string
  requirementId?: string
  resources: PendingToolPermissionResource[]
}

export type ApprovalHistoryQuery = { risk?: EffectiveRisk; limit?: number }
export type ApprovalHistoryRecord = {
  executionId: string
  toolId: string
  approvalProfileId: ApprovalProfileId
  effectiveRisk?: EffectiveRisk
  outcome: 'automatic' | 'reused' | 'waiting' | 'approved' | 'denied' | 'expired' | 'cancelled'
  asked: boolean
  occurredAt: number
  waitMs: number
}
export type ApprovalModeMetrics = {
  approvalProfileId: ApprovalProfileId
  automatic: number
  reused: number
  asked: number
  denied: number
  waitMs: number
}
export type ApprovalHistoryView = {
  records: ApprovalHistoryRecord[]
  metrics: ApprovalModeMetrics[]
}
export type ApprovalDefaultView = { approvalProfileId: ApprovalProfileId; revision: number }

export type ToolPermissionApi = {
  getDefault?(): Promise<ApprovalDefaultView>
  setDefault?(command: ApprovalDefaultView): Promise<ApprovalDefaultView>
  history?(query: ApprovalHistoryQuery): Promise<ApprovalHistoryView>
  listPending(): Promise<PendingToolPermissionView[]>
  listGrants(): Promise<ReusableToolPermissionView[]>
  revokeGrant(grantId: string): Promise<void>
  resolve(
    command: PermissionDecisionCommand
  ): Promise<ToolPermissionRequestProjection>
  onChanged(listener: () => void): () => void
}
