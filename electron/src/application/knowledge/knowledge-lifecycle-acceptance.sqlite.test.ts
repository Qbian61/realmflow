import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  CatalogKnowledgePoint,
  CatalogSearchResult
} from '../../../../domain/catalog-knowledge'
import type { ChunkedKnowledgeResult } from '../../../../domain/knowledge-chunking'
import type {
  WorkspaceKnowledgePoint,
  WorkspaceKnowledgePointPayload
} from '../../../../domain/knowledge-index-generation'
import type { KnowledgeSearchResult } from '../../../../domain/knowledge-search'
import {
  DEFAULT_VECTOR_INDEX_PROFILE,
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION
} from '../../../../domain/vector-index-profile'
import { RequirementNodeConversationContextAssembler } from '../conversation/requirement-node-context'
import { SpaceConversationContextAssembler } from '../conversation/space-conversation-context'
import { ContextAssembler } from '../context/context-assembler'
import { SqliteContextSources } from '../../infrastructure/context/sqlite-context-sources'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteKnowledgeNoteRepository } from '../../infrastructure/sqlite/knowledge-note-repository'
import { SqliteKnowledgeSearchStore } from '../../infrastructure/sqlite/knowledge-search-store'
import { SqliteKnowledgeSourceRepository } from '../../infrastructure/sqlite/knowledge-source-repository'
import { createSqliteRepositories } from '../../infrastructure/sqlite/repositories'
import { SqliteRepositoryIngestionStore } from '../../infrastructure/sqlite/repository-ingestion-store'
import { SqliteRequirementMemoryRepository } from '../../infrastructure/sqlite/requirement-memory-repository'
import { SqliteVectorIndexRepository } from '../../infrastructure/sqlite/vector-index-repository'
import { CatalogIndexService } from './catalog-index-service'
import { HybridKnowledgeSearchService } from './hybrid-knowledge-search-service'
import { KnowledgeIndexCoordinator } from './knowledge-index-coordinator'
import { MainKnowledgeIndexSourceReader } from './knowledge-index-source-reader'
import { KnowledgeIndexWorker } from './knowledge-index-worker'
import { KnowledgeNoteService } from './knowledge-note-service'
import { RequirementMemoryService } from './requirement-memory-service'

