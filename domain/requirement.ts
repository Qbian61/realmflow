export const REQUIREMENT_STAGE_IDS = [
  'analysis',
  'design',
  'implementation',
  'testing',
  'release',
  'retrospective'
] as const

export type RequirementStageId = (typeof REQUIREMENT_STAGE_IDS)[number]

export function isRequirementStageId(
  value: unknown
): value is RequirementStageId {
  return (
    typeof value === 'string' &&
    REQUIREMENT_STAGE_IDS.some((stage) => stage === value)
  )
}
