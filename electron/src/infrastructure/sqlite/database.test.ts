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

function insertWorkspaceAndModelProfile(
  database: Database.Database,
  input: {
    workspaceId?: string
    providerId?: string
    modelProfileId?: string
  } = {}
): void {
  const workspaceId = input.workspaceId ?? 'workspace-1'
  const providerId = input.providerId ?? 'provider-1'
  const modelProfileId = input.modelProfileId ?? 'model-profile-1'
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at,
        updated_at
      ) VALUES (?, ?, ?, '', 0, 0, 1, 1)`
    )
    .run(workspaceId, `/spaces/${workspaceId}`, workspaceId)
  database
    .prepare(
      `INSERT INTO model_providers (
        id, type, api_type, name, base_url, enabled, revision,
        created_at, updated_at
      ) VALUES (?, 'openai_compatible', 'openai_completions', ?, ?,
        1, 0, 1, 1)`
    )
    .run(providerId, providerId, 'https://api.example.com')
  database
    .prepare(
      `INSERT INTO model_profiles (
        id, provider_id, model_id, display_name, capabilities_json,
        context_window, input_cost_per_million_tokens,
        output_cost_per_million_tokens, enabled, revision, created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 8192, 0, 0, 1, 0, 1, 1)`
    )
    .run(
      modelProfileId,
      providerId,
      'model-1',
      'Model 1',
      '{"text":true,"vision":false,"toolCalling":true,"structuredOutput":true}'
    )
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
    expect(migrations.map(({ version }) => version)).toEqual([116])

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
        'conversation_context_projections',
        'conversation_memory_entries',
        'conversation_turns',
        'conversation_turn_context_routes',
        'chat_messages_fts',
        'connector_commands',
        'connector_credentials',
        'connector_events',
        'connector_validation_results',
        'connectors',
        'context_snapshots',
        'dataset_revisions',
        'document_delivery_operations',
        'document_delivery_receipts',
        'dsh_run_manifest_publications',
        'dsh_session_bindings',
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
        'online_document_snapshot_documents',
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
    expect(tables.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(['agent_run_checkpoints'])
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
        expect.objectContaining({ name: 'turn_id', notnull: 1 }),
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
    const chatMessageTableSql = database
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'chat_messages'`
      )
      .pluck()
      .get() as string
    expect(chatMessageTableSql).toContain(
      "CHECK (role IN ('user', 'assistant'))"
    )

    const turnColumns = database
      .prepare("PRAGMA table_info('conversation_turns')")
      .all() as Array<{ name: string; notnull: number }>
    expect(turnColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'session_id', notnull: 1 }),
        expect.objectContaining({ name: 'turn_index', notnull: 1 }),
        expect.objectContaining({ name: 'user_message_id', notnull: 1 }),
        expect.objectContaining({
          name: 'assistant_message_id',
          notnull: 1
        }),
        expect.objectContaining({ name: 'status', notnull: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'completed_at', notnull: 0 })
      ])
    )
    const turnIndexes = database
      .prepare("PRAGMA index_list('conversation_turns')")
      .all() as Array<{ name: string; unique: number }>
    expect(turnIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'conversation_turns_session_index',
          unique: 1
        }),
        expect.objectContaining({
          name: 'conversation_turns_user_message',
          unique: 1
        }),
        expect.objectContaining({
          name: 'conversation_turns_assistant_message',
          unique: 1
        })
      ])
    )

    const projectionTableSql = database
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'assistant_turn_projections'`
      )
      .pluck()
      .get() as string
    expect(projectionTableSql).toContain(
      "json_extract(projection_json, '$.schemaVersion') = 2"
    )
    expect(database.pragma('foreign_key_check')).toEqual([])
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
    const modelMetricSchema = database
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'model_call_metrics'`
      )
      .get() as { sql: string }
    expect(modelMetricSchema.sql).toContain("'workflow_node'")
    expect(modelMetricSchema.sql).not.toContain("'workflow_stage'")
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
      }
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

  it('uses a single current schema baseline instead of a historical upgrade chain', () => {
    expect(REALMFLOW_MIGRATIONS).toHaveLength(1)
    expect(REALMFLOW_MIGRATIONS[0]).toMatchObject({
      version: 116,
      name: 'current_schema_baseline'
    })
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
    expect(
      columns('repository_snapshot_skipped_files')
        .filter(({ pk }) => pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map(({ name }) => name)
    ).toEqual(['snapshot_id', 'relative_path'])
    expect(
      columns('repository_snapshot_skipped_files').map(({ name }) => name)
    ).toEqual([
      'snapshot_id',
      'source_id',
      'version',
      'relative_path',
      'reason',
      'byte_size'
    ])
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

  it('creates persistent cron trigger slots with database integrity', async () => {
    const database = await createDatabase()
    insertWorkspaceAndModelProfile(database)

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
          id, name, description, cron_expression, time_zone,
          missed_run_policy, status,
          workspace_id, model_profile_id, target_kind,
          target_definition_id, target_definition_version,
          target_definition_digest, skill_input_json,
          connector_bindings_json, permissions_json, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'schedule-1',
        'Daily summary',
        '',
        '0 9 * * *',
        'Asia/Shanghai',
        'skip',
        'active',
        'workspace-1',
        'model-profile-1',
        'skill',
        'skill-1',
        '1.0.0',
        'a'.repeat(64),
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

  it('creates missed-run policies and immutable recovery decisions', async () => {
    const database = await createDatabase()
    insertWorkspaceAndModelProfile(database)

    const policyColumn = (
      database
        .prepare("PRAGMA table_info('schedules')")
        .all() as Array<{
          name: string
          notnull: number
          dflt_value: string | null
        }>
    ).find(({ name }) => name === 'missed_run_policy')
    expect(policyColumn).toMatchObject({ notnull: 1, dflt_value: null })

    database
      .prepare(
        `INSERT INTO schedules (
          id, name, description, cron_expression, time_zone,
          missed_run_policy, status,
          workspace_id, model_profile_id, target_kind,
          target_definition_id, target_definition_version,
          target_definition_digest, skill_input_json,
          connector_bindings_json, permissions_json, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'schedule-1',
        'Daily summary',
        '',
        '0 9 * * *',
        'Asia/Shanghai',
        'skip',
        'active',
        'workspace-1',
        'model-profile-1',
        'skill',
        'skill-1',
        '1.0.0',
        'a'.repeat(64),
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

  it('omits removed Skill, permission, and execution authority tables from the current schema', async () => {
    const database = await createDatabase()
    const removedTables = database
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

    expect(removedTables).toEqual([])
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

  it('stores explicit model API protocols in the current schema', async () => {
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
