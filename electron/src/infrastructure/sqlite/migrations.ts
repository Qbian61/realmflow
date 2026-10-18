import type Database from 'better-sqlite3'

export type SqlMigration = {
  version: number
  name: string
  up: (database: Database.Database) => void
  requiresForeignKeysDisabled?: boolean
}

const CURRENT_SCHEMA = `
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    root_path TEXT UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  , work_root_id TEXT REFERENCES work_roots(id), directory_name TEXT, deleted_at INTEGER, relocated_at INTEGER, relocation_source TEXT
    CHECK (relocation_source IS NULL OR relocation_source IN ('user')));

CREATE TABLE requirements (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    stage TEXT CHECK (
      stage IS NULL OR stage IN (
        'analysis', 'design', 'implementation', 'testing', 'release', 'retrospective'
      )
    ),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'completed')),
    body_relative_path TEXT,
    workspace_root_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, workflow_template_version_id TEXT, directory_name TEXT, sync_completed_artifacts_to_knowledge INTEGER NOT NULL DEFAULT 0
    CHECK (sync_completed_artifacts_to_knowledge IN (0, 1)), deleted_at INTEGER,
    UNIQUE (workspace_id, id)
  );

CREATE INDEX requirements_workspace_order
    ON requirements(workspace_id, sort_order, id);

CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    stage_id TEXT NOT NULL CHECK (
      stage_id IN (
        'analysis', 'design', 'implementation', 'testing', 'release', 'retrospective'
      )
    ),
    relative_path TEXT NOT NULL,
    kind TEXT NOT NULL,
    checksum TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, node_id TEXT, node_run_id TEXT
    REFERENCES node_runs(id) ON DELETE RESTRICT, is_valid INTEGER NOT NULL DEFAULT 1
    CHECK (is_valid IN (0, 1)), media_type TEXT, verification_receipt_id TEXT
    REFERENCES document_delivery_receipts(id) ON DELETE SET NULL,
    UNIQUE (requirement_id, stage_id, relative_path, version)
  );

CREATE TABLE ai_runs (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    stage_id TEXT NOT NULL CHECK (
      stage_id IN (
        'analysis', 'design', 'implementation', 'testing', 'release', 'retrospective'
      )
    ),
    status TEXT NOT NULL CHECK (
      status IN (
        'created', 'running', 'cancelling', 'completed', 'failed', 'cancelled',
        'interrupted'
      )
    ),
    last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
    content_checkpoint TEXT NOT NULL DEFAULT '',
    pending_artifact_path TEXT,
    pending_artifact_content TEXT,
    artifact_id TEXT REFERENCES artifacts(id) ON DELETE SET NULL,
    error TEXT,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  , node_id TEXT, workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL, model_profile_id TEXT REFERENCES model_profiles(id) ON DELETE RESTRICT, context_snapshot_id TEXT REFERENCES context_snapshots(id) ON DELETE SET NULL, model_started_at INTEGER CHECK (
      model_started_at IS NULL OR model_started_at >= 0
    ));

CREATE INDEX ai_runs_requirement_updated
    ON ai_runs(requirement_id, updated_at DESC, id);

CREATE INDEX ai_runs_status ON ai_runs(status);

CREATE TABLE ai_run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence >= 0),
    type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data_json TEXT NOT NULL,
    UNIQUE (run_id, sequence)
  );

CREATE INDEX ai_run_events_run_sequence
    ON ai_run_events(run_id, sequence);

CREATE TABLE dataset_revisions (
    dataset TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at INTEGER NOT NULL
  );

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at INTEGER NOT NULL
  );

CREATE TABLE work_roots (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );

CREATE UNIQUE INDEX work_roots_single_current
    ON work_roots(is_current)
    WHERE is_current = 1;

CREATE TABLE workflow_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'published', 'archived')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

CREATE TABLE workflow_template_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
    checksum TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    published_at INTEGER,
    UNIQUE (template_id, version)
  );

CREATE TABLE workflow_nodes (
    id TEXT PRIMARY KEY,
    template_version_id TEXT NOT NULL
      REFERENCES workflow_template_versions(id) ON DELETE CASCADE,
    stable_key TEXT NOT NULL,
    type TEXT NOT NULL
      CHECK (type IN ('ai_generate', 'human_input', 'tool', 'approval')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL DEFAULT '{}',
    allow_skip INTEGER NOT NULL DEFAULT 0 CHECK (allow_skip IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0, position_x REAL NOT NULL DEFAULT 0, position_y REAL NOT NULL DEFAULT 0,
    UNIQUE (template_version_id, stable_key)
  );

CREATE INDEX workflow_nodes_version_order
    ON workflow_nodes(template_version_id, sort_order, id);

CREATE TABLE workflow_edges (
    id TEXT PRIMARY KEY,
    template_version_id TEXT NOT NULL
      REFERENCES workflow_template_versions(id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
    UNIQUE (template_version_id, source_node_id, target_node_id),
    CHECK (source_node_id <> target_node_id)
  );

CREATE TABLE requirement_workflows (
    requirement_id TEXT PRIMARY KEY
      REFERENCES requirements(id) ON DELETE CASCADE,
    template_version_id TEXT NOT NULL
      REFERENCES workflow_template_versions(id),
    status TEXT NOT NULL DEFAULT 'created'
      CHECK (
        status IN (
          'created', 'running', 'waiting_user', 'paused', 'completed', 'failed',
          'cancelled', 'interrupted'
        )
      ),
    current_node_id TEXT,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  , max_parallelism INTEGER NOT NULL DEFAULT 1
      CHECK (max_parallelism BETWEEN 1 AND 8));

CREATE TABLE requirement_nodes (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL
      REFERENCES requirement_workflows(requirement_id) ON DELETE CASCADE,
    template_node_id TEXT REFERENCES workflow_nodes(id) ON DELETE SET NULL,
    type TEXT NOT NULL
      CHECK (type IN ('ai_generate', 'human_input', 'tool', 'approval')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL DEFAULT '{}',
    allow_skip INTEGER NOT NULL DEFAULT 0 CHECK (allow_skip IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (
        status IN (
          'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
          'completed', 'failed', 'skipped', 'cancelled', 'interrupted'
        )
      ),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (requirement_id, id)
  );

CREATE INDEX requirement_nodes_workflow_order
    ON requirement_nodes(requirement_id, sort_order, id);

CREATE TABLE requirement_edges (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL
      REFERENCES requirement_workflows(requirement_id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL REFERENCES requirement_nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES requirement_nodes(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    UNIQUE (requirement_id, source_node_id, target_node_id),
    CHECK (source_node_id <> target_node_id)
  );

CREATE TABLE workflow_executions (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL
      REFERENCES requirement_workflows(requirement_id) ON DELETE CASCADE,
    status TEXT NOT NULL
      CHECK (
        status IN (
          'created', 'running', 'waiting_user', 'paused', 'completed', 'failed',
          'cancelled', 'interrupted'
        )
      ),
    current_node_id TEXT REFERENCES requirement_nodes(id) ON DELETE SET NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  );

CREATE INDEX workflow_executions_requirement_updated
    ON workflow_executions(requirement_id, updated_at DESC, id);

CREATE TABLE node_runs (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL
      REFERENCES workflow_executions(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES requirement_nodes(id) ON DELETE CASCADE,
    ai_run_id TEXT REFERENCES ai_runs(id) ON DELETE SET NULL,
    status TEXT NOT NULL
      CHECK (
        status IN (
          'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
          'completed', 'failed', 'skipped', 'cancelled', 'interrupted'
        )
      ),
    attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
    checkpoint_json TEXT,
    error TEXT,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    UNIQUE (execution_id, node_id, attempt)
  );

CREATE INDEX node_runs_status ON node_runs(status);

CREATE TABLE node_todos (
    id TEXT PRIMARY KEY,
    node_run_id TEXT NOT NULL REFERENCES node_runs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (
        status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')
      ),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  , completed_at INTEGER);

CREATE TABLE node_questions (
    id TEXT PRIMARY KEY,
    node_run_id TEXT NOT NULL REFERENCES node_runs(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'answered', 'dismissed')),
    answer TEXT,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    answered_at INTEGER
  );

CREATE TABLE model_providers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('openai_compatible', 'local')),
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  , api_type TEXT NOT NULL DEFAULT 'openai_completions'
    CHECK (
      api_type IN (
        'openai_completions',
        'openai_responses',
        'anthropic_messages',
        'local'
      )
    ), source TEXT NOT NULL DEFAULT 'custom'
    CHECK (source IN ('builtin', 'custom', 'discovered')), catalog_provider_id TEXT, icon TEXT, base_url_overridden INTEGER NOT NULL DEFAULT 0
    CHECK (base_url_overridden IN (0, 1)), deleted_at INTEGER CHECK (
      deleted_at IS NULL OR deleted_at >= 0
    ));

CREATE TABLE model_profiles (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    capabilities_json TEXT NOT NULL,
    context_window INTEGER NOT NULL CHECK (context_window > 0),
    input_cost_per_million_tokens REAL NOT NULL DEFAULT 0 CHECK (
      input_cost_per_million_tokens >= 0
    ),
    output_cost_per_million_tokens REAL NOT NULL DEFAULT 0 CHECK (
      output_cost_per_million_tokens >= 0
    ),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, timeout_ms INTEGER NOT NULL
    DEFAULT 120000 CHECK (timeout_ms BETWEEN 1 AND 600000), max_retries INTEGER NOT NULL
    DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 10), max_concurrency INTEGER NOT NULL
    DEFAULT 1 CHECK (max_concurrency BETWEEN 1 AND 32), source TEXT NOT NULL DEFAULT 'custom'
    CHECK (source IN ('catalog', 'custom')), catalog_provider_id TEXT, catalog_model_id TEXT, catalog_version INTEGER CHECK (
    catalog_version IS NULL OR catalog_version > 0
  ), default_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (default_enabled IN (0, 1)), enabled_override INTEGER
    CHECK (enabled_override IS NULL OR enabled_override IN (0, 1)), lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'retired')), input_types_json TEXT NOT NULL DEFAULT '["text"]'
    CHECK (
      json_valid(input_types_json) AND json_type(input_types_json) = 'array'
    ), reasoning INTEGER NOT NULL DEFAULT 0
    CHECK (reasoning IN (0, 1)), max_output_tokens INTEGER NOT NULL DEFAULT 4096
    CHECK (max_output_tokens > 0), icon TEXT, api_type TEXT CHECK (
    api_type IS NULL OR api_type IN (
      'openai_completions',
      'openai_responses',
      'anthropic_messages',
      'local'
    )
  ), deepseek_thinking INTEGER NOT NULL DEFAULT 0
    CHECK (deepseek_thinking IN (0, 1)), deleted_at INTEGER CHECK (
      deleted_at IS NULL OR deleted_at >= 0
    ),
    UNIQUE (provider_id, model_id)
  );

CREATE TABLE model_credentials (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL UNIQUE
      REFERENCES model_providers(id) ON DELETE CASCADE,
    encrypted_value BLOB NOT NULL,
    nonce BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

CREATE TABLE model_usage_rollups (
    bucket_start INTEGER NOT NULL,
    bucket_kind TEXT NOT NULL CHECK (bucket_kind IN ('hour', 'day', 'month')),
    provider_id TEXT NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
    model_profile_id TEXT NOT NULL REFERENCES model_profiles(id) ON DELETE CASCADE,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cached_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
    reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
    duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
    PRIMARY KEY (bucket_start, bucket_kind, provider_id, model_profile_id)
  );

CREATE TABLE "chat_sessions" (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'space'
      CHECK (kind IN ('general', 'space', 'requirement_node')),
    node_run_id TEXT,
    folder_path TEXT,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  , model_profile_id TEXT
      REFERENCES model_profiles(id) ON DELETE RESTRICT, knowledge_scope TEXT NOT NULL DEFAULT '{"kind":"none"}'
      CHECK (
        json_valid(knowledge_scope)
        AND json_type(knowledge_scope) = 'object'
        AND (
          knowledge_scope IN (
            '{"kind":"none"}',
            '{"kind":"all_workspaces"}',
            '{"kind":"node_configuration"}'
          )
          OR (
            json_extract(knowledge_scope, '$.kind') = 'workspace'
            AND json_type(knowledge_scope, '$.workspaceId') = 'text'
            AND trim(json_extract(knowledge_scope, '$.workspaceId')) <> ''
            AND json_remove(knowledge_scope, '$.workspaceId')
              = '{"kind":"workspace"}'
          )
        )
      ), approval_profile_id TEXT NOT NULL
        DEFAULT 'protected' CHECK (approval_profile_id IN ('cautious', 'protected', 'trusted')));

CREATE INDEX chat_sessions_workspace_updated
    ON chat_sessions(workspace_id, updated_at DESC, id);

CREATE INDEX chat_sessions_recent_updated
    ON chat_sessions(kind, updated_at DESC, id);

CREATE TABLE workflow_dispatches (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL
      REFERENCES workflow_executions(id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL
      REFERENCES requirement_workflows(requirement_id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES requirement_nodes(id) ON DELETE CASCADE,
    node_run_id TEXT NOT NULL REFERENCES node_runs(id) ON DELETE CASCADE,
    trigger_node_run_id TEXT NOT NULL REFERENCES node_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL
      CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error TEXT,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  );

CREATE INDEX workflow_dispatches_dispatchable
    ON workflow_dispatches(status, updated_at, id);

CREATE TABLE entity_deletions (
    entity_type TEXT NOT NULL CHECK (entity_type IN ('workspace', 'requirement')),
    entity_id TEXT NOT NULL,
    original_path TEXT NOT NULL,
    trash_path TEXT NOT NULL UNIQUE,
    deleted_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'trashed'
    CHECK (state IN ('trashed', 'purging')), trigger_source TEXT NOT NULL DEFAULT 'user'
    CHECK (trigger_source IN ('user')),
    PRIMARY KEY (entity_type, entity_id)
  );

CREATE INDEX entity_deletions_deleted_at
    ON entity_deletions(deleted_at DESC, entity_type, entity_id);

CREATE TABLE workflow_execution_transitions (
    execution_id TEXT NOT NULL
      REFERENCES workflow_executions(id) ON DELETE CASCADE,
    execution_revision INTEGER NOT NULL CHECK (execution_revision > 0),
    from_status TEXT NOT NULL
      CHECK (
        from_status IN (
          'created', 'running', 'waiting_user', 'paused', 'completed', 'failed',
          'cancelled', 'interrupted'
        )
      ),
    to_status TEXT NOT NULL
      CHECK (
        to_status IN (
          'created', 'running', 'waiting_user', 'paused', 'completed', 'failed',
          'cancelled', 'interrupted'
        )
      ),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    trigger_source TEXT NOT NULL
      CHECK (trigger_source IN ('user', 'system', 'recovery')),
    transitioned_at INTEGER NOT NULL,
    PRIMARY KEY (execution_id, execution_revision),
    CHECK (from_status <> to_status)
  );

CREATE INDEX workflow_execution_transitions_time
    ON workflow_execution_transitions(execution_id, transitioned_at, execution_revision);

CREATE TABLE node_run_transitions (
    node_run_id TEXT NOT NULL REFERENCES node_runs(id) ON DELETE CASCADE,
    node_run_revision INTEGER NOT NULL CHECK (node_run_revision > 0),
    from_status TEXT NOT NULL
      CHECK (
        from_status IN (
          'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
          'completed', 'failed', 'skipped', 'cancelled', 'interrupted'
        )
      ),
    to_status TEXT NOT NULL
      CHECK (
        to_status IN (
          'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
          'completed', 'failed', 'skipped', 'cancelled', 'interrupted'
        )
      ),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    trigger_source TEXT NOT NULL
      CHECK (trigger_source IN ('user', 'system', 'recovery')),
    transitioned_at INTEGER NOT NULL,
    PRIMARY KEY (node_run_id, node_run_revision),
    CHECK (from_status <> to_status)
  );

CREATE INDEX node_run_transitions_time
    ON node_run_transitions(node_run_id, transitioned_at, node_run_revision);

CREATE TABLE node_todo_transitions (
    node_todo_id TEXT NOT NULL REFERENCES node_todos(id) ON DELETE CASCADE,
    node_todo_revision INTEGER NOT NULL CHECK (node_todo_revision > 0),
    from_status TEXT NOT NULL
      CHECK (
        from_status IN (
          'pending', 'in_progress', 'completed', 'blocked', 'cancelled'
        )
      ),
    to_status TEXT NOT NULL
      CHECK (
        to_status IN (
          'pending', 'in_progress', 'completed', 'blocked', 'cancelled'
        )
      ),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    trigger_source TEXT NOT NULL
      CHECK (trigger_source IN ('user', 'system', 'recovery')),
    transitioned_at INTEGER NOT NULL,
    PRIMARY KEY (node_todo_id, node_todo_revision),
    CHECK (from_status <> to_status)
  );

CREATE INDEX node_todo_transitions_time
    ON node_todo_transitions(
      node_todo_id, transitioned_at, node_todo_revision
    );

CREATE TABLE node_question_transitions (
    node_question_id TEXT NOT NULL
      REFERENCES node_questions(id) ON DELETE CASCADE,
    node_question_revision INTEGER NOT NULL
      CHECK (node_question_revision > 0),
    from_status TEXT NOT NULL
      CHECK (from_status IN ('open', 'answered', 'dismissed')),
    to_status TEXT NOT NULL
      CHECK (to_status IN ('open', 'answered', 'dismissed')),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    trigger_source TEXT NOT NULL
      CHECK (trigger_source IN ('user', 'system', 'recovery')),
    transitioned_at INTEGER NOT NULL,
    PRIMARY KEY (node_question_id, node_question_revision),
    CHECK (from_status <> to_status)
  );

CREATE INDEX node_question_transitions_time
    ON node_question_transitions(
      node_question_id, transitioned_at, node_question_revision
    );

CREATE TABLE node_approvals (
    node_run_id TEXT PRIMARY KEY
      REFERENCES node_runs(id) ON DELETE CASCADE,
    decision_id TEXT NOT NULL UNIQUE,
    result TEXT NOT NULL CHECK (result IN ('approved', 'rejected')),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('local_user', 'system')),
    actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
    note TEXT CHECK (note IS NULL OR length(note) <= 2000),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    decided_at INTEGER NOT NULL
  );

CREATE TABLE node_approval_decisions (
    node_run_id TEXT NOT NULL
      REFERENCES node_runs(id) ON DELETE CASCADE,
    approval_revision INTEGER NOT NULL CHECK (approval_revision > 0),
    decision_id TEXT NOT NULL UNIQUE,
    previous_result TEXT
      CHECK (previous_result IS NULL OR previous_result IN ('approved', 'rejected')),
    result TEXT NOT NULL CHECK (result IN ('approved', 'rejected')),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('local_user', 'system')),
    actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
    note TEXT CHECK (note IS NULL OR length(note) <= 2000),
    decided_at INTEGER NOT NULL,
    PRIMARY KEY (node_run_id, approval_revision)
  );

CREATE INDEX node_approval_decisions_time
    ON node_approval_decisions(node_run_id, decided_at, approval_revision);

CREATE TABLE requirement_workflow_revisions (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL
      REFERENCES requirement_workflows(requirement_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    snapshot_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    diff_json TEXT NOT NULL DEFAULT
      '{"addedNodeIds":[],"removedNodeIds":[],"updatedNodeIds":[],"reorderedNodeIds":[],"addedEdgeIds":[],"removedEdgeIds":[],"updatedEdgeIds":[]}',
    trigger_source TEXT NOT NULL DEFAULT 'system'
      CHECK (trigger_source IN ('user', 'system', 'recovery')),
    UNIQUE (requirement_id, revision)
  );

CREATE TABLE model_provider_events (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    provider_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (
      event_type IN ('created', 'updated', 'enabled', 'disabled', 'deleted')
    ),
    from_revision INTEGER NOT NULL CHECK (from_revision >= 0),
    to_revision INTEGER NOT NULL CHECK (to_revision >= 0),
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('user', 'system')),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX model_provider_events_provider_time
    ON model_provider_events(provider_id, occurred_at, id);

CREATE TRIGGER model_providers_reject_referenced_delete
    BEFORE DELETE ON model_providers
    WHEN EXISTS (
      SELECT 1 FROM model_profiles WHERE provider_id = OLD.id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Model provider is referenced by model profiles');
    END;

CREATE TRIGGER model_provider_events_prevent_update
    BEFORE UPDATE ON model_provider_events
    BEGIN
      SELECT RAISE(ABORT, 'Model provider events are immutable');
    END;

CREATE TRIGGER model_provider_events_prevent_delete
    BEFORE DELETE ON model_provider_events
    BEGIN
      SELECT RAISE(ABORT, 'Model provider events are immutable');
    END;

CREATE TABLE model_profile_events (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (
      event_type IN ('created', 'updated', 'enabled', 'disabled', 'deleted')
    ),
    from_revision INTEGER NOT NULL CHECK (from_revision >= 0),
    to_revision INTEGER NOT NULL CHECK (to_revision >= 0),
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('user', 'system')),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX model_profile_events_profile_time
    ON model_profile_events(profile_id, occurred_at, id);

CREATE TRIGGER model_profile_events_prevent_update
    BEFORE UPDATE ON model_profile_events
    BEGIN
      SELECT RAISE(ABORT, 'Model profile events are immutable');
    END;

CREATE TRIGGER model_profile_events_prevent_delete
    BEFORE DELETE ON model_profile_events
    BEGIN
      SELECT RAISE(ABORT, 'Model profile events are immutable');
    END;

CREATE TABLE model_availability_checks (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    provider_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    provider_revision INTEGER NOT NULL CHECK (provider_revision > 0),
    profile_revision INTEGER NOT NULL CHECK (profile_revision > 0),
    status TEXT NOT NULL CHECK (
      status IN (
        'available', 'network_error', 'authentication_error',
        'model_not_found', 'capability_mismatch', 'provider_error'
      )
    ),
    checked_capabilities_json TEXT NOT NULL,
    missing_capabilities_json TEXT NOT NULL,
    latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
    message TEXT NOT NULL,
    checked_at INTEGER NOT NULL CHECK (checked_at >= 0),
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('user', 'system'))
  );

CREATE INDEX model_availability_checks_current
    ON model_availability_checks(
      profile_id, provider_revision, profile_revision, checked_at DESC, id DESC
    );

CREATE TRIGGER model_availability_checks_prevent_update
    BEFORE UPDATE ON model_availability_checks
    BEGIN
      SELECT RAISE(ABORT, 'Model availability checks are immutable');
    END;

CREATE TABLE model_credential_key_rotations (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    from_key_version INTEGER NOT NULL CHECK (from_key_version > 0),
    to_key_version INTEGER NOT NULL CHECK (to_key_version > from_key_version),
    credential_count INTEGER NOT NULL CHECK (credential_count >= 0),
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('user', 'system')),
    rotated_at INTEGER NOT NULL CHECK (rotated_at >= 0)
  );

CREATE INDEX model_credential_key_rotations_time
    ON model_credential_key_rotations(rotated_at, id);

CREATE TRIGGER model_credential_key_rotations_prevent_update
    BEFORE UPDATE ON model_credential_key_rotations
    BEGIN
      SELECT RAISE(ABORT, 'Model credential key rotations are immutable');
    END;

CREATE TRIGGER model_credential_key_rotations_prevent_delete
    BEFORE DELETE ON model_credential_key_rotations
    BEGIN
      SELECT RAISE(ABORT, 'Model credential key rotations are immutable');
    END;

CREATE TABLE context_snapshots (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL
      REFERENCES requirements(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES requirement_nodes(id) ON DELETE CASCADE,
    node_run_id TEXT NOT NULL UNIQUE
      REFERENCES node_runs(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES model_providers(id),
    model_profile_id TEXT NOT NULL REFERENCES model_profiles(id),
    model_id TEXT NOT NULL,
    model_parameters_json TEXT NOT NULL,
    policy_version INTEGER NOT NULL CHECK (policy_version > 0),
    content TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    insufficient_knowledge INTEGER NOT NULL
      CHECK (insufficient_knowledge IN (0, 1)),
    character_count INTEGER NOT NULL CHECK (character_count >= 0),
    estimated_tokens INTEGER NOT NULL CHECK (estimated_tokens >= 0),
    checksum TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE INDEX context_snapshots_requirement_time
    ON context_snapshots(requirement_id, created_at DESC, id);

CREATE TRIGGER context_snapshots_prevent_update
    BEFORE UPDATE ON context_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'Context snapshots are immutable');
    END;

CREATE TABLE "chat_messages" (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    turn_id TEXT NOT NULL
      REFERENCES conversation_turns(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    status TEXT NOT NULL DEFAULT 'completed'
      CHECK (status IN ('pending', 'completed', 'failed')),
    content TEXT NOT NULL,
    run_id TEXT,
    error TEXT,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL, question_id TEXT
    REFERENCES node_questions(id) ON DELETE SET NULL, todo_id TEXT
    REFERENCES node_todos(id) ON DELETE SET NULL, tool_call_id TEXT, artifact_id TEXT
    REFERENCES artifacts(id) ON DELETE SET NULL, completed_at INTEGER
    CHECK (completed_at IS NULL OR completed_at >= created_at), model_id TEXT, model_name TEXT, processing_json TEXT
    CHECK (
      processing_json IS NULL OR (
        json_valid(processing_json) AND
        json_extract(processing_json, '$.schemaVersion') = 1
      )
    ), source_json TEXT
    CHECK (source_json IS NULL OR json_valid(source_json)),
    UNIQUE (session_id, sort_order),
    CHECK (role != 'user' OR status = 'completed'),
    CHECK (status != 'completed' OR error IS NULL),
    CHECK (status != 'failed' OR error IS NOT NULL)
  );

CREATE INDEX chat_messages_turn_order
    ON chat_messages(turn_id, sort_order, id);

CREATE TABLE conversation_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL
      REFERENCES chat_sessions(id) ON DELETE CASCADE,
    turn_index INTEGER NOT NULL CHECK (turn_index >= 0),
    user_message_id TEXT NOT NULL,
    assistant_message_id TEXT NOT NULL,
    run_id TEXT,
    status TEXT NOT NULL CHECK (
      status IN (
        'pending', 'initializing', 'running', 'retrying',
        'waiting_permission', 'waiting_input', 'paused',
        'recovery_blocked', 'completed', 'failed', 'cancelled'
      )
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    completed_at INTEGER CHECK (
      completed_at IS NULL OR completed_at >= created_at
    ),
    CHECK (user_message_id <> assistant_message_id),
    CHECK (
      (status IN ('completed', 'failed', 'cancelled')
        AND completed_at IS NOT NULL)
      OR
      (status NOT IN ('completed', 'failed', 'cancelled')
        AND completed_at IS NULL)
    )
  );

CREATE UNIQUE INDEX conversation_turns_session_index
    ON conversation_turns(session_id, turn_index);

CREATE UNIQUE INDEX conversation_turns_user_message
    ON conversation_turns(user_message_id);

CREATE UNIQUE INDEX conversation_turns_assistant_message
    ON conversation_turns(assistant_message_id);

CREATE UNIQUE INDEX conversation_turns_run
    ON conversation_turns(run_id)
    WHERE run_id IS NOT NULL;

CREATE UNIQUE INDEX chat_sessions_node_run_unique
    ON chat_sessions(node_run_id)
    WHERE node_run_id IS NOT NULL;

CREATE TABLE "model_call_metrics" (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK (
      source IN (
        'workflow_node', 'general_conversation',
        'space_conversation', 'folder_conversation',
        'requirement_node_conversation', 'follow_up_suggestion'
      )
    ),
    provider_id TEXT NOT NULL REFERENCES model_providers(id),
    model_profile_id TEXT NOT NULL REFERENCES model_profiles(id),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    node_id TEXT REFERENCES requirement_nodes(id) ON DELETE SET NULL,
    conversation_id TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
    ai_run_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
    cached_tokens INTEGER NOT NULL CHECK (cached_tokens >= 0),
    reasoning_tokens INTEGER NOT NULL CHECK (reasoning_tokens >= 0),
    first_token_latency_ms INTEGER CHECK (first_token_latency_ms >= 0),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    throughput_tokens_per_second REAL NOT NULL CHECK (
      throughput_tokens_per_second >= 0
    ),
    retry_count INTEGER NOT NULL CHECK (retry_count >= 0),
    status TEXT NOT NULL CHECK (
      status IN ('completed', 'failed', 'cancelled', 'interrupted')
    ),
    error_code TEXT CHECK (
      error_code IS NULL OR error_code IN (
        'provider_rejected', 'provider_unavailable', 'provider_timeout',
        'request_cancelled', 'protocol_error', 'stream_error', 'interrupted'
      )
    ),
    estimated_input_cost REAL NOT NULL CHECK (estimated_input_cost >= 0),
    estimated_output_cost REAL NOT NULL CHECK (estimated_output_cost >= 0),
    estimated_cost REAL NOT NULL CHECK (estimated_cost >= 0),
    context_snapshot_id TEXT,
    created_at INTEGER NOT NULL, requested_reasoning TEXT
    CHECK (
      requested_reasoning IS NULL OR
      requested_reasoning IN ('inherit', 'off', 'low', 'medium', 'high')
    ), effective_reasoning TEXT
    CHECK (
      effective_reasoning IS NULL OR
      effective_reasoning IN ('off', 'low', 'medium', 'high')
    ),
    CHECK (
      first_token_latency_ms IS NULL OR first_token_latency_ms <= duration_ms
    )
  );

CREATE INDEX model_call_metrics_created
    ON model_call_metrics(created_at DESC, id);

CREATE UNIQUE INDEX model_call_metrics_ai_run
    ON model_call_metrics(ai_run_id);

CREATE TRIGGER model_call_metrics_validate_context_insert
    BEFORE INSERT ON model_call_metrics
    WHEN NEW.context_snapshot_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM context_snapshots WHERE id = NEW.context_snapshot_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'Context snapshot was not found');
    END;

CREATE TRIGGER model_call_metrics_prevent_update
    BEFORE UPDATE ON model_call_metrics
    WHEN
      NEW.id IS NOT OLD.id OR NEW.source IS NOT OLD.source OR
      NEW.provider_id IS NOT OLD.provider_id OR
      NEW.model_profile_id IS NOT OLD.model_profile_id OR
      NEW.ai_run_id IS NOT OLD.ai_run_id OR
      NEW.input_tokens IS NOT OLD.input_tokens OR
      NEW.output_tokens IS NOT OLD.output_tokens OR
      NEW.cached_tokens IS NOT OLD.cached_tokens OR
      NEW.reasoning_tokens IS NOT OLD.reasoning_tokens OR
      NEW.first_token_latency_ms IS NOT OLD.first_token_latency_ms OR
      NEW.duration_ms IS NOT OLD.duration_ms OR
      NEW.throughput_tokens_per_second IS NOT
        OLD.throughput_tokens_per_second OR
      NEW.retry_count IS NOT OLD.retry_count OR
      NEW.status IS NOT OLD.status OR NEW.error_code IS NOT OLD.error_code OR
      NEW.estimated_input_cost IS NOT OLD.estimated_input_cost OR
      NEW.estimated_output_cost IS NOT OLD.estimated_output_cost OR
      NEW.estimated_cost IS NOT OLD.estimated_cost OR
      NEW.created_at IS NOT OLD.created_at OR
      (NEW.workspace_id IS NOT OLD.workspace_id AND NEW.workspace_id IS NOT NULL) OR
      (NEW.requirement_id IS NOT OLD.requirement_id AND NEW.requirement_id IS NOT NULL) OR
      (NEW.node_id IS NOT OLD.node_id AND NEW.node_id IS NOT NULL) OR
      (NEW.conversation_id IS NOT OLD.conversation_id AND NEW.conversation_id IS NOT NULL) OR
      (NEW.context_snapshot_id IS NOT OLD.context_snapshot_id AND
        NEW.context_snapshot_id IS NOT NULL)
    BEGIN
      SELECT RAISE(ABORT, 'Model call metrics are immutable');
    END;

CREATE TRIGGER model_call_metrics_prevent_delete
    BEFORE DELETE ON model_call_metrics
    BEGIN
      SELECT RAISE(ABORT, 'Model call metrics are immutable');
    END;

CREATE TRIGGER context_snapshots_clear_metric_reference
    AFTER DELETE ON context_snapshots
    BEGIN
      UPDATE model_call_metrics
      SET context_snapshot_id = NULL
      WHERE context_snapshot_id = OLD.id;
    END;

CREATE TABLE knowledge_source_events (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    operation TEXT NOT NULL CHECK (
      operation IN (
        'register', 'start_sync', 'complete_index', 'mark_stale',
        'fail_sync', 'retry_sync', 'remove', 'interrupt'
      )
    ),
    from_status TEXT CHECK (
      from_status IS NULL OR from_status IN (
        'registered', 'syncing', 'indexed', 'stale', 'failed', 'removed'
      )
    ),
    to_status TEXT NOT NULL CHECK (
      to_status IN ('registered', 'syncing', 'indexed', 'stale', 'failed', 'removed')
    ),
    trigger_source TEXT NOT NULL CHECK (
      trigger_source IN ('user', 'ingestion', 'recovery')
    ),
    idempotency_key TEXT NOT NULL UNIQUE,
    source_revision INTEGER NOT NULL CHECK (source_revision > 0),
    error_code TEXT,
    error_message TEXT,
    occurred_at INTEGER NOT NULL
  );

CREATE INDEX knowledge_source_events_source_order
    ON knowledge_source_events(source_id, occurred_at, id);

CREATE TABLE knowledge_source_commands (
    idempotency_key TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    command_fingerprint TEXT NOT NULL,
    resulting_revision INTEGER NOT NULL CHECK (resulting_revision > 0),
    created_at INTEGER NOT NULL
  );

CREATE TRIGGER knowledge_source_events_prevent_update
    BEFORE UPDATE ON knowledge_source_events
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge source events are append-only');
    END;

CREATE TRIGGER knowledge_source_events_prevent_delete
    BEFORE DELETE ON knowledge_source_events
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge source events are append-only');
    END;

CREATE TABLE local_file_sources (
    source_id TEXT PRIMARY KEY
      REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    workspace_id TEXT NOT NULL
      REFERENCES workspaces(id) ON DELETE CASCADE,
    storage_mode TEXT NOT NULL CHECK (
      storage_mode IN ('managed_copy', 'external_reference')
    ),
    original_path TEXT NOT NULL,
    managed_relative_path TEXT,
    content_checksum TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    modified_at INTEGER NOT NULL CHECK (modified_at >= 0),
    checked_at INTEGER NOT NULL CHECK (checked_at >= 0),
    UNIQUE (workspace_id, original_path),
    CHECK (
      (storage_mode = 'managed_copy' AND managed_relative_path IS NOT NULL)
      OR
      (storage_mode = 'external_reference' AND managed_relative_path IS NULL)
    )
  );

CREATE INDEX local_file_sources_workspace
    ON local_file_sources(workspace_id, source_id);

CREATE TABLE local_file_ingestion_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type = 'http'),
    base_url TEXT NOT NULL,
    authentication_type TEXT NOT NULL CHECK (
      authentication_type IN ('none', 'bearer', 'api_key_header')
    ),
    authentication_header TEXT,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 1 AND 600000),
    max_retries INTEGER NOT NULL CHECK (max_retries BETWEEN 0 AND 10),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    CHECK (
      (authentication_type = 'api_key_header' AND authentication_header IS NOT NULL)
      OR
      (authentication_type <> 'api_key_header' AND authentication_header IS NULL)
    )
  );

CREATE INDEX connectors_name ON connectors(name, id);

CREATE TABLE connector_credentials (
    connector_id TEXT PRIMARY KEY REFERENCES connectors(id) ON DELETE CASCADE,
    encrypted_value BLOB NOT NULL,
    nonce BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    key_version INTEGER NOT NULL CHECK (key_version > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE TABLE connector_events (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (
      operation IN ('created', 'updated', 'enabled', 'disabled', 'validated', 'deleted')
    ),
    connector_revision INTEGER NOT NULL CHECK (connector_revision > 0),
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('user', 'system')),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX connector_events_connector_time
    ON connector_events(connector_id, occurred_at, id);

CREATE TRIGGER connector_events_prevent_update
    BEFORE UPDATE ON connector_events
    BEGIN
      SELECT RAISE(ABORT, 'Connector events are immutable');
    END;

CREATE TRIGGER connector_events_prevent_delete
    BEFORE DELETE ON connector_events
    BEGIN
      SELECT RAISE(ABORT, 'Connector events are immutable');
    END;

CREATE TABLE connector_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE TABLE connector_validation_results (
    connector_id TEXT PRIMARY KEY REFERENCES connectors(id) ON DELETE CASCADE,
    connector_revision INTEGER NOT NULL CHECK (connector_revision > 0),
    status TEXT NOT NULL CHECK (
      status IN ('available', 'authentication_error', 'unavailable', 'protocol_error')
    ),
    message TEXT NOT NULL,
    checked_at INTEGER NOT NULL CHECK (checked_at >= 0)
  );

CREATE TABLE outbound_calls (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    call_type TEXT NOT NULL CHECK (call_type IN (
      'model_completion', 'model_availability', 'connector',
      'online_document', 'remote_repository', 'app_update', 'online_help',
      'mcp'
    )),
    target_type TEXT NOT NULL CHECK (target_type IN (
      'model_provider', 'connector', 'document_service', 'repository_host',
      'update_service', 'help_service', 'mcp_server'
    )),
    target_id TEXT NOT NULL,
    owner_type TEXT NOT NULL CHECK (owner_type IN (
      'ai_run', 'model_profile', 'workspace', 'requirement', 'node_run',
      'conversation', 'connector', 'knowledge_source', 'application'
    )),
    owner_id TEXT NOT NULL,
    provider_id TEXT,
    model_profile_id TEXT,
    workspace_id TEXT,
    requirement_id TEXT,
    node_id TEXT,
    node_run_id TEXT,
    conversation_id TEXT,
    ai_run_id TEXT,
    status TEXT NOT NULL CHECK (status IN (
      'started', 'succeeded', 'failed', 'cancelled', 'interrupted'
    )),
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    completed_at INTEGER CHECK (
      completed_at IS NULL OR completed_at >= started_at
    ),
    duration_ms INTEGER CHECK (
      duration_ms IS NULL OR (
        duration_ms >= 0 AND duration_ms = completed_at - started_at
      )
    ),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    error_code TEXT CHECK (error_code IS NULL OR error_code IN (
      'provider_rejected', 'provider_unavailable', 'provider_timeout',
      'authentication_error', 'target_unavailable', 'request_timeout',
      'request_cancelled', 'protocol_error', 'response_too_large',
      'audit_unavailable', 'interrupted'
    )),
    error_summary TEXT,
    CHECK (
      (status = 'started' AND completed_at IS NULL AND duration_ms IS NULL
        AND error_code IS NULL AND error_summary IS NULL)
      OR
      (status = 'succeeded' AND completed_at IS NOT NULL
        AND duration_ms IS NOT NULL AND error_code IS NULL
        AND error_summary IS NULL)
      OR
      (status IN ('failed', 'cancelled', 'interrupted')
        AND completed_at IS NOT NULL AND duration_ms IS NOT NULL
        AND error_code IS NOT NULL AND error_summary IS NOT NULL)
    )
  );

CREATE UNIQUE INDEX outbound_calls_idempotency
    ON outbound_calls(idempotency_key);

CREATE INDEX outbound_calls_started
    ON outbound_calls(started_at DESC, id DESC);

CREATE INDEX outbound_calls_owner
    ON outbound_calls(owner_type, owner_id, started_at DESC, id DESC);

CREATE INDEX outbound_calls_requirement
    ON outbound_calls(requirement_id, started_at DESC, id DESC);

CREATE TRIGGER outbound_calls_validate_transition
    BEFORE UPDATE ON outbound_calls
    WHEN OLD.status <> 'started'
      OR NEW.status = 'started'
      OR NEW.id IS NOT OLD.id
      OR NEW.idempotency_key IS NOT OLD.idempotency_key
      OR NEW.call_type IS NOT OLD.call_type
      OR NEW.target_type IS NOT OLD.target_type
      OR NEW.target_id IS NOT OLD.target_id
      OR NEW.owner_type IS NOT OLD.owner_type
      OR NEW.owner_id IS NOT OLD.owner_id
      OR NEW.provider_id IS NOT OLD.provider_id
      OR NEW.model_profile_id IS NOT OLD.model_profile_id
      OR NEW.workspace_id IS NOT OLD.workspace_id
      OR NEW.requirement_id IS NOT OLD.requirement_id
      OR NEW.node_id IS NOT OLD.node_id
      OR NEW.node_run_id IS NOT OLD.node_run_id
      OR NEW.conversation_id IS NOT OLD.conversation_id
      OR NEW.ai_run_id IS NOT OLD.ai_run_id
      OR NEW.started_at IS NOT OLD.started_at
    BEGIN
      SELECT RAISE(ABORT, 'Outbound call transition is invalid');
    END;

CREATE TRIGGER outbound_calls_prevent_delete
    BEFORE DELETE ON outbound_calls
    BEGIN
      SELECT RAISE(ABORT, 'Outbound calls are append-preserved');
    END;

CREATE TABLE online_document_sources (
    source_id TEXT PRIMARY KEY
      REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL
      REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_id TEXT NOT NULL
      REFERENCES connectors(id) ON DELETE RESTRICT,
    path TEXT NOT NULL,
    locator TEXT NOT NULL UNIQUE,
    media_type TEXT,
    etag TEXT,
    last_modified TEXT,
    last_fetched_at INTEGER CHECK (
      last_fetched_at IS NULL OR last_fetched_at >= 0
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE INDEX online_document_sources_workspace
    ON online_document_sources(workspace_id, source_id);

CREATE TABLE online_document_commands (
    idempotency_key TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES online_document_sources(source_id) ON DELETE CASCADE,
    command_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('started', 'succeeded', 'failed')
    ),
    result_json TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    CHECK (
      (status = 'started' AND result_json IS NULL)
      OR
      (status <> 'started' AND result_json IS NOT NULL)
    )
  );

CREATE TABLE repository_snapshots (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES repository_sources(source_id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    revision_label TEXT NOT NULL,
    manifest_checksum TEXT NOT NULL,
    file_count INTEGER NOT NULL CHECK (file_count >= 0),
    total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
    scanned_at INTEGER NOT NULL CHECK (scanned_at >= 0), branch TEXT,
    UNIQUE (source_id, version)
  );

CREATE INDEX repository_snapshots_current
    ON repository_snapshots(source_id, version DESC);

CREATE TRIGGER repository_snapshots_prevent_update
    BEFORE UPDATE ON repository_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'Repository snapshots are immutable');
    END;

CREATE TRIGGER repository_snapshots_prevent_delete
    BEFORE DELETE ON repository_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'Repository snapshots are immutable');
    END;

CREATE TABLE repository_commands (
    idempotency_key TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES repository_sources(source_id) ON DELETE RESTRICT,
    command_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('started', 'succeeded', 'failed')
    ),
    result_json TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    CHECK (
      (status = 'started' AND result_json IS NULL)
      OR
      (status <> 'started' AND result_json IS NOT NULL)
    )
  );

CREATE TABLE app_update_checks (
    request_id TEXT PRIMARY KEY,
    current_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('up_to_date', 'update_available', 'failed')
    ),
    latest_version TEXT,
    error_code TEXT,
    checked_at INTEGER NOT NULL CHECK (checked_at >= 0),
    CHECK (
      (
        status IN ('up_to_date', 'update_available')
        AND latest_version IS NOT NULL
        AND error_code IS NULL
      )
      OR (
        status = 'failed'
        AND latest_version IS NULL
        AND error_code IS NOT NULL
      )
    )
  );

CREATE INDEX app_update_checks_latest
    ON app_update_checks(checked_at DESC, request_id DESC);

CREATE TABLE backup_operations (
    request_id TEXT PRIMARY KEY CHECK (length(request_id) > 0),
    kind TEXT NOT NULL CHECK (kind IN ('backup', 'restore')),
    status TEXT NOT NULL CHECK (
      status IN ('succeeded', 'failed', 'restore_pending', 'restored')
    ),
    bundle_name TEXT NOT NULL CHECK (length(bundle_name) > 0),
    bundle_checksum TEXT,
    format_version INTEGER CHECK (
      format_version IS NULL OR format_version > 0
    ),
    schema_version INTEGER CHECK (
      schema_version IS NULL OR schema_version >= 0
    ),
    file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
    byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
    error_code TEXT CHECK (
      error_code IS NULL OR error_code IN (
        'destination_conflict',
        'source_changed',
        'bundle_corrupt',
        'unsafe_bundle',
        'schema_too_new',
        'root_unavailable',
        'bundle_changed',
        'storage_unavailable',
        'restore_failed'
      )
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    completed_at INTEGER CHECK (
      completed_at IS NULL OR completed_at >= created_at
    ),
    CHECK (
      (kind = 'backup' AND status IN ('succeeded', 'failed'))
      OR
      (kind = 'restore' AND status IN ('restore_pending', 'restored', 'failed'))
    ),
    CHECK (
      (status = 'failed' AND error_code IS NOT NULL)
      OR (status != 'failed' AND error_code IS NULL)
    ),
    CHECK (
      (status = 'restore_pending' AND completed_at IS NULL)
      OR (status != 'restore_pending' AND completed_at IS NOT NULL)
    ),
    CHECK (
      status = 'failed'
      OR (
        bundle_checksum IS NOT NULL
        AND format_version IS NOT NULL
        AND schema_version IS NOT NULL
      )
    )
  );

CREATE INDEX backup_operations_latest
    ON backup_operations(kind, created_at DESC, request_id DESC);

CREATE TABLE workflow_template_migrations (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
    request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0),
    requirement_id TEXT NOT NULL CHECK (length(requirement_id) > 0),
    source_template_version_id TEXT NOT NULL
      CHECK (length(source_template_version_id) > 0),
    target_template_version_id TEXT NOT NULL
      CHECK (length(target_template_version_id) > 0),
    before_requirement_revision INTEGER NOT NULL
      CHECK (before_requirement_revision >= 0),
    after_requirement_revision INTEGER NOT NULL
      CHECK (after_requirement_revision = before_requirement_revision + 1),
    before_workflow_revision INTEGER NOT NULL
      CHECK (before_workflow_revision >= 0),
    after_workflow_revision INTEGER NOT NULL
      CHECK (after_workflow_revision = before_workflow_revision + 1),
    before_execution_revision INTEGER NOT NULL
      CHECK (before_execution_revision >= 0),
    after_execution_revision INTEGER NOT NULL
      CHECK (after_execution_revision = before_execution_revision + 1),
    diff_json TEXT NOT NULL CHECK (json_valid(diff_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE INDEX workflow_template_migrations_requirement_created
    ON workflow_template_migrations(requirement_id, created_at DESC, id DESC);

CREATE TRIGGER workflow_template_migrations_prevent_update
  BEFORE UPDATE ON workflow_template_migrations
  BEGIN
    SELECT RAISE(ABORT, 'Workflow template migrations are immutable');
  END;

CREATE TRIGGER workflow_template_migrations_prevent_delete
  BEFORE DELETE ON workflow_template_migrations
  BEGIN
    SELECT RAISE(ABORT, 'Workflow template migrations are immutable');
  END;

CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (
      scope IN (
        'workflow_template', 'requirement_workflow', 'workflow_execution',
        'node_run', 'workflow_advance'
      )
    ),
    scope_id TEXT NOT NULL CHECK (length(trim(scope_id)) > 0),
    requirement_id TEXT,
    execution_id TEXT,
    node_run_id TEXT,
    template_id TEXT,
    template_version_id TEXT,
    event_type TEXT NOT NULL CHECK (
      event_type IN (
        'template_created', 'template_revised', 'template_published',
        'template_archived', 'instance_created', 'instance_revised',
        'template_migrated', 'workflow_parallelism_changed',
        'execution_created', 'execution_status_changed',
        'execution_current_node_changed', 'node_run_created',
        'node_run_status_changed', 'advance_enqueued', 'advance_started',
        'advance_completed', 'advance_failed', 'workflow_rolled_back'
      )
    ),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('local_user', 'system')),
    actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
    trigger_source TEXT NOT NULL
      CHECK (trigger_source IN ('user', 'system', 'recovery')),
    from_state TEXT,
    to_state TEXT,
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    aggregate_revision INTEGER NOT NULL CHECK (aggregate_revision > 0),
    metadata_json TEXT NOT NULL DEFAULT '{}'
      CHECK (
        json_valid(metadata_json) AND json_type(metadata_json) = 'object'
      ),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE UNIQUE INDEX audit_events_idempotency
    ON audit_events(idempotency_key);

CREATE INDEX audit_events_scope_time
    ON audit_events(scope, scope_id, occurred_at, id);

CREATE INDEX audit_events_requirement_time
    ON audit_events(requirement_id, occurred_at, id)
    WHERE requirement_id IS NOT NULL;

CREATE TRIGGER audit_events_prevent_update
    BEFORE UPDATE ON audit_events
    BEGIN
      SELECT RAISE(ABORT, 'Workflow audit events are immutable');
    END;

CREATE TRIGGER audit_events_prevent_delete
    BEFORE DELETE ON audit_events
    BEGIN
      SELECT RAISE(ABORT, 'Workflow audit events are immutable');
    END;

CREATE UNIQUE INDEX model_profiles_catalog_identity
    ON model_profiles(catalog_provider_id, catalog_model_id)
    WHERE source = 'catalog';

CREATE TRIGGER model_profiles_validate_catalog_insert
    BEFORE INSERT ON model_profiles
    WHEN (
      NEW.source = 'catalog' AND (
        NEW.catalog_provider_id IS NULL OR NEW.catalog_model_id IS NULL
        OR NEW.catalog_version IS NULL
      )
    ) OR (
      NEW.source = 'custom' AND (
        NEW.catalog_provider_id IS NOT NULL OR NEW.catalog_model_id IS NOT NULL
        OR NEW.catalog_version IS NOT NULL
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'Invalid model profile catalog ownership');
    END;

CREATE TRIGGER model_profiles_validate_catalog_update
    BEFORE UPDATE ON model_profiles
    WHEN (
      NEW.source = 'catalog' AND (
        NEW.catalog_provider_id IS NULL OR NEW.catalog_model_id IS NULL
        OR NEW.catalog_version IS NULL
      )
    ) OR (
      NEW.source = 'custom' AND (
        NEW.catalog_provider_id IS NOT NULL OR NEW.catalog_model_id IS NOT NULL
        OR NEW.catalog_version IS NOT NULL
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'Invalid model profile catalog ownership');
    END;

CREATE TABLE model_catalog_applications (
    provider_id TEXT PRIMARY KEY
      REFERENCES model_providers(id) ON DELETE CASCADE,
    catalog_provider_id TEXT NOT NULL,
    catalog_version INTEGER NOT NULL CHECK (catalog_version > 0),
    revision INTEGER NOT NULL CHECK (revision > 0),
    applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
  );

CREATE TABLE model_catalog_events (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    provider_id TEXT NOT NULL,
    catalog_provider_id TEXT NOT NULL,
    from_version INTEGER,
    to_version INTEGER NOT NULL CHECK (to_version > 0),
    created_count INTEGER NOT NULL CHECK (created_count >= 0),
    updated_count INTEGER NOT NULL CHECK (updated_count >= 0),
    retired_count INTEGER NOT NULL CHECK (retired_count >= 0),
    restored_count INTEGER NOT NULL CHECK (restored_count >= 0),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX model_catalog_events_provider_time
    ON model_catalog_events(provider_id, occurred_at, id);

CREATE TRIGGER model_catalog_events_prevent_update
    BEFORE UPDATE ON model_catalog_events
    BEGIN
      SELECT RAISE(ABORT, 'Model catalog events are immutable');
    END;

CREATE TRIGGER model_catalog_events_prevent_delete
    BEFORE DELETE ON model_catalog_events
    BEGIN
      SELECT RAISE(ABORT, 'Model catalog events are immutable');
    END;

CREATE UNIQUE INDEX model_providers_catalog_identity
    ON model_providers(catalog_provider_id)
    WHERE source = 'builtin';

CREATE TRIGGER model_providers_validate_source_insert
    BEFORE INSERT ON model_providers
    WHEN (
      NEW.source = 'builtin' AND NEW.catalog_provider_id IS NULL
    ) OR (
      NEW.source != 'builtin' AND NEW.catalog_provider_id IS NOT NULL
    )
    BEGIN
      SELECT RAISE(ABORT, 'Invalid model provider source metadata');
    END;

CREATE TRIGGER model_providers_validate_source_update
    BEFORE UPDATE ON model_providers
    WHEN (
      NEW.source = 'builtin' AND NEW.catalog_provider_id IS NULL
    ) OR (
      NEW.source != 'builtin' AND NEW.catalog_provider_id IS NOT NULL
    )
    BEGIN
      SELECT RAISE(ABORT, 'Invalid model provider source metadata');
    END;

CREATE TRIGGER model_profiles_reject_referenced_delete
    BEFORE DELETE ON model_profiles
    WHEN EXISTS (
      SELECT 1 FROM workflow_nodes
      WHERE json_extract(config_json, '$.model.strategy') = 'fixed'
        AND json_extract(config_json, '$.model.profileId') = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM requirement_nodes
      WHERE json_extract(config_json, '$.model.strategy') = 'fixed'
        AND json_extract(config_json, '$.model.profileId') = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM node_runs
      WHERE status IN (
        'pending', 'ready', 'running', 'waiting_user', 'paused', 'blocked',
        'interrupted'
      )
        AND json_extract(checkpoint_json, '$.modelProfileId') = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM chat_sessions WHERE model_profile_id = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM model_call_metrics WHERE model_profile_id = OLD.id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Model profile is referenced');
    END;

CREATE TABLE model_profile_cleanup_authorizations (
    profile_id TEXT PRIMARY KEY
  );

CREATE TRIGGER model_availability_checks_prevent_delete
    BEFORE DELETE ON model_availability_checks
    WHEN NOT EXISTS (
      SELECT 1 FROM model_profile_cleanup_authorizations
      WHERE profile_id = OLD.profile_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Model availability checks are immutable');
    END;

CREATE INDEX model_providers_active
    ON model_providers(name, id)
    WHERE deleted_at IS NULL;

CREATE INDEX model_profiles_active_provider
    ON model_profiles(provider_id, display_name, id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX artifacts_primary_per_node
    ON artifacts(requirement_id, node_id)
    WHERE is_primary = 1 AND is_valid = 1;

CREATE TABLE workflow_rollback_operations (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    requirement_id TEXT NOT NULL
      REFERENCES requirements(id) ON DELETE CASCADE,
    execution_id TEXT NOT NULL
      REFERENCES workflow_executions(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL,
    affected_node_ids_json TEXT NOT NULL,
    created_node_run_ids_json TEXT NOT NULL,
    pending_ai_run_ids_json TEXT NOT NULL DEFAULT '[]',
    knowledge_sync_pending INTEGER NOT NULL DEFAULT 0
      CHECK (knowledge_sync_pending IN (0, 1)),
    status TEXT NOT NULL
      CHECK (
        status IN (
          'committed', 'coordination_pending', 'completed', 'failed'
        )
      ),
    error TEXT,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  );

CREATE INDEX workflow_rollback_operations_execution
    ON workflow_rollback_operations(execution_id, created_at, id);

CREATE INDEX workflow_rollback_operations_pending
    ON workflow_rollback_operations(status, updated_at, id)
    WHERE status IN ('committed', 'coordination_pending');

CREATE INDEX node_runs_execution_latest
    ON node_runs(
      execution_id, node_id, attempt DESC, created_at DESC, id DESC
    );

CREATE TABLE vector_index_profiles (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    workspace_collection TEXT NOT NULL,
    catalog_collection TEXT NOT NULL,
    qdrant_version TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_revision TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0),
    normalize TEXT NOT NULL,
    distance TEXT NOT NULL,
    sparse_model TEXT NOT NULL,
    fusion TEXT NOT NULL,
    fusion_parameter INTEGER NOT NULL CHECK (fusion_parameter > 0),
    chunker_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE UNIQUE INDEX vector_index_profiles_one_active
    ON vector_index_profiles(status)
    WHERE status = 'active';

CREATE TABLE knowledge_index_generations (
    id TEXT PRIMARY KEY,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('workspace', 'catalog')),
    scope_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    source_checksum TEXT NOT NULL,
    profile_id TEXT NOT NULL
      REFERENCES vector_index_profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (
      status IN ('staging', 'current', 'retired', 'failed')
    ),
    document_count INTEGER NOT NULL CHECK (document_count >= 0),
    chunk_count INTEGER NOT NULL CHECK (chunk_count >= 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    committed_at INTEGER CHECK (
      committed_at IS NULL OR committed_at >= created_at
    ),
    retired_at INTEGER CHECK (
      retired_at IS NULL OR retired_at >= created_at
    ),
    error_code TEXT,
    qdrant_deleted_at INTEGER CHECK (
      qdrant_deleted_at IS NULL OR qdrant_deleted_at >= created_at
    )
  );

CREATE UNIQUE INDEX knowledge_index_generations_one_current
    ON knowledge_index_generations (
      scope_kind, scope_id, source_kind, source_id, profile_id
    )
    WHERE status = 'current';

CREATE INDEX knowledge_index_generations_scope_current
    ON knowledge_index_generations (
      scope_kind, scope_id, profile_id, source_kind, source_id
    )
    WHERE status = 'current';

CREATE INDEX knowledge_index_generations_source_history
    ON knowledge_index_generations (
      source_kind, source_id, profile_id, created_at DESC, id DESC
    );

CREATE TABLE knowledge_search_chunks (
    point_id TEXT NOT NULL,
    generation_id TEXT NOT NULL
      REFERENCES knowledge_index_generations(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    requirement_id TEXT,
    node_id TEXT,
    session_id TEXT,
    document_id TEXT NOT NULL,
    document_key TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_id TEXT NOT NULL,
    chunk_ordinal INTEGER NOT NULL CHECK (chunk_ordinal >= 0),
    start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
    end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
    start_line INTEGER NOT NULL CHECK (start_line > 0),
    end_line INTEGER NOT NULL CHECK (end_line >= start_line),
    checksum TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY (generation_id, point_id)
  );

CREATE INDEX knowledge_search_chunks_scope
    ON knowledge_search_chunks(workspace_id, generation_id, source_kind);

CREATE VIRTUAL TABLE knowledge_search_chunks_fts USING fts5(
    title,
    document_key,
    content,
    content = 'knowledge_search_chunks',
    content_rowid = 'rowid',
    tokenize = 'unicode61'
  );

CREATE TRIGGER knowledge_search_chunks_fts_insert
    AFTER INSERT ON knowledge_search_chunks BEGIN
      INSERT INTO knowledge_search_chunks_fts(
        rowid, title, document_key, content
      ) VALUES (new.rowid, new.title, new.document_key, new.content);
    END;

CREATE TRIGGER knowledge_search_chunks_fts_delete
    AFTER DELETE ON knowledge_search_chunks BEGIN
      INSERT INTO knowledge_search_chunks_fts(
        knowledge_search_chunks_fts, rowid, title, document_key, content
      ) VALUES (
        'delete', old.rowid, old.title, old.document_key, old.content
      );
    END;

CREATE TABLE knowledge_index_jobs (
    id TEXT PRIMARY KEY,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('workspace', 'catalog')),
    scope_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_revision INTEGER NOT NULL CHECK (target_revision > 0),
    target_version TEXT NOT NULL,
    target_checksum TEXT NOT NULL,
    profile_id TEXT NOT NULL
      REFERENCES vector_index_profiles(id) ON DELETE RESTRICT,
    generation_id TEXT NOT NULL
      REFERENCES knowledge_index_generations(id) ON DELETE RESTRICT,
    trigger_source TEXT NOT NULL CHECK (
      trigger_source IN (
        'manual', 'source_event', 'scheduled', 'startup_recovery'
      )
    ),
    priority INTEGER NOT NULL CHECK (priority >= 0),
    status TEXT NOT NULL CHECK (
      status IN (
        'pending', 'running', 'qdrant_written',
        'completed', 'failed', 'cancelled', 'interrupted'
      )
    ),
    attempt INTEGER NOT NULL CHECK (attempt >= 0),
    next_attempt_at INTEGER CHECK (
      next_attempt_at IS NULL OR next_attempt_at >= 0
    ),
    locked_at INTEGER CHECK (locked_at IS NULL OR locked_at >= 0),
    error_code TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    completed_at INTEGER CHECK (
      completed_at IS NULL OR completed_at >= created_at
    )
  , target_document_key TEXT);

CREATE UNIQUE INDEX knowledge_index_jobs_one_pending_successor
    ON knowledge_index_jobs (
      scope_kind, scope_id, source_kind, source_id, profile_id
    )
    WHERE status = 'pending';

CREATE INDEX knowledge_index_jobs_claim
    ON knowledge_index_jobs (
      priority DESC, created_at, id, next_attempt_at
    )
    WHERE status = 'pending';

CREATE INDEX knowledge_index_jobs_source_history
    ON knowledge_index_jobs (
      source_kind, source_id, updated_at DESC, id DESC
    );

CREATE TABLE knowledge_refresh_policies (
    source_id TEXT PRIMARY KEY
      REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    preset TEXT NOT NULL CHECK (
      preset IN ('manual', '5m', '15m', '30m', '1h', 'daily')
    ),
    cron_expression TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE TABLE knowledge_refresh_cursors (
    source_id TEXT PRIMARY KEY
      REFERENCES knowledge_refresh_policies(source_id) ON DELETE CASCADE,
    policy_revision INTEGER NOT NULL CHECK (policy_revision > 0),
    next_due_at INTEGER NOT NULL CHECK (next_due_at >= 0),
    missed_due_at INTEGER CHECK (
      missed_due_at IS NULL OR missed_due_at >= 0
    ),
    last_checked_at INTEGER CHECK (
      last_checked_at IS NULL OR last_checked_at >= 0
    ),
    last_changed_at INTEGER CHECK (
      last_changed_at IS NULL OR last_changed_at >= 0
    ),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );

CREATE INDEX knowledge_refresh_cursors_due
    ON knowledge_refresh_cursors(next_due_at, source_id);

CREATE TABLE knowledge_refresh_runs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    policy_revision INTEGER NOT NULL CHECK (policy_revision > 0),
    scheduled_for INTEGER CHECK (
      scheduled_for IS NULL OR scheduled_for >= 0
    ),
    trigger_source TEXT NOT NULL CHECK (
      trigger_source IN ('manual', 'scheduled', 'startup_recovery')
    ),
    status TEXT NOT NULL CHECK (
      status IN (
        'running', 'retry_wait', 'unchanged', 'queued',
        'failed', 'interrupted'
      )
    ),
    attempt INTEGER NOT NULL CHECK (attempt > 0),
    next_attempt_at INTEGER CHECK (
      next_attempt_at IS NULL OR next_attempt_at >= 0
    ),
    before_checksum TEXT,
    after_checksum TEXT,
    index_job_id TEXT
      REFERENCES knowledge_index_jobs(id) ON DELETE RESTRICT,
    error_code TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    completed_at INTEGER CHECK (
      completed_at IS NULL OR completed_at >= started_at
    ),
    CHECK (
      (status = 'running' AND completed_at IS NULL)
      OR (status = 'retry_wait' AND next_attempt_at IS NOT NULL)
      OR (status IN ('unchanged', 'queued', 'failed', 'interrupted')
          AND completed_at IS NOT NULL)
    )
  );

CREATE UNIQUE INDEX knowledge_refresh_runs_scheduled_slot
    ON knowledge_refresh_runs(source_id, policy_revision, scheduled_for)
    WHERE scheduled_for IS NOT NULL;

CREATE UNIQUE INDEX knowledge_refresh_runs_one_running
    ON knowledge_refresh_runs(source_id)
    WHERE status = 'running';

CREATE INDEX knowledge_refresh_runs_retry
    ON knowledge_refresh_runs(next_attempt_at, source_id)
    WHERE status = 'retry_wait';

CREATE TRIGGER chat_sessions_validate_knowledge_scope_insert
    BEFORE INSERT ON chat_sessions
    WHEN NOT (
      (
        NEW.kind = 'general'
        AND NEW.workspace_id IS NULL
        AND NEW.requirement_id IS NULL
        AND NEW.node_run_id IS NULL
        AND (
          (NEW.folder_path IS NOT NULL
            AND json_extract(NEW.knowledge_scope, '$.kind') = 'none')
          OR
          (NEW.folder_path IS NULL
            AND json_extract(NEW.knowledge_scope, '$.kind')
              IN ('none', 'all_workspaces'))
        )
      )
      OR (
        NEW.kind = 'space'
        AND NEW.workspace_id IS NOT NULL
        AND NEW.requirement_id IS NULL
        AND NEW.node_run_id IS NULL
        AND NEW.folder_path IS NULL
        AND json_extract(NEW.knowledge_scope, '$.kind') = 'workspace'
        AND json_extract(NEW.knowledge_scope, '$.workspaceId')
          = NEW.workspace_id
      )
      OR (
        NEW.kind = 'requirement_node'
        AND NEW.workspace_id IS NOT NULL
        AND NEW.requirement_id IS NOT NULL
        AND NEW.node_run_id IS NOT NULL
        AND NEW.folder_path IS NULL
        AND json_extract(NEW.knowledge_scope, '$.kind')
          = 'node_configuration'
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'Invalid conversation knowledge scope binding');
    END;

CREATE TRIGGER chat_sessions_validate_knowledge_scope_update
    BEFORE UPDATE OF kind, workspace_id, requirement_id, node_run_id,
      folder_path, knowledge_scope ON chat_sessions
    WHEN NOT (
      (
        NEW.kind = 'general'
        AND NEW.workspace_id IS NULL
        AND NEW.requirement_id IS NULL
        AND NEW.node_run_id IS NULL
        AND (
          (NEW.folder_path IS NOT NULL
            AND json_extract(NEW.knowledge_scope, '$.kind') = 'none')
          OR
          (NEW.folder_path IS NULL
            AND json_extract(NEW.knowledge_scope, '$.kind')
              IN ('none', 'all_workspaces'))
        )
      )
      OR (
        NEW.kind = 'space'
        AND NEW.workspace_id IS NOT NULL
        AND NEW.requirement_id IS NULL
        AND NEW.node_run_id IS NULL
        AND NEW.folder_path IS NULL
        AND json_extract(NEW.knowledge_scope, '$.kind') = 'workspace'
        AND json_extract(NEW.knowledge_scope, '$.workspaceId')
          = NEW.workspace_id
      )
      OR (
        NEW.kind = 'requirement_node'
        AND NEW.workspace_id IS NOT NULL
        AND NEW.requirement_id IS NOT NULL
        AND NEW.node_run_id IS NOT NULL
        AND NEW.folder_path IS NULL
        AND json_extract(NEW.knowledge_scope, '$.kind')
          = 'node_configuration'
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'Invalid conversation knowledge scope binding');
    END;

CREATE TABLE knowledge_notes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL
      REFERENCES workspaces(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (
      kind IN ('conversation_note', 'decision', 'retrospective')
    ),
    requirement_id TEXT
      REFERENCES requirements(id) ON DELETE SET NULL,
    session_id TEXT
      REFERENCES chat_sessions(id) ON DELETE SET NULL,
    current_version_id TEXT NOT NULL
      REFERENCES knowledge_note_versions(id)
      DEFERRABLE INITIALLY DEFERRED,
    current_version INTEGER NOT NULL CHECK (current_version > 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE TABLE knowledge_note_versions (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL
      REFERENCES knowledge_notes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    source_message_ids_json TEXT NOT NULL CHECK (
      json_valid(source_message_ids_json)
      AND json_type(source_message_ids_json) = 'array'
      AND json_array_length(source_message_ids_json) > 0
    ),
    checksum TEXT NOT NULL CHECK (
      length(checksum) = 71 AND checksum LIKE 'sha256:%'
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    UNIQUE (note_id, version)
  );

CREATE INDEX knowledge_notes_workspace_status_updated
    ON knowledge_notes(workspace_id, status, updated_at DESC, id);

CREATE INDEX knowledge_notes_session
    ON knowledge_notes(session_id, created_at, id);

CREATE INDEX knowledge_notes_requirement
    ON knowledge_notes(requirement_id, created_at, id);

CREATE TABLE requirement_memories (
    requirement_id TEXT PRIMARY KEY
      REFERENCES requirements(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL
      REFERENCES workspaces(id) ON DELETE CASCADE,
    current_version_id TEXT NOT NULL
      REFERENCES requirement_memory_versions(id)
      DEFERRABLE INITIALLY DEFERRED,
    current_version INTEGER NOT NULL CHECK (current_version > 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'withdrawn')),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE TABLE requirement_memory_versions (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL
      REFERENCES requirement_memories(requirement_id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL
      REFERENCES workspaces(id) ON DELETE CASCADE,
    requirement_revision INTEGER NOT NULL CHECK (requirement_revision > 0),
    completion_version INTEGER NOT NULL CHECK (completion_version > 0),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    checksum TEXT NOT NULL CHECK (
      length(checksum) = 71 AND checksum LIKE 'sha256:%'
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    UNIQUE (requirement_id, requirement_revision),
    UNIQUE (requirement_id, completion_version)
  );

CREATE INDEX requirement_memories_workspace_status
    ON requirement_memories(workspace_id, status, updated_at DESC);

CREATE TABLE knowledge_index_documents (
    id TEXT NOT NULL,
    generation_id TEXT NOT NULL
      REFERENCES knowledge_index_generations(id) ON DELETE CASCADE,
    document_key TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    chunk_count INTEGER NOT NULL CHECK (chunk_count >= 0),
    PRIMARY KEY (generation_id, id),
    UNIQUE (generation_id, document_key)
  );

CREATE TABLE knowledge_index_rebuild_markers (
    scope TEXT PRIMARY KEY CHECK (scope = 'all'),
    request_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason = 'backup_restore'),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    requested_at INTEGER NOT NULL CHECK (requested_at >= 0)
  );

CREATE TABLE workspace_qdrant_cleanup_jobs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    collection_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('pending', 'running', 'completed', 'failed')
    ),
    attempt INTEGER NOT NULL CHECK (attempt >= 0),
    next_attempt_at INTEGER CHECK (
      next_attempt_at IS NULL OR next_attempt_at >= 0
    ),
    locked_at INTEGER CHECK (locked_at IS NULL OR locked_at >= 0),
    error_code TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    completed_at INTEGER CHECK (
      completed_at IS NULL OR completed_at >= created_at
    ),
    UNIQUE (workspace_id, collection_name)
  );

CREATE INDEX workspace_qdrant_cleanup_jobs_claim
    ON workspace_qdrant_cleanup_jobs(next_attempt_at, created_at, id)
    WHERE status = 'pending';

CREATE TABLE vector_index_profile_recoveries (
    profile_id TEXT PRIMARY KEY
      REFERENCES vector_index_profiles(id) ON DELETE RESTRICT,
    previous_profile_id TEXT NOT NULL
      REFERENCES vector_index_profiles(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL CHECK (
      reason IN ('collection_corrupt', 'profile_incompatible')
    ),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    completed_at INTEGER CHECK (
      completed_at IS NULL OR completed_at >= created_at
    )
  );

CREATE UNIQUE INDEX vector_index_profile_recoveries_one_pending
    ON vector_index_profile_recoveries(status)
    WHERE status = 'pending';

CREATE TABLE vector_index_collection_deletions (
    collection_name TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL
      REFERENCES vector_index_profiles(id) ON DELETE RESTRICT,
    recovery_profile_id TEXT NOT NULL
      REFERENCES vector_index_profile_recoveries(profile_id)
      ON DELETE RESTRICT,
    not_before INTEGER NOT NULL CHECK (not_before >= 0),
    queued_at INTEGER NOT NULL CHECK (queued_at >= 0),
    deleted_at INTEGER CHECK (
      deleted_at IS NULL OR deleted_at >= queued_at
    )
  );

CREATE INDEX vector_index_collection_deletions_due
    ON vector_index_collection_deletions(not_before, collection_name)
    WHERE deleted_at IS NULL;

CREATE TABLE knowledge_index_document_states (
    source_id TEXT NOT NULL
      REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL
      REFERENCES vector_index_profiles(id) ON DELETE CASCADE,
    document_key TEXT NOT NULL,
    source_version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('pending', 'indexing', 'indexed', 'failed')
    ),
    generation_id TEXT
      REFERENCES knowledge_index_generations(id) ON DELETE SET NULL,
    error_code TEXT,
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    PRIMARY KEY (source_id, profile_id, document_key)
  );

CREATE INDEX knowledge_index_document_states_status
    ON knowledge_index_document_states (
      source_id, profile_id, source_version, status, document_key
    );

CREATE TABLE workbench_hub_layout (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    module_order_json TEXT NOT NULL,
    hidden_modules_json TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    updated_at INTEGER NOT NULL
  );

CREATE TABLE workbench_task_tables (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    view_state_json TEXT NOT NULL DEFAULT '{}',
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

CREATE INDEX workbench_task_tables_position
    ON workbench_task_tables(deleted_at, position, id);

CREATE TABLE workbench_task_fields (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES workbench_task_tables(id),
    name TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (
      field_type IN (
        'text', 'date', 'single_select', 'multi_select', 'url', 'attachment'
      )
    ),
    config_json TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

CREATE INDEX workbench_task_fields_table_position
    ON workbench_task_fields(table_id, deleted_at, position, id);

CREATE TABLE workbench_task_records (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES workbench_task_tables(id),
    values_json TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

CREATE INDEX workbench_task_records_table_position
    ON workbench_task_records(table_id, deleted_at, position, id);

CREATE TABLE workbench_attachments (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL CHECK (
      owner_type IN ('task_record', 'site_icon', 'memo')
    ),
    owner_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    checksum_sha256 TEXT NOT NULL,
    relative_path TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

CREATE INDEX workbench_attachments_owner
    ON workbench_attachments(owner_type, owner_id, deleted_at, created_at, id);

CREATE TABLE workbench_site_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    system_key TEXT UNIQUE CHECK (
      system_key IS NULL OR system_key = 'ungrouped'
    ),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

CREATE INDEX workbench_site_groups_position
    ON workbench_site_groups(deleted_at, position, id);

CREATE TABLE workbench_sites (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES workbench_site_groups(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    open_mode TEXT NOT NULL CHECK (open_mode IN ('embedded', 'external')),
    icon_attachment_id TEXT REFERENCES workbench_attachments(id)
      ON DELETE SET NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

CREATE INDEX workbench_sites_group_position
    ON workbench_sites(group_id, deleted_at, position, id);

CREATE TABLE workbench_memos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_json TEXT NOT NULL,
    plain_text TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL CHECK (position >= 0),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

CREATE INDEX workbench_memos_position
    ON workbench_memos(deleted_at, position, id);

CREATE TABLE workbench_audit_events (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL CHECK (
      module IN ('layout', 'tasks', 'attachments', 'sites', 'memos')
    ),
    action TEXT NOT NULL CHECK (
      action IN ('created', 'updated', 'deleted', 'restored', 'purged')
    ),
    entity_type TEXT NOT NULL CHECK (length(trim(entity_type)) > 0),
    entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
    entity_revision INTEGER CHECK (
      entity_revision IS NULL OR entity_revision >= 0
    ),
    metadata_json TEXT NOT NULL DEFAULT '{}'
      CHECK (
        json_valid(metadata_json) AND json_type(metadata_json) = 'object'
      ),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX workbench_audit_events_module_time
    ON workbench_audit_events(module, occurred_at, id);

CREATE INDEX workbench_audit_events_entity
    ON workbench_audit_events(entity_type, entity_id, occurred_at, id);

CREATE TRIGGER workbench_audit_events_prevent_update
    BEFORE UPDATE ON workbench_audit_events
    BEGIN
      SELECT RAISE(ABORT, 'Workbench audit events are immutable');
    END;

CREATE TRIGGER workbench_audit_events_prevent_delete
    BEFORE DELETE ON workbench_audit_events
    BEGIN
      SELECT RAISE(ABORT, 'Workbench audit events are immutable');
    END;

CREATE TRIGGER workbench_hub_layout_audit_insert
        AFTER INSERT ON workbench_hub_layout
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'layout', 'created',
            'layout', NEW.singleton_id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_hub_layout_audit_update
        AFTER UPDATE ON workbench_hub_layout
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'layout', 'updated',
            'layout', NEW.singleton_id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_hub_layout_audit_delete
        AFTER DELETE ON workbench_hub_layout
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'layout', 'purged',
            'layout', OLD.singleton_id, OLD.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_tables_audit_insert
        AFTER INSERT ON workbench_task_tables
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', 'created',
            'task_table', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_tables_audit_update
        AFTER UPDATE ON workbench_task_tables
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END,
            'task_table', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_tables_audit_delete
        AFTER DELETE ON workbench_task_tables
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', 'purged',
            'task_table', OLD.id, OLD.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_fields_audit_insert
        AFTER INSERT ON workbench_task_fields
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', 'created',
            'task_field', NEW.id, NULL, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_fields_audit_update
        AFTER UPDATE ON workbench_task_fields
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END,
            'task_field', NEW.id, NULL, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_fields_audit_delete
        AFTER DELETE ON workbench_task_fields
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', 'purged',
            'task_field', OLD.id, NULL, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_records_audit_insert
        AFTER INSERT ON workbench_task_records
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', 'created',
            'task_record', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_records_audit_update
        AFTER UPDATE ON workbench_task_records
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END,
            'task_record', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_task_records_audit_delete
        AFTER DELETE ON workbench_task_records
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'tasks', 'purged',
            'task_record', OLD.id, OLD.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_attachments_audit_insert
        AFTER INSERT ON workbench_attachments
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'attachments', 'created',
            'attachment', NEW.id, NULL, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_attachments_audit_update
        AFTER UPDATE ON workbench_attachments
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'attachments', CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END,
            'attachment', NEW.id, NULL, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_attachments_audit_delete
        AFTER DELETE ON workbench_attachments
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'attachments', 'purged',
            'attachment', OLD.id, NULL, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_site_groups_audit_insert
        AFTER INSERT ON workbench_site_groups
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'sites', 'created',
            'site_group', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_site_groups_audit_update
        AFTER UPDATE ON workbench_site_groups
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'sites', CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END,
            'site_group', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_site_groups_audit_delete
        AFTER DELETE ON workbench_site_groups
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'sites', 'purged',
            'site_group', OLD.id, OLD.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_sites_audit_insert
        AFTER INSERT ON workbench_sites
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'sites', 'created',
            'site', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_sites_audit_update
        AFTER UPDATE ON workbench_sites
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'sites', CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END,
            'site', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_sites_audit_delete
        AFTER DELETE ON workbench_sites
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'sites', 'purged',
            'site', OLD.id, OLD.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_memos_audit_insert
        AFTER INSERT ON workbench_memos
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'memos', 'created',
            'memo', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_memos_audit_update
        AFTER UPDATE ON workbench_memos
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'memos', CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END,
            'memo', NEW.id, NEW.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TRIGGER workbench_memos_audit_delete
        AFTER DELETE ON workbench_memos
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), 'memos', 'purged',
            'memo', OLD.id, OLD.revision, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;

CREATE TABLE tool_event_streams (
    stream_id TEXT PRIMARY KEY,
    stream_type TEXT NOT NULL,
    current_sequence INTEGER NOT NULL CHECK (current_sequence >= 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE TABLE tool_events (
    global_position INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    stream_id TEXT NOT NULL
      REFERENCES tool_event_streams(stream_id) ON DELETE RESTRICT,
    stream_type TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    event_type TEXT NOT NULL,
    event_schema_version INTEGER NOT NULL CHECK (event_schema_version > 0),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
    payload_checksum TEXT NOT NULL CHECK (length(payload_checksum) = 64),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
    UNIQUE (stream_id, sequence)
  );

CREATE INDEX tool_events_stream_sequence
    ON tool_events(stream_id, sequence);

CREATE TRIGGER tool_events_prevent_update
    BEFORE UPDATE ON tool_events
    BEGIN
      SELECT RAISE(ABORT, 'Tool events are immutable');
    END;

CREATE TRIGGER tool_events_prevent_delete
    BEFORE DELETE ON tool_events
    BEGIN
      SELECT RAISE(ABORT, 'Tool events are immutable');
    END;

CREATE TABLE tool_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    stream_id TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE TABLE extension_package_projections (
    package_id TEXT NOT NULL,
    package_version TEXT NOT NULL,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    PRIMARY KEY (package_id, package_version)
  );

CREATE TABLE tool_definition_projections (
    definition_id TEXT NOT NULL,
    definition_version TEXT NOT NULL,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    PRIMARY KEY (definition_id, definition_version)
  );

CREATE TABLE skill_definition_projections (
    definition_id TEXT NOT NULL,
    definition_version TEXT NOT NULL,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    PRIMARY KEY (definition_id, definition_version)
  );

CREATE TRIGGER extension_package_projections_prevent_update
    BEFORE UPDATE ON extension_package_projections
    BEGIN
      SELECT RAISE(ABORT, 'Published Extension packages are immutable');
    END;

CREATE TRIGGER tool_definition_projections_prevent_update
    BEFORE UPDATE ON tool_definition_projections
    BEGIN
      SELECT RAISE(ABORT, 'Published Tool definitions are immutable');
    END;

CREATE TRIGGER skill_definition_projections_prevent_update
    BEFORE UPDATE ON skill_definition_projections
    BEGIN
      SELECT RAISE(ABORT, 'Published Skill definitions are immutable');
    END;

CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    identity TEXT NOT NULL CHECK (length(identity) = 64),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    transport_json TEXT NOT NULL CHECK (json_valid(transport_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    last_status TEXT CHECK (
      last_status IS NULL OR last_status IN ('available', 'unavailable')
    ),
    last_message TEXT,
    last_checked_at INTEGER
  );

CREATE TABLE mcp_server_credentials (
    credential_id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL
      REFERENCES mcp_servers(id) ON DELETE CASCADE,
    binding_name TEXT NOT NULL,
    encrypted_value BLOB NOT NULL,
    nonce BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    key_version INTEGER NOT NULL CHECK (key_version > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    UNIQUE (server_id, binding_name)
  );

CREATE TABLE mcp_server_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE TABLE "knowledge_sources" (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('file', 'document', 'repository')),
    locator TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (
      status IN ('registered', 'syncing', 'indexed', 'stale', 'failed', 'removed')
    ),
    sync_started_at INTEGER,
    indexed_at INTEGER,
    error_code TEXT CHECK (
      error_code IS NULL OR error_code IN (
        'source_unavailable', 'permission_denied', 'unsupported_format',
        'connector_unavailable', 'indexing_failed', 'interrupted'
      )
    ),
    error_message TEXT,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

CREATE UNIQUE INDEX knowledge_sources_active_locator
    ON knowledge_sources(workspace_id, locator)
    WHERE status <> 'removed';

CREATE INDEX knowledge_sources_workspace_order
    ON knowledge_sources(workspace_id, sort_order, id);

CREATE INDEX knowledge_sources_recovery
    ON knowledge_sources(status, updated_at, id);

CREATE TRIGGER knowledge_sources_validate_transition
    BEFORE UPDATE ON knowledge_sources
    BEGIN
      SELECT CASE
        WHEN OLD.id <> NEW.id
          OR OLD.workspace_id <> NEW.workspace_id
          OR OLD.type <> NEW.type
          OR OLD.locator <> NEW.locator
          OR OLD.created_at <> NEW.created_at
        THEN RAISE(ABORT, 'Knowledge source identity is immutable')
      END;
      SELECT CASE
        WHEN NOT (
          (OLD.status = 'registered' AND NEW.status IN ('syncing', 'removed'))
          OR (OLD.status = 'syncing' AND NEW.status IN ('indexed', 'failed', 'removed'))
          OR (OLD.status = 'indexed' AND NEW.status IN ('syncing', 'stale', 'removed'))
          OR (OLD.status = 'stale' AND NEW.status IN ('syncing', 'removed'))
          OR (OLD.status = 'failed' AND NEW.status IN ('syncing', 'removed'))
        )
        THEN RAISE(ABORT, 'Invalid knowledge source transition')
      END;
      SELECT CASE
        WHEN NEW.revision <> OLD.revision + 1
        THEN RAISE(ABORT, 'Knowledge source revision must increment')
      END;
    END;

CREATE TRIGGER knowledge_sources_prevent_delete
    BEFORE DELETE ON knowledge_sources
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge sources are retained');
    END;

CREATE TRIGGER knowledge_sources_create_refresh_policy
    AFTER INSERT ON knowledge_sources
    WHEN NEW.status <> 'removed'
    BEGIN
      INSERT INTO knowledge_refresh_policies (
        source_id, enabled, preset, cron_expression, time_zone, revision,
        created_at, updated_at
      ) VALUES (
        NEW.id,
        1,
        CASE WHEN NEW.type = 'document' THEN '30m' ELSE '5m' END,
        CASE
          WHEN NEW.type = 'document' THEN '*/30 * * * *'
          ELSE '*/5 * * * *'
        END,
        'UTC',
        1,
        NEW.created_at,
        NEW.updated_at
      );
      INSERT INTO knowledge_refresh_cursors (
        source_id, policy_revision, next_due_at, missed_due_at,
        last_checked_at, last_changed_at, updated_at
      ) VALUES (NEW.id, 1, 0, NULL, NULL, NULL, NEW.updated_at);
    END;

CREATE TRIGGER knowledge_sources_cancel_refresh_on_remove
    AFTER UPDATE OF status ON knowledge_sources
    WHEN NEW.status = 'removed' AND OLD.status <> 'removed'
    BEGIN
      UPDATE knowledge_refresh_policies
      SET enabled = 0,
          preset = 'manual',
          revision = revision + 1,
          updated_at = NEW.updated_at
      WHERE source_id = NEW.id;

      UPDATE knowledge_refresh_cursors
      SET policy_revision = (
            SELECT revision
            FROM knowledge_refresh_policies
            WHERE source_id = NEW.id
          ),
          next_due_at = 0,
          missed_due_at = NULL,
          updated_at = NEW.updated_at
      WHERE source_id = NEW.id;

      UPDATE knowledge_refresh_runs
      SET status = 'interrupted',
          next_attempt_at = NULL,
          error_code = 'interrupted',
          completed_at = NEW.updated_at
      WHERE source_id = NEW.id
        AND status IN ('running', 'retry_wait');
    END;

CREATE TABLE "repository_sources" (
    source_id TEXT PRIMARY KEY
      REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    workspace_id TEXT NOT NULL
      REFERENCES workspaces(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('local', 'remote')),
    local_path TEXT,
    connector_id TEXT REFERENCES connectors(id) ON DELETE RESTRICT,
    path TEXT,
    managed_relative_path TEXT,
    locator TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
    revision_label TEXT,
    file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
    total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
    last_scanned_at INTEGER CHECK (
      last_scanned_at IS NULL OR last_scanned_at >= 0
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    selected_branch TEXT,
    CHECK (
      (
        mode = 'local'
        AND local_path IS NOT NULL
        AND connector_id IS NULL
        AND path IS NULL
        AND managed_relative_path IS NULL
      )
      OR
      (
        mode = 'remote'
        AND local_path IS NULL
        AND connector_id IS NOT NULL
        AND path IS NOT NULL
        AND managed_relative_path IS NOT NULL
      )
    )
  );

CREATE INDEX repository_sources_workspace
    ON repository_sources(workspace_id, source_id);

CREATE INDEX repository_sources_local_identity
    ON repository_sources(workspace_id, local_path)
    WHERE mode = 'local';

CREATE INDEX repository_sources_remote_identity
    ON repository_sources(workspace_id, connector_id, path)
    WHERE mode = 'remote';

CREATE TABLE assistant_run_events (
    event_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    assistant_message_id TEXT NOT NULL
      REFERENCES chat_messages(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    event_type TEXT NOT NULL,
    event_timestamp INTEGER NOT NULL CHECK (event_timestamp >= 0),
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    UNIQUE (run_id, sequence)
  );

CREATE INDEX assistant_run_events_run_sequence
    ON assistant_run_events(run_id, sequence);

CREATE TRIGGER assistant_run_events_prevent_update
    BEFORE UPDATE ON assistant_run_events
    BEGIN
      SELECT RAISE(ABORT, 'Assistant Run events are immutable');
    END;

CREATE TABLE assistant_turn_projections (
    run_id TEXT PRIMARY KEY,
    assistant_message_id TEXT NOT NULL
      REFERENCES chat_messages(id) ON DELETE CASCADE,
    last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
    projection_json TEXT NOT NULL CHECK (
      json_valid(projection_json) AND
      json_extract(projection_json, '$.schemaVersion') = 2
    ),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );

CREATE TABLE capability_definitions (
    capability_id TEXT NOT NULL,
    capability_version TEXT NOT NULL,
    capability_kind TEXT NOT NULL CHECK (
      capability_kind IN ('tool', 'skill', 'agent', 'connector')
    ),
    definition_digest TEXT NOT NULL CHECK (length(definition_digest) = 64),
    definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
    published_at INTEGER NOT NULL CHECK (published_at >= 0),
    PRIMARY KEY (capability_id, capability_version)
  );

CREATE TRIGGER capability_definitions_prevent_update
    BEFORE UPDATE ON capability_definitions
    BEGIN
      SELECT RAISE(ABORT, 'Published Capability definitions are immutable');
    END;

CREATE TABLE capability_installations (
    installation_id TEXT PRIMARY KEY,
    capability_id TEXT NOT NULL,
    capability_version TEXT NOT NULL,
    capability_digest TEXT NOT NULL CHECK (length(capability_digest) = 64),
    scope_kind TEXT NOT NULL CHECK (
      scope_kind IN ('global', 'work-root', 'folder', 'workspace', 'requirement')
    ),
    scope_key TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    lifecycle_status TEXT NOT NULL CHECK (
      lifecycle_status IN (
        'draft', 'validating', 'awaiting_approval', 'installed_disabled',
        'enabled', 'superseded', 'quarantined'
      )
    ),
    installation_json TEXT NOT NULL CHECK (json_valid(installation_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    installed_at INTEGER NOT NULL CHECK (installed_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= installed_at),
    FOREIGN KEY (capability_id, capability_version)
      REFERENCES capability_definitions(capability_id, capability_version)
      ON DELETE RESTRICT,
    UNIQUE (capability_id, scope_kind, scope_key)
  );

CREATE INDEX capability_installations_scope
    ON capability_installations(scope_kind, scope_key, capability_id);

CREATE TABLE capability_references (
    capability_id TEXT NOT NULL,
    capability_version TEXT NOT NULL,
    owner_kind TEXT NOT NULL CHECK (
      owner_kind IN ('profile', 'conversation', 'workflow', 'schedule', 'run')
    ),
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    FOREIGN KEY (capability_id, capability_version)
      REFERENCES capability_definitions(capability_id, capability_version)
      ON DELETE RESTRICT,
    PRIMARY KEY (
      capability_id, capability_version, owner_kind, owner_id
    )
  );

CREATE TABLE capability_catalog_audit (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    capability_id TEXT NOT NULL,
    capability_version TEXT NOT NULL,
    event_type TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE TRIGGER capability_catalog_audit_prevent_update
    BEFORE UPDATE ON capability_catalog_audit
    BEGIN
      SELECT RAISE(ABORT, 'Capability Catalog audit is append-only');
    END;

CREATE TRIGGER capability_catalog_audit_prevent_delete
    BEFORE DELETE ON capability_catalog_audit
    BEGIN
      SELECT RAISE(ABORT, 'Capability Catalog audit is append-only');
    END;

CREATE TABLE capability_package_bindings (
    capability_id TEXT NOT NULL,
    capability_version TEXT NOT NULL,
    package_digest TEXT NOT NULL CHECK (length(package_digest) = 64),
    FOREIGN KEY (capability_id, capability_version)
      REFERENCES capability_definitions(capability_id, capability_version)
      ON DELETE RESTRICT,
    PRIMARY KEY (capability_id, capability_version)
  );

CREATE INDEX capability_package_bindings_digest
    ON capability_package_bindings(package_digest);

CREATE TABLE conversation_attachment_blobs (
    checksum_sha256 TEXT PRIMARY KEY CHECK (length(checksum_sha256) = 64),
    relative_path TEXT NOT NULL UNIQUE,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    created_at INTEGER NOT NULL
  );

CREATE TABLE conversation_attachments (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('draft', 'message')),
    owner_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'document')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    checksum_sha256 TEXT NOT NULL
      REFERENCES conversation_attachment_blobs(checksum_sha256),
    source TEXT NOT NULL CHECK (source IN ('picker', 'paste', 'drop')),
    status TEXT NOT NULL CHECK (status IN ('registered', 'ready', 'failed')),
    error_code TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    CHECK (
      (status = 'failed' AND error_code IS NOT NULL AND error_message IS NOT NULL)
      OR (status != 'failed' AND error_code IS NULL AND error_message IS NULL)
    )
  );

CREATE INDEX conversation_attachments_owner
    ON conversation_attachments(
      owner_type, owner_id, deleted_at, created_at, id
    );

CREATE TABLE capability_generation_sessions (
    session_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN (
        'draft', 'validating', 'awaiting_approval',
        'installed', 'cancelled', 'failed'
      )
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    session_json TEXT NOT NULL CHECK (
      json_valid(session_json) AND
      json_extract(session_json, '$.spec.schemaVersion') = 1
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE INDEX capability_generation_sessions_recoverable
    ON capability_generation_sessions(status, updated_at, session_id);

CREATE TABLE agent_runtime_runs (
    id TEXT PRIMARY KEY,
    provider_run_id TEXT UNIQUE,
    scenario_id TEXT NOT NULL CHECK (scenario_id IN (
      'general', 'folder', 'space', 'requirement-node', 'workflow-node',
      'scheduled', 'sensitive', 'management'
    )),
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN (
      'preparing', 'running', 'waiting_permission', 'waiting_input',
      'retrying', 'paused', 'recovery_blocked',
      'completed', 'failed', 'cancelled'
    )),
    snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
    error TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    root_run_id TEXT GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.rootRunId')
    ) VIRTUAL,
    parent_run_id TEXT GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.parentRunId')
    ) VIRTUAL,
    delegation_depth INTEGER GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.delegationDepth')
    ) VIRTUAL,
    delegation_ordinal INTEGER GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.delegationOrdinal')
    ) VIRTUAL
  );

CREATE INDEX agent_runtime_runs_status_updated
    ON agent_runtime_runs(lifecycle_status, updated_at, id);

CREATE INDEX agent_runtime_runs_root
    ON agent_runtime_runs(
      root_run_id, delegation_depth, delegation_ordinal, created_at, id
    );

CREATE INDEX agent_runtime_runs_parent
    ON agent_runtime_runs(
      parent_run_id, delegation_ordinal, created_at, id
    );

CREATE TRIGGER agent_runtime_runs_snapshot_immutable
    BEFORE UPDATE OF scenario_id, snapshot_json, created_at
    ON agent_runtime_runs
    BEGIN
      SELECT RAISE(ABORT, 'Agent Run snapshot is immutable');
    END;

CREATE TABLE agent_run_attempts (
    run_id TEXT NOT NULL
      REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal > 0),
    provider_run_id TEXT NOT NULL UNIQUE,
    resume_token TEXT UNIQUE CHECK (
      resume_token IS NULL OR length(resume_token) = 64
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY (run_id, attempt_ordinal)
  );

CREATE INDEX agent_run_attempts_latest
    ON agent_run_attempts(run_id, attempt_ordinal DESC);

CREATE TRIGGER agent_run_attempts_prevent_update
    BEFORE UPDATE ON agent_run_attempts
    BEGIN
      SELECT RAISE(ABORT, 'Agent Run attempts are immutable');
    END;

CREATE TRIGGER agent_run_attempts_prevent_delete
    BEFORE DELETE ON agent_run_attempts
    BEGIN
      SELECT RAISE(ABORT, 'Agent Run attempts are immutable');
    END;

CREATE TABLE runtime_evaluation_runs (
    evaluation_id TEXT PRIMARY KEY,
    suite_version TEXT NOT NULL,
    candidate_digest TEXT NOT NULL CHECK (length(candidate_digest) = 64),
    reproducibility_digest TEXT NOT NULL CHECK (
      length(reproducibility_digest) = 64
    ),
    overall_score REAL NOT NULL CHECK (
      overall_score >= 0 AND overall_score <= 100
    ),
    evaluation_json TEXT NOT NULL CHECK (json_valid(evaluation_json)),
    completed_at INTEGER NOT NULL CHECK (completed_at >= 0)
  );

CREATE INDEX runtime_evaluation_runs_completed
    ON runtime_evaluation_runs(completed_at DESC, evaluation_id);

CREATE TRIGGER runtime_evaluation_runs_prevent_update
    BEFORE UPDATE ON runtime_evaluation_runs
    BEGIN
      SELECT RAISE(ABORT, 'Runtime evaluation runs are immutable');
    END;

CREATE TRIGGER runtime_evaluation_runs_prevent_delete
    BEFORE DELETE ON runtime_evaluation_runs
    BEGIN
      SELECT RAISE(ABORT, 'Runtime evaluation runs are immutable');
    END;

CREATE TABLE runtime_governance_revisions (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    revision INTEGER NOT NULL CHECK (revision > 0),
    candidate_digest TEXT CHECK (
      candidate_digest IS NULL OR length(candidate_digest) = 64
    ),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );

CREATE TABLE runtime_governance_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL CHECK (event_type IN (
      'evaluation.completed', 'release.blocked', 'release.published',
      'diagnostic.exported'
    )),
    evaluation_id TEXT REFERENCES runtime_evaluation_runs(evaluation_id)
      ON DELETE RESTRICT,
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_json TEXT NOT NULL CHECK (json_valid(event_json)),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX runtime_governance_events_occurred
    ON runtime_governance_events(occurred_at DESC, sequence DESC);

CREATE TRIGGER runtime_governance_events_prevent_update
    BEFORE UPDATE ON runtime_governance_events
    BEGIN
      SELECT RAISE(ABORT, 'Runtime governance events are append-only');
    END;

CREATE TRIGGER runtime_governance_events_prevent_delete
    BEFORE DELETE ON runtime_governance_events
    BEGIN
      SELECT RAISE(ABORT, 'Runtime governance events are append-only');
    END;

CREATE TABLE agent_profile_publications (
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('user', 'workspace')),
    scenario_id TEXT NOT NULL CHECK (scenario_id IN (
      'general', 'folder', 'space', 'requirement-node', 'workflow-node',
      'scheduled', 'sensitive', 'management'
    )),
    workspace_id TEXT,
    profile_digest TEXT NOT NULL CHECK (length(profile_digest) = 64),
    profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
    published_at INTEGER NOT NULL CHECK (published_at >= 0),
    PRIMARY KEY (profile_id, profile_version),
    CHECK (
      (source = 'user' AND workspace_id IS NULL) OR
      (source = 'workspace' AND length(workspace_id) > 0)
    )
  );

CREATE INDEX agent_profile_publications_resolution
    ON agent_profile_publications(
      scenario_id, source, workspace_id, published_at DESC,
      profile_version DESC, profile_id
    );

CREATE TRIGGER agent_profile_publications_prevent_update
    BEFORE UPDATE ON agent_profile_publications
    BEGIN
      SELECT RAISE(ABORT, 'Agent Profile publications are immutable');
    END;

CREATE TRIGGER agent_profile_publications_prevent_delete
    BEFORE DELETE ON agent_profile_publications
    BEGIN
      SELECT RAISE(ABORT, 'Agent Profile publications are immutable');
    END;

CREATE TABLE runtime_observability_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    retention_days INTEGER NOT NULL CHECK (
      retention_days BETWEEN 1 AND 3650
    ),
    maximum_events INTEGER NOT NULL CHECK (
      maximum_events BETWEEN 1 AND 10000000
    ),
    dropped_events INTEGER NOT NULL DEFAULT 0 CHECK (dropped_events >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );

CREATE TABLE conversation_attachment_chunks (
    chunk_id TEXT PRIMARY KEY,
    attachment_id TEXT NOT NULL
      REFERENCES conversation_attachments(id) ON DELETE CASCADE,
    start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
    end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
    digest TEXT NOT NULL CHECK (length(digest) = 64),
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    UNIQUE (attachment_id, start_offset, end_offset)
  );

CREATE INDEX conversation_attachment_chunks_attachment
    ON conversation_attachment_chunks(attachment_id, start_offset);

CREATE TABLE assistant_run_event_retention_deletions (
    event_id TEXT PRIMARY KEY
  );

CREATE TRIGGER assistant_run_events_prevent_delete
    BEFORE DELETE ON assistant_run_events
    WHEN EXISTS (
      SELECT 1 FROM chat_messages WHERE id = OLD.assistant_message_id
    ) AND NOT EXISTS (
      SELECT 1 FROM assistant_run_event_retention_deletions
      WHERE event_id = OLD.event_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Assistant Run events are immutable');
    END;

CREATE TABLE assistant_follow_up_suggestion_sets (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL
      REFERENCES chat_sessions(id) ON DELETE CASCADE,
    assistant_message_id TEXT NOT NULL
      REFERENCES chat_messages(id) ON DELETE CASCADE,
    source_run_id TEXT NOT NULL,
    source_digest TEXT NOT NULL,
    response_locale TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('generating', 'ready', 'failed', 'superseded')
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    UNIQUE (assistant_message_id, source_digest)
  );

CREATE INDEX assistant_follow_up_suggestion_sets_conversation
    ON assistant_follow_up_suggestion_sets(
      conversation_id, updated_at DESC, id
    );

CREATE TABLE assistant_follow_up_suggestions (
    id TEXT PRIMARY KEY,
    suggestion_set_id TEXT NOT NULL
      REFERENCES assistant_follow_up_suggestion_sets(id) ON DELETE CASCADE,
    label TEXT NOT NULL CHECK (length(trim(label)) > 0),
    prompt TEXT NOT NULL CHECK (length(trim(prompt)) > 0),
    intent TEXT NOT NULL CHECK (
      intent IN ('continue', 'refine', 'verify', 'explain', 'open_artifact')
    ),
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    UNIQUE (suggestion_set_id, sort_order)
  );

CREATE TABLE document_delivery_operations (
    request_id TEXT PRIMARY KEY,
    idempotency_fingerprint TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (
      operation IN ('create', 'export_pdf', 'verify')
    ),
    input_json TEXT NOT NULL,
    scope_root TEXT NOT NULL,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
    node_run_id TEXT REFERENCES node_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('requested', 'running')),
    requested_at INTEGER NOT NULL,
    started_at INTEGER,
    updated_at INTEGER NOT NULL
  );

CREATE INDEX document_delivery_operations_status
    ON document_delivery_operations(status, requested_at, request_id);

CREATE TABLE document_delivery_receipts (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    idempotency_fingerprint TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (
      operation IN ('create', 'export_pdf', 'verify')
    ),
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
    scope_root TEXT NOT NULL,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
    node_run_id TEXT REFERENCES node_runs(id) ON DELETE CASCADE,
    artifact_path TEXT,
    artifact_format TEXT CHECK (
      artifact_format IS NULL OR artifact_format IN ('docx', 'pdf')
    ),
    artifact_checksum TEXT,
    artifact_byte_size INTEGER CHECK (
      artifact_byte_size IS NULL OR artifact_byte_size > 0
    ),
    artifact_page_count INTEGER CHECK (
      artifact_page_count IS NULL OR artifact_page_count > 0
    ),
    verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    error_code TEXT,
    message TEXT,
    completed_at INTEGER NOT NULL,
    receipt_json TEXT NOT NULL,
    CHECK (
      (status = 'succeeded' AND artifact_path IS NOT NULL
        AND artifact_format IS NOT NULL AND artifact_checksum IS NOT NULL
        AND artifact_byte_size IS NOT NULL AND error_code IS NULL
        AND message IS NULL)
      OR
      (status = 'failed' AND artifact_path IS NULL
        AND artifact_format IS NULL AND artifact_checksum IS NULL
        AND artifact_byte_size IS NULL AND verified = 0
        AND error_code IS NOT NULL AND message IS NOT NULL)
    ),
    CHECK (verified = 0 OR (status = 'succeeded' AND operation = 'verify'))
  );

CREATE INDEX document_delivery_receipts_artifact
    ON document_delivery_receipts(
      requirement_id, node_run_id, artifact_path, completed_at
    );

CREATE INDEX artifacts_verification_receipt
    ON artifacts(verification_receipt_id)
    WHERE verification_receipt_id IS NOT NULL;

CREATE TABLE browser_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'closed', 'interrupted')),
    revision INTEGER NOT NULL CHECK (revision >= 1),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    execution_id TEXT NOT NULL
  );

CREATE UNIQUE INDEX browser_one_active_profile
    ON browser_sessions(profile_id) WHERE status = 'active';

CREATE INDEX browser_sessions_owner ON browser_sessions(owner_key);

CREATE TABLE browser_session_events (
    session_id TEXT NOT NULL REFERENCES browser_sessions(id),
    revision INTEGER NOT NULL,
    status TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, revision)
  );

CREATE TABLE web_provider_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL CHECK (revision > 0),
    configuration_json TEXT NOT NULL
  );

CREATE TABLE web_provider_credentials (
    handle TEXT PRIMARY KEY,
    encrypted_value BLOB NOT NULL,
    nonce BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    key_version INTEGER NOT NULL
  );

CREATE TABLE web_provider_events (
    request_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL UNIQUE,
    fingerprint TEXT NOT NULL,
    configuration_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL
  );

CREATE TABLE agent_runtime_state (
    run_id TEXT PRIMARY KEY REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    state_json TEXT NOT NULL CHECK (json_valid(state_json)),
    updated_at INTEGER NOT NULL
  );

CREATE TABLE agent_runtime_commands (
    run_id TEXT NOT NULL REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    PRIMARY KEY (run_id, request_id)
  );

CREATE TABLE agent_runtime_state_events (
    run_id TEXT NOT NULL REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, revision),
    UNIQUE (run_id, request_id)
  );

CREATE TABLE agent_runtime_budget_receipts (
    run_id TEXT NOT NULL REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('consume', 'reserve')),
    PRIMARY KEY (run_id, request_id)
  );

CREATE TABLE agent_runtime_budget_allocations (
    child_run_id TEXT PRIMARY KEY,
    parent_run_id TEXT NOT NULL REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    root_run_id TEXT NOT NULL REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    tool_calls INTEGER NOT NULL CHECK (tool_calls > 0),
    FOREIGN KEY (parent_run_id, request_id)
      REFERENCES agent_runtime_budget_receipts(run_id, request_id) ON DELETE CASCADE
  );

CREATE INDEX agent_runtime_budget_root ON agent_runtime_budget_allocations(root_run_id);

CREATE TABLE agent_runtime_budget_events (
    run_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, request_id),
    FOREIGN KEY (run_id, request_id)
      REFERENCES agent_runtime_budget_receipts(run_id, request_id) ON DELETE CASCADE
  );

CREATE TABLE agent_delegation_requests (
    parent_run_id TEXT NOT NULL REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    PRIMARY KEY (parent_run_id, request_id)
  );

CREATE TABLE agent_delegations (
    run_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    parent_run_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('registered', 'running', 'completed', 'failed', 'cancelled')),
    record_json TEXT NOT NULL CHECK (json_valid(record_json)),
    FOREIGN KEY (parent_run_id, request_id)
      REFERENCES agent_delegation_requests(parent_run_id, request_id) ON DELETE CASCADE
  );

CREATE INDEX agent_delegations_parent ON agent_delegations(parent_run_id);

CREATE TABLE agent_delegation_events (
    run_id TEXT NOT NULL REFERENCES agent_delegations(run_id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, status)
  );

CREATE TABLE conversation_generated_artifact_runs (
        run_id TEXT PRIMARY KEY REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL CHECK (json_valid(state_json))
      );

CREATE TABLE skill_sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (
      kind IN ('builtin', 'workspace', 'user_global', 'plugin', 'generated')
    ),
    display_name TEXT NOT NULL,
    locator TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    last_scanned_at INTEGER NOT NULL CHECK (last_scanned_at >= 0)
  );

CREATE TABLE skill_registry_versions (
    skill_id TEXT NOT NULL,
    version TEXT NOT NULL,
    digest TEXT NOT NULL CHECK (
      length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*'
    ),
    source_id TEXT NOT NULL REFERENCES skill_sources(id) ON DELETE RESTRICT,
    definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
    instructions_digest TEXT NOT NULL CHECK (
      length(instructions_digest) = 64
      AND instructions_digest NOT GLOB '*[^0-9a-f]*'
    ),
    instructions_text TEXT NOT NULL,
    boundary_notes TEXT NOT NULL,
    risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
    discovered_at INTEGER NOT NULL CHECK (discovered_at >= 0),
    PRIMARY KEY (skill_id, version, digest)
  );

CREATE INDEX skill_registry_versions_source
    ON skill_registry_versions(source_id, skill_id, version);

CREATE TABLE skill_source_entries (
    source_id TEXT NOT NULL REFERENCES skill_sources(id) ON DELETE RESTRICT,
    skill_id TEXT NOT NULL,
    version TEXT NOT NULL,
    digest TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= 0),
    PRIMARY KEY (source_id, skill_id, version, digest),
    FOREIGN KEY (skill_id, version, digest)
      REFERENCES skill_registry_versions(skill_id, version, digest)
      ON DELETE RESTRICT
  );

CREATE TABLE skill_reviews (
    skill_id TEXT NOT NULL,
    version TEXT NOT NULL,
    digest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    reviewed_at INTEGER NOT NULL CHECK (reviewed_at >= 0),
    PRIMARY KEY (skill_id, version, digest),
    FOREIGN KEY (skill_id, version, digest)
      REFERENCES skill_registry_versions(skill_id, version, digest)
      ON DELETE RESTRICT
  );

CREATE TABLE skill_activation_preferences (
    skill_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    digest TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    FOREIGN KEY (skill_id, version, digest)
      REFERENCES skill_registry_versions(skill_id, version, digest)
      ON DELETE RESTRICT
  );

CREATE TABLE skill_registry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT,
    skill_id TEXT NOT NULL,
    version TEXT NOT NULL,
    digest TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (
      operation IN ('published', 'reviewed', 'activated', 'deactivated')
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX skill_registry_events_skill
    ON skill_registry_events(skill_id, occurred_at, id);

CREATE TABLE skill_registry_commands (
    request_id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE TRIGGER skill_registry_versions_prevent_update
    BEFORE UPDATE ON skill_registry_versions
    BEGIN
      SELECT RAISE(ABORT, 'Skill registry versions are immutable');
    END;

CREATE TRIGGER skill_registry_versions_prevent_delete
    BEFORE DELETE ON skill_registry_versions
    BEGIN
      SELECT RAISE(ABORT, 'Skill registry versions are retained');
    END;

CREATE TRIGGER skill_registry_events_prevent_update
    BEFORE UPDATE ON skill_registry_events
    BEGIN
      SELECT RAISE(ABORT, 'Skill registry events are immutable');
    END;

CREATE TRIGGER skill_registry_events_prevent_delete
    BEFORE DELETE ON skill_registry_events
    BEGIN
      SELECT RAISE(ABORT, 'Skill registry events are immutable');
    END;

CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    missed_run_policy TEXT NOT NULL CHECK (
      missed_run_policy IN ('skip', 'run_once')
    ),
    status TEXT NOT NULL CHECK (status IN ('active', 'paused')),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    model_profile_id TEXT NOT NULL
      REFERENCES model_profiles(id) ON DELETE RESTRICT,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('tool', 'skill')),
    target_definition_id TEXT NOT NULL,
    target_definition_version TEXT NOT NULL,
    target_definition_digest TEXT NOT NULL CHECK (
      length(target_definition_digest) = 64
    ),
    skill_input_json TEXT NOT NULL CHECK (json_valid(skill_input_json)),
    connector_bindings_json TEXT NOT NULL CHECK (
      json_valid(connector_bindings_json)
    ),
    permissions_json TEXT NOT NULL CHECK (json_valid(permissions_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    last_run_at INTEGER,
    last_run_status TEXT CHECK (
      last_run_status IS NULL OR last_run_status IN (
        'succeeded', 'failed', 'cancelled', 'interrupted'
      )
    )
  , approval_profile_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"id":"protected","policyVersion":"1.0.0","digest":"42fff4157af1bdecd796d356da126b1df9d035800bcc844ea30493be70ecb8e4"}' CHECK(json_valid(approval_profile_json)));

CREATE INDEX schedules_status_updated
    ON schedules(status, updated_at DESC, id);

CREATE TABLE schedule_runs (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    schedule_revision INTEGER NOT NULL CHECK (schedule_revision > 0),
    schedule_name TEXT NOT NULL,
    trigger_source TEXT NOT NULL CHECK (
      trigger_source IN ('manual', 'cron')
    ),
    status TEXT NOT NULL CHECK (
      status IN (
        'running', 'waiting_permission', 'succeeded', 'failed', 'cancelled', 'interrupted'
      )
    ),
    tool_execution_id TEXT,
    error_code TEXT,
    error_message TEXT,
    scheduled_for INTEGER CHECK (
      scheduled_for IS NULL OR scheduled_for >= 0
    ),
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    finished_at INTEGER CHECK (
      finished_at IS NULL OR finished_at >= started_at
    ),
    revision INTEGER NOT NULL CHECK (revision > 0), approval_profile_json TEXT CHECK(approval_profile_json IS NULL OR json_valid(approval_profile_json)), permission_request_id TEXT, provider_run_id TEXT,
    CHECK (
      (status IN ('running', 'waiting_permission') AND finished_at IS NULL)
      OR (status NOT IN ('running', 'waiting_permission') AND finished_at IS NOT NULL)
    ),
    CHECK (
      (trigger_source = 'cron' AND scheduled_for IS NOT NULL)
      OR (trigger_source = 'manual' AND scheduled_for IS NULL)
    )
  );

CREATE INDEX schedule_runs_schedule_time
    ON schedule_runs(schedule_id, started_at DESC, id);

CREATE INDEX schedule_runs_status
    ON schedule_runs(status, started_at, id);

CREATE UNIQUE INDEX schedule_runs_cron_slot_unique
    ON schedule_runs(schedule_id, schedule_revision, scheduled_for)
    WHERE trigger_source = 'cron';

CREATE TABLE schedule_events (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    schedule_run_id TEXT,
    operation TEXT NOT NULL CHECK (
      operation IN (
        'created', 'updated', 'paused', 'resumed', 'run_started',
        'run_succeeded', 'run_failed', 'run_cancelled',
        'run_interrupted', 'run_waiting_permission', 'deleted'
      )
    ),
    schedule_revision INTEGER NOT NULL CHECK (schedule_revision > 0),
    detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );

CREATE INDEX schedule_events_schedule_time
    ON schedule_events(schedule_id, occurred_at, id);

CREATE TRIGGER schedule_events_prevent_update
    BEFORE UPDATE ON schedule_events
    BEGIN
      SELECT RAISE(ABORT, 'Schedule events are immutable');
    END;

CREATE TRIGGER schedule_events_prevent_delete
    BEFORE DELETE ON schedule_events
    BEGIN
      SELECT RAISE(ABORT, 'Schedule events are immutable');
    END;

CREATE TABLE schedule_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE TABLE schedule_trigger_cursors (
    schedule_id TEXT PRIMARY KEY
      REFERENCES schedules(id) ON DELETE CASCADE,
    schedule_revision INTEGER NOT NULL CHECK (schedule_revision > 0),
    next_due_at INTEGER NOT NULL CHECK (next_due_at >= 0),
    missed_due_at INTEGER CHECK (
      missed_due_at IS NULL OR missed_due_at >= 0
    ),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );

CREATE INDEX schedule_trigger_cursors_due
    ON schedule_trigger_cursors(next_due_at, schedule_id);

CREATE TABLE schedule_recovery_decisions (
    schedule_id TEXT NOT NULL,
    schedule_revision INTEGER NOT NULL CHECK (schedule_revision > 0),
    missed_due_at INTEGER NOT NULL CHECK (missed_due_at >= 0),
    policy TEXT NOT NULL CHECK (policy IN ('skip', 'run_once')),
    action TEXT NOT NULL CHECK (action IN ('skipped', 'run_once')),
    run_id TEXT REFERENCES schedule_runs(id) ON DELETE RESTRICT,
    decided_at INTEGER NOT NULL CHECK (decided_at >= 0),
    PRIMARY KEY (schedule_id, schedule_revision, missed_due_at)
  );

CREATE INDEX schedule_recovery_decisions_latest
    ON schedule_recovery_decisions(
      schedule_id, decided_at DESC, missed_due_at DESC
    );

CREATE TRIGGER schedule_recovery_decisions_prevent_update
    BEFORE UPDATE ON schedule_recovery_decisions
    BEGIN
      SELECT RAISE(ABORT, 'Schedule recovery decisions are immutable');
    END;

CREATE TRIGGER schedule_recovery_decisions_prevent_delete
    BEFORE DELETE ON schedule_recovery_decisions
    BEGIN
      SELECT RAISE(ABORT, 'Schedule recovery decisions are immutable');
    END;

CREATE TABLE conversation_turn_context_routes (
    source_message_id TEXT PRIMARY KEY
      REFERENCES chat_messages(id) ON DELETE CASCADE,
    policy_version TEXT NOT NULL,
    source_digest TEXT NOT NULL,
    relation TEXT NOT NULL CHECK (
      relation IN ('fresh', 'continuation', 'reference')
    ),
    predecessor_message_id TEXT
      REFERENCES chat_messages(id) ON DELETE RESTRICT,
    selected_message_ids_json TEXT NOT NULL CHECK (
      json_valid(selected_message_ids_json) AND
      json_type(selected_message_ids_json) = 'array'
    ),
    excluded_message_ids_json TEXT NOT NULL CHECK (
      json_valid(excluded_message_ids_json) AND
      json_type(excluded_message_ids_json) = 'array'
    ),
    reasons_json TEXT NOT NULL CHECK (
      json_valid(reasons_json) AND json_type(reasons_json) = 'array'
    ),
    confidence REAL NOT NULL CHECK (
      confidence >= 0 AND confidence <= 1
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE INDEX conversation_turn_context_routes_relation_created
    ON conversation_turn_context_routes(relation, created_at DESC);

CREATE TRIGGER conversation_turn_context_routes_prevent_update
    BEFORE UPDATE ON conversation_turn_context_routes
    BEGIN
      SELECT RAISE(ABORT, 'Conversation turn context routes are immutable');
    END;

CREATE TABLE conversation_context_projections (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL
      REFERENCES chat_sessions(id) ON DELETE CASCADE,
    source_message_id TEXT NOT NULL UNIQUE
      REFERENCES conversation_turn_context_routes(source_message_id)
      ON DELETE CASCADE,
    route_policy_version TEXT NOT NULL,
    projection_policy_version TEXT NOT NULL,
    projection_json TEXT NOT NULL CHECK (
      json_valid(projection_json) AND
      json_extract(projection_json, '$.schemaVersion') = 1
    ),
    character_count INTEGER NOT NULL CHECK (character_count >= 0),
    estimated_tokens INTEGER NOT NULL CHECK (estimated_tokens >= 0),
    digest TEXT NOT NULL CHECK (length(digest) = 64),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

CREATE INDEX conversation_context_projections_conversation_created
    ON conversation_context_projections(conversation_id, created_at DESC);

CREATE TRIGGER conversation_context_projections_prevent_update
    BEFORE UPDATE ON conversation_context_projections
    BEGIN
      SELECT RAISE(ABORT, 'Conversation context projections are immutable');
    END;

CREATE VIRTUAL TABLE chat_messages_fts USING fts5(
    message_id UNINDEXED,
    session_id UNINDEXED,
    role UNINDEXED,
    content,
    tokenize = 'unicode61'
  );

CREATE TRIGGER chat_messages_fts_after_insert
    AFTER INSERT ON chat_messages
    WHEN NEW.status = 'completed'
      AND NEW.role IN ('user', 'assistant')
      AND length(trim(NEW.content)) > 0
    BEGIN
      INSERT INTO chat_messages_fts(
        message_id, session_id, role, content
      ) VALUES (NEW.id, NEW.session_id, NEW.role, NEW.content);
    END;

CREATE TRIGGER chat_messages_fts_after_update
    AFTER UPDATE OF status, role, content, session_id ON chat_messages
    BEGIN
      DELETE FROM chat_messages_fts WHERE message_id = OLD.id;
      INSERT INTO chat_messages_fts(
        message_id, session_id, role, content
      )
      SELECT NEW.id, NEW.session_id, NEW.role, NEW.content
      WHERE NEW.status = 'completed'
        AND NEW.role IN ('user', 'assistant')
        AND length(trim(NEW.content)) > 0;
    END;

CREATE TRIGGER chat_messages_fts_after_delete
    AFTER DELETE ON chat_messages
    BEGIN
      DELETE FROM chat_messages_fts WHERE message_id = OLD.id;
    END;

CREATE TABLE conversation_memory_entries (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (
      scope IN ('conversation', 'workspace', 'requirement', 'global_user')
    ),
    scope_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (
      kind IN ('fact', 'preference', 'decision', 'constraint', 'outcome')
    ),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    source_message_ids_json TEXT NOT NULL CHECK (
      json_valid(source_message_ids_json) AND
      json_type(source_message_ids_json) = 'array'
    ),
    source_digest TEXT NOT NULL,
    importance REAL NOT NULL CHECK (importance >= 0 AND importance <= 1),
    valid_from INTEGER NOT NULL CHECK (valid_from >= 0),
    expires_at INTEGER CHECK (
      expires_at IS NULL OR expires_at > valid_from
    ),
    superseded_by TEXT
      REFERENCES conversation_memory_entries(id) ON DELETE RESTRICT,
    trust TEXT NOT NULL CHECK (
      trust IN ('user_confirmed', 'system_observed', 'model_summary')
    )
  );

CREATE INDEX conversation_memory_entries_scope_validity
    ON conversation_memory_entries(
      scope, scope_id, valid_from DESC, importance DESC
    );

CREATE TABLE repository_snapshot_skipped_files (
          snapshot_id TEXT NOT NULL
            REFERENCES repository_snapshots(id) ON DELETE RESTRICT,
          source_id TEXT NOT NULL
            REFERENCES repository_sources(source_id) ON DELETE RESTRICT,
          version INTEGER NOT NULL CHECK (version > 0),
          relative_path TEXT NOT NULL,
          reason TEXT NOT NULL CHECK (
            reason IN (
              'file_too_large',
              'binary',
              'invalid_utf8',
              'repository_text_limit_exceeded',
              'file_count_limit_exceeded'
            )
          ),
          byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
          PRIMARY KEY (snapshot_id, relative_path),
          UNIQUE (source_id, version, relative_path)
        );

CREATE INDEX repository_snapshot_skipped_files_source_version
          ON repository_snapshot_skipped_files(source_id, version, relative_path);

CREATE TRIGGER repository_snapshot_skipped_files_prevent_update
          BEFORE UPDATE ON repository_snapshot_skipped_files
          BEGIN
            SELECT RAISE(ABORT, 'Repository snapshot skipped files are immutable');
          END;

CREATE TRIGGER repository_snapshot_skipped_files_prevent_delete
          BEFORE DELETE ON repository_snapshot_skipped_files
          BEGIN
            SELECT RAISE(ABORT, 'Repository snapshot skipped files are immutable');
          END;

CREATE TABLE repository_snapshot_files (
          snapshot_id TEXT NOT NULL
            REFERENCES repository_snapshots(id) ON DELETE RESTRICT,
          source_id TEXT NOT NULL
            REFERENCES repository_sources(source_id) ON DELETE RESTRICT,
          version INTEGER NOT NULL CHECK (version > 0),
          relative_path TEXT NOT NULL,
          content TEXT,
          content_checksum TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
          PRIMARY KEY (snapshot_id, relative_path),
          UNIQUE (source_id, version, relative_path)
        );

CREATE INDEX repository_snapshot_files_source_version
          ON repository_snapshot_files(source_id, version, relative_path);

CREATE TRIGGER repository_snapshot_files_prevent_update
          BEFORE UPDATE ON repository_snapshot_files
          BEGIN
            SELECT RAISE(ABORT, 'Repository snapshot files are immutable');
          END;

CREATE TRIGGER repository_snapshot_files_prevent_delete
          BEFORE DELETE ON repository_snapshot_files
          BEGIN
            SELECT RAISE(ABORT, 'Repository snapshot files are immutable');
          END;

CREATE TABLE repository_snapshot_documents (
          snapshot_id TEXT NOT NULL,
          source_path TEXT NOT NULL,
          unit_key TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          content_checksum TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
          metadata_json TEXT CHECK (
            metadata_json IS NULL OR json_valid(metadata_json)
          ),
          PRIMARY KEY (snapshot_id, source_path, unit_key),
          FOREIGN KEY (snapshot_id, source_path)
            REFERENCES repository_snapshot_files(snapshot_id, relative_path)
            ON DELETE RESTRICT
        );

CREATE INDEX repository_snapshot_documents_snapshot
          ON repository_snapshot_documents(snapshot_id, source_path, unit_key);

CREATE TRIGGER repository_snapshot_documents_prevent_update
          BEFORE UPDATE ON repository_snapshot_documents
          BEGIN
            SELECT RAISE(ABORT, 'Repository snapshot documents are immutable');
          END;

CREATE TRIGGER repository_snapshot_documents_prevent_delete
          BEFORE DELETE ON repository_snapshot_documents
          BEGIN
            SELECT RAISE(ABORT, 'Repository snapshot documents are immutable');
          END;

CREATE TABLE online_document_snapshots (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL
            REFERENCES online_document_sources(source_id) ON DELETE CASCADE,
          version INTEGER NOT NULL CHECK (version > 0),
          media_type TEXT NOT NULL,
          content_checksum TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          etag TEXT,
          last_modified TEXT,
          fetched_at INTEGER NOT NULL CHECK (fetched_at >= 0),
          UNIQUE (source_id, version)
        );

CREATE INDEX online_document_snapshots_current
          ON online_document_snapshots(source_id, version DESC);

CREATE TRIGGER online_document_snapshots_prevent_update
          BEFORE UPDATE ON online_document_snapshots
          BEGIN
            SELECT RAISE(ABORT, 'Online document snapshots are immutable');
          END;

CREATE TRIGGER online_document_snapshots_prevent_delete
          BEFORE DELETE ON online_document_snapshots
          BEGIN
            SELECT RAISE(ABORT, 'Online document snapshots are immutable');
          END;

CREATE TABLE online_document_snapshot_documents (
          snapshot_id TEXT NOT NULL
            REFERENCES online_document_snapshots(id) ON DELETE RESTRICT,
          unit_key TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          content_checksum TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
          metadata_json TEXT CHECK (
            metadata_json IS NULL OR json_valid(metadata_json)
          ),
          PRIMARY KEY (snapshot_id, unit_key)
        );

CREATE INDEX online_document_snapshot_documents_snapshot
          ON online_document_snapshot_documents(snapshot_id, unit_key);

CREATE TRIGGER online_document_snapshot_documents_prevent_update
          BEFORE UPDATE ON online_document_snapshot_documents
          BEGIN
            SELECT RAISE(ABORT, 'Online document snapshot documents are immutable');
          END;

CREATE TRIGGER online_document_snapshot_documents_prevent_delete
          BEFORE DELETE ON online_document_snapshot_documents
          BEGIN
            SELECT RAISE(ABORT, 'Online document snapshot documents are immutable');
          END;
`