describe('P3-38..39 knowledge lifecycle acceptance with SQLite', () => {
  let directory: string
  let database: RealmFlowDatabase
  let harness: ReturnType<typeof createHarness>

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-knowledge-acceptance-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    seedCanonicalData(database)
    harness = createHarness(database)
    await harness.indexes.ensureActiveProfile(1)
  })

  afterEach(async () => {
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('returns the same indexed chunk to explicit search, space chat, and node context', async () => {
    await harness.requirementMemories.syncCompleted('requirement-1')
    await expect(harness.worker.runNext()).resolves.toBe('completed')

    const explicit = await harness.search.search({
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      query: 'acceptance-canary-3839',
      sourceKinds: ['requirement_memory']
    })
    expect(explicit).toHaveLength(1)
    const fixedChunk = explicit[0]

    const spaceContext = await new SpaceConversationContextAssembler(
      harness.search
    ).assemble('workspace-1', 'acceptance-canary-3839')
    const nodeContext = await createNodeContextAssembler(
      database,
      harness.search
    ).assemble({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      query: 'acceptance-canary-3839'
    })

    expect(spaceContext).toContain(fixedChunk.content)
    expect(nodeContext.context).toContain(fixedChunk.content)
    expect(harness.protocol.workspaceSearches).toEqual([
      expect.objectContaining({
        workspaceIds: ['workspace-1'],
        generationIds: [fixedChunk.generationId]
      }),
      expect.objectContaining({
        workspaceIds: ['workspace-1'],
        generationIds: [fixedChunk.generationId]
      }),
      expect.objectContaining({
        workspaceIds: ['workspace-1'],
        generationIds: [fixedChunk.generationId]
      })
    ])
  })

  it('indexes completed Requirement Memory and hides it immediately on rollback', async () => {
    await expect(
      harness.requirementMemories.syncCompleted('requirement-1')
    ).resolves.toMatchObject({ status: 'enqueued', completionVersion: 1 })
    await expect(harness.worker.runNext()).resolves.toBe('completed')

    await expect(
      harness.search.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: 'acceptance-canary-3839',
        sourceKinds: ['requirement_memory'],
        requirementId: 'requirement-1'
      })
    ).resolves.toHaveLength(1)

    await expect(
      harness.requirementMemories.withdraw('requirement-1')
    ).resolves.toEqual({ status: 'withdrawn' })
    await expect(
      harness.search.search({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        query: 'acceptance-canary-3839',
        sourceKinds: ['requirement_memory'],
        requirementId: 'requirement-1'
      })
    ).resolves.toEqual([])
  })

  it('switches Knowledge Note generations on edit and hides the note on archive', async () => {
    const created = await harness.notes.createDecisionNote({
      id: 'note-1',
      versionId: 'note-version-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      sourceMessageIds: ['message-1', 'message-2'],
      title: 'Initial decision',
      content: 'note-canary-v1'
    })
    await expect(harness.worker.runNext()).resolves.toBe('completed')
    await expect(searchDecision(harness.search, 'note-canary-v1')).resolves
      .toHaveLength(1)

    const edited = await harness.notes.edit({
      noteId: created.note.id,
      expectedRevision: created.note.revision,
      versionId: 'note-version-2',
      title: 'Updated decision',
      content: 'note-canary-v2'
    })
    await expect(harness.worker.runNext()).resolves.toBe('completed')

    await expect(searchDecision(harness.search, 'note-canary-v1')).resolves
      .toEqual([])
    await expect(searchDecision(harness.search, 'note-canary-v2')).resolves
      .toHaveLength(1)

    await harness.notes.archive({
      noteId: edited.note.id,
      expectedRevision: edited.note.revision
    })
    await expect(searchDecision(harness.search, 'note-canary-v2')).resolves
      .toEqual([])
  })

  it('searches published templates and enabled Skills, then removes inactive entries', async () => {
    await harness.catalog.syncWorkflowTemplate(template('published'))
    await expect(
      harness.catalog.search({
        query: 'template-canary-3839',
        kind: 'workflow_template'
      })
    ).resolves.toEqual([
      expect.objectContaining({
        catalogKind: 'workflow_template',
        catalogId: 'template-1'
      })
    ])

    await harness.catalog.syncWorkflowTemplate(template('archived'))
    await expect(
      harness.catalog.search({
        query: 'template-canary-3839',
        kind: 'workflow_template'
      })
    ).resolves.toEqual([])

    await harness.catalog.syncSkill(skill(true))
    await expect(
      harness.catalog.search({
        query: 'skill-canary-3839',
        kind: 'skill' as const
      })
    ).resolves.toEqual([
      expect.objectContaining({
        catalogKind: 'skill',
        catalogId: 'com.example.acceptance'
      })
    ])

    await harness.catalog.syncSkill(skill(false))
    await expect(
      harness.catalog.search({
        query: 'skill-canary-3839',
        kind: 'skill' as const
      })
    ).resolves.toEqual([])
  })
})

