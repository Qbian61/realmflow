import {
  mkdir,
  mkdtemp,
  readFile as readTextFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssembledNodeContextRepository } from '../../ai-run/infrastructure/assembled-node-context-repository'
import { ContextAssembler } from '../../application/context/context-assembler'
import type { HybridKnowledgeSearchService } from '../../application/knowledge/hybrid-knowledge-search-service'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../sqlite/database'
import { createSqliteRepositories } from '../sqlite/repositories'
import { SqliteContextSources } from './sqlite-context-sources'

let database: RealmFlowDatabase | undefined
const directories: string[] = []

afterEach(async () => {
  database?.close()
  database = undefined
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('SqliteContextSources', () => {
  it('delegates requirement knowledge search to the shared workspace search port', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-context-search-'))
    directories.push(directory)
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    seedArtifactGraph(database)
    const result = {
      id: 'chunk-current',
      schemaVersion: 1 as const,
      profileId: 'realmflow-vector-index-v1',
      workspaceId: 'workspace-1',
      workspaceName: 'Workspace',
      generationId: 'generation-current',
      sourceId: 'source-current',
      sourceKind: 'file' as const,
      sourceVersion: 'file:v2',
      documentId: 'document-current',
      documentKey: 'docs/architecture.md',
      title: 'Architecture',
      chunkId: 'chunk-current',
      chunkOrdinal: 0,
      startOffset: 0,
      endOffset: 20,
      startLine: 1,
      endLine: 1,
      checksum: `sha256:${'a'.repeat(64)}`,
      createdAt: 2,
      content: 'local first architecture',
      denseScore: 0.5,
      denseRank: 1,
      bm25Score: 0.75,
      bm25Rank: 1,
      fusionScore: 0.6,
      fusionRank: 1
    }
    const search = vi.fn().mockResolvedValue([result])
    const sources = new SqliteContextSources(
      database,
      { readFile: vi.fn() },
      { search }
    )

    await expect(
      sources.search('requirement-1', 'local architecture')
    ).resolves.toEqual([
      {
        id: 'chunk-current',
        sourceId: 'source-current',
        documentKey: 'docs/architecture.md',
        generationId: 'generation-current',
        sourceVersion: 'file:v2',
        chunkId: 'chunk-current',
        chunkOrdinal: 0,
        startOffset: 0,
        endOffset: 20,
        checksum: `sha256:${'a'.repeat(64)}`,
        version: 2,
        content: 'local first architecture',
        denseScore: 0.5,
        denseRank: 1,
        bm25Score: 0.75,
        bm25Rank: 1,
        fusionScore: 0.6,
        fusionRank: 1
      }
    ])
    expect(search).toHaveBeenCalledWith({
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      query: 'local architecture'
    })
  })

  it('returns direct artifacts before unique non-direct ancestors and only uses primary versions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-context-'))
    directories.push(directory)
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    seedArtifactGraph(database)
    const readFile = vi.fn(
      async (_requirementId: string, path: string) => ({
        name: path.split('/').at(-1) ?? path,
        path,
        content: `content:${path}`,
        kind: 'text' as const,
        language: 'plaintext',
        version: 'version',
        modifiedAt: 1,
        size: 1
      })
    )
    const sources = new SqliteContextSources(database, { readFile })

    const all = await sources.listPredecessorArtifacts(
      'requirement-1',
      'node-target',
      'all'
    )

    expect(all).toEqual([
      expect.objectContaining({
        id: 'artifact-direct-b',
        relationship: 'direct'
      }),
      expect.objectContaining({
        id: 'artifact-direct-c',
        relationship: 'direct'
      }),
      expect.objectContaining({
        id: 'artifact-ancestor-a',
        relationship: 'ancestor'
      })
    ])
    expect(all.map(({ id }) => id)).not.toContain('artifact-history-a')
    expect(all.map(({ id }) => id)).not.toContain('artifact-unrelated')
    expect(readFile.mock.calls.map(([, path]) => path)).toEqual([
      'artifacts/b.md',
      'artifacts/c.md',
      'artifacts/a.md'
    ])

    readFile.mockClear()
    const direct = await sources.listPredecessorArtifacts(
      'requirement-1',
      'node-target',
      'direct'
    )
    expect(direct.map(({ id }) => id)).toEqual([
      'artifact-direct-b',
      'artifact-direct-c'
    ])
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it('excludes invalidated primary artifacts from predecessor context', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-context-valid-'))
    directories.push(directory)
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    seedArtifactGraph(database)
    database
      .prepare(
        `UPDATE artifacts SET is_valid = 0
         WHERE id = 'artifact-direct-b'`
      )
      .run()
    const readFile = vi.fn(
      async (_requirementId: string, path: string) => ({
        name: path,
        path,
        content: `content:${path}`,
        kind: 'text' as const,
        language: 'plaintext',
        version: 'version',
        modifiedAt: 1,
        size: 1
      })
    )
    const sources = new SqliteContextSources(database, { readFile })

    await expect(
      sources.listPredecessorArtifacts(
        'requirement-1',
        'node-target',
        'direct'
      )
    ).resolves.toEqual([
      expect.objectContaining({ id: 'artifact-direct-c' })
    ])
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledWith(
      'requirement-1',
      'artifacts/c.md'
    )
  })

  it('persists an immutable node context snapshot across database reopen', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-context-reload-'))
    directories.push(directory)
    const workspaceRoot = join(directory, 'workspace')
    await mkdir(join(workspaceRoot, 'artifacts'), { recursive: true })
    await writeFile(join(workspaceRoot, 'requirement.md'), 'Original requirement')
    await writeFile(join(workspaceRoot, 'artifacts/a.md'), 'Ancestor A')
    await writeFile(join(workspaceRoot, 'artifacts/b.md'), 'Direct B')
    await writeFile(join(workspaceRoot, 'artifacts/c.md'), 'Direct C')

    const databasePath = join(directory, 'realmflow.db')
    database = openRealmFlowDatabase(databasePath)
    seedArtifactGraph(database)
    seedNodeRun(database)
    await seedModel(database)
    const firstAssembler = createRealAssembler(database, workspaceRoot, {
      search: vi.fn().mockResolvedValue([
        {
          id: 'chunk-current',
          schemaVersion: 1,
          profileId: 'realmflow-vector-index-v1',
          workspaceId: 'workspace-1',
          workspaceName: 'Workspace',
          generationId: 'generation-current',
          sourceId: 'source-current',
          sourceKind: 'file',
          sourceVersion: 'file:v2',
          documentId: 'document-current',
          documentKey: 'docs/architecture.md',
          title: 'Architecture',
          chunkId: 'chunk-current',
          chunkOrdinal: 0,
          startOffset: 0,
          endOffset: 24,
          startLine: 1,
          endLine: 1,
          checksum: `sha256:${'a'.repeat(64)}`,
          createdAt: 2,
          content: 'Immutable indexed knowledge',
          denseScore: 0.5,
          denseRank: 1,
          bm25Score: 0.75,
          bm25Rank: 1,
          fusionScore: 0.6,
          fusionRank: 1
        }
      ])
    })
    const firstRepository = createContextRepository(
      database,
      workspaceRoot,
      firstAssembler
    )

    const first = await firstRepository.loadNode(nodeContextInput)
    const firstCheckpoint = await createSqliteRepositories(
      database
    ).nodeRuns.get('node-run-1')
    expect(first.prompt).toContain('Original requirement')
    expect(first.prompt).toContain('Ancestor A')
    expect(firstCheckpoint?.checkpoint).toMatchObject({
      contextSnapshotId: first.contextSnapshotId,
      modelProfileId: 'profile-1'
    })
    const firstSnapshot = await createSqliteRepositories(
      database
    ).contextSnapshots.get(first.contextSnapshotId ?? '')
    expect(firstSnapshot).toMatchObject({
      id: first.contextSnapshotId,
      checksum: expect.stringMatching(/^sha256:/),
      sources: expect.arrayContaining([
        expect.objectContaining({
          kind: 'knowledge',
          id: 'chunk-current',
          sourceId: 'source-current',
          documentKey: 'docs/architecture.md',
          generationId: 'generation-current',
          sourceVersion: 'file:v2',
          version: 2,
          denseScore: 0.5,
          denseRank: 1,
          bm25Score: 0.75,
          bm25Rank: 1,
          fusionScore: 0.6,
          fusionRank: 1
        })
      ])
    })

    database.close()
    database = undefined
    await writeFile(join(workspaceRoot, 'requirement.md'), 'Changed requirement')
    await writeFile(join(workspaceRoot, 'artifacts/b.md'), 'Changed direct B')
    database = openRealmFlowDatabase(databasePath)
    const assemble = vi.fn().mockRejectedValue(new Error('must not reassemble'))
    const reopenedRepository = createContextRepository(
      database,
      workspaceRoot,
      { assemble }
    )

    const reopened = await reopenedRepository.loadNode(nodeContextInput)
    const reopenedSnapshot = await createSqliteRepositories(
      database
    ).contextSnapshots.get(first.contextSnapshotId ?? '')
    expect(reopened.prompt).toBe(first.prompt)
    expect(reopened.contextSnapshotId).toBe(first.contextSnapshotId)
    expect(reopenedSnapshot?.sources).toEqual(firstSnapshot?.sources)
    expect(assemble).not.toHaveBeenCalled()
  })
})