const DSH_SESSION_BINDINGS_SCHEMA = `
CREATE TABLE dsh_session_bindings (
    owner_key TEXT PRIMARY KEY,
    owner_json TEXT NOT NULL CHECK (json_valid(owner_json)),
    dsh_session_id TEXT NOT NULL UNIQUE,
    run_manifest_digest TEXT NOT NULL CHECK (
      length(run_manifest_digest) = 64
      AND lower(run_manifest_digest) = run_manifest_digest
    ),
    runtime_build_digest TEXT NOT NULL CHECK (
      length(runtime_build_digest) = 64
      AND lower(runtime_build_digest) = runtime_build_digest
    ),
    last_projected_sequence INTEGER NOT NULL DEFAULT 0 CHECK (
      last_projected_sequence >= 0
    ),
    lifecycle_status TEXT NOT NULL CHECK (
      lifecycle_status IN (
        'active', 'closing', 'paused', 'closed', 'cancelled', 'failed', 'reset'
      )
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

CREATE INDEX dsh_session_bindings_session_status
    ON dsh_session_bindings(dsh_session_id, lifecycle_status);
`

const DSH_RUN_MANIFEST_PUBLICATIONS_SCHEMA = `
CREATE TABLE dsh_run_manifest_publications (
    manifest_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    owner_json TEXT NOT NULL CHECK (json_valid(owner_json)),
    digest TEXT NOT NULL UNIQUE CHECK (
      length(digest) = 64 AND lower(digest) = digest
    ),
    runtime_json TEXT NOT NULL CHECK (json_valid(runtime_json)),
    manifest_json TEXT NOT NULL CHECK (
      json_valid(manifest_json) AND
      json_extract(manifest_json, '$.digest') = digest
    ),
    published_at INTEGER NOT NULL CHECK (published_at >= 0)
  );

CREATE INDEX dsh_run_manifest_publications_owner
    ON dsh_run_manifest_publications(owner_key, published_at, manifest_id);
`

