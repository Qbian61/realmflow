import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ArtifactMetadataRecord,
  NodeRunRecord,
  WorkflowRollbackOperationRecord
} from '../../application/ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { createSqliteRepositories } from './repositories'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-workflow-rollback-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  await seedExecution()
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite workflow rollback repository', () => {
  it('lists only the latest node run for each execution node', async () => {
    const { nodeRuns } = createSqliteRepositories(database)
    await nodeRuns.save(nodeRun('analysis-1', 'node-analysis', 1, 100), 0)
    await nodeRuns.save(nodeRun('design-1', 'node-design', 1, 110), 0)
    await nodeRuns.save(nodeRun('analysis-2', 'node-analysis', 2, 120), 0)

    await expect(nodeRuns.listLatestByExecution('execution-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'analysis-2',
        nodeId: 'node-analysis',
        attempt: 2
      }),
      expect.objectContaining({
        id: 'design-1',
        nodeId: 'node-design',
        attempt: 1
      })
    ])
  })

  it('appends once and replays the stored operation for the same request', async () => {
    const { workflowRollbacks } = createSqliteRepositories(database)
    const operation = rollbackOperation()

    await expect(workflowRollbacks.append(operation)).resolves.toEqual({
      ...operation,
      revision: 1
    })
    await expect(
      workflowRollbacks.append({
        ...operation,
        id: 'rollback-replayed',
        targetNodeId: 'node-design'
      })
    ).resolves.toEqual({ ...operation, revision: 1 })
    await expect(
      workflowRollbacks.getByRequestId(operation.requestId)
    ).resolves.toEqual({ ...operation, revision: 1 })
  })

  it('saves with revision checks and lists unresolved operations stably', async () => {
    const { workflowRollbacks } = createSqliteRepositories(database)
    const first = await workflowRollbacks.append(rollbackOperation())
    await workflowRollbacks.append({
      ...rollbackOperation(),
      id: 'rollback-2',
      requestId: 'rollback-request-2',
      status: 'coordination_pending',
      updatedAt: 90
    })

    await expect(
      workflowRollbacks.save(
        {
          ...first,
          pendingAiRunIds: ['ai-run-1'],
          knowledgeSyncPending: true,
          status: 'coordination_pending',
          error: 'cancel failed',
          updatedAt: 120
        },
        1
      )
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        revision: 2,
        status: 'coordination_pending',
        pendingAiRunIds: ['ai-run-1'],
        knowledgeSyncPending: true,
        error: 'cancel failed'
      }
    })
    await expect(
      workflowRollbacks.save(
        { ...first, status: 'completed', updatedAt: 130 },
        1
      )
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { revision: 2, status: 'coordination_pending' }
    })
    await expect(workflowRollbacks.listPending()).resolves.toMatchObject([
      { id: 'rollback-2', updatedAt: 90 },
      { id: 'rollback-1', updatedAt: 120 }
    ])
  })

  it('rejects rollback rows whose JSON arrays are invalid', async () => {
    const { workflowRollbacks } = createSqliteRepositories(database)
    await workflowRollbacks.append(rollbackOperation())
    database
      .prepare(
        `UPDATE workflow_rollback_operations
         SET affected_node_ids_json = '{"node":"analysis"}'
         WHERE id = 'rollback-1'`
      )
      .run()

    await expect(
      workflowRollbacks.getByRequestId('rollback-request-1')
    ).rejects.toThrow(
      'Workflow rollback affectedNodeIds must be an array of strings'
    )
  })

  it('restores pending rollback coordination after reopening the database', async () => {
    let repositories = createSqliteRepositories(database)
    const operation = {
      ...rollbackOperation(),
      status: 'coordination_pending' as const,
      pendingAiRunIds: ['ai-run-1'],
      knowledgeSyncPending: true
    }
    await repositories.workflowRollbacks.append(operation)

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)

    await expect(repositories.workflowRollbacks.listPending()).resolves.toEqual([
      { ...operation, revision: 1 }
    ])
  })

  it('invalidates artifacts by node run and lists only valid primary artifacts', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.nodeRuns.save(
      nodeRun('analysis-1', 'node-analysis', 1, 100),
      0
    )
    await repositories.nodeRuns.save(
      nodeRun('analysis-2', 'node-analysis', 2, 120),
      0
    )
    const historical = artifact('artifact-1', 'analysis-1', 1, 110)
    await repositories.artifacts.save(historical, 0)
    database
      .prepare(
        `INSERT INTO artifacts (
          id, requirement_id, stage_id, node_id, node_run_id, relative_path,
          kind, checksum, version, byte_size, is_primary, is_valid, revision,
          created_at, updated_at
        ) VALUES (
          'artifact-legacy', 'requirement-1', 'analysis', 'node-analysis',
          NULL, 'artifacts/legacy.md', 'markdown', 'sha256:legacy', 1, 1,
          0, 1, 1, 115, 115
        )`
      )
      .run()

    await expect(
      repositories.artifacts.invalidateByNodeRunIds(
        ['analysis-1'],
        130,
        ['node-analysis']
      )
    ).resolves.toBe(2)
    await expect(
      repositories.artifacts.listByRequirement('requirement-1')
    ).resolves.toEqual([])

    const current = artifact('artifact-2', 'analysis-2', 2, 140)
    await repositories.artifacts.save(current, 0)

    await expect(
      repositories.artifacts.listByRequirement('requirement-1')
    ).resolves.toEqual([{ ...current, revision: 1 }])
    expect(
      database
        .prepare(
          `SELECT node_run_id, is_primary, is_valid, revision, updated_at
           FROM artifacts WHERE id = 'artifact-1'`
        )
        .get()
    ).toEqual({
      node_run_id: 'analysis-1',
      is_primary: 0,
      is_valid: 0,
      revision: 2,
      updated_at: 130
    })
    expect(
      database
        .prepare(
          `SELECT node_run_id, is_primary, is_valid, revision, updated_at
           FROM artifacts WHERE id = 'artifact-legacy'`
        )
        .get()
    ).toEqual({
      node_run_id: null,
      is_primary: 0,
      is_valid: 0,
      revision: 2,
      updated_at: 130
    })
  })
})

