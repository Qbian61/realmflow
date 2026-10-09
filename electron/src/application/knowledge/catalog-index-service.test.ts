import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  CatalogKnowledgePoint,
  CatalogSearchResult
} from '../../../../domain/catalog-knowledge'
import { createIsolatedVectorIndexProfile } from '../../../../domain/vector-index-profile'
import { CatalogIndexService } from './catalog-index-service'

const profile = createIsolatedVectorIndexProfile('catalog-test')

describe('CatalogIndexService', () => {
  it('replaces a published template version through its stable point id', async () => {
    const dependencies = createDependencies()
    const service = new CatalogIndexService({ ...dependencies, profile })
    const first = template()
    const next = {
      ...first,
      updatedAt: 300,
      currentVersion: {
        ...first.currentVersion,
        id: 'template-1-v3',
        version: 3
      }
    }

    await service.syncWorkflowTemplate(first)
    await service.syncWorkflowTemplate(next)

    const points = dependencies.qdrant.upsertPoints.mock.calls.map(
      ([, values]) => (values as CatalogKnowledgePoint[])[0]
    )
    expect(points[0].id).toBe(points[1].id)
    expect(points.map(({ payload }) => payload.versionId)).toEqual([
      'template-1-v2',
      'template-1-v3'
    ])
    expect(dependencies.qdrant.upsertPoints).toHaveBeenCalledWith(
      profile.catalogCollection,
      [expect.objectContaining({ payload: expect.any(Object) })],
      expect.any(AbortSignal)
    )
  })

  it('removes an archived template without embedding it', async () => {
    const dependencies = createDependencies()
    const service = new CatalogIndexService({ ...dependencies, profile })

    await service.syncWorkflowTemplate({
      ...template(),
      status: 'archived'
    })

    expect(dependencies.embedding.embedKnowledgeDocuments).not.toHaveBeenCalled()
    expect(dependencies.qdrant.deletePoints).toHaveBeenCalledWith(
      profile.catalogCollection,
      [expect.stringMatching(/^[a-f0-9-]{36}$/)],
      expect.any(AbortSignal)
    )
  })

  it('indexes only the enabled verified current Skill version', async () => {
    const dependencies = createDependencies()
    const service = new CatalogIndexService({ ...dependencies, profile })

    await service.syncSkill(skill())

    expect(dependencies.embedding.embedKnowledgeDocuments).toHaveBeenCalledWith(
      [
        {
          id: 'skill:com.example.planning',
          text: expect.stringContaining('# Planning')
        }
      ],
      expect.any(AbortSignal)
    )
    expect(dependencies.qdrant.upsertPoints).toHaveBeenCalledWith(
      profile.catalogCollection,
      [
        expect.objectContaining({
          payload: expect.objectContaining({
            profileId: profile.id,
            catalogKind: 'skill',
            catalogId: 'com.example.planning',
            versionId: 'skill-v2'
          })
        })
      ],
      expect.any(AbortSignal)
    )
  })

  it.each([
    ['disabled', { enabled: false }, 'verified'],
    ['corrupted', { enabled: true }, 'corrupted']
  ] as const)('removes a %s Skill from catalog results', async (
    _name,
    skillChanges,
    integrityStatus
  ) => {
    const dependencies = createDependencies()
    const service = new CatalogIndexService({ ...dependencies, profile })
    const record = skill()

    await service.syncSkill({
      ...record,
      skill: { ...record.skill, ...skillChanges },
      versions: record.versions.map((item) =>
        item.version.id === record.skill.currentVersionId
          ? {
              ...item,
              integrity: {
                ...item.integrity,
                status: integrityStatus
              }
            }
          : item
      )
    })

    expect(dependencies.embedding.embedKnowledgeDocuments).not.toHaveBeenCalled()
    expect(dependencies.qdrant.deletePoints).toHaveBeenCalledWith(
      profile.catalogCollection,
      [expect.stringMatching(/^[a-f0-9-]{36}$/)],
      expect.any(AbortSignal)
    )
  })

  it('searches only the catalog collection with optional kind filtering', async () => {
    const dependencies = createDependencies()
    dependencies.qdrant.searchCatalog.mockResolvedValue([
      catalogResult()
    ])
    const service = new CatalogIndexService({ ...dependencies, profile })

    await expect(
      service.search({
        query: ' release planning ',
        kind: 'skill' as const,
        topK: 5
      })
    ).resolves.toEqual([catalogResult()])

    expect(dependencies.qdrant.searchCatalog).toHaveBeenCalledWith({
      collection: profile.catalogCollection,
      query: 'release planning',
      dense: [1, ...Array(767).fill(0)],
      filter: {
        must: [
          {
            key: 'catalogKind',
            match: { value: 'skill' }
          }
        ]
      },
      topK: 5,
      signal: expect.any(AbortSignal)
    })
    expect(
      JSON.stringify(dependencies.qdrant.searchCatalog.mock.calls)
    ).not.toMatch(/workspaceId|generationId|realmflow_workspace_knowledge_v1/)
  })

  it('rejects catalog results whose content checksum is invalid', async () => {
    const dependencies = createDependencies()
    dependencies.qdrant.searchCatalog.mockResolvedValue([
      catalogResult({ content: 'tampered' })
    ])
    const service = new CatalogIndexService({ ...dependencies, profile })

    await expect(
      service.search({ query: 'release' })
    ).rejects.toThrow('Local catalog search failed')
  })
})

