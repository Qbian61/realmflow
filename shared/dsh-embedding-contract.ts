import type { KnowledgeRuntimeManifest } from '../domain/dsh-run-manifest'

export type DshEmbeddingProfile = KnowledgeRuntimeManifest['embeddingProfile']

export type DshEmbeddingWorkerRequest = {
  profile: DshEmbeddingProfile
  texts: string[]
  signal?: AbortSignal
}

export type DshEmbeddingWorkerResult = {
  profile: DshEmbeddingProfile
  vectors: number[][]
}

export type DshDocumentEmbeddingInput = {
  id: string
  text: string
}

export type DshCatalogEmbeddingInput = DshDocumentEmbeddingInput & {
  catalogKind: 'workflow_template' | 'skill'
  catalogId: string
}

export type DshDocumentEmbeddingResult = {
  id: string
  vector: number[]
}
