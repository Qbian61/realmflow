import type {
  SkillActivationPreference,
  SkillReview,
  SkillSource,
} from '../domain/skill-registry'
import type { ToolRisk } from '../domain/tool-definition'

export type SkillRegistryItemDto = {
  source: SkillSource
  skill: {
    id: string
    version: string
    digest: string
    name: string
    description: string
    risk: ToolRisk
    contexts: string[]
    requiredTools: Array<{
      toolId: string
      versionRange: string
      required: boolean
    }>
    instructionsDigest: string
    boundaryNotes: string
  }
  review: SkillReview
  activation: SkillActivationPreference
  present: boolean
}

export type SkillRegistryReviewCommand = {
  skillId: string
  version: string
  digest: string
  status: 'approved' | 'rejected'
  notes: string
  expectedRevision: number
  requestId: string
}

export type SkillRegistryActivationCommand = {
  skillId: string
  version: string
  digest: string
  enabled: boolean
  expectedRevision: number
  requestId: string
}

export type SkillRegistrySyncResult = {
  published: number
  errorCount: number
}

export interface SkillRegistryApi {
  list: () => Promise<SkillRegistryItemDto[]>
  synchronize: () => Promise<SkillRegistrySyncResult>
  review: (
    command: SkillRegistryReviewCommand,
  ) => Promise<SkillReview>
  setActivation: (
    command: SkillRegistryActivationCommand,
  ) => Promise<SkillActivationPreference>
}
