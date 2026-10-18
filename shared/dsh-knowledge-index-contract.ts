import type {
  KnowledgeRuntimeManifest
} from '../domain/dsh-run-manifest'
import type { QdrantKnowledgeMatch } from '../domain/knowledge-search'

export type DshKnowledgeIndexLease = Readonly<{
  token: string
  leaseId: string
  manifestDigest: string
  runId: string
  sessionId: string
  collection: string
  workspaceIds: string[]
  generationIds: string[]
  sourceKinds: string[]
  requirementId?: string
  embeddingProfile: KnowledgeRuntimeManifest['embeddingProfile']
  limits: KnowledgeRuntimeManifest['limits']
  expiresAt: number
  issuedAt: number
}>

export type DshKnowledgeIndexAuthorizationRequest = {
  token: string
  workspaceIds: string[]
  generationIds: string[]
  sourceKinds?: string[]
  requirementId?: string
  topK: number
  returnedChunks: number
  now?: number
}

export type DshKnowledgeIndexSearchRequest = {
  token: string
  query: string
  dense: number[]
  profile: KnowledgeRuntimeManifest['embeddingProfile']
  workspaceIds: string[]
  generationIds: string[]
  sourceKinds?: string[]
  requirementId?: string
  topK: number
  signal?: AbortSignal
}

export type DshKnowledgeIndexPortRequest = Omit<
  DshKnowledgeIndexSearchRequest,
  'token'
> & {
  leaseId: string
  collection: string
}

export type DshKnowledgeIndexSearchResponse = {
  dense: QdrantKnowledgeMatch[]
  bm25: QdrantKnowledgeMatch[]
  fusion: QdrantKnowledgeMatch[]
}
