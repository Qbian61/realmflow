export const APPROVAL_PROFILES = ['cautious', 'protected', 'trusted'] as const
export type ApprovalProfileId = typeof APPROVAL_PROFILES[number]
export type EffectiveRisk = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
export const APPROVAL_POLICY_VERSION = '1.0.0'
// SHA-256 of the canonical profile payload; version changes require new digests.
const PROFILE_DIGESTS: Record<ApprovalProfileId, string> = {
  cautious: '5380bc479fbe6d94bfb4f21361d215c6db225c52c51822718d87219916b19ea6',
  protected: '42fff4157af1bdecd796d356da126b1df9d035800bcc844ea30493be70ecb8e4',
  trusted: 'f4521ced733555baa248d0e94bd9a2fa97000dc5366982f10f46fd3cc05eaa1b',
}

export type ApprovalProfileSnapshot = {
  schemaVersion: 1
  id: ApprovalProfileId
  policyVersion: string
  digest: string
}

export function normalizeApprovalProfile(value: unknown): ApprovalProfileId {
  if (!APPROVAL_PROFILES.includes(value as ApprovalProfileId)) {
    throw new Error('Approval profile is invalid')
  }
  return value as ApprovalProfileId
}

export function createApprovalProfileSnapshot(
  id: ApprovalProfileId = 'protected',
): ApprovalProfileSnapshot {
  const profile = {
    schemaVersion: 1 as const,
    id: normalizeApprovalProfile(id),
    policyVersion: APPROVAL_POLICY_VERSION,
  }
  return Object.freeze({
    ...profile,
    digest: PROFILE_DIGESTS[profile.id],
  })
}

export function restrictApprovalProfile(
  parent: ApprovalProfileId,
  requested: ApprovalProfileId,
): ApprovalProfileId {
  return APPROVAL_PROFILES[Math.min(
    APPROVAL_PROFILES.indexOf(normalizeApprovalProfile(parent)),
    APPROVAL_PROFILES.indexOf(normalizeApprovalProfile(requested)),
  )]
}