const CURRENT_SEED_DATA = `
INSERT INTO "workflow_templates" ("id", "name", "description", "status", "revision", "created_at", "updated_at") VALUES ('builtin-sdlc', 'Software Delivery', 'Built-in six-stage delivery workflow', 'published', 0, 0, 0);
INSERT INTO "workflow_template_versions" ("id", "template_id", "version", "status", "checksum", "created_at", "published_at") VALUES ('builtin-sdlc-v1', 'builtin-sdlc', 1, 'published', 'builtin-sdlc-v1', 0, 0);
INSERT INTO "workflow_nodes" ("id", "template_version_id", "stable_key", "type", "name", "description", "config_json", "allow_skip", "sort_order", "position_x", "position_y") VALUES ('builtin-analysis', 'builtin-sdlc-v1', 'analysis', 'ai_generate', 'Analysis', '', '{"kind":"ai_generate","prompt":"Generate the analysis artifact for this requirement.","artifact":{"relativePath":"artifacts/analysis.md","kind":"markdown"}}', 0, 0, 0, 0);
INSERT INTO "workflow_nodes" ("id", "template_version_id", "stable_key", "type", "name", "description", "config_json", "allow_skip", "sort_order", "position_x", "position_y") VALUES ('builtin-design', 'builtin-sdlc-v1', 'design', 'ai_generate', 'Design', '', '{"kind":"ai_generate","prompt":"Generate the design artifact for this requirement.","artifact":{"relativePath":"artifacts/design.md","kind":"markdown"}}', 0, 1, 0, 0);
INSERT INTO "workflow_nodes" ("id", "template_version_id", "stable_key", "type", "name", "description", "config_json", "allow_skip", "sort_order", "position_x", "position_y") VALUES ('builtin-implementation', 'builtin-sdlc-v1', 'implementation', 'ai_generate', 'Implementation', '', '{"kind":"ai_generate","prompt":"Generate the implementation artifact for this requirement.","artifact":{"relativePath":"artifacts/implementation.md","kind":"markdown"}}', 0, 2, 0, 0);
INSERT INTO "workflow_nodes" ("id", "template_version_id", "stable_key", "type", "name", "description", "config_json", "allow_skip", "sort_order", "position_x", "position_y") VALUES ('builtin-testing', 'builtin-sdlc-v1', 'testing', 'ai_generate', 'Testing', '', '{"kind":"ai_generate","prompt":"Generate the testing artifact for this requirement.","artifact":{"relativePath":"artifacts/testing.md","kind":"markdown"}}', 0, 3, 0, 0);
INSERT INTO "workflow_nodes" ("id", "template_version_id", "stable_key", "type", "name", "description", "config_json", "allow_skip", "sort_order", "position_x", "position_y") VALUES ('builtin-release', 'builtin-sdlc-v1', 'release', 'approval', 'Release', '', '{}', 0, 4, 0, 0);
INSERT INTO "workflow_nodes" ("id", "template_version_id", "stable_key", "type", "name", "description", "config_json", "allow_skip", "sort_order", "position_x", "position_y") VALUES ('builtin-retrospective', 'builtin-sdlc-v1', 'retrospective', 'ai_generate', 'Retrospective', '', '{"kind":"ai_generate","prompt":"Generate the retrospective artifact for this requirement.","artifact":{"relativePath":"artifacts/retrospective.md","kind":"markdown"}}', 0, 5, 0, 0);
INSERT INTO "workflow_edges" ("id", "template_version_id", "source_node_id", "target_node_id") VALUES ('builtin-analysis-design', 'builtin-sdlc-v1', 'builtin-analysis', 'builtin-design');
INSERT INTO "workflow_edges" ("id", "template_version_id", "source_node_id", "target_node_id") VALUES ('builtin-design-implementation', 'builtin-sdlc-v1', 'builtin-design', 'builtin-implementation');
INSERT INTO "workflow_edges" ("id", "template_version_id", "source_node_id", "target_node_id") VALUES ('builtin-implementation-testing', 'builtin-sdlc-v1', 'builtin-implementation', 'builtin-testing');
INSERT INTO "workflow_edges" ("id", "template_version_id", "source_node_id", "target_node_id") VALUES ('builtin-testing-release', 'builtin-sdlc-v1', 'builtin-testing', 'builtin-release');
INSERT INTO "workflow_edges" ("id", "template_version_id", "source_node_id", "target_node_id") VALUES ('builtin-release-retrospective', 'builtin-sdlc-v1', 'builtin-release', 'builtin-retrospective');
INSERT INTO "workbench_site_groups" ("id", "name", "position", "system_key", "revision", "created_at", "updated_at", "deleted_at") VALUES ('workbench-site-group-ungrouped', '未分组', 0, NULL, 1, 0, 1791957205555, 1791957205555);
INSERT INTO "workbench_audit_events" ("id", "module", "action", "entity_type", "entity_id", "entity_revision", "metadata_json", "occurred_at") VALUES ('3360fdef6735809335d62495c06a644c', 'sites', 'deleted', 'site_group', 'workbench-site-group-ungrouped', 1, '{}', 1791957205554);
INSERT INTO "workbench_audit_events" ("id", "module", "action", "entity_type", "entity_id", "entity_revision", "metadata_json", "occurred_at") VALUES ('f913776a8b7f1a2ceca3453a11d3f3ac', 'sites', 'updated', 'site_group', 'workbench-site-group-ungrouped', 1, '{}', 1791957205554);
INSERT INTO "runtime_governance_revisions" ("singleton_id", "revision", "candidate_digest", "updated_at") VALUES (1, 1, NULL, 0);
INSERT INTO "runtime_observability_state" ("singleton_id", "retention_days", "maximum_events", "dropped_events", "updated_at") VALUES (1, 30, 50000, 0, 0);
`

