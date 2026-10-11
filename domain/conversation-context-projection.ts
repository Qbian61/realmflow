export type ProjectedConversationMessage = Readonly<{
  messageId: string
  role: 'user' | 'assistant' | 'tool'
  content: string
}>

export type ContextExclusionReason =
  | 'unrelated'
  | 'runtime_handle'
  | 'tool_result_pruned'
  | 'budget'
  | 'sensitive'

export type CompactedConversationFact = Readonly<{
  objective: string
  decisions: readonly string[]
  constraints: readonly string[]
  openItems: readonly string[]
  artifacts: readonly string[]
  stableReferences: readonly string[]
  sourceMessageIds: readonly string[]
}>

export type RecalledMemoryReference = Readonly<{
  id: string
  content: string
  sourceMessageIds: readonly string[]
  score: number
}>

export type ConversationContextProjection = Readonly<{
  schemaVersion: 1
  id: string
  conversationId: string
  sourceMessageId: string
  routePolicyVersion: string
  projectionPolicyVersion: string
  recentMessages: readonly ProjectedConversationMessage[]
  compactedFacts: readonly CompactedConversationFact[]
  recalledMemory: readonly RecalledMemoryReference[]
  excluded: readonly Readonly<{
    messageId: string
    reason: ContextExclusionReason
  }>[]
  characterCount: number
  estimatedTokens: number
  digest: string
  createdAt: number
}>
