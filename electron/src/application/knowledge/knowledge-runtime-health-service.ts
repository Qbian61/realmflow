import {
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION,
  type VectorIndexProfile
} from '../../../../domain/vector-index-profile'

type QdrantHealth =
  | {
      status: 'ready'
      process: 'ready'
      workspaceCollection: 'ready'
    }
  | {
      status: 'unavailable'
      process: 'stopped' | 'starting' | 'ready' | 'failed' | 'stopping'
      workspaceCollection: 'unknown' | 'unavailable'
      errorCode:
        | 'QDRANT_RUNTIME_UNAVAILABLE'
        | 'QDRANT_COLLECTION_UNAVAILABLE'
    }

type EmbeddingHealth =
  | {
      status: 'ready'
      model: typeof GTE_EMBEDDING_MODEL
      revision: typeof GTE_EMBEDDING_REVISION
      dimensions: typeof GTE_EMBEDDING_DIMENSIONS
      normalize: 'L2'
      runtime: 'onnxruntime-cpu'
    }
  | {
      status: 'unavailable'
      model: typeof GTE_EMBEDDING_MODEL
      revision: typeof GTE_EMBEDDING_REVISION
      dimensions: typeof GTE_EMBEDDING_DIMENSIONS
      normalize: 'L2'
      runtime: 'onnxruntime-cpu'
      errorCode: string
    }

export type KnowledgeRuntimeHealth = {
  status: 'ready' | 'unavailable'
  components: {
    vectorStore: 'ready' | 'unavailable'
    embeddings: 'ready' | 'unavailable'
  }
}

export class KnowledgeRuntimeHealthService {
  constructor(
    private readonly dependencies: {
      profile: VectorIndexProfile
      qdrant: {
        getRuntimeHealth(profile: VectorIndexProfile): Promise<QdrantHealth>
      }
      embedding: { getEmbeddingModelHealth(): Promise<EmbeddingHealth> }
    }
  ) {}

  async get(): Promise<KnowledgeRuntimeHealth> {
    const [qdrant, embedding] = await Promise.all([
      this.dependencies.qdrant.getRuntimeHealth(this.dependencies.profile),
      this.readEmbeddingHealth()
    ])
    return {
      status:
        qdrant.status === 'ready' && embedding.status === 'ready'
          ? 'ready'
          : 'unavailable',
      components: {
        vectorStore: qdrant.status,
        embeddings: embedding.status
      }
    }
  }

  private async readEmbeddingHealth(): Promise<EmbeddingHealth> {
    try {
      return await this.dependencies.embedding.getEmbeddingModelHealth()
    } catch {
      return {
        status: 'unavailable',
        model: GTE_EMBEDDING_MODEL,
        revision: GTE_EMBEDDING_REVISION,
        dimensions: GTE_EMBEDDING_DIMENSIONS,
        normalize: 'L2',
        runtime: 'onnxruntime-cpu',
        errorCode: 'MODEL_RUNTIME_UNAVAILABLE'
      }
    }
  }
}