export const REALMFLOW_MIGRATIONS: readonly SqlMigration[] = [
  {
    version: 116,
    name: 'current_schema_baseline',
    up: (database) => {
      database.exec(CURRENT_SCHEMA)
      database.exec(DSH_RUN_MANIFEST_PUBLICATIONS_SCHEMA)
      database.exec(DSH_SESSION_BINDINGS_SCHEMA)
      database.exec(CURRENT_SEED_DATA)
    }
  }
]

export const REALMFLOW_SCHEMA_VERSION =
  REALMFLOW_MIGRATIONS.at(-1)?.version ?? 0

export function applyMigrations(
  database: Database.Database,
  migrations: readonly SqlMigration[] = REALMFLOW_MIGRATIONS
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `)
  assertValidMigrations(migrations)
  const ordered = [...migrations].sort(
    (left, right) => left.version - right.version
  )
  const appliedVersions = new Set(
    (
      database
      .prepare('SELECT version FROM schema_migrations')
      .all() as Array<{ version: number }>
    )
      .map(({ version }) => version)
  )
  const recordMigration = database.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at)
     VALUES (?, ?, ?)`
  )
  for (const migration of ordered) {
    if (appliedVersions.has(migration.version)) continue
    if (migration.requiresForeignKeysDisabled) {
      database.pragma('foreign_keys = OFF')
    }
    const migrate = database.transaction(() => {
      migration.up(database)
      if (migration.requiresForeignKeysDisabled) {
        const violations = database.pragma('foreign_key_check') as Array<{
          table: string
          rowid: number
          parent: string
          fkid: number
        }>
        if (violations.length > 0) {
          throw new Error(
            `Migration ${migration.version} violates foreign key integrity: ${JSON.stringify(
              violations
            )}`
          )
        }
      }
      recordMigration.run(migration.version, migration.name, Date.now())
    })
    if (!migration.requiresForeignKeysDisabled) {
      migrate()
      continue
    }
    try {
      migrate()
    } finally {
      database.pragma('foreign_keys = ON')
    }
  }
}

function assertValidMigrations(migrations: readonly SqlMigration[]): void {
  const versions = new Set<number>()
  const names = new Set<string>()
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Invalid migration version: ${migration.version}`)
    }
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`)
    }
    if (!migration.name || names.has(migration.name)) {
      throw new Error(`Duplicate or empty migration name: ${migration.name}`)
    }
    versions.add(migration.version)
    names.add(migration.name)
  }
}
