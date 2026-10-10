import type { SkillDefinition } from './skill-definition'
import type { ToolRisk } from './tool-definition'

export type SkillSourceKind =
  | 'builtin'
  | 'workspace'
  | 'user_global'
  | 'plugin'
  | 'generated'

export type SkillReviewStatus = 'pending' | 'approved' | 'rejected'

export type SkillSource = {
  id: string
  kind: SkillSourceKind
  displayName: string
  locator: string
  revision: number
  lastScannedAt: number
}

export type RegisteredSkillVersion = {
  skillId: string
  version: string
  digest: string
  sourceId: string
  definition: SkillDefinition
  instructionsDigest: string
  instructions: string
  boundaryNotes: string
  risk: ToolRisk
  discoveredAt: number
}

export type SkillReview = {
  skillId: string
  version: string
  digest: string
  status: SkillReviewStatus
  notes: string
  revision: number
  reviewedAt: number
}

export type SkillActivationPreference = {
  skillId: string
  version: string
  digest: string
  enabled: boolean
  revision: number
  updatedAt: number
}

export type RegisteredSkill = {
  source: SkillSource
  version: RegisteredSkillVersion
  review: SkillReview
  activation: SkillActivationPreference
  present: boolean
}

export function skillVersionKey(
  value: Pick<RegisteredSkillVersion, 'skillId' | 'version' | 'digest'>,
): string {
  return `${value.skillId}@${value.version}:${value.digest}`
}

export function isRegisteredSkillAvailable(skill: RegisteredSkill): boolean {
  return skill.review.status === 'approved' && skill.activation.enabled
}
