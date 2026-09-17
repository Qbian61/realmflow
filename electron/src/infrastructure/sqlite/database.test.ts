import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { applyMigrations, type SqlMigration } from './migrations'

const temporaryDirectories: string[] = []
const openDatabases: RealmFlowDatabase[] = []

async function createDatabase(): Promise<RealmFlowDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'realmflow-sqlite-'))
  temporaryDirectories.push(directory)
  const database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  openDatabases.push(database)
  return database
}

afterEach(async () => {
  for (const database of openDatabases.splice(0)) database.close()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('RealmFlow SQLite database', () => {
  it('initializes an empty database with ordered migrations and pragmas', async () => {
    const database = await createDatabase()

    expect(database.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(database.pragma('busy_timeout', { simple: true })).toBe(5_000)

    const migrations = database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>
    expect(migrations.map(({ version }) => version)).toEqual([
      1, 2, 3, 4, 5, 6, 7
    ])

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all() as Array<{ name: string }>
    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'ai_run_events',
        'ai_runs',
        'app_settings',
        'artifacts',
        'chat_messages',
        'chat_sessions',
        'dataset_revisions',
        'entity_deletions',
        'legacy_imports',
        'knowledge_chunks',
        'knowledge_documents',
        'knowledge_sync_jobs',
        'model_call_metrics',
        'model_credentials',
        'model_profiles',
        'model_providers',
        'model_usage_rollups',
        'node_questions',
        'node_runs',
        'node_todos',
        'requirement_edges',
        'requirement_nodes',
        'requirement_workflow_revisions',
        'requirement_workflows',
        'requirements',
        'schema_migrations',
        'space_resources',
        'work_roots',
        'workflow_edges',
        'workflow_dispatches',
        'workflow_executions',
        'workflow_nodes',
        'workflow_template_versions',
        'workflow_templates',
        'workspaces'
      ])
    )

    const chatColumns = database
      .prepare('PRAGMA table_info(chat_sessions)')
      .all() as Array<{ name: string; notnull: number }>
    expect(chatColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'workspace_id', notnull: 0 }),
        expect.objectContaining({ name: 'kind', notnull: 1 }),
        expect.objectContaining({ name: 'node_run_id', notnull: 0 }),
        expect.objectContaining({ name: 'folder_path', notnull: 0 })
      ])
    )

    const chatSessionColumns = database
      .prepare("PRAGMA table_info('chat_sessions')")
      .all() as Array<{ name: string }>
    expect(chatSessionColumns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['kind', 'node_run_id', 'folder_path'])
    )

    const builtInNodes = database
      .prepare(
        `SELECT stable_key
         FROM workflow_nodes
         WHERE template_version_id = ?
         ORDER BY sort_order`
      )
      .pluck()
      .all('builtin-sdlc-v1')
    expect(builtInNodes).toEqual([
      'analysis',
      'design',
      'implementation',
      'testing',
      'release',
      'retrospective'
    ])
    const builtInAnalysisConfig = database
      .prepare(
        `SELECT config_json
         FROM workflow_nodes
         WHERE template_version_id = ? AND stable_key = ?`
      )
      .pluck()
      .get('builtin-sdlc-v1', 'analysis')
    expect(JSON.parse(String(builtInAnalysisConfig))).toEqual({
      kind: 'ai_generate',
      prompt: 'Generate the analysis artifact for this requirement.',
      artifact: {
        relativePath: 'artifacts/analysis.md',
        kind: 'markdown'
      },
      legacyStageId: 'analysis'
    })
    for (const table of ['ai_runs', 'artifacts']) {
      const columns = database
        .prepare(`PRAGMA table_info('${table}')`)
        .all() as Array<{ name: string }>
      expect(columns.map(({ name }) => name)).toContain('node_id')
    }
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND name = 'artifacts_primary_per_node'`
        )
        .pluck()
        .get()
    ).toBe('artifacts_primary_per_node')
  })

  it('applies multiple migrations in order and skips already applied versions', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    const applied: number[] = []
    const migrations: SqlMigration[] = [
      {
        version: 1,
        name: 'first',
        up: (connection) => {
          applied.push(1)
          connection.exec('CREATE TABLE first_table (id TEXT PRIMARY KEY)')
        }
      },
      {
        version: 2,
        name: 'second',
        up: (connection) => {
          applied.push(2)
          connection.exec('CREATE TABLE second_table (id TEXT PRIMARY KEY)')
        }
      }
    ]

    applyMigrations(database, migrations)
    applyMigrations(database, migrations)

    expect(applied).toEqual([1, 2])
    expect(
      database
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .pluck()
        .all()
    ).toEqual([1, 2])
  })

  it('rolls back a failed migration without recording or retaining partial DDL', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    const migrations: SqlMigration[] = [
      {
        version: 1,
        name: 'broken',
        up: (connection) => {
          connection.exec('CREATE TABLE should_rollback (id TEXT PRIMARY KEY)')
          throw new Error('migration failed')
        }
      }
    ]

    expect(() => applyMigrations(database, migrations)).toThrow(
      'migration failed'
    )
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
        )
        .get('should_rollback')
    ).toBeUndefined()
    expect(
      database.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()
    ).toBe(0)
  })

  it('enforces foreign keys and unique run event sequences', async () => {
    const database = await createDatabase()

    expect(() =>
      database
        .prepare(
          `INSERT INTO requirements (
            id, workspace_id, title, stage, status, revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run('requirement-1', 'missing', 'Broken', 'analysis', 'pending', 0, 1, 1)
    ).toThrow(/FOREIGN KEY/)

    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('workspace-1', '/spaces/one', 'One', '', 0, 1, 1)
    database
      .prepare(
        `INSERT INTO requirements (
          id, workspace_id, title, stage, status, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'requirement-1',
        'workspace-1',
        'Requirement',
        'analysis',
        'active',
        0,
        1,
        1
      )
    database
      .prepare(
        `INSERT INTO ai_runs (
          id, requirement_id, stage_id, status, last_sequence, content_checkpoint,
          revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'run-1',
        'requirement-1',
        'analysis',
        'running',
        0,
        '',
        0,
        1,
        1
      )

    const insertEvent = database.prepare(
      `INSERT INTO ai_run_events (
        id, run_id, sequence, type, timestamp, data_json
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    insertEvent.run('event-1', 'run-1', 1, 'run.started', 1, '{}')
    expect(() =>
      insertEvent.run('event-2', 'run-1', 1, 'run.progress', 2, '{}')
    ).toThrow(/UNIQUE/)
  })

  it('rolls back all statements when a transaction fails', async () => {
    const database = await createDatabase()
    const createWorkspace = database.prepare(
      `INSERT INTO workspaces (
        id, path, label, description, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const operation = database.transaction(() => {
      createWorkspace.run('workspace-1', '/spaces/one', 'One', '', 0, 1, 1)
      createWorkspace.run('workspace-2', '/spaces/one', 'Duplicate', '', 0, 1, 1)
    })

    expect(() => operation()).toThrow(/UNIQUE/)
    expect(
      database.prepare('SELECT COUNT(*) FROM workspaces').pluck().get()
    ).toBe(0)
  })
})