const nodeContextInput = {
  requirementId: 'requirement-1',
  nodeId: 'node-target',
  nodeRunId: 'node-run-1',
  executor: {
    kind: 'ai_generate' as const,
    prompt: 'Produce the result.',
    artifact: {
      relativePath: 'artifacts/result.md',
      kind: 'markdown'
    }
  },
  modelProfileId: 'profile-1'
}

function createContextRepository(
  database: RealmFlowDatabase,
  workspaceRoot: string,
  assembler: Pick<ContextAssembler, 'assemble'>
) {
  const repositories = createSqliteRepositories(database)
  return new AssembledNodeContextRepository({
    legacy: {
      load: async () => {
        throw new Error('legacy context should not be used')
      }
    },
    requirements: repositories.requirements,
    workflows: repositories.requirementWorkflows,
    nodeRuns: repositories.nodeRuns,
    snapshots: repositories.contextSnapshots,
    models: repositories.modelPool,
    unitOfWork: repositories.unitOfWork,
    assembler,
    workspace: {
      getBinding: async () => ({ rootName: 'Workspace' }),
      readRequirementBody: async () =>
        readTextFile(join(workspaceRoot, 'requirement.md'), 'utf8')
    },
    now: () => 10
  })
}

async function seedModel(database: RealmFlowDatabase): Promise<void> {
  const modelPool = createSqliteRepositories(database).modelPool
  await modelPool.saveProvider(
    {
      id: 'provider-1',
      type: 'openai_completions',
      name: 'Example',
      baseUrl: 'https://api.example.com/v1',
      enabled: true
    },
    0
  )
  await modelPool.saveProfile(
    {
      id: 'profile-1',
      providerId: 'provider-1',
      modelId: 'example-model',
      displayName: 'Example Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: true,
        structuredOutput: true
      },
      contextWindow: 128_000,
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 4,
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 8
    },
    0
  )
}