async function seedExecution(): Promise<void> {
  const repositories = createSqliteRepositories(database)
  await repositories.workspaces.save(
    {
      id: 'workspace-1',
      path: '/spaces/one',
      label: 'One',
      description: '',
      sortOrder: 0,
      createdAt: 10,
      updatedAt: 10
    },
    0
  )
  await repositories.requirements.save(
    {
      id: 'requirement-1',
      workspaceId: 'workspace-1',
      title: 'Requirement one',
      stage: 'implementation',
      status: 'active',
      sortOrder: 0,
      createdAt: 20,
      updatedAt: 20
    },
    0
  )
  await repositories.requirementWorkflows.save(
    {
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 0,
      maxParallelism: 1,
      nodes: [
        {
          id: 'node-analysis',
          type: 'ai_generate',
          name: 'Analysis',
          description: '',
          order: 0,
          status: 'completed',
          allowSkip: false
        },
        {
          id: 'node-design',
          type: 'ai_generate',
          name: 'Design',
          description: '',
          order: 1,
          status: 'ready',
          allowSkip: false
        }
      ],
      edges: []
    },
    0,
    { reason: 'workflow_created', triggerSource: 'system' }
  )
  database
    .prepare(
      `INSERT INTO workflow_executions (
        id, requirement_id, status, current_node_id, revision, created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'execution-1',
      'requirement-1',
      'running',
      'node-analysis',
      1,
      30,
      30
    )
}

function nodeRun(
  id: string,
  nodeId: string,
  attempt: number,
  createdAt: number
): NodeRunRecord {
  return {
    id,
    executionId: 'execution-1',
    nodeId,
    status: attempt === 1 ? 'completed' : 'ready',
    attempt,
    createdAt,
    updatedAt: createdAt
  }
}

function rollbackOperation(): WorkflowRollbackOperationRecord {
  return {
    id: 'rollback-1',
    requestId: 'rollback-request-1',
    requirementId: 'requirement-1',
    executionId: 'execution-1',
    targetNodeId: 'node-analysis',
    affectedNodeIds: ['node-analysis', 'node-design'],
    createdNodeRunIds: ['analysis-2', 'design-2'],
    pendingAiRunIds: [],
    knowledgeSyncPending: false,
    status: 'committed',
    createdAt: 100,
    updatedAt: 100
  }
}

function artifact(
  id: string,
  nodeRunId: string,
  version: number,
  createdAt: number
): ArtifactMetadataRecord {
  return {
    id,
    requirementId: 'requirement-1',
    stageId: 'analysis',
    nodeId: 'node-analysis',
    nodeRunId,
    relativePath: `artifacts/analysis-v${version}.md`,
    kind: 'markdown',
    checksum: `sha256:${version}`,
    version,
    byteSize: version,
    isPrimary: true,
    isValid: true,
    createdAt,
    updatedAt: createdAt
  }
}