function createHarness(database: RealmFlowDatabase) {
  let idSequence = 0
  let now = 100
  const indexes = new SqliteVectorIndexRepository(database)
  const memories = new SqliteRequirementMemoryRepository(database)
  const noteRepository = new SqliteKnowledgeNoteRepository(database)
  const knowledgeSources = new SqliteKnowledgeSourceRepository(database)
  const protocol = new StrictInMemoryKnowledgeProtocol()
  const reader = new MainKnowledgeIndexSourceReader({
    sources: knowledgeSources,
    localFiles: knowledgeSources,
    onlineDocuments: knowledgeSources,
    repositories: new SqliteRepositoryIngestionStore(database),
    workspaces: createSqliteRepositories(database).workspaces,
    requirementMemories: memories,
    knowledgeNotes: noteRepository
  })
  const coordinator = new KnowledgeIndexCoordinator({
    repository: indexes,
    reader,
    createId: () => `acceptance-id-${++idSequence}`,
    now: () => ++now
  })
  const worker = new KnowledgeIndexWorker({
    repository: indexes,
    reader,
    sidecar: protocol,
    qdrant: protocol,
    profile: DEFAULT_VECTOR_INDEX_PROFILE,
    now: () => ++now
  })
  const search = new HybridKnowledgeSearchService({
    profile: DEFAULT_VECTOR_INDEX_PROFILE,
    store: new SqliteKnowledgeSearchStore(database),
    sidecar: protocol,
    qdrant: protocol
  })
  const requirementMemories = new RequirementMemoryService(
    {
      requirements: {
        get: async (id) => {
          const row = database
            .prepare(
              `SELECT id, workspace_id, title, status, revision
               FROM requirements WHERE id = ?`
            )
            .get(id) as
            | {
                id: string
                workspace_id: string
                title: string
                status: 'pending' | 'active' | 'completed'
                revision: number
              }
            | undefined
          return row
            ? {
                id: row.id,
                workspaceId: row.workspace_id,
                title: row.title,
                status: row.status,
                revision: row.revision
              }
            : undefined
        }
      },
      readRequirementBody: async () =>
        [
          '# Acceptance',
          'The fixed result is acceptance-canary-3839.',
          '',
          '## Scope',
          '- Space and node retrieval',
          '',
          '## Acceptance Criteria',
          '- All entry points return the same chunk'
        ].join('\n'),
      executions: { getLatestByRequirement: async () => undefined },
      nodeRuns: { listLatestByExecution: async () => [] },
      questions: { listByNodeRun: async () => [] },
      artifacts: { listByRequirement: async () => [] },
      memories,
      coordinator
    },
    () => ++now
  )
  const notes = new KnowledgeNoteService({
    sessions: {
      get: async (id) =>
        id === 'session-1'
          ? {
              id,
              workspaceId: 'workspace-1',
              requirementId: 'requirement-1',
              messages: [
                {
                  id: 'message-1',
                  role: 'user',
                  status: 'completed',
                  content: 'Choose storage',
                  sortOrder: 0
                },
                {
                  id: 'message-2',
                  role: 'assistant',
                  status: 'completed',
                  content: 'Use local storage',
                  sortOrder: 1
                }
              ]
            }
          : undefined
    },
    repository: noteRepository,
    coordinator,
    visibility: { hide: async () => undefined },
    now: () => ++now
  })
  return {
    indexes,
    worker,
    search,
    requirementMemories,
    notes,
    catalog: new CatalogIndexService({
      embedding: protocol,
      qdrant: protocol,
      profile: DEFAULT_VECTOR_INDEX_PROFILE
    }),
    protocol
  }
}

function createNodeContextAssembler(
  database: RealmFlowDatabase,
  search: HybridKnowledgeSearchService
): RequirementNodeConversationContextAssembler {
  const sources = new SqliteContextSources(
    database,
    {
      readFile: async () => {
        throw new Error('No artifact should be read')
      }
    },
    search
  )
  const assembler = new ContextAssembler({
    artifacts: sources,
    knowledge: sources,
    questions: { listByNodeRun: async () => [] },
    todos: { listByNodeRun: async () => [] },
    attachments: {
      read: async () => {
        throw new Error('No attachment should be read')
      }
    }
  })
  return new RequirementNodeConversationContextAssembler({
    requirements: {
      get: async () => ({
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Acceptance',
        bodyRelativePath: 'requirement.md',
        status: 'active',
        sortOrder: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      })
    },
    workflows: {
      get: async () => ({
        requirementId: 'requirement-1',
        templateVersionId: 'template-version-1',
        revision: 1,
        maxParallelism: 1,
        nodes: [
          {
            id: 'node-1',
            type: 'ai_generate',
            name: 'Acceptance node',
            description: '',
            order: 0,
            status: 'running',
            allowSkip: false,
            configuration: {
              input: {
                includeRequirementBody: false,
                predecessorArtifacts: 'none',
                includeSpaceKnowledge: true,
                attachments: []
              },
              prompt: 'Verify retrieval',
              model: { strategy: 'inherit' },
              connectorIds: [],
              permissions: [],
              artifact: {
                required: false,
                relativePath: 'artifacts/acceptance.md',
                kind: 'markdown'
              },
              todos: [],
              completionGate: { requireApproval: false },
              retry: { maxAttempts: 1, backoffMs: 0 },
              skip: { allowed: false, requireReason: false }
            }
          }
        ],
        edges: []
      })
    },
    executions: {
      getLatestByRequirement: async () => ({
        id: 'execution-1',
        requirementId: 'requirement-1',
        status: 'running',
        currentNodeId: 'node-1',
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      })
    },
    nodeRuns: {
      get: async () => ({
        id: 'node-run-1',
        executionId: 'execution-1',
        nodeId: 'node-1',
        status: 'running',
        attempt: 1,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      })
    },
    assembler,
    workspace: {
      readRequirementBody: async () => {
        throw new Error('Requirement body should be excluded')
      }
    }
  })
}

class StrictInMemoryKnowledgeProtocol {
  readonly workspacePoints = new Map<string, WorkspaceKnowledgePoint>()
  readonly catalogPoints = new Map<string, CatalogKnowledgePoint>()
  readonly workspaceSearches: Array<{
    workspaceIds: string[]
    generationIds: string[]
  }> = []

