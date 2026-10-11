export type TurnRelation = 'fresh' | 'continuation' | 'reference'

export type TurnContextReason =
  | 'explicit_reference'
  | 'clarification_response'
  | 'continuation_phrase'
  | 'entity_overlap'
  | 'semantic_match'
  | 'topic_changed'
  | 'runtime_only'
  | 'budget'
  | 'manual_fresh'
  | 'manual_continuation'

export type TurnContextRoute = Readonly<{
  schemaVersion: 1
  policyVersion: string
  sourceMessageId: string
  sourceDigest: string
  relation: TurnRelation
  predecessorMessageId?: string
  selectedMessageIds: readonly string[]
  excludedMessageIds: readonly string[]
  reasons: readonly TurnContextReason[]
  confidence: number
  createdAt: number
}>
