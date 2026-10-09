import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { SqliteProductAnalyticsRepository } from './product-analytics-repository'

let directory: string
let databasePath: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-product-analytics-'))
  databasePath = join(directory, 'realmflow.db')
  database = openRealmFlowDatabase(databasePath)
  seedProductActivity(database)
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteProductAnalyticsRepository', () => {
  it('aggregates active local product state with complete stable distributions', async () => {
    const repository = new SqliteProductAnalyticsRepository(database)

    const result = await repository.query({ activityLimit: 12 })

    expect(result.scope).toEqual({
      workspaces: [
        { id: 'workspace-a', label: 'Alpha' },
        { id: 'workspace-b', label: 'Beta' }
      ]
    })
    expect(result.summary).toEqual({
      workspaces: 2,
      requirements: 3,
      workflows: 3,
      executions: 4,
      nodeRuns: 6
    })
    expect(result.requirements).toEqual([
      { status: 'pending', count: 1 },
      { status: 'active', count: 1 },
      { status: 'completed', count: 1 }
    ])
    expect(result.workflows).toEqual([
      { templateId: 'template-1', label: 'Delivery', count: 2 },
      { templateId: 'template-2', label: 'Research', count: 1 }
    ])
    expect(result.executionStatuses).toEqual([
      { status: 'created', count: 1 },
      { status: 'running', count: 1 },
      { status: 'waiting_user', count: 0 },
      { status: 'paused', count: 0 },
      { status: 'completed', count: 1 },
      { status: 'failed', count: 1 },
      { status: 'cancelled', count: 0 },
      { status: 'interrupted', count: 0 }
    ])
    expect(result.nodeRunStatuses).toEqual([
      { status: 'pending', count: 0 },
      { status: 'ready', count: 1 },
      { status: 'running', count: 1 },
      { status: 'waiting_user', count: 0 },
      { status: 'paused', count: 0 },
      { status: 'blocked', count: 1 },
      { status: 'completed', count: 1 },
      { status: 'failed', count: 1 },
      { status: 'skipped', count: 1 },
      { status: 'cancelled', count: 0 },
      { status: 'interrupted', count: 0 }
    ])
  })

  it('filters one active workspace and rejects missing or deleted workspaces', async () => {
    const repository = new SqliteProductAnalyticsRepository(database)

    const result = await repository.query({
      workspaceId: 'workspace-a',
      activityLimit: 12
    })

    expect(result.scope.workspaceId).toBe('workspace-a')
    expect(result.summary).toEqual({
      workspaces: 1,
      requirements: 2,
      workflows: 2,
      executions: 3,
      nodeRuns: 4
    })
    expect(result.workflows).toEqual([
      { templateId: 'template-1', label: 'Delivery', count: 1 },
      { templateId: 'template-2', label: 'Research', count: 1 }
    ])
    await expect(
      repository.query({ workspaceId: 'missing', activityLimit: 12 })
    ).rejects.toThrow('空间不存在或不可用')
    await expect(
      repository.query({ workspaceId: 'workspace-deleted', activityLimit: 12 })
    ).rejects.toThrow('空间不存在或不可用')
  })

  it('returns recent traceable audit activity without metadata or reasons', async () => {
    const repository = new SqliteProductAnalyticsRepository(database)

    const result = await repository.query({ activityLimit: 2 })

    expect(result.recentActivity).toEqual([
      {
        id: 'audit-b',
        eventType: 'execution_created',
        triggerSource: 'system',
        occurredAt: 400,
        workspaceId: 'workspace-b',
        workspaceLabel: 'Beta',
        requirementId: 'requirement-b',
        requirementTitle: 'Build',
        executionId: 'execution-b'
      },
      {
        id: 'audit-a-new',
        eventType: 'node_run_status_changed',
        triggerSource: 'recovery',
        fromState: 'interrupted',
        toState: 'running',
        occurredAt: 300,
        workspaceId: 'workspace-a',
        workspaceLabel: 'Alpha',
        requirementId: 'requirement-a1',
        requirementTitle: 'Analyze',
        executionId: 'execution-a1',
        nodeRunId: 'run-a1'
      }
    ])
    expect(JSON.stringify(result.recentActivity)).not.toContain('secret')
    expect(JSON.stringify(result.recentActivity)).not.toContain('raw reason')
    expect(JSON.stringify(result.recentActivity)).not.toContain('/tmp')
  })

  it('recreates the same result after reopening the database', async () => {
    const before = await new SqliteProductAnalyticsRepository(database).query({
      workspaceId: 'workspace-a',
      activityLimit: 12
    })
    database.close()
    database = openRealmFlowDatabase(databasePath)

    const after = await new SqliteProductAnalyticsRepository(database).query({
      workspaceId: 'workspace-a',
      activityLimit: 12
    })

    expect(after).toEqual(before)
  })
})