  async chunkKnowledgeDocuments(
    documents: Array<{ documentKey: string; content: string }>
  ): Promise<ChunkedKnowledgeResult> {
    return {
      chunkerVersion: 'realmflow-token-aware-v1' as const,
      embeddingModel: GTE_EMBEDDING_MODEL,
      embeddingRevision: GTE_EMBEDDING_REVISION,
      documents: documents.map((document) => ({
        documentKey: document.documentKey,
        chunks: [
          {
            ordinal: 0,
            content: document.content,
            tokenCount: Math.max(1, Math.ceil(document.content.length / 4)),
            startOffset: 0,
            endOffset: document.content.length,
            startLine: 1,
            endLine: document.content.split('\n').length,
            checksum: digest(document.content)
          }
        ]
      }))
    }
  }

  async embedKnowledgeDocuments(documents: Array<{ id: string }>) {
    return {
      embeddingModel: GTE_EMBEDDING_MODEL,
      embeddingRevision: GTE_EMBEDDING_REVISION,
      dimensions: GTE_EMBEDDING_DIMENSIONS,
      embeddings: documents.map(({ id }) => ({
        id,
        embedding: unitVector()
      }))
    }
  }

  async embedKnowledgeQuery() {
    return {
      embeddingModel: GTE_EMBEDDING_MODEL,
      embeddingRevision: GTE_EMBEDDING_REVISION,
      dimensions: GTE_EMBEDDING_DIMENSIONS,
      embedding: unitVector()
    }
  }

  async upsertPoints(
    collection: string,
    points: readonly (WorkspaceKnowledgePoint | CatalogKnowledgePoint)[]
  ): Promise<void> {
    if (collection === DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection) {
      for (const point of points as readonly WorkspaceKnowledgePoint[]) {
        assertDenseVector(point.vector.dense)
        this.workspacePoints.set(point.id, point)
      }
      return
    }
    if (collection === DEFAULT_VECTOR_INDEX_PROFILE.catalogCollection) {
      for (const point of points as readonly CatalogKnowledgePoint[]) {
        assertDenseVector(point.vector.dense)
        this.catalogPoints.set(point.id, point)
      }
      return
    }
    throw new Error(`Unexpected collection: ${collection}`)
  }

  async readGenerationPoints(input: {
    collection: string
    workspaceId: string
    generationId: string
  }): Promise<WorkspaceKnowledgePoint[]> {
    this.assertWorkspaceCollection(input.collection)
    return [...this.workspacePoints.values()].filter(
      ({ payload }) =>
        payload.workspaceId === input.workspaceId &&
        payload.generationId === input.generationId
    )
  }

  async verifyGeneration(input: {
    collection: string
    workspaceId: string
    generationId: string
    points: Array<{ id: string; chunkId: string; checksum: string }>
  }): Promise<void> {
    const actual = await this.readGenerationPoints(input)
    expect(
      actual.map(({ id, payload }) => ({
        id,
        chunkId: payload.chunkId,
        checksum: payload.checksum
      }))
    ).toEqual(input.points)
  }

  async deleteGeneration(input: {
    collection: string
    workspaceId: string
    generationId: string
  }): Promise<void> {
    for (const point of await this.readGenerationPoints(input)) {
      this.workspacePoints.delete(point.id)
    }
  }

  async search(input: {
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
  }): Promise<KnowledgeSearchResult[]> {
    this.assertWorkspaceCollection(input.collection)
    assertDenseVector(input.dense)
    const workspaceIds = requiredFilterValues(input.filter.must, 'workspaceId')
    const generationIds = requiredFilterValues(input.filter.must, 'generationId')
    this.workspaceSearches.push({ workspaceIds, generationIds })
    return [...this.workspacePoints.values()]
      .filter(({ payload }) => matchesFilters(payload, input.filter.must))
      .filter(({ payload }) => includesQuery(payload.content, input.query))
      .slice(0, input.topK)
      .map(({ id, payload }, index) => ({
        id,
        ...payload,
        denseScore: 1,
        denseRank: index + 1,
        bm25Score: 1,
        bm25Rank: index + 1,
        fusionScore: 1,
        fusionRank: index + 1
      }))
  }

  async deletePoints(
    collection: string,
    pointIds: readonly string[]
  ): Promise<void> {
    this.assertCatalogCollection(collection)
    pointIds.forEach((id) => this.catalogPoints.delete(id))
  }