function createDependencies() {
  return {
    embedding: {
      embedKnowledgeDocuments: vi.fn(async (documents) => ({
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        dimensions: 768,
        embeddings: documents.map(({ id }: { id: string }) => ({
          id,
          embedding: [1, ...Array(767).fill(0)]
        }))
      })),
      embedKnowledgeQuery: vi.fn(async () => ({
        embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
        embeddingRevision:
          '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
        dimensions: 768,
        embedding: [1, ...Array(767).fill(0)]
      }))
    },
    qdrant: {
      upsertPoints: vi.fn(
        async (
          _collection: string,
          _points: readonly CatalogKnowledgePoint[],
          _signal?: AbortSignal
        ) => undefined
      ),
      deletePoints: vi.fn(
        async (
          _collection: string,
          _pointIds: readonly string[],
          _signal?: AbortSignal
        ) => undefined
      ),
      searchCatalog: vi.fn()
    }
  }
}

function template() {
  return {
    id: 'template-1',
    name: 'Release delivery',
    description: 'Ship a validated release.',
    status: 'published' as const,
    updatedAt: 200,
    currentVersion: {
      id: 'template-1-v2',
      templateId: 'template-1',
      version: 2,
      status: 'published' as const,
      nodes: [
        {
          id: 'node-1',
          stableKey: 'release',
          type: 'ai_generate' as const,
          name: 'Release',
          description: 'Prepare release',
          order: 0,
          allowSkip: false
        }
      ],
      edges: []
    }
  }
}

function skill() {
  const version = (id: string, versionNumber: string) => ({
    version: {
      id,
      skillId: 'com.example.planning',
      version: versionNumber,
      name: 'Planning',
      description: 'Generate a release plan.',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      permissions: ['filesystem.read'],
      network: { required: false, services: [] }
    },
    integrity: {
      status: 'verified' as const,
      checkedAt: 200,
      message: 'verified'
    }
  })
  return {
    skill: {
      id: 'com.example.planning',
      enabled: true,
      currentVersionId: 'skill-v2',
      revision: 2,
      createdAt: 100,
      updatedAt: 200
    },
    versions: [version('skill-v1', '1.0.0'), version('skill-v2', '2.0.0')]
  }
}

function catalogResult(
  overrides: Partial<CatalogSearchResult> = {}
): CatalogSearchResult {
  const content = '# Planning'
  return {
    id: 'catalog-point',
    schemaVersion: 1,
    profileId: profile.id,
    catalogKind: 'skill',
    catalogId: 'com.example.planning',
    versionId: 'skill-v2',
    sourceVersion: '2.0.0',
    title: 'Planning',
    content,
    checksum: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    updatedAt: 200,
    denseScore: 0.8,
    denseRank: 1,
    bm25Score: 2,
    bm25Rank: 1,
    fusionScore: 0.9,
    fusionRank: 1,
    ...overrides
  }
}
