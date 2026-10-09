export const CONTEXT_SNAPSHOT_POLICY_VERSION = 3

export type ContextSourceKind =
  | 'requirement'
  | 'node'
  | 'predecessor_artifact'
  | 'ancestor_artifact'
  | 'node_answer'
  | 'node_todo'
  | 'knowledge'
  | 'attachment'

export type ContextSource = {
  kind: ContextSourceKind
  id: string
  version: number
  characterCount: number
  includedCharacters: number
  estimatedTokens: number
  status: 'included' | 'excluded'
  truncated: boolean
  summarized: boolean
  redacted: boolean
  exclusionReason?:
    | 'sensitive_file'
    | 'low_confidence'
    | 'budget_exhausted'
    | 'duplicate'
  sourceId?: string
  documentKey?: string
  generationId?: string
  sourceVersion?: string
  chunkId?: string
  chunkOrdinal?: number
  startOffset?: number
  endOffset?: number
  checksum?: string
  denseScore?: number
  denseRank?: number
  bm25Score?: number
  bm25Rank?: number
  fusionScore?: number
  fusionRank?: number
  preview: string
}

export type ContextSnapshot = {
  policyVersion: typeof CONTEXT_SNAPSHOT_POLICY_VERSION
  content: string
  sources: ContextSource[]
  plan: {
    totalTokenBudget: number
    allocations: {
      fixed: number
      knowledge: number
    }
  }
  insufficientKnowledge: boolean
  characterCount: number
  estimatedTokens: number
  checksum: string
}

export type PersistedContextSnapshot = ContextSnapshot & {
  id: string
  requirementId: string
  nodeId: string
  nodeRunId: string
  providerId: string
  modelProfileId: string
  modelId: string
  modelParameters: {
    timeoutMs: number
    maxRetries: number
    maxConcurrency: number
    reasoningPolicy?: 'inherit' | 'off' | 'low' | 'medium' | 'high'
  }
  createdAt: number
}