function createRealAssembler(
  database: RealmFlowDatabase,
  workspaceRoot: string,
  knowledgeSearch?: Pick<HybridKnowledgeSearchService, 'search'>
): ContextAssembler {
  const repositories = createSqliteRepositories(database)
  const readWorkspaceFile = async (_requirementId: string, path: string) => ({
    name: path.split('/').at(-1) ?? path,
    path,
    content: await readTextFile(join(workspaceRoot, path), 'utf8'),
    kind: 'markdown' as const,
    language: 'markdown',
    size: 1,
    modifiedAt: 1,
    version: 'version'
  })
  const sources = new SqliteContextSources(
    database,
    { readFile: readWorkspaceFile },
    knowledgeSearch
  )
  return new ContextAssembler({
    artifacts: sources,
    knowledge: sources,
    questions: {
      listByNodeRun: async (nodeRunId) =>
        (await repositories.nodeQuestions.listByNodeRun(nodeRunId)).map(
          (question) => ({ ...question, version: question.revision })
        )
    },
    todos: {
      listByNodeRun: async (nodeRunId) =>
        (await repositories.nodeTodos.listByNodeRun(nodeRunId)).map((todo) => ({
          ...todo,
          version: todo.revision
        }))
    },
    attachments: {
      read: async (requirementId, path) => ({
        version: 1,
        content: (await readWorkspaceFile(requirementId, path)).content
      })
    }
  })
}

