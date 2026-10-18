import type { DshRunOwner } from './dsh-run-manifest'
import {
  requireDigest,
  requireEnum,
  requireIdentifier,
  requireInteger
} from './tool-protocol-validation'

export type DshSessionBindingLifecycleStatus =
  | 'active'
  | 'closing'
  | 'paused'
  | 'closed'
  | 'cancelled'
  | 'failed'
  | 'reset'

export type DshSessionBinding = {
  owner: DshRunOwner
  ownerKey: string
  dshSessionId: string
  runManifestDigest: string
  runtimeBuildDigest: string
  lastProjectedSequence: number
  lifecycleStatus: DshSessionBindingLifecycleStatus
  createdAt: number
  updatedAt: number
}

export type CreateDshSessionBindingInput = {
  owner: DshRunOwner
  dshSessionId: string
  runManifestDigest: string
  runtimeBuildDigest: string
  lastProjectedSequence?: number
  lifecycleStatus?: DshSessionBindingLifecycleStatus
  createdAt: number
  updatedAt?: number
}

const LIFECYCLE_STATUSES = new Set<DshSessionBindingLifecycleStatus>([
  'active',
  'closing',
  'paused',
  'closed',
  'cancelled',
  'failed',
  'reset'
])

export function createDshSessionBinding(
  input: CreateDshSessionBindingInput
): DshSessionBinding {
  const owner = normalizeOwner(input.owner)
  const createdAt = requireInteger(input.createdAt, 'DSH binding createdAt', 0, Number.MAX_SAFE_INTEGER)
  return {
    owner,
    ownerKey: dshRunOwnerKey(owner),
    dshSessionId: requireIdentifier(input.dshSessionId, 'DSH session ID'),
    runManifestDigest: requireDigest(input.runManifestDigest, 'DSH run manifest digest'),
    runtimeBuildDigest: requireDigest(input.runtimeBuildDigest, 'DSH runtime build digest'),
    lastProjectedSequence: requireInteger(
      input.lastProjectedSequence ?? 0,
      'DSH last projected sequence',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    lifecycleStatus: requireEnum(
      input.lifecycleStatus ?? 'active',
      LIFECYCLE_STATUSES,
      'DSH binding lifecycle status'
    ),
    createdAt,
    updatedAt: requireInteger(
      input.updatedAt ?? createdAt,
      'DSH binding updatedAt',
      createdAt,
      Number.MAX_SAFE_INTEGER
    )
  }
}

export function dshRunOwnerKey(owner: DshRunOwner): string {
  const normalized = normalizeOwner(owner)
  if (normalized.nodeRunId !== undefined) {
    return [
      'requirement-node',
      normalized.workspaceId,
      normalized.requirementId,
      normalized.nodeRunId
    ].join(':')
  }
  if (normalized.requirementId !== undefined) {
    return [
      'requirement',
      normalized.workspaceId,
      normalized.requirementId
    ].join(':')
  }
  if (normalized.workspaceId !== undefined) {
    return ['workspace', normalized.workspaceId].join(':')
  }
  if (normalized.conversationId !== undefined) {
    return ['conversation', normalized.conversationId].join(':')
  }
  if (normalized.scheduleRunId !== undefined) {
    return ['schedule', normalized.scheduleRunId].join(':')
  }
  throw new Error('DSH run owner is invalid')
}

export function assertDshSessionReusable(
  existing: DshSessionBinding,
  owner: DshRunOwner
): void {
  const ownerKey = dshRunOwnerKey(owner)
  if (existing.ownerKey !== ownerKey) {
    throw new Error('DSH session cross-owner reuse is forbidden')
  }
}

export function advanceDshSessionProjection(
  binding: DshSessionBinding,
  nextSequence: number,
  updatedAt: number
): DshSessionBinding {
  const sequence = requireInteger(
    nextSequence,
    'DSH projection sequence',
    0,
    Number.MAX_SAFE_INTEGER
  )
  if (sequence < binding.lastProjectedSequence) {
    throw new Error('DSH projection sequence cannot move backwards')
  }
  return {
    ...binding,
    lastProjectedSequence: sequence,
    updatedAt: requireInteger(updatedAt, 'DSH binding updatedAt', binding.updatedAt, Number.MAX_SAFE_INTEGER)
  }
}

export function transitionDshSessionBinding(
  binding: DshSessionBinding,
  lifecycleStatus: DshSessionBindingLifecycleStatus,
  updatedAt: number
): DshSessionBinding {
  return {
    ...binding,
    lifecycleStatus: requireEnum(
      lifecycleStatus,
      LIFECYCLE_STATUSES,
      'DSH binding lifecycle status'
    ),
    updatedAt: requireInteger(updatedAt, 'DSH binding updatedAt', binding.updatedAt, Number.MAX_SAFE_INTEGER)
  }
}

export function resetDshSessionBinding(
  binding: DshSessionBinding,
  updatedAt: number
): DshSessionBinding {
  return {
    ...binding,
    lastProjectedSequence: 0,
    lifecycleStatus: 'reset',
    updatedAt: requireInteger(updatedAt, 'DSH binding updatedAt', binding.updatedAt, Number.MAX_SAFE_INTEGER)
  }
}

function normalizeOwner(owner: DshRunOwner): DshRunOwner {
  if (owner.nodeRunId !== undefined) {
    return {
      workspaceId: requireIdentifier(owner.workspaceId, 'DSH owner workspace ID'),
      requirementId: requireIdentifier(owner.requirementId, 'DSH owner requirement ID'),
      nodeRunId: requireIdentifier(owner.nodeRunId, 'DSH owner node run ID')
    }
  }
  if (owner.requirementId !== undefined) {
    return {
      workspaceId: requireIdentifier(owner.workspaceId, 'DSH owner workspace ID'),
      requirementId: requireIdentifier(owner.requirementId, 'DSH owner requirement ID')
    }
  }
  if (owner.workspaceId !== undefined) {
    return {
      workspaceId: requireIdentifier(owner.workspaceId, 'DSH owner workspace ID')
    }
  }
  if (owner.conversationId !== undefined) {
    return {
      conversationId: requireIdentifier(owner.conversationId, 'DSH owner conversation ID')
    }
  }
  if (owner.scheduleRunId !== undefined) {
    return {
      scheduleRunId: requireIdentifier(owner.scheduleRunId, 'DSH owner schedule run ID')
    }
  }
  throw new Error('DSH run owner is invalid')
}
