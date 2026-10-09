import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import {
  applyMigrations,
  REALMFLOW_MIGRATIONS,
  type SqlMigration
} from './migrations'

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
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
      36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
      53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
      70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86,
      87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99
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
        'agent_run_attempts',
        'agent_run_checkpoints',
        'agent_profile_publications',
        'agent_runtime_runs',
        'assistant_run_events',
        'assistant_run_event_retention_deletions',
        'assistant_turn_projections',
        'app_update_checks',
        'app_settings',
        'artifacts',
        'audit_events',
        'backup_operations',
        'capability_catalog_audit',
        'capability_definitions',
        'capability_generation_sessions',
        'capability_installations',
        'capability_package_bindings',
        'capability_references',
        'chat_messages',
        'chat_sessions',
        'conversation_attachment_chunks',
        'connector_commands',
        'connector_credentials',
        'connector_events',
        'connector_validation_results',
        'connectors',
        'context_snapshots',
        'dataset_revisions',
        'document_delivery_operations',
        'document_delivery_receipts',
        'entity_deletions',
        'knowledge_index_documents',
        'knowledge_index_document_states',
        'knowledge_index_generations',
        'knowledge_index_jobs',
        'knowledge_index_rebuild_markers',
        'vector_index_collection_deletions',
        'vector_index_profile_recoveries',
        'knowledge_note_versions',
        'knowledge_notes',
        'knowledge_refresh_cursors',
        'knowledge_refresh_policies',
        'knowledge_refresh_runs',
        'local_file_ingestion_commands',
        'local_file_sources',
        'knowledge_source_commands',
        'knowledge_source_events',
        'knowledge_sources',
        'workspace_qdrant_cleanup_jobs',
        'vector_index_profiles',
        'model_call_metrics',
        'model_availability_checks',
        'model_credentials',
        'model_credential_key_rotations',
        'model_catalog_applications',
        'model_catalog_events',
        'model_profile_events',
        'model_provider_events',
        'model_profiles',
        'model_providers',
        'model_usage_rollups',
        'node_approval_decisions',
        'node_approvals',
        'node_questions',
        'node_question_transitions',
        'node_runs',
        'node_run_transitions',
        'node_todo_transitions',
        'node_todos',
        'outbound_calls',
        'online_document_commands',
        'online_document_snapshots',
        'online_document_sources',
        'repository_commands',
        'repository_snapshot_files',
        'repository_snapshots',
        'repository_sources',
        'requirement_memories',
        'requirement_memory_versions',
        'requirement_edges',
        'requirement_nodes',
        'requirement_workflow_revisions',
        'requirement_workflows',
        'requirements',
        'runtime_evaluation_runs',
        'runtime_governance_events',
        'runtime_governance_revisions',
        'runtime_observability_state',
        'schema_migrations',
        'schedule_commands',
        'schedule_events',
        'schedule_recovery_decisions',
        'schedule_runs',
        'schedule_trigger_cursors',
        'schedules',
        'extension_package_projections',
        'skill_definition_projections',
        'tool_event_streams',
        'tool_events',
        'tool_definition_projections',
        'tool_execution_projections',
        'workbench_hub_layout',
        'workbench_audit_events',
        'workbench_attachments',
        'workbench_memos',
        'workbench_site_groups',
        'workbench_sites',
        'workbench_task_fields',
        'workbench_task_records',
        'workbench_task_tables',
        'work_roots',
        'workflow_edges',
        'workflow_dispatches',
        'workflow_execution_transitions',
        'workflow_executions',
        'workflow_nodes',
        'workflow_template_migrations',
        'workflow_template_versions',
        'workflow_templates',
        'workspaces'
      ])
    )
    expect(
      (
        database.pragma('table_info(chat_messages)') as Array<{
          name: string
        }>
      ).map(({ name }) => name)
    ).toEqual(expect.arrayContaining(['model_id', 'model_name']))

    const artifactColumns = database
      .prepare("PRAGMA table_info('artifacts')")
      .all() as Array<{ name: string; notnull: number }>
    expect(artifactColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'media_type', notnull: 0 }),
        expect.objectContaining({
          name: 'verification_receipt_id',
          notnull: 0
        })
      ])
    )

    const todoColumns = database
      .prepare("PRAGMA table_info('node_todos')")
      .all() as Array<{ name: string; notnull: number }>
    expect(todoColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'completed_at', notnull: 0 })
      ])
    )

    const attachmentColumns = database
      .prepare("PRAGMA table_info('workbench_attachments')")
      .all() as Array<{ name: string; notnull: number }>
    expect(attachmentColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'owner_type', notnull: 1 }),
        expect.objectContaining({ name: 'owner_id', notnull: 1 }),
        expect.objectContaining({ name: 'relative_path', notnull: 1 }),
        expect.objectContaining({ name: 'deleted_at', notnull: 0 })
      ])
    )
    const taskRecordColumns = database
      .prepare("PRAGMA table_info('workbench_task_records')")
      .all() as Array<{ name: string }>
    expect(taskRecordColumns.map(({ name }) => name)).not.toContain(
      'completed_at'
    )
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND tbl_name = 'workbench_attachments'`
        )
        .all()
    ).toEqual(
      expect.arrayContaining([
        { name: 'workbench_attachments_owner' },
        { name: 'sqlite_autoindex_workbench_attachments_2' }
      ])
    )
    expect(() =>
      database
        .prepare(
          `INSERT INTO workbench_attachments (
            id, owner_type, owner_id, file_name, mime_type, size_bytes,
            checksum_sha256, relative_path, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'attachment-invalid',
          'requirement',
          'owner-1',
          'file.txt',
          'text/plain',
          1,
          '0'.repeat(64),
          'attachment-invalid/file.txt',
          1
        )
    ).toThrow()
    expect(
      database
        .prepare(
          `SELECT id, name, system_key
           FROM workbench_site_groups
           WHERE system_key = 'ungrouped'`
        )
        .get()
    ).toBeUndefined()

    const workflowColumns = database
      .prepare("PRAGMA table_info('requirement_workflows')")
      .all() as Array<{
      name: string
      notnull: number
      dflt_value: string | null
    }>
    expect(workflowColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'max_parallelism',
          notnull: 1,
          dflt_value: '1'
        })
      ])
    )
    const workflowTableSql = database
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'requirement_workflows'`
      )
      .pluck()
      .get() as string
    expect(workflowTableSql).toContain(
      'CHECK (max_parallelism BETWEEN 1 AND 8)'
    )

    const contextSnapshotColumns = database
      .prepare("PRAGMA table_info('context_snapshots')")
      .all() as Array<{ name: string; notnull: number }>
    expect(contextSnapshotColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'node_run_id', notnull: 1 }),
        expect.objectContaining({ name: 'provider_id', notnull: 1 }),
        expect.objectContaining({ name: 'model_profile_id', notnull: 1 }),
        expect.objectContaining({ name: 'content', notnull: 1 }),
        expect.objectContaining({ name: 'sources_json', notnull: 1 }),
        expect.objectContaining({ name: 'checksum', notnull: 1 })
      ])
    )

    const generationColumns = database
      .prepare("PRAGMA table_info('knowledge_index_generations')")
      .all() as Array<{ name: string; notnull: number }>
    expect(generationColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'scope_kind', notnull: 1 }),
        expect.objectContaining({ name: 'scope_id', notnull: 1 }),
        expect.objectContaining({ name: 'profile_id', notnull: 1 }),
        expect.objectContaining({ name: 'status', notnull: 1 }),
        expect.objectContaining({ name: 'chunk_count', notnull: 1 })
      ])
    )
    const indexJobColumns = database
      .prepare("PRAGMA table_info('knowledge_index_jobs')")
      .all() as Array<{ name: string; notnull: number }>
    expect(indexJobColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'generation_id', notnull: 1 }),
        expect.objectContaining({ name: 'trigger_source', notnull: 1 }),
        expect.objectContaining({ name: 'priority', notnull: 1 }),
        expect.objectContaining({ name: 'idempotency_key', notnull: 1 })
      ])
    )
    const removedIndexTables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (
           'knowledge_indexes', 'knowledge_index_versions',
           'knowledge_index_chunks', 'knowledge_index_commands',
           'knowledge_chunks', 'knowledge_documents', 'knowledge_sync_jobs'
         )
         ORDER BY name`
      )
      .all()
    expect(removedIndexTables).toEqual([])

    const chatColumns = database
      .prepare('PRAGMA table_info(chat_sessions)')
      .all() as Array<{ name: string; notnull: number }>
    expect(chatColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'workspace_id', notnull: 0 }),
        expect.objectContaining({ name: 'kind', notnull: 1 }),
        expect.objectContaining({ name: 'node_run_id', notnull: 0 }),
        expect.objectContaining({ name: 'folder_path', notnull: 0 }),
        expect.objectContaining({ name: 'knowledge_scope', notnull: 1 })
      ])
    )

    const chatSessionColumns = database
      .prepare("PRAGMA table_info('chat_sessions')")
      .all() as Array<{ name: string }>
    expect(chatSessionColumns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'kind',
        'node_run_id',
        'folder_path',
        'knowledge_scope'
      ])
    )
    const insertConversation = database.prepare(
      `INSERT INTO chat_sessions (
        id, kind, knowledge_scope, title, sort_order, revision,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, 1, 1)`
    )
    expect(() =>
      insertConversation.run(
        'invalid-scope-json',
        'general',
        '{"kind":"workspace"}',
        'Invalid'
      )
    ).toThrow()
    expect(() =>
      insertConversation.run(
        'invalid-scope-binding',
        'general',
        '{"kind":"node_configuration"}',
        'Invalid'
      )
    ).toThrow('Invalid conversation knowledge scope binding')

    const workflowNodeColumns = database
      .prepare("PRAGMA table_info('workflow_nodes')")
      .all() as Array<{ name: string; notnull: number }>
    expect(workflowNodeColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'position_x', notnull: 1 }),
        expect.objectContaining({ name: 'position_y', notnull: 1 })
      ])
    )

    const chatMessageColumns = database
      .prepare("PRAGMA table_info('chat_messages')")
      .all() as Array<{ name: string; notnull: number }>
    expect(chatMessageColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'status', notnull: 1 }),
        expect.objectContaining({ name: 'run_id', notnull: 0 }),
        expect.objectContaining({ name: 'error', notnull: 0 }),
        expect.objectContaining({ name: 'question_id', notnull: 0 }),
        expect.objectContaining({ name: 'todo_id', notnull: 0 }),
        expect.objectContaining({ name: 'tool_call_id', notnull: 0 }),
        expect.objectContaining({ name: 'artifact_id', notnull: 0 }),
        expect.objectContaining({ name: 'completed_at', notnull: 0 })
      ])
    )
    const chatSessionIndexes = database
      .prepare("PRAGMA index_list('chat_sessions')")
      .all() as Array<{ name: string; unique: number; partial: number }>
    expect(chatSessionIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'chat_sessions_node_run_unique',
          unique: 1,
          partial: 1
        })
      ])
    )
    const modelMetricForeignKeys = database
      .prepare("PRAGMA foreign_key_list('model_call_metrics')")
      .all() as Array<{ from: string; table: string }>
    expect(modelMetricForeignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'conversation_id',
          table: 'chat_sessions'
        }),
        expect.objectContaining({
          from: 'model_profile_id',
          table: 'model_profiles'
        }),
        expect.objectContaining({
          from: 'provider_id',
          table: 'model_providers'
        })
      ])
    )
    expect(modelMetricForeignKeys).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'ai_run_id', table: 'ai_runs' })
      ])
    )
    const modelMetricColumns = database
      .prepare("PRAGMA table_info('model_call_metrics')")
      .all() as Array<{ name: string; notnull: number }>
    expect(modelMetricColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'source', notnull: 1 }),
        expect.objectContaining({
          name: 'throughput_tokens_per_second',
          notnull: 1
        }),
        expect.objectContaining({ name: 'estimated_input_cost', notnull: 1 }),
        expect.objectContaining({ name: 'estimated_output_cost', notnull: 1 }),
        expect.objectContaining({ name: 'requested_reasoning', notnull: 0 }),
        expect.objectContaining({ name: 'effective_reasoning', notnull: 0 }),
        expect.objectContaining({ name: 'error_code', notnull: 0 })
      ])
    )
    const modelMetricIndexes = database
      .prepare("PRAGMA index_list('model_call_metrics')")
      .all() as Array<{ name: string; unique: number }>
    expect(modelMetricIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'model_call_metrics_ai_run',
          unique: 1
        })
      ])
    )
    const metricTriggers = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND tbl_name = 'model_call_metrics'`
      )
      .all() as Array<{ name: string }>
    expect(metricTriggers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'model_call_metrics_prevent_update',
        'model_call_metrics_prevent_delete'
      ])
    )
    const deletionColumns = database
      .prepare("PRAGMA table_info('entity_deletions')")
      .all() as Array<{ name: string; notnull: number }>
    expect(deletionColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'state', notnull: 1 }),
        expect.objectContaining({ name: 'trigger_source', notnull: 1 })
      ])
    )
    const workspaceColumns = database
      .prepare("PRAGMA table_info('workspaces')")
      .all() as Array<{ name: string; notnull: number }>
    expect(workspaceColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'relocated_at', notnull: 0 }),
        expect.objectContaining({ name: 'relocation_source', notnull: 0 })
      ])
    )
    const workflowRevisionColumns = database
      .prepare("PRAGMA table_info('requirement_workflow_revisions')")
      .all() as Array<{ name: string; notnull: number }>
    expect(workflowRevisionColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'diff_json', notnull: 1 }),
        expect.objectContaining({ name: 'trigger_source', notnull: 1 })
      ])
    )
    const auditColumns = database
      .prepare("PRAGMA table_info('audit_events')")
      .all() as Array<{ name: string; notnull: number }>
    expect(auditColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'idempotency_key', notnull: 1 }),
        expect.objectContaining({ name: 'scope', notnull: 1 }),
        expect.objectContaining({ name: 'scope_id', notnull: 1 }),
        expect.objectContaining({ name: 'event_type', notnull: 1 }),
        expect.objectContaining({ name: 'aggregate_revision', notnull: 1 }),
        expect.objectContaining({ name: 'metadata_json', notnull: 1 }),
        expect.objectContaining({ name: 'occurred_at', notnull: 1 })
      ])
    )
    const auditIndexes = database
      .prepare("PRAGMA index_list('audit_events')")
      .all() as Array<{ name: string; unique: number }>
    expect(auditIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'audit_events_idempotency',
          unique: 1
        }),
        expect.objectContaining({
          name: 'audit_events_scope_time',
          unique: 0
        }),
        expect.objectContaining({
          name: 'audit_events_requirement_time',
          unique: 0
        })
      ])
    )
    const outboundColumns = database
      .prepare("PRAGMA table_info('outbound_calls')")
      .all() as Array<{ name: string; notnull: number }>
    expect(outboundColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'idempotency_key', notnull: 1 }),
        expect.objectContaining({ name: 'call_type', notnull: 1 }),
        expect.objectContaining({ name: 'target_type', notnull: 1 }),
        expect.objectContaining({ name: 'target_id', notnull: 1 }),
        expect.objectContaining({ name: 'owner_type', notnull: 1 }),
        expect.objectContaining({ name: 'owner_id', notnull: 1 }),
        expect.objectContaining({ name: 'status', notnull: 1 }),
        expect.objectContaining({ name: 'started_at', notnull: 1 }),
        expect.objectContaining({ name: 'duration_ms', notnull: 0 }),
        expect.objectContaining({ name: 'error_summary', notnull: 0 })
      ])
    )
    const outboundIndexes = database
      .prepare("PRAGMA index_list('outbound_calls')")
      .all() as Array<{ name: string; unique: number }>
    expect(outboundIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'outbound_calls_idempotency',
          unique: 1
        }),
        expect.objectContaining({
          name: 'outbound_calls_started',
          unique: 0
        }),
        expect.objectContaining({
          name: 'outbound_calls_owner',
          unique: 0
        })
      ])
    )
    const outboundTriggers = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND tbl_name = 'outbound_calls'`
      )
      .all() as Array<{ name: string }>
    expect(outboundTriggers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'outbound_calls_validate_transition',
        'outbound_calls_prevent_delete'
      ])
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

  it('upgrades a quoted schema 95 model metrics table to schema 96', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 95))
    database.exec(`
      ALTER TABLE model_call_metrics RENAME TO model_call_metrics_v95;
      ALTER TABLE model_call_metrics_v95 RENAME TO model_call_metrics;
    `)
    const migratedSchema = database
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'model_call_metrics'`
      )
      .get() as { sql: string }
    database.exec('DROP TABLE model_call_metrics')
    database.exec(
      migratedSchema.sql.replace(", 'follow_up_suggestion'", '')
    )
    const before = database
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'model_call_metrics'`
      )
      .get() as { sql: string }
    expect(before.sql).toMatch(/^CREATE TABLE "model_call_metrics"/)
    expect(before.sql).not.toContain("'follow_up_suggestion'")

    applyMigrations(database)

    const after = database
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'model_call_metrics'`
      )
      .get() as { sql: string }
    expect(after.sql).toContain("'follow_up_suggestion'")
    expect(
      database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get()
    ).toEqual({ version: 99 })
  })

  it('audits workbench writes without storing private content', async () => {
    const database = await createDatabase()
    database
      .prepare(
        `INSERT INTO workbench_sites (
          id, group_id, name, url, open_mode, position, revision,
          created_at, updated_at
        ) VALUES (
          'site-private', 'workbench-site-group-ungrouped', 'Private',
          'https://example.com/path?token=secret', 'embedded', 0, 0, 1, 1
        )`
      )
      .run()
    database
      .prepare(
        `UPDATE workbench_sites
         SET deleted_at = 2, revision = 1, updated_at = 2
         WHERE id = 'site-private'`
      )
      .run()

    const events = database
      .prepare(
        `SELECT module, action, entity_type, entity_id, entity_revision,
                metadata_json
         FROM workbench_audit_events
         WHERE entity_id = 'site-private'
         ORDER BY occurred_at, rowid`
      )
      .all()

    expect(events).toEqual([
      {
        module: 'sites',
        action: 'created',
        entity_type: 'site',
        entity_id: 'site-private',
        entity_revision: 0,
        metadata_json: '{}'
      },
      {
        module: 'sites',
        action: 'deleted',
        entity_type: 'site',
        entity_id: 'site-private',
        entity_revision: 1,
        metadata_json: '{}'
      }
    ])
    expect(JSON.stringify(events)).not.toContain('secret')
    expect(JSON.stringify(events)).not.toContain('example.com')
  })

  it('creates constrained Knowledge Note aggregates and immutable versions', async () => {
    const database = await createDatabase()
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('workspace-note', '/spaces/note', 'Note', '', 0, 1, 1, 1)
    database
      .prepare(
        `INSERT INTO chat_sessions (
          id, kind, knowledge_scope, workspace_id, title, sort_order, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'session-note',
        'space',
        '{"kind":"workspace","workspaceId":"workspace-note"}',
        'workspace-note',
        'Source',
        0,
        1,
        1,
        1
      )

    const insertAggregate = database.prepare(
      `INSERT INTO knowledge_notes (
        id, workspace_id, kind, requirement_id, session_id,
        current_version_id, current_version, status, revision, created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertVersion = database.prepare(
      `INSERT INTO knowledge_note_versions (
        id, note_id, version, title, content, source_message_ids_json,
        checksum, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    database.transaction(() => {
      insertAggregate.run(
        'note-1',
        'workspace-note',
        'decision',
        null,
        'session-note',
        'note-version-1',
        1,
        'active',
        1,
        10,
        10
      )
      insertVersion.run(
        'note-version-1',
        'note-1',
        1,
        'Direction',
        'Use SQLite.',
        '["message-1"]',
        `sha256:${'a'.repeat(64)}`,
        10
      )
    })()

    expect(() =>
      insertVersion.run(
        'note-version-duplicate',
        'note-1',
        1,
        'Duplicate',
        'Duplicate',
        '["message-1"]',
        `sha256:${'b'.repeat(64)}`,
        11
      )
    ).toThrow(/UNIQUE/)
    expect(() =>
      insertAggregate.run(
        'note-invalid',
        'workspace-note',
        'system',
        null,
        'session-note',
        'note-version-invalid',
        1,
        'active',
        1,
        10,
        10
      )
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `UPDATE knowledge_notes SET status = 'deleted' WHERE id = 'note-1'`
        )
        .run()
    ).toThrow()
    expect(() =>
      insertVersion.run(
        'orphan-version',
        'missing-note',
        1,
        'Orphan',
        'Orphan',
        '["message-1"]',
        `sha256:${'c'.repeat(64)}`,
        12
      )
    ).toThrow(/FOREIGN KEY/)
  })

  it('creates immutable template migration records with unique request ids', async () => {
    const database = await createDatabase()
    const columns = database
      .prepare("PRAGMA table_info('workflow_template_migrations')")
      .all() as Array<{ name: string; notnull: number }>

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', notnull: 1 }),
        expect.objectContaining({ name: 'request_id', notnull: 1 }),
        expect.objectContaining({ name: 'requirement_id', notnull: 1 }),
        expect.objectContaining({ name: 'diff_json', notnull: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 })
      ])
    )

    const insert = database.prepare(
      `INSERT INTO workflow_template_migrations (
        id, request_id, requirement_id, source_template_version_id,
        target_template_version_id, before_requirement_revision,
        after_requirement_revision, before_workflow_revision,
        after_workflow_revision, before_execution_revision,
        after_execution_revision, diff_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const values = [
      'migration-1',
      'request-1',
      'requirement-1',
      'template-v1',
      'template-v2',
      1,
      2,
      3,
      4,
      5,
      6,
      '{}',
      100
    ] as const
    insert.run(...values)

    expect(() =>
      insert.run('migration-2', ...values.slice(1))
    ).toThrow(/UNIQUE/)
    expect(() =>
      database
        .prepare(
          'UPDATE workflow_template_migrations SET created_at = 101 WHERE id = ?'
        )
        .run('migration-1')
    ).toThrow('Workflow template migrations are immutable')
    expect(() =>
      database
        .prepare('DELETE FROM workflow_template_migrations WHERE id = ?')
        .run('migration-1')
    ).toThrow('Workflow template migrations are immutable')
  })

  it('creates constrained update check storage with deterministic ordering', async () => {
    const database = await createDatabase()

    database
      .prepare(
        `INSERT INTO app_update_checks (
          request_id, current_version, status, latest_version, error_code,
          checked_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run('request-1', '1.0.0', 'up_to_date', '1.0.0', null, 100)

    expect(() =>
      database
        .prepare(
          `INSERT INTO app_update_checks (
            request_id, current_version, status, latest_version, error_code,
            checked_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('request-2', '1.0.0', 'failed', '1.1.0', 'invalid_response', 200)
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `INSERT INTO app_update_checks (
            request_id, current_version, status, latest_version, error_code,
            checked_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('request-3', '1.0.0', 'up_to_date', null, null, -1)
    ).toThrow()

    const indexes = database
      .prepare("PRAGMA index_list('app_update_checks')")
      .all() as Array<{ name: string }>
    expect(indexes.map(({ name }) => name)).toContain(
      'app_update_checks_latest'
    )
  })

  it('adds repository branch and file-index persistence', async () => {
    const database = await createDatabase()

    const columns = (table: string) =>
      (
        database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string
          pk: number
        }>
      )

    expect(columns('repository_sources').map(({ name }) => name)).toContain(
      'selected_branch'
    )
    expect(columns('repository_snapshots').map(({ name }) => name)).toContain(
      'branch'
    )
    expect(columns('knowledge_index_jobs').map(({ name }) => name)).toContain(
      'target_document_key'
    )
    expect(
      columns('knowledge_index_document_states')
        .filter(({ pk }) => pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map(({ name }) => name)
    ).toEqual(['source_id', 'profile_id', 'document_key'])
  })

  it('creates constrained backup operation storage', async () => {
    const database = await createDatabase()
    const insert = database.prepare(
      `INSERT INTO backup_operations (
        request_id, kind, status, bundle_name, bundle_checksum,
        format_version, schema_version, file_count, byte_size, error_code,
        created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    insert.run(
      'backup-1',
      'backup',
      'succeeded',
      'daily.realmflow-backup',
      `sha256:${'a'.repeat(64)}`,
      1,
      44,
      1,
      1024,
      null,
      100,
      200
    )
    expect(() =>
      insert.run(
        'backup-2',
        'backup',
        'restore_pending',
        'daily.realmflow-backup',
        `sha256:${'a'.repeat(64)}`,
        1,
        44,
        1,
        1024,
        null,
        100,
        null
      )
    ).toThrow()
    expect(() =>
      insert.run(
        'restore-1',
        'restore',
        'failed',
        'daily.realmflow-backup',
        null,
        null,
        null,
        0,
        0,
        null,
        100,
        200
      )
    ).toThrow()

    const indexes = database
      .prepare("PRAGMA index_list('backup_operations')")
      .all() as Array<{ name: string }>
    expect(indexes.map(({ name }) => name)).toContain(
      'backup_operations_latest'
    )
  })

  it('adds persistent cron trigger slots with database integrity', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    database.exec(`
      CREATE TABLE workspaces (id TEXT PRIMARY KEY);
      CREATE TABLE model_profiles (id TEXT PRIMARY KEY);
      CREATE TABLE skill_versions (id TEXT PRIMARY KEY);
      INSERT INTO workspaces (id) VALUES ('workspace-1');
      INSERT INTO model_profiles (id) VALUES ('model-profile-1');
      INSERT INTO skill_versions (id) VALUES ('skill-version-1');
    `)
    database.pragma('foreign_keys = ON')
    applyMigrations(
      database,
      REALMFLOW_MIGRATIONS.filter(
        ({ version }) => version >= 40 && version <= 41
      )
    )

    const runColumns = database
      .prepare("PRAGMA table_info('schedule_runs')")
      .all() as Array<{ name: string; notnull: number }>
    expect(runColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'scheduled_for', notnull: 0 })
      ])
    )
    expect(
      database
        .prepare("PRAGMA table_info('schedule_trigger_cursors')")
        .all() as Array<{ name: string }>
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'schedule_id' }),
        expect.objectContaining({ name: 'schedule_revision' }),
        expect.objectContaining({ name: 'next_due_at' }),
        expect.objectContaining({ name: 'missed_due_at' }),
        expect.objectContaining({ name: 'updated_at' })
      ])
    )

    database
      .prepare(
        `INSERT INTO schedules (
          id, name, description, cron_expression, time_zone, status,
          workspace_id, model_profile_id, skill_version_id, skill_input_json,
          connector_bindings_json, permissions_json, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'schedule-1',
        'Daily summary',
        '',
        '0 9 * * *',
        'Asia/Shanghai',
        'active',
        'workspace-1',
        'model-profile-1',
        'skill-version-1',
        '{}',
        '[]',
        '[]',
        1,
        100,
        100
      )
    database
      .prepare(
        `INSERT INTO schedule_trigger_cursors (
          schedule_id, schedule_revision, next_due_at, missed_due_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run('schedule-1', 1, 200, null, 100)

    const insertRun = database.prepare(
      `INSERT INTO schedule_runs (
        id, schedule_id, schedule_revision, schedule_name, trigger_source,
        status, scheduled_for, started_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    insertRun.run(
      'cron-run-1',
      'schedule-1',
      1,
      'Daily summary',
      'cron',
      'running',
      200,
      200,
      1
    )
    expect(() =>
      insertRun.run(
        'cron-run-2',
        'schedule-1',
        1,
        'Daily summary',
        'cron',
        'running',
        200,
        201,
        1
      )
    ).toThrow(/UNIQUE/)
    expect(() =>
      insertRun.run(
        'manual-run',
        'schedule-1',
        1,
        'Daily summary',
        'manual',
        'running',
        201,
        201,
        1
      )
    ).toThrow(/CHECK/)
    expect(() =>
      insertRun.run(
        'cron-run-without-slot',
        'schedule-1',
        1,
        'Daily summary',
        'cron',
        'running',
        null,
        201,
        1
      )
    ).toThrow(/CHECK/)

    database.prepare('DELETE FROM schedules WHERE id = ?').run('schedule-1')
    expect(
      database
        .prepare('SELECT COUNT(*) FROM schedule_trigger_cursors')
        .pluck()
        .get()
    ).toBe(0)
  })

  it('adds missed-run policies and immutable recovery decisions', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    database.exec(`
      CREATE TABLE workspaces (id TEXT PRIMARY KEY);
      CREATE TABLE model_profiles (id TEXT PRIMARY KEY);
      CREATE TABLE skill_versions (id TEXT PRIMARY KEY);
      INSERT INTO workspaces (id) VALUES ('workspace-1');
      INSERT INTO model_profiles (id) VALUES ('model-profile-1');
      INSERT INTO skill_versions (id) VALUES ('skill-version-1');
    `)
    database.pragma('foreign_keys = ON')
    applyMigrations(
      database,
      REALMFLOW_MIGRATIONS.filter(
        ({ version }) => version >= 40 && version <= 42
      )
    )

    const policyColumn = (
      database
        .prepare("PRAGMA table_info('schedules')")
        .all() as Array<{
          name: string
          notnull: number
          dflt_value: string | null
        }>
    ).find(({ name }) => name === 'missed_run_policy')
    expect(policyColumn).toMatchObject({
      notnull: 1,
      dflt_value: "'skip'"
    })

    database
      .prepare(
        `INSERT INTO schedules (
          id, name, description, cron_expression, time_zone, status,
          workspace_id, model_profile_id, skill_version_id, skill_input_json,
          connector_bindings_json, permissions_json, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'schedule-1',
        'Daily summary',
        '',
        '0 9 * * *',
        'Asia/Shanghai',
        'active',
        'workspace-1',
        'model-profile-1',
        'skill-version-1',
        '{}',
        '[]',
        '[]',
        1,
        100,
        100
      )
    expect(
      database
        .prepare(
          'SELECT missed_run_policy FROM schedules WHERE id = ?'
        )
        .pluck()
        .get('schedule-1')
    ).toBe('skip')
    expect(() =>
      database
        .prepare(
          `UPDATE schedules SET missed_run_policy = 'run_all' WHERE id = ?`
        )
        .run('schedule-1')
    ).toThrow(/CHECK/)

    const insertDecision = database.prepare(
      `INSERT INTO schedule_recovery_decisions (
        schedule_id, schedule_revision, missed_due_at, policy, action,
        run_id, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    insertDecision.run(
      'schedule-1',
      1,
      200,
      'skip',
      'skipped',
      null,
      300
    )
    expect(() =>
      insertDecision.run(
        'schedule-1',
        1,
        200,
        'skip',
        'skipped',
        null,
        301
      )
    ).toThrow(/UNIQUE/)
    expect(() =>
      insertDecision.run(
        'schedule-1',
        1,
        201,
        'run_all',
        'skipped',
        null,
        301
      )
    ).toThrow(/CHECK/)

    database.prepare('DELETE FROM schedules WHERE id = ?').run('schedule-1')
    expect(
      database
        .prepare('SELECT COUNT(*) FROM schedule_recovery_decisions')
        .pluck()
        .get()
    ).toBe(1)
  })

  it('upgrades workflow revision audit records to recovery trigger support', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    database.pragma('foreign_keys = ON')
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 15))
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
        `INSERT INTO requirement_workflows (
          requirement_id, template_version_id, status, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run('requirement-1', 'builtin-sdlc-v1', 'running', 1, 1, 1)
    database
      .prepare(
        `INSERT INTO requirement_workflow_revisions (
          id, requirement_id, revision, snapshot_json, reason, created_at,
          diff_json, trigger_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'workflow-revision-1',
        'requirement-1',
        1,
        '{}',
        'node_started',
        1,
        '{}',
        'system'
      )

    applyMigrations(database)
    database.pragma('foreign_keys = ON')

    expect(
      database
        .prepare(
          `SELECT id, reason, trigger_source
           FROM requirement_workflow_revisions
           ORDER BY revision`
        )
        .all()
    ).toEqual([
      {
        id: 'workflow-revision-1',
        reason: 'node_started',
        trigger_source: 'system'
      }
    ])
    expect(() =>
      database
        .prepare(
          `INSERT INTO requirement_workflow_revisions (
            id, requirement_id, revision, snapshot_json, reason, created_at,
            diff_json, trigger_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'workflow-revision-2',
          'requirement-1',
          2,
          '{}',
          'startup_interrupted',
          2,
          '{}',
          'recovery'
        )
    ).not.toThrow()
    expect(database.pragma('foreign_key_check')).toEqual([])

    database
      .prepare('DELETE FROM requirement_workflows WHERE requirement_id = ?')
      .run('requirement-1')
    expect(
      database
        .prepare('SELECT COUNT(*) FROM requirement_workflow_revisions')
        .pluck()
        .get()
    ).toBe(0)
  })

  it('removes legacy Skill, permission, and execution authority tables', async () => {
    const database = await createDatabase()
    const legacy = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN (
             'skills', 'skill_versions', 'skill_version_integrity',
             'skill_events', 'skill_commands', 'skill_executions',
             'skill_execution_events', 'skill_execution_commands',
             'permission_grants', 'permission_events', 'permission_commands'
           )
         ORDER BY name`
      )
      .all()

    expect(legacy).toEqual([])
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

  it('stores explicit model API protocols after migrating legacy providers', async () => {
    const database = await createDatabase()

    for (const apiType of [
      'openai_completions',
      'openai_responses',
      'anthropic_messages',
      'local'
    ]) {
      database
        .prepare(
          `INSERT INTO model_providers (
            id, type, api_type, name, base_url, enabled, revision,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, 0, 1, 1)`
        )
        .run(
          `provider-${apiType}`,
          apiType === 'local' ? 'local' : 'openai_compatible',
          apiType,
          apiType,
          'https://api.example.com'
        )
    }

    expect(
      database
        .prepare(
          'SELECT api_type FROM model_providers ORDER BY api_type'
        )
        .pluck()
        .all()
    ).toEqual([
      'anthropic_messages',
      'local',
      'openai_completions',
      'openai_responses'
    ])
  })

  it('adds catalog ownership metadata after the v48 API type migration', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 48))
    database
      .prepare(
        `INSERT INTO model_providers (
          id, type, api_type, name, base_url, enabled, revision,
          created_at, updated_at
        ) VALUES ('legacy-provider', 'openai_compatible',
          'openai_completions', 'Legacy', 'https://api.example.com',
          1, 1, 1, 1)`
      )
      .run()
    database
      .prepare(
        `INSERT INTO model_profiles (
          id, provider_id, model_id, display_name, capabilities_json,
          context_window, input_cost_per_million_tokens,
          output_cost_per_million_tokens, enabled, revision, created_at,
          updated_at, timeout_ms, max_retries, max_concurrency
        ) VALUES ('legacy-profile', 'legacy-provider', 'legacy-model',
          'Legacy Model', '{"text":true,"vision":false,"toolCalling":true,
          "structuredOutput":true}', 8192, 0, 0, 0, 1, 1, 1, 120000, 2, 1)`
      )
      .run()

    applyMigrations(database)

    expect(
      database
        .prepare(
          `SELECT source, catalog_provider_id, catalog_model_id,
            catalog_version, default_enabled, enabled_override,
            lifecycle_status
           FROM model_profiles WHERE id = 'legacy-profile'`
        )
        .get()
    ).toEqual({
      source: 'custom',
      catalog_provider_id: null,
      catalog_model_id: null,
      catalog_version: null,
      default_enabled: 0,
      enabled_override: null,
      lifecycle_status: 'active'
    })
  })

  it('adds provider source and presentation metadata after the catalog migration', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 49))
    database
      .prepare(
        `INSERT INTO model_providers (
          id, type, api_type, name, base_url, enabled, revision,
          created_at, updated_at
        ) VALUES ('legacy-provider', 'openai_compatible',
          'openai_completions', 'Legacy', 'https://api.example.com',
          1, 1, 1, 1)`
      )
      .run()

    applyMigrations(database)

    expect(
      database
        .prepare(
          `SELECT source, catalog_provider_id, icon,
            base_url_overridden
           FROM model_providers WHERE id = 'legacy-provider'`
        )
        .get()
    ).toEqual({
      source: 'custom',
      catalog_provider_id: null,
      icon: null,
      base_url_overridden: 0
    })
  })

  it('backfills and enforces conversation knowledge scope when upgrading v60', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 60))
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision,
          created_at, updated_at
        ) VALUES ('workspace-1', '/spaces/one', 'One', '', 0, 1, 1, 1)`
      )
      .run()
    const insert = database.prepare(
      `INSERT INTO chat_sessions (
        id, workspace_id, kind, title, sort_order, revision,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 1, 1, 1)`
    )
    insert.run('general-1', null, 'general', 'General')
    insert.run('space-1', 'workspace-1', 'space', 'Space')

    applyMigrations(database)

    expect(
      database
        .prepare(
          `SELECT id, knowledge_scope
           FROM chat_sessions ORDER BY id`
        )
        .all()
    ).toEqual([
      { id: 'general-1', knowledge_scope: '{"kind":"none"}' },
      {
        id: 'space-1',
        knowledge_scope:
          '{"kind":"workspace","workspaceId":"workspace-1"}'
      }
    ])
    expect(() =>
      database
        .prepare(
          `UPDATE chat_sessions
           SET knowledge_scope = '{"kind":"all_workspaces"}'
           WHERE id = 'space-1'`
        )
        .run()
    ).toThrow('Invalid conversation knowledge scope binding')
  })

  it('adds nullable deletion tombstones to existing model configuration rows', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 52))

    database
      .prepare(
        `INSERT INTO model_providers (
          id, type, api_type, name, base_url, enabled, revision,
          created_at, updated_at, source, base_url_overridden
        ) VALUES ('legacy-provider', 'openai_compatible',
          'openai_completions', 'Legacy', 'https://api.example.com',
          1, 1, 1, 1, 'custom', 0)`
      )
      .run()
    database
      .prepare(
        `INSERT INTO model_profiles (
          id, provider_id, model_id, display_name, capabilities_json,
          context_window, input_cost_per_million_tokens,
          output_cost_per_million_tokens, enabled, revision, created_at,
          updated_at, timeout_ms, max_retries, max_concurrency, source,
          default_enabled, lifecycle_status, input_types_json, reasoning,
          max_output_tokens, deepseek_thinking
        ) VALUES ('legacy-profile', 'legacy-provider', 'legacy-model',
          'Legacy Model', '{"text":true,"vision":false,"toolCalling":true,
          "structuredOutput":true}', 8192, 0, 0, 1, 1, 1, 1, 120000, 2, 1,
          'custom', 1, 'active', '["text"]', 0, 4096, 0)`
      )
      .run()

    applyMigrations(database)

    expect(
      database
        .prepare(
          `SELECT p.deleted_at AS provider_deleted_at,
            m.deleted_at AS profile_deleted_at
           FROM model_providers p
           JOIN model_profiles m ON m.provider_id = p.id
           WHERE p.id = 'legacy-provider'`
        )
        .get()
    ).toEqual({
      provider_deleted_at: null,
      profile_deleted_at: null
    })
  })

  it('adds reasoning attribution columns when upgrading a v54 database', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 54))

    expect(
      database
        .prepare("PRAGMA table_info('model_call_metrics')")
        .all()
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'requested_reasoning' }),
        expect.objectContaining({ name: 'effective_reasoning' })
      ])
    )

    applyMigrations(database)

    expect(
      database
        .prepare("PRAGMA table_info('model_call_metrics')")
        .all()
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'requested_reasoning', notnull: 0 }),
        expect.objectContaining({ name: 'effective_reasoning', notnull: 0 })
      ])
    )
    expect(
      database
        .prepare('SELECT MAX(version) FROM schema_migrations')
        .pluck()
        .get()
    ).toBe(REALMFLOW_MIGRATIONS.at(-1)?.version)
  })

  it('adds durable workflow rollback operations when upgrading a v55 database', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 55))
    database.pragma('foreign_keys = OFF')
    database
      .prepare(
        `INSERT INTO artifacts (
          id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
          version, byte_size, is_primary, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'artifact-backfill',
        'requirement-backfill',
        'analysis',
        'node-backfill',
        'artifacts/analysis.md',
        'markdown',
        'sha256:backfill',
        1,
        10,
        1,
        1,
        10,
        10
      )
    database
      .prepare(
        `INSERT INTO artifacts (
          id, requirement_id, stage_id, node_id, relative_path, kind, checksum,
          version, byte_size, is_primary, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'artifact-without-lineage',
        'requirement-backfill',
        'design',
        'node-without-lineage',
        'artifacts/design.md',
        'markdown',
        'sha256:without-lineage',
        1,
        10,
        1,
        1,
        10,
        10
      )
    database
      .prepare(
        `INSERT INTO ai_runs (
          id, requirement_id, stage_id, node_id, status, last_sequence,
          content_checkpoint, artifact_id, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'ai-run-backfill',
        'requirement-backfill',
        'analysis',
        'node-backfill',
        'completed',
        0,
        '',
        'artifact-backfill',
        1,
        10,
        10
      )
    database
      .prepare(
        `INSERT INTO node_runs (
          id, execution_id, node_id, ai_run_id, status, attempt, revision,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'node-run-backfill',
        'execution-backfill',
        'node-backfill',
        'ai-run-backfill',
        'completed',
        1,
        1,
        10,
        10,
        10
      )

    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
        )
        .get('workflow_rollback_operations')
    ).toBeUndefined()

    applyMigrations(database)

    expect(
      database
        .prepare("PRAGMA table_info('workflow_rollback_operations')")
        .all()
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', pk: 1 }),
        expect.objectContaining({ name: 'request_id', notnull: 1 }),
        expect.objectContaining({ name: 'requirement_id', notnull: 1 }),
        expect.objectContaining({ name: 'execution_id', notnull: 1 }),
        expect.objectContaining({ name: 'target_node_id', notnull: 1 }),
        expect.objectContaining({ name: 'affected_node_ids_json', notnull: 1 }),
        expect.objectContaining({ name: 'created_node_run_ids_json', notnull: 1 }),
        expect.objectContaining({ name: 'pending_ai_run_ids_json', notnull: 1 }),
        expect.objectContaining({ name: 'status', notnull: 1 }),
        expect.objectContaining({ name: 'revision', notnull: 1 })
      ])
    )
    expect(
      database.prepare("PRAGMA table_info('artifacts')").all()
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'node_run_id', notnull: 0 }),
        expect.objectContaining({
          name: 'is_valid',
          notnull: 1,
          dflt_value: '1'
        })
      ])
    )
    expect(
      database
        .prepare(
          `SELECT node_run_id, is_valid
           FROM artifacts WHERE id = 'artifact-backfill'`
        )
        .get()
    ).toEqual({ node_run_id: 'node-run-backfill', is_valid: 1 })
    expect(
      database
        .prepare(
          `SELECT node_run_id, is_primary, is_valid
           FROM artifacts WHERE id = 'artifact-without-lineage'`
        )
        .get()
    ).toEqual({ node_run_id: null, is_primary: 0, is_valid: 0 })
    expect(
      database
        .prepare("PRAGMA foreign_key_list('artifacts')")
        .all()
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'node_runs',
          from: 'node_run_id',
          on_delete: 'RESTRICT'
        })
      ])
    )
    expect(
      (
        database
          .prepare(
            `SELECT sql FROM sqlite_master
             WHERE type = 'index' AND name = 'artifacts_primary_per_node'`
          )
          .pluck()
          .get() as string
      ).replace(/\s+/g, ' ')
    ).toContain('WHERE is_primary = 1 AND is_valid = 1')
    expect(
      database
        .prepare('SELECT MAX(version) FROM schema_migrations')
        .pluck()
        .get()
    ).toBe(REALMFLOW_MIGRATIONS.at(-1)?.version)
  })

  it('resets only rebuildable vector indexes when upgrading a v57 database', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(database, REALMFLOW_MIGRATIONS.slice(0, 57))
    database
      .prepare(
        `INSERT INTO workspaces (
          id, path, label, description, sort_order, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('space-1', '/spaces/one', 'One', 'authoritative', 0, 1, 1, 1)
    database
      .prepare(
        `INSERT INTO knowledge_sources (
          id, workspace_id, name, type, locator, detail, sort_order, status,
          revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'source-1',
        'space-1',
        'Notes',
        'file',
        'managed:notes.txt',
        'authoritative body metadata',
        0,
        'indexed',
        3,
        1,
        2
      )
    database
      .prepare(
        `INSERT INTO knowledge_index_versions (
          id, source_id, version, source_revision, source_version,
          source_checksum, embedding_model, dimensions, chunker_version,
          document_count, chunk_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'legacy-version',
        'source-1',
        1,
        3,
        'file:v1',
        `sha256:${'a'.repeat(64)}`,
        'realmflow-hash-v1',
        64,
        'realmflow-text-v1',
        1,
        1,
        2
      )
    database
      .prepare(
        `INSERT INTO knowledge_index_documents (
          id, index_version_id, document_key, content_checksum, byte_size
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        'legacy-document',
        'legacy-version',
        'content',
        `sha256:${'b'.repeat(64)}`,
        5
      )
    database
      .prepare(
        `INSERT INTO knowledge_index_chunks (
          id, document_id, ordinal, content, start_offset, end_offset,
          start_line, end_line, checksum, embedding_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'legacy-chunk',
        'legacy-document',
        0,
        'alpha',
        0,
        5,
        1,
        1,
        `sha256:${'b'.repeat(64)}`,
        JSON.stringify(Array(64).fill(0)),
        2
      )
    const sourceBefore = database
      .prepare('SELECT * FROM knowledge_sources WHERE id = ?')
      .get('source-1')

    applyMigrations(database)

    expect(
      database
        .prepare('SELECT * FROM knowledge_sources WHERE id = ?')
        .get('source-1')
    ).toEqual(sourceBefore)
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'knowledge_indexes', 'knowledge_index_versions',
             'knowledge_index_chunks', 'knowledge_index_commands',
             'knowledge_chunks', 'knowledge_documents',
             'knowledge_sync_jobs'
           )`
        )
        .all()
    ).toEqual([])
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'vector_index_profiles', 'knowledge_index_generations',
             'knowledge_index_documents', 'knowledge_index_jobs'
           )
           ORDER BY name`
        )
        .all()
    ).toEqual([
      { name: 'knowledge_index_documents' },
      { name: 'knowledge_index_generations' },
      { name: 'knowledge_index_jobs' },
      { name: 'vector_index_profiles' }
    ])
    expect(
      database
        .prepare(
          `SELECT enabled, preset, cron_expression, time_zone, revision
           FROM knowledge_refresh_policies WHERE source_id = 'source-1'`
        )
        .get()
    ).toEqual({
      enabled: 1,
      preset: '5m',
      cron_expression: '*/5 * * * *',
      time_zone: 'UTC',
      revision: 1
    })
    expect(
      database
        .prepare(
          `SELECT policy_revision, next_due_at
           FROM knowledge_refresh_cursors WHERE source_id = 'source-1'`
        )
        .get()
    ).toEqual({ policy_revision: 1, next_due_at: 0 })
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

  it('migrates repository identity uniqueness without losing removed history', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    database.pragma('foreign_keys = ON')
    applyMigrations(
      database,
      REALMFLOW_MIGRATIONS.filter(({ version }) => version <= 76)
    )
    database.exec(`
      INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES ('space-1', '/spaces/one', 'One', '', 0, 1, 1, 1);
      INSERT INTO connectors (
        id, name, type, base_url, authentication_type, authentication_header,
        enabled, timeout_ms, max_retries, revision, created_at, updated_at
      ) VALUES (
        'connector-git', 'Git', 'http', 'https://git.example.com', 'none',
        NULL, 1, 1000, 0, 1, 1, 1
      );
      INSERT INTO knowledge_sources (
        id, workspace_id, name, type, locator, detail, sort_order, status,
        sync_started_at, indexed_at, error_code, error_message, revision,
        created_at, updated_at
      ) VALUES (
        'repo-removed', 'space-1', 'Removed', 'repository',
        'connector:connector-git/repositories/realmflow', 'Remote repository',
        0, 'removed', 2, 3, NULL, NULL, 4, 1, 4
      );
      INSERT INTO repository_sources (
        source_id, workspace_id, mode, local_path, connector_id, path,
        managed_relative_path, locator, selected_branch, current_version,
        revision_label, file_count, total_bytes, last_scanned_at, created_at,
        updated_at
      ) VALUES (
        'repo-removed', 'space-1', 'remote', NULL, 'connector-git',
        '/repositories/realmflow',
        '.realmflow/knowledge/repositories/repo-removed',
        'connector:connector-git/repositories/realmflow', 'main', 1,
        'main@1', 1, 4, 3, 1, 3
      );
    `)

    applyMigrations(database)

    expect(database.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(database.pragma('foreign_key_check')).toEqual([])
    expect(() =>
      database.exec(`
        INSERT INTO knowledge_sources (
          id, workspace_id, name, type, locator, detail, sort_order, status,
          sync_started_at, indexed_at, error_code, error_message, revision,
          created_at, updated_at
        ) VALUES (
          'repo-active', 'space-1', 'Active', 'repository',
          'connector:connector-git/repositories/realmflow', 'Remote repository',
          0, 'syncing', 5, NULL, NULL, NULL, 2, 5, 5
        );
        INSERT INTO repository_sources (
          source_id, workspace_id, mode, local_path, connector_id, path,
          managed_relative_path, locator, selected_branch, current_version,
          revision_label, file_count, total_bytes, last_scanned_at, created_at,
          updated_at
        ) VALUES (
          'repo-active', 'space-1', 'remote', NULL, 'connector-git',
          '/repositories/realmflow',
          '.realmflow/knowledge/repositories/repo-active',
          'connector:connector-git/repositories/realmflow', 'main', 0,
          NULL, 0, 0, NULL, 5, 5
        );
      `)
    ).not.toThrow()
    expect(
      database
        .prepare(
          `SELECT id, status FROM knowledge_sources
           WHERE locator = ? ORDER BY id`
        )
        .all('connector:connector-git/repositories/realmflow')
    ).toEqual([
      { id: 'repo-active', status: 'syncing' },
      { id: 'repo-removed', status: 'removed' }
    ])
    expect(() =>
      database
        .prepare(
          `INSERT INTO knowledge_sources (
            id, workspace_id, name, type, locator, detail, sort_order, status,
            revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'repo-duplicate',
          'space-1',
          'Duplicate',
          'repository',
          'connector:connector-git/repositories/realmflow',
          'Remote repository',
          0,
          'registered',
          1,
          6,
          6
        )
    ).toThrow(/UNIQUE/)
  })

  it('removes the mandatory ungrouped site role when upgrading schema 96', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(
      database,
      REALMFLOW_MIGRATIONS.filter(({ version }) => version <= 96)
    )
    database
      .prepare(
        `UPDATE workbench_site_groups
         SET name = '新建分组', revision = 1
         WHERE system_key = 'ungrouped'`
      )
      .run()

    applyMigrations(database)

    expect(
      database
        .prepare(
          `SELECT name, system_key
           FROM workbench_site_groups
           WHERE deleted_at IS NULL`
        )
        .all()
    ).toEqual([{ name: '新建分组', system_key: null }])
    expect(
      database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get()
    ).toEqual({ version: 99 })
  })

  it('repairs conversation messages incorrectly failed at a suspended Run boundary', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(
      database,
      REALMFLOW_MIGRATIONS.filter(({ version }) => version <= 97)
    )
    database
      .prepare(
        `INSERT INTO chat_sessions (
           id, kind, title, sort_order, revision, created_at, updated_at
         ) VALUES (?, 'general', ?, 0, 1, 100, 200)`
      )
      .run('session-suspended-repair', 'Suspended repair')
    database
      .prepare(
        `INSERT INTO chat_messages (
           id, session_id, role, status, content, run_id, error, sort_order,
           created_at, completed_at
         ) VALUES (?, ?, 'assistant', 'failed', '', ?, ?, 0, 100, 200)`
      )
      .run(
        'assistant-suspended-repair',
        'session-suspended-repair',
        'run-suspended-repair',
        'Conversation run ended without a terminal event'
      )
    database
      .prepare(
        `INSERT INTO assistant_turn_projections (
           run_id, assistant_message_id, last_sequence, projection_json,
           updated_at
         ) VALUES (?, ?, 2, ?, 200)`
      )
      .run(
        'run-suspended-repair',
        'assistant-suspended-repair',
        JSON.stringify({
          runId: 'run-suspended-repair',
          assistantMessageId: 'assistant-suspended-repair',
          status: 'waiting_input',
          startedAt: 100,
          answer: '',
          executionSummaries: [],
          references: [],
          toolCalls: [
            {
              callId: 'call-pending',
              toolName: 'process.run',
              category: 'command',
              status: 'requested',
              argumentsSummary: 'pwd',
              requestedAt: 190
            }
          ],
          delegations: [],
          compactions: [],
          recovery: { reason: 'consecutive_tool_failures' },
          lastSequence: 2
        })
      )

    applyMigrations(database)

    expect(
      database
        .prepare(
          `SELECT status, error FROM chat_messages
           WHERE id = 'assistant-suspended-repair'`
        )
        .get()
    ).toEqual({ status: 'completed', error: null })
    const projection = JSON.parse(
      database
        .prepare(
          `SELECT projection_json FROM assistant_turn_projections
           WHERE run_id = 'run-suspended-repair'`
        )
        .pluck()
        .get() as string
    )
    expect(projection).toMatchObject({
      status: 'waiting_input',
      elapsedAt: 200,
      toolCalls: [
        expect.objectContaining({
          callId: 'call-pending',
          status: 'failed',
          completedAt: 200,
          errorCode: 'run_suspended'
        })
      ]
    })
    expect(
      database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get()
    ).toEqual({ version: 99 })
  })

  it('backfills an empty no-progress suspension with a truthful degraded conclusion', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    applyMigrations(
      database,
      REALMFLOW_MIGRATIONS.filter(({ version }) => version <= 98)
    )
    database
      .prepare(
        `INSERT INTO chat_sessions (
           id, kind, title, sort_order, revision, created_at, updated_at
         ) VALUES (?, 'general', ?, 0, 1, 100, 200)`
      )
      .run('session-degraded-conclusion', 'Degraded conclusion')
    const insertMessage = database.prepare(
      `INSERT INTO chat_messages (
         id, session_id, role, status, content, run_id, sort_order,
         created_at, completed_at
       ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?)`
    )
    insertMessage.run(
      'user-degraded-conclusion',
      'session-degraded-conclusion',
      'user',
      '请生成 PDF 简历',
      null,
      0,
      100,
      100
    )
    insertMessage.run(
      'assistant-degraded-conclusion',
      'session-degraded-conclusion',
      'assistant',
      '',
      'run-degraded-conclusion',
      1,
      100,
      200
    )
    database
      .prepare(
        `INSERT INTO assistant_turn_projections (
           run_id, assistant_message_id, last_sequence, projection_json,
           updated_at
         ) VALUES (?, ?, 3, ?, 200)`
      )
      .run(
        'run-degraded-conclusion',
        'assistant-degraded-conclusion',
        JSON.stringify({
          runId: 'run-degraded-conclusion',
          assistantMessageId: 'assistant-degraded-conclusion',
          status: 'waiting_input',
          startedAt: 100,
          elapsedAt: 200,
          answer: '',
          executionSummaries: [],
          references: [],
          toolCalls: [
            {
              callId: 'call-create',
              toolName: 'rf_builtin_document_create_12345678',
              category: 'other',
              status: 'completed',
              argumentsSummary: JSON.stringify({
                outputPath: 'resume.docx'
              }),
              requestedAt: 120,
              completedAt: 140
            },
            {
              callId: 'call-export',
              toolName: 'rf_builtin_document_export_pdf_12345678',
              category: 'other',
              status: 'failed',
              argumentsSummary: '{}',
              errorCode: 'document_export_unavailable',
              error: 'Tool execution failed',
              requestedAt: 150,
              completedAt: 190
            }
          ],
          delegations: [],
          compactions: [],
          recovery: { reason: 'consecutive_tool_failures' },
          lastSequence: 3
        })
      )

    applyMigrations(database)

    const content = database
      .prepare(
        `SELECT content FROM chat_messages
         WHERE id = 'assistant-degraded-conclusion'`
      )
      .pluck()
      .get() as string
    expect(content).toContain('PDF')
    expect(content).toContain('resume.docx')
    expect(content).toContain('LibreOffice')
    expect(
      database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get()
    ).toEqual({ version: 99 })
  })

  it('purges legacy deleted task records and their attachment metadata', () => {
    const database = new Database(':memory:')
    openDatabases.push(database)
    database.pragma('foreign_keys = ON')
    applyMigrations(
      database,
      REALMFLOW_MIGRATIONS.filter(({ version }) => version <= 77)
    )
    database.exec(`
      INSERT INTO workbench_task_tables (
        id, name, position, view_state_json, revision, created_at, updated_at
      ) VALUES ('table-1', 'Tasks', 0, '{"filters":[],"filterJoin":"and","sorts":[]"}', 0, 1, 1);
      INSERT INTO workbench_task_records (
        id, table_id, values_json, position, completed_at, revision,
        created_at, updated_at, deleted_at
      ) VALUES
        ('record-active', 'table-1', '{}', 0, NULL, 0, 1, 1, NULL),
        ('record-deleted', 'table-1', '{}', 10, NULL, 1, 1, 2, 2);
      INSERT INTO workbench_attachments (
        id, owner_type, owner_id, file_name, mime_type, size_bytes,
        checksum_sha256, relative_path, created_at
      ) VALUES (
        'attachment-deleted', 'task_record', 'record-deleted', 'old.txt',
        'text/plain', 1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'attachment-deleted/old.txt', 1
      );
    `)

    applyMigrations(database)

    expect(
      database
        .prepare('SELECT id FROM workbench_task_records ORDER BY id')
        .all()
    ).toEqual([{ id: 'record-active' }])
    expect(
      (
        database
          .prepare("PRAGMA table_info('workbench_task_records')")
          .all() as Array<{ name: string }>
      ).map(({ name }) => name)
    ).not.toContain('completed_at')
    expect(
      database
        .prepare('SELECT id FROM workbench_attachments ORDER BY id')
        .all()
    ).toEqual([])
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
