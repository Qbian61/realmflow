import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteWorkbenchDashboardRepository } from './workbench-dashboard-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteWorkbenchDashboardRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-dashboard-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  seedDashboard(database)
  repository = new SqliteWorkbenchDashboardRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite workbench dashboard repository', () => {
  it('builds one consistent snapshot with distinct requirement metrics', async () => {
    const snapshot = await repository.query({
      rangeStart: 1_000,
      rangeEnd: 2_000
    })

    expect(snapshot.asOf).toBe(2_000)
    expect(snapshot.summary).toEqual({
      activeRequirements: 2,
      waitingForUser: 1,
      runtimeExceptions: 1,
      enteredExecutionCount: 3,
      completedCount: 1,
      completionRate: 1 / 3
    })
    expect(snapshot.spaces.map(({ id, health }) => [id, health])).toEqual([
      ['space-b', 'failed'],
      ['space-a', 'waiting_user']
    ])
    expect(snapshot.inProgress.map(({ id, health }) => [id, health])).toEqual([
      ['requirement-4', 'failed'],
      ['requirement-2', 'waiting_user']
    ])
    expect(snapshot.exceptions.map(({ kind, requirementId }) => [
      kind,
      requirementId
    ])).toEqual([
      ['user', 'requirement-2'],
      ['system', 'requirement-4']
    ])
  })

  it('scopes every section to one workspace', async () => {
    const snapshot = await repository.query({
      workspaceId: 'space-a',
      rangeStart: 1_000,
      rangeEnd: 2_000
    })

    expect(snapshot.spaces.map(({ id }) => id)).toEqual(['space-a'])
    expect(snapshot.summary).toMatchObject({
      activeRequirements: 1,
      waitingForUser: 1,
      runtimeExceptions: 0,
      enteredExecutionCount: 2,
      completedCount: 1
    })
    expect(
      snapshot.inProgress.every(({ workspaceId }) => workspaceId === 'space-a')
    ).toBe(true)
    expect(
      snapshot.exceptions.every(
        ({ workspaceId }) => workspaceId === 'space-a'
      )
    ).toBe(true)
  })
})

function seedDashboard(target: RealmFlowDatabase): void {
  target.exec(`
    INSERT INTO workspaces (
      id, path, label, description, sort_order, revision, created_at, updated_at,
      deleted_at
    ) VALUES
      ('space-a', '/spaces/a', 'Alpha', '', 0, 1, 1, 1, NULL),
      ('space-b', '/spaces/b', 'Beta', '', 1, 1, 1, 1, NULL);

    INSERT INTO requirements (
      id, workspace_id, title, status, sort_order, revision, created_at,
      updated_at, deleted_at
    ) VALUES
      ('requirement-1', 'space-a', 'Completed retry', 'completed', 0, 1, 10, 1400, NULL),
      ('requirement-2', 'space-a', 'Needs answer', 'active', 1, 1, 20, 1800, NULL),
      ('requirement-3', 'space-b', 'Entered before range', 'completed', 0, 1, 30, 1500, NULL),
      ('requirement-4', 'space-b', 'Failed node', 'active', 1, 1, 40, 1700, NULL);

    INSERT INTO workflow_templates (
      id, name, description, status, revision, created_at, updated_at
    ) VALUES ('template-1', 'Delivery', '', 'published', 1, 1, 1);

    INSERT INTO workflow_template_versions (
      id, template_id, version, status, checksum, created_at, published_at
    ) VALUES ('version-1', 'template-1', 1, 'published', 'checksum', 1, 1);

    INSERT INTO requirement_workflows (
      requirement_id, template_version_id, status, revision, created_at, updated_at
    ) VALUES
      ('requirement-1', 'version-1', 'completed', 1, 10, 1400),
      ('requirement-2', 'version-1', 'waiting_user', 1, 20, 1800),
      ('requirement-3', 'version-1', 'completed', 1, 30, 1500),
      ('requirement-4', 'version-1', 'running', 1, 40, 1700);

    INSERT INTO requirement_nodes (
      id, requirement_id, type, name, description, config_json, allow_skip,
      sort_order, status, revision, created_at, updated_at
    ) VALUES
      ('node-1', 'requirement-1', 'tool', 'Complete', '', '{}', 0, 0, 'completed', 1, 10, 1400),
      ('node-2', 'requirement-2', 'human_input', 'Answer', '', '{}', 0, 0, 'waiting_user', 1, 20, 1800),
      ('node-3', 'requirement-3', 'tool', 'Legacy', '', '{}', 0, 0, 'completed', 1, 30, 1500),
      ('node-4', 'requirement-4', 'tool', 'Build', '', '{}', 0, 0, 'failed', 1, 40, 1700);

    INSERT INTO workflow_executions (
      id, requirement_id, status, current_node_id, revision, created_at,
      updated_at, completed_at
    ) VALUES
      ('execution-1-old', 'requirement-1', 'failed', 'node-1', 1, 1100, 1150, 1150),
      ('execution-1', 'requirement-1', 'completed', 'node-1', 1, 1200, 1400, 1400),
      ('execution-2', 'requirement-2', 'running', 'node-2', 1, 1300, 1800, NULL),
      ('execution-3', 'requirement-3', 'completed', 'node-3', 1, 900, 1500, 1500),
      ('execution-4', 'requirement-4', 'running', 'node-4', 1, 1250, 1700, NULL);

    INSERT INTO node_runs (
      id, execution_id, node_id, status, attempt, revision, created_at,
      updated_at, completed_at
    ) VALUES
      ('run-1', 'execution-1', 'node-1', 'completed', 1, 1, 1200, 1400, 1400),
      ('run-2', 'execution-2', 'node-2', 'waiting_user', 1, 1, 1300, 1800, NULL),
      ('run-3', 'execution-3', 'node-3', 'completed', 1, 1, 900, 1500, 1500),
      ('run-4', 'execution-4', 'node-4', 'failed', 1, 1, 1250, 1700, 1700);

    INSERT INTO node_questions (
      id, node_run_id, prompt, required, status, revision, created_at, updated_at
    ) VALUES ('question-2', 'run-2', 'Choose target', 1, 'open', 0, 1350, 1350);
  `)
}