function seedProductActivity(target: RealmFlowDatabase): void {
  target.exec(`
    INSERT INTO workspaces (
      id, path, label, description, sort_order, revision, created_at, updated_at,
      deleted_at
    ) VALUES
      ('workspace-a', '/spaces/a', 'Alpha', '', 0, 1, 1, 1, NULL),
      ('workspace-b', '/spaces/b', 'Beta', '', 1, 1, 1, 1, NULL),
      ('workspace-deleted', '/spaces/deleted', 'Deleted', '', 2, 1, 1, 1, 50);

    INSERT INTO requirements (
      id, workspace_id, title, status, sort_order, revision, created_at,
      updated_at, deleted_at
    ) VALUES
      ('requirement-a1', 'workspace-a', 'Analyze', 'pending', 0, 1, 10, 10, NULL),
      ('requirement-a2', 'workspace-a', 'Release', 'completed', 1, 1, 20, 20, NULL),
      ('requirement-b', 'workspace-b', 'Build', 'active', 0, 1, 30, 30, NULL),
      ('requirement-trashed', 'workspace-a', 'Trashed', 'active', 2, 1, 40, 40, 60),
      ('requirement-deleted-space', 'workspace-deleted', 'Hidden', 'active', 0, 1, 40, 40, NULL);

    INSERT INTO workflow_templates (
      id, name, description, status, revision, created_at, updated_at
    ) VALUES
      ('template-1', 'Delivery', '', 'published', 1, 1, 1),
      ('template-2', 'Research', '', 'published', 1, 1, 1);

    INSERT INTO workflow_template_versions (
      id, template_id, version, status, checksum, created_at, published_at
    ) VALUES
      ('version-1', 'template-1', 1, 'published', 'checksum-1', 1, 1),
      ('version-2', 'template-2', 1, 'published', 'checksum-2', 1, 1);

    INSERT INTO requirement_workflows (
      requirement_id, template_version_id, status, revision, created_at, updated_at
    ) VALUES
      ('requirement-a1', 'version-1', 'running', 1, 10, 10),
      ('requirement-a2', 'version-2', 'completed', 1, 20, 20),
      ('requirement-b', 'version-1', 'created', 1, 30, 30),
      ('requirement-trashed', 'version-1', 'running', 1, 40, 40),
      ('requirement-deleted-space', 'version-2', 'running', 1, 40, 40);

    INSERT INTO requirement_nodes (
      id, requirement_id, type, name, description, config_json, allow_skip,
      sort_order, status, revision, created_at, updated_at
    ) VALUES
      ('node-a1', 'requirement-a1', 'ai_generate', 'Analyze', '', '{}', 0, 0, 'running', 1, 10, 10),
      ('node-a2', 'requirement-a2', 'ai_generate', 'Release', '', '{}', 0, 0, 'completed', 1, 20, 20),
      ('node-b', 'requirement-b', 'tool', 'Build', '', '{}', 0, 0, 'ready', 1, 30, 30),
      ('node-trashed', 'requirement-trashed', 'tool', 'Hidden', '', '{}', 0, 0, 'running', 1, 40, 40),
      ('node-deleted-space', 'requirement-deleted-space', 'tool', 'Hidden', '', '{}', 0, 0, 'running', 1, 40, 40);

    INSERT INTO workflow_executions (
      id, requirement_id, status, current_node_id, revision, created_at,
      updated_at, completed_at
    ) VALUES
      ('execution-a1', 'requirement-a1', 'running', 'node-a1', 1, 100, 100, NULL),
      ('execution-a2', 'requirement-a1', 'failed', 'node-a1', 1, 110, 110, 110),
      ('execution-a3', 'requirement-a2', 'completed', 'node-a2', 1, 120, 120, 120),
      ('execution-b', 'requirement-b', 'created', 'node-b', 1, 130, 130, NULL),
      ('execution-trashed', 'requirement-trashed', 'running', 'node-trashed', 1, 140, 140, NULL),
      ('execution-deleted-space', 'requirement-deleted-space', 'running', 'node-deleted-space', 1, 140, 140, NULL);

    INSERT INTO node_runs (
      id, execution_id, node_id, status, attempt, revision, created_at,
      updated_at, completed_at
    ) VALUES
      ('run-a1', 'execution-a1', 'node-a1', 'running', 1, 1, 100, 100, NULL),
      ('run-a2', 'execution-a1', 'node-a1', 'ready', 2, 1, 101, 101, NULL),
      ('run-a3', 'execution-a2', 'node-a1', 'failed', 1, 1, 110, 110, 110),
      ('run-a4', 'execution-a3', 'node-a2', 'completed', 1, 1, 120, 120, 120),
      ('run-b1', 'execution-b', 'node-b', 'blocked', 1, 1, 130, 130, NULL),
      ('run-b2', 'execution-b', 'node-b', 'skipped', 2, 1, 131, 131, 131),
      ('run-trashed', 'execution-trashed', 'node-trashed', 'running', 1, 1, 140, 140, NULL),
      ('run-deleted-space', 'execution-deleted-space', 'node-deleted-space', 'running', 1, 1, 140, 140, NULL);

    INSERT INTO audit_events (
      id, idempotency_key, scope, scope_id, requirement_id, execution_id,
      node_run_id, event_type, actor_type, actor_id, trigger_source, from_state,
      to_state, reason, aggregate_revision, metadata_json, occurred_at
    ) VALUES
      ('audit-a-old', 'audit:a:old', 'workflow_execution', 'execution-a1',
       'requirement-a1', 'execution-a1', NULL, 'execution_created', 'local_user',
       'local-user', 'user', NULL, NULL, 'raw reason', 1,
       '{"path":"/tmp/secret","prompt":"secret"}', 200),
      ('audit-a-new', 'audit:a:new', 'node_run', 'run-a1',
       'requirement-a1', 'execution-a1', 'run-a1', 'node_run_status_changed',
       'system', 'realmflow', 'recovery', 'interrupted', 'running', 'raw reason',
       2, '{"error":"secret"}', 300),
      ('audit-b', 'audit:b', 'workflow_execution', 'execution-b',
       'requirement-b', 'execution-b', NULL, 'execution_created', 'system',
       'realmflow', 'system', NULL, NULL, 'raw reason', 1, '{}', 400),
      ('audit-trashed', 'audit:trashed', 'workflow_execution', 'execution-trashed',
       'requirement-trashed', 'execution-trashed', NULL, 'execution_created',
       'system', 'realmflow', 'system', NULL, NULL, 'raw reason', 1, '{}', 500),
      ('audit-deleted-space', 'audit:deleted-space', 'workflow_execution',
       'execution-deleted-space', 'requirement-deleted-space',
       'execution-deleted-space', NULL, 'execution_created', 'system',
       'realmflow', 'system', NULL, NULL, 'raw reason', 1, '{}', 600);
  `)
}
