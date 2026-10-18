import { createHash } from 'node:crypto'
import {
  createApprovalProfileSnapshot,
  type ApprovalProfileId,
  type EffectiveRisk
} from '../../../../domain/approval-profile'
import type { ToolRisk } from '../../../../domain/tool-definition'
import type {
  DshInteractionDecision,
  DshInteractionRequestRecord,
  DshInteractionResponseCommand
} from '../../../../shared/dsh-interaction-contract'
import type {
  PendingToolPermissionResource,
  PendingToolPermissionView,
  PermissionDecisionCommand,
  ToolPermissionRequestProjection
} from '../../../../shared/tool-permissions'

type DshInteractionLookup = {
  get?(
    requestId: string
  ): Promise<DshInteractionRequestRecord | undefined>
  listPending(): Promise<DshInteractionRequestRecord[]>
}

type DshInteractionResponder = {
  respond(command: DshInteractionResponseCommand): Promise<DshInteractionDecision>
}

export class DshToolPermissionAdapter {
  private readonly now: () => number

  constructor(
    private readonly dependencies: {
      interactions: DshInteractionLookup
      responder: DshInteractionResponder
      now?: () => number
    }
  ) {
    this.now = dependencies.now ?? Date.now
  }

  async listPendingPermissions(): Promise<PendingToolPermissionView[]> {
    const now = this.now()
    const records = await this.dependencies.interactions.listPending()
    return records
      .filter(
        (
          record
        ): record is Extract<
          DshInteractionRequestRecord,
          { kind: 'permission_approval' }
        > =>
          record.kind === 'permission_approval' &&
          record.status === 'pending' &&
          record.expiresAt > now
      )
      .sort(
        (left, right) =>
          left.requestedAt - right.requestedAt ||
          left.requestId.localeCompare(right.requestId)
      )
      .map((record) => permissionViewFromRecord(record))
  }

  async resolve(
    command: PermissionDecisionCommand
  ): Promise<ToolPermissionRequestProjection> {
    if (!this.dependencies.interactions.get) {
      throw new Error('DSH interaction lookup is unavailable')
    }
    const record =
      (await this.dependencies.interactions.get(command.requestId)) ??
      (await this.findPendingRecordByPermissionId(command.requestId))
    if (!record || record.kind !== 'permission_approval') {
      throw new Error('DSH permission approval request was not found')
    }
    if (!record.payload.options.includes(command.decision)) {
      throw new Error('DSH permission approval decision is unavailable')
    }
    const decision = await this.dependencies.responder.respond({
      runtimeInstanceId: record.runtimeInstanceId,
      sessionId: record.sessionId,
      runId: record.runId,
      requestId: record.requestId,
      activityId: record.activityId,
      capabilityId: record.capabilityId,
      scopeDigest: record.scopeDigest,
      effectDigest: record.effectDigest,
      expectedRevision: command.expectedRevision,
      nonce: record.nonce,
      response: {
        kind: 'permission_approval',
        decision: command.decision
      }
    })
    return permissionViewFromRecord({
      ...record,
      status: 'resolved',
      requestRevision: record.requestRevision + 1,
      resolvedAt: decision.resolvedAt,
      response: decision.response,
      decisionDigest: decision.decisionDigest,
      decisionSignature: decision.decisionSignature
    })
  }

  private async findPendingRecordByPermissionId(
    permissionId: string
  ): Promise<DshInteractionRequestRecord | undefined> {
    const pending = await this.dependencies.interactions.listPending()
    return pending.find(
      (record) => permissionIdFromDshRequestId(record.requestId) === permissionId
    )
  }
}

function permissionViewFromRecord(
  record: Extract<DshInteractionRequestRecord, { kind: 'permission_approval' }>
): ToolPermissionRequestProjection {
  const approvalProfileId = approvalProfileIdFor(record.payload.approvalProfileId)
  const classification = classifyCapability(record.capabilityId)
  return {
    schemaVersion: 3,
    approvalProfileId,
    approvalProfileDigest: createApprovalProfileSnapshot(approvalProfileId).digest,
    effectiveRisk: classification.effectiveRisk,
    maxGrant: record.payload.maxGrant,
    id: permissionIdFromDshRequestId(record.requestId),
    executionId: record.activityId,
    runId: record.runId,
    callId: record.activityId,
    toolId: record.capabilityId,
    toolName: record.payload.title || record.capabilityId,
    status: permissionStatusFromRecord(record),
    reason: classification.reason,
    risk: classification.risk,
    effectsDigest: record.effectDigest,
    argumentsDigest: record.scopeDigest,
    bindingRevision: 1,
    requestRevision: record.requestRevision,
    requestedAt: record.requestedAt,
    expiresAt: record.expiresAt,
    resources: [
      {
        kind: classification.resourceKind,
        label: record.payload.message || record.payload.title
      }
    ],
    ...(record.resolvedAt === undefined ? {} : { resolvedAt: record.resolvedAt }),
    ...(record.response?.kind === 'permission_approval'
      ? { decision: record.response.decision }
      : {})
  }
}

function permissionIdFromDshRequestId(requestId: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(requestId)) {
    return requestId
  }
  return `dsh-${createHash('sha256').update(requestId).digest('hex')}`
}

function permissionStatusFromRecord(
  record: DshInteractionRequestRecord
): ToolPermissionRequestProjection['status'] {
  if (
    record.status === 'resolved' &&
    record.response?.kind === 'permission_approval'
  ) {
    return record.response.decision === 'deny' ? 'denied' : 'approved'
  }
  if (record.status === 'expired') return 'expired'
  if (record.status === 'cancelled') return 'cancelled'
  return 'requested'
}

function approvalProfileIdFor(
  value: DshInteractionRequestRecord['payload'] extends infer Payload
    ? Payload extends { approvalProfileId: infer Id }
      ? Id
      : never
    : never
): ApprovalProfileId {
  return value === 'cautious' || value === 'trusted' ? value : 'protected'
}

function classifyCapability(capabilityId: string): {
  effectiveRisk: EffectiveRisk
  reason: ToolPermissionRequestProjection['reason']
  resourceKind: PendingToolPermissionResource['kind']
  risk: ToolRisk
} {
  if (
    /(?:^|[._-])(?:bash|shell|command|terminal|exec|process[._-]run)(?:[._-]|$)/i.test(
      capabilityId
    )
  ) {
    return {
      effectiveRisk: 'L3',
      reason: 'process',
      resourceKind: 'process',
      risk: 'high'
    }
  }
  if (
    /(?:^|[._-])(?:file|files|filesystem|write|edit)(?:[._-]|$)/i.test(
      capabilityId
    )
  ) {
    return {
      effectiveRisk: 'L2',
      reason: 'write',
      resourceKind: 'path',
      risk: 'medium'
    }
  }
  if (/(?:^|[._-])(?:web|network|connector|mcp)(?:[._-]|$)/i.test(capabilityId)) {
    return {
      effectiveRisk: 'L2',
      reason: 'external',
      resourceKind: 'network',
      risk: 'medium'
    }
  }
  return {
    effectiveRisk: 'L1',
    reason: 'system',
    resourceKind: 'application',
    risk: 'low'
  }
}
