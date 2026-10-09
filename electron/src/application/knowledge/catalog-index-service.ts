import { createHash } from 'node:crypto'
import {
  createCatalogKnowledgePoint,
  createCatalogKnowledgePointId,
  normalizeCatalogSearchQuery,
  projectSkillCatalogDocument,
  projectWorkflowTemplateCatalogDocument,
  type CatalogKnowledgeDocument,
  type CatalogKnowledgePoint,
  type CatalogSearchQueryInput,
  type CatalogSearchResult
} from '../../../../domain/catalog-knowledge'
import {
  type VectorIndexProfile
} from '../../../../domain/vector-index-profile'

type WorkflowTemplateInput = Parameters<
  typeof projectWorkflowTemplateCatalogDocument
>[0]
type SkillCatalogInput = Parameters<typeof projectSkillCatalogDocument>[0]

type EmbeddingPort = {
  embedKnowledgeDocuments(
    documents: Array<{ id: string; text: string }>,
    signal: AbortSignal
  ): Promise<{
    embeddingModel: string
    embeddingRevision: string
    dimensions: number
    embeddings: Array<{ id: string; embedding: number[] }>
  }>
  embedKnowledgeQuery(
    query: string,
    signal: AbortSignal
  ): Promise<{
    embeddingModel: string
    embeddingRevision: string
    dimensions: number
    embedding: number[]
  }>
}

type CatalogQdrantPort = {
  upsertPoints(
    collection: string,
    points: readonly CatalogKnowledgePoint[],
    signal?: AbortSignal
  ): Promise<void>
  deletePoints(
    collection: string,
    pointIds: readonly string[],
    signal?: AbortSignal
  ): Promise<void>
  searchCatalog(input: {
    collection: string
    query: string
    dense: number[]
    filter: {
      must: Array<{
        key: string
        match: { value: string } | { any: string[] }
      }>
    }
    topK: number
    signal: AbortSignal
  }): Promise<CatalogSearchResult[]>
}

export interface CatalogKnowledgeLifecyclePort {
  syncWorkflowTemplate(template: WorkflowTemplateInput): Promise<void>
  syncSkill(skill: SkillCatalogInput): Promise<void>
}

export class CatalogIndexService implements CatalogKnowledgeLifecyclePort {
  constructor(
    private readonly dependencies: {
      embedding: EmbeddingPort
      qdrant: CatalogQdrantPort
      profile: VectorIndexProfile | (() => VectorIndexProfile)
    }
  ) {}

  async syncWorkflowTemplate(
    template: WorkflowTemplateInput
  ): Promise<void> {
    await this.sync(
      'workflow_template',
      template.id,
      projectWorkflowTemplateCatalogDocument(template)
    )
  }

  async syncSkill(skill: SkillCatalogInput): Promise<void> {
    await this.sync(
      'skill',
      skill.skill.id,
      projectSkillCatalogDocument(skill)
    )
  }

  async search(input: CatalogSearchQueryInput): Promise<CatalogSearchResult[]> {
    const query = normalizeCatalogSearchQuery(input)
    const profile = this.profile()
    const controller = new AbortController()
    try {
      const embedded = await this.dependencies.embedding.embedKnowledgeQuery(
        query.query,
        controller.signal
      )
      assertEmbeddingResponse(
        embedded,
        embedded.embedding,
        profile
      )
      const results = await this.dependencies.qdrant.searchCatalog({
        collection: profile.catalogCollection,
        query: query.query,
        dense: embedded.embedding,
        filter: {
          must: query.kind
            ? [
                {
                  key: 'catalogKind',
                  match: { value: query.kind }
                }
              ]
            : []
        },
        topK: query.topK,
        signal: controller.signal
      })
      results.forEach((result) =>
        validateSearchResult(result, profile)
      )
      return results
    } catch {
      throw new Error('Local catalog search failed')
    }
  }

  private async sync(
    kind: CatalogKnowledgeDocument['kind'],
    catalogId: string,
    document: CatalogKnowledgeDocument | null
  ): Promise<void> {
    const profile = this.profile()
    const controller = new AbortController()
    if (!document) {
      await this.dependencies.qdrant.deletePoints(
        profile.catalogCollection,
        [createCatalogKnowledgePointId(kind, catalogId)],
        controller.signal
      )
      return
    }

    const embeddingId = `${kind === 'skill' ? 'skill' : 'template'}:${catalogId}`
    const response =
      await this.dependencies.embedding.embedKnowledgeDocuments(
        [{ id: embeddingId, text: document.content }],
        controller.signal
      )
    if (
      response.embeddings.length !== 1 ||
      response.embeddings[0]?.id !== embeddingId
    ) {
      throw new Error('Catalog embedding response is invalid')
    }
    assertEmbeddingResponse(
      response,
      response.embeddings[0].embedding,
      profile
    )
    await this.dependencies.qdrant.upsertPoints(
      profile.catalogCollection,
      [
        createCatalogKnowledgePoint({
          document,
          profile,
          dense: response.embeddings[0].embedding
        })
      ],
      controller.signal
    )
  }

  private profile(): VectorIndexProfile {
    return typeof this.dependencies.profile === 'function'
      ? this.dependencies.profile()
      : this.dependencies.profile
  }
}

function assertEmbeddingResponse(
  response: {
    embeddingModel: string
    embeddingRevision: string
    dimensions: number
  },
  embedding: number[],
  profile: VectorIndexProfile
): void {
  if (
    response.embeddingModel !== profile.embeddingModel ||
    response.embeddingRevision !== profile.embeddingRevision ||
    response.dimensions !== profile.dimensions ||
    embedding.length !== profile.dimensions ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Catalog embedding response is invalid')
  }
}

function validateSearchResult(
  result: CatalogSearchResult,
  profile: VectorIndexProfile
): void {
  if (
    result.schemaVersion !== 1 ||
    result.profileId !== profile.id ||
    result.checksum !== checksum(result.content)
  ) {
    throw new Error('Catalog search result is invalid')
  }
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