function seedArtifactGraph(database: RealmFlowDatabase): void {
  database.exec(`
    INSERT INTO workspaces (
      id, path, label, description, root_path, sort_order, revision,
      created_at, updated_at
    ) VALUES (
      'workspace-1', '/tmp/workspace-1', 'Workspace', '', '/tmp/workspace-1',
      0, 1, 1, 1
    );
    INSERT INTO requirements (
      id, workspace_id, title, status, sort_order, revision, created_at, updated_at
    ) VALUES ('requirement-1', 'workspace-1', 'Requirement', 'active', 0, 1, 1, 1);
    INSERT INTO workflow_templates (
      id, name, description, status, revision, created_at, updated_at
    ) VALUES ('template-1', 'Template', '', 'published', 1, 1, 1);
    INSERT INTO workflow_template_versions (
      id, template_id, version, status, checksum, created_at, published_at
    ) VALUES ('version-1', 'template-1', 1, 'published', 'checksum', 1, 1);
    INSERT INTO requirement_workflows (
      requirement_id, template_version_id, status, revision, created_at, updated_at
    ) VALUES ('requirement-1', 'version-1', 'running', 1, 1, 1);

    INSERT INTO requirement_nodes (
      id, requirement_id, type, name, description, config_json, allow_skip,
      sort_order, status, revision, created_at, updated_at
    ) VALUES
      ('node-a', 'requirement-1', 'ai_generate', 'A', '', '{}', 0, 0, 'completed', 1, 1, 1),
      ('node-b', 'requirement-1', 'ai_generate', 'B', '', '{}', 0, 1, 'completed', 1, 1, 1),
      ('node-c', 'requirement-1', 'ai_generate', 'C', '', '{}', 0, 2, 'completed', 1, 1, 1),
      ('node-target', 'requirement-1', 'ai_generate', 'Target', '', '{}', 0, 3, 'running', 1, 1, 1),
      ('node-other', 'requirement-1', 'ai_generate', 'Other', '', '{}', 0, 4, 'completed', 1, 1, 1);

    INSERT INTO requirement_edges (
      id, requirement_id, source_node_id, target_node_id, revision
    ) VALUES
      ('edge-a-b', 'requirement-1', 'node-a', 'node-b', 1),
      ('edge-a-c', 'requirement-1', 'node-a', 'node-c', 1),
      ('edge-b-target', 'requirement-1', 'node-b', 'node-target', 1),
      ('edge-c-target', 'requirement-1', 'node-c', 'node-target', 1);

    INSERT INTO artifacts (
      id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
      version, byte_size, is_primary, revision, created_at, updated_at
    ) VALUES
      ('artifact-ancestor-a', 'requirement-1', 'analysis', 'node-a', 'artifacts/a.md', 'markdown', 'a2', 2, 1, 1, 1, 2, 2),
      ('artifact-history-a', 'requirement-1', 'analysis', 'node-a', 'artifacts/a-old.md', 'markdown', 'a1', 1, 1, 0, 2, 1, 2),
      ('artifact-direct-b', 'requirement-1', 'design', 'node-b', 'artifacts/b.md', 'markdown', 'b1', 1, 1, 1, 1, 1, 1),
      ('artifact-direct-c', 'requirement-1', 'implementation', 'node-c', 'artifacts/c.md', 'markdown', 'c1', 1, 1, 1, 1, 1, 1),
      ('artifact-unrelated', 'requirement-1', 'testing', 'node-other', 'artifacts/other.md', 'markdown', 'o1', 1, 1, 1, 1, 1, 1);
  `)
}

function seedNodeRun(database: RealmFlowDatabase): void {
  const configuration = {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: 'all',
      includeSpaceKnowledge: true,
      attachments: []
    },
    prompt: 'Produce the result.',
    model: { strategy: 'inherit' },
    connectorIds: [],
    permissions: [],
    artifact: {
      required: true,
      relativePath: 'artifacts/result.md',
      kind: 'markdown'
    },
    todos: [],
    completionGate: { requireApproval: false },
    retry: { maxAttempts: 1, backoffMs: 0 },
    skip: { allowed: false, requireReason: false }
  }
  database
    .prepare(
      `UPDATE requirement_nodes SET config_json = ? WHERE id = 'node-target'`
    )
    .run(
      JSON.stringify({
        configuration,
        executor: nodeContextInput.executor
      })
    )
  database.exec(`
    UPDATE requirements
    SET body_relative_path = 'requirement.md'
    WHERE id = 'requirement-1';
    INSERT INTO workflow_executions (
      id, requirement_id, status, current_node_id, revision, created_at, updated_at
    ) VALUES (
      'execution-1', 'requirement-1', 'running', 'node-target', 1, 1, 1
    );
    INSERT INTO node_runs (
      id, execution_id, node_id, status, attempt, revision, created_at, updated_at
    ) VALUES (
      'node-run-1', 'execution-1', 'node-target', 'running', 1, 1, 1, 1
    );
  `)
}