  async searchCatalog(input: {
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
  }): Promise<CatalogSearchResult[]> {
    this.assertCatalogCollection(input.collection)
    assertDenseVector(input.dense)
    return [...this.catalogPoints.values()]
      .filter(({ payload }) => matchesFilters(payload, input.filter.must))
      .filter(({ payload }) => includesQuery(payload.content, input.query))
      .slice(0, input.topK)
      .map(({ id, payload }, index) => ({
        id,
        ...payload,
        denseScore: 1,
        denseRank: index + 1,
        bm25Score: 1,
        bm25Rank: index + 1,
        fusionScore: 1,
        fusionRank: index + 1
      }))
  }

  private assertWorkspaceCollection(collection: string): void {
    if (collection !== DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection) {
      throw new Error('Workspace collection mismatch')
    }
  }

  private assertCatalogCollection(collection: string): void {
    if (collection !== DEFAULT_VECTOR_INDEX_PROFILE.catalogCollection) {
      throw new Error('Catalog collection mismatch')
    }
  }
}

function searchDecision(
  search: HybridKnowledgeSearchService,
  query: string
) {
  return search.search({
    scope: { kind: 'workspace', workspaceId: 'workspace-1' },
    query,
    sourceKinds: ['decision']
  })
}

function requiredFilterValues(
  filters: Array<{
    key: string
    match: { value: string } | { any: string[] }
  }>,
  key: string
): string[] {
  const filter = filters.find((candidate) => candidate.key === key)
  if (!filter) throw new Error(`Required filter is missing: ${key}`)
  return 'value' in filter.match ? [filter.match.value] : filter.match.any
}

function matchesFilters(
  payload: WorkspaceKnowledgePointPayload | CatalogKnowledgePoint['payload'],
  filters: Array<{
    key: string
    match: { value: string } | { any: string[] }
  }>
): boolean {
  return filters.every(({ key, match }) => {
    const value = payload[key as keyof typeof payload]
    return typeof value === 'string' &&
      ('value' in match ? value === match.value : match.any.includes(value))
  })
}

function includesQuery(content: string, query: string): boolean {
  return content.toLowerCase().includes(query.trim().toLowerCase())
}

function assertDenseVector(vector: readonly number[]): void {
  if (
    vector.length !== GTE_EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Dense vector protocol mismatch')
  }
}

function unitVector(): number[] {
  return [1, ...Array(GTE_EMBEDDING_DIMENSIONS - 1).fill(0)]
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function seedCanonicalData(database: RealmFlowDatabase): void {
  database.exec(`
    INSERT INTO workspaces (
      id, path, label, description, sort_order, revision, created_at, updated_at
    ) VALUES (
      'workspace-1', '/spaces/acceptance', 'Acceptance', '', 0, 1, 1, 1
    );
    INSERT INTO requirements (
      id, workspace_id, title, status, sort_order, revision, created_at, updated_at
    ) VALUES (
      'requirement-1', 'workspace-1', 'Acceptance', 'completed', 0, 1, 1, 1
    );
    INSERT INTO chat_sessions (
      id, kind, knowledge_scope, workspace_id, requirement_id, title,
      sort_order, revision, created_at, updated_at
    ) VALUES (
      'session-1', 'space',
      '{"kind":"workspace","workspaceId":"workspace-1"}',
      'workspace-1', NULL, 'Acceptance conversation', 0, 1, 1, 1
    );
  `)
}

function template(status: 'published' | 'archived') {
  return {
    id: 'template-1',
    name: 'template-canary-3839',
    description: 'Acceptance workflow',
    status,
    updatedAt: 200,
    currentVersion: {
      id: 'template-version-1',
      templateId: 'template-1',
      version: 1,
      status,
      nodes: [
        {
          id: 'template-node-1',
          stableKey: 'accept',
          type: 'ai_generate',
          name: 'Accept',
          description: 'Verify the result',
          order: 0,
          allowSkip: false
        }
      ],
      edges: []
    }
  }
}

function skill(enabled: boolean) {
  return {
    skill: {
      id: 'com.example.acceptance',
      enabled,
      currentVersionId: 'skill-version-1',
      updatedAt: 300
    },
    versions: [
      {
        version: {
          id: 'skill-version-1',
          skillId: 'com.example.acceptance',
          version: '1.0.0',
          name: 'skill-canary-3839',
          description: 'Acceptance Skill',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          permissions: [],
          network: { required: false, services: [] }
        },
        integrity: {
          status: 'verified' as const
        }
      }
    ]
  }
}
