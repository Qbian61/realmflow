import type Database from 'better-sqlite3'

export type SqlMigration = {
  version: number
  name: string
  up: (database: Database.Database) => void
}

const INITIAL_SCHEMA = `
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
  );

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
    updated_at INTEGER NOT NULL,
    UNIQUE (workspace_id, id)
  );
  CREATE INDEX requirements_workspace_order
    ON requirements(workspace_id, sort_order, id);

  CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX chat_sessions_workspace_updated
    ON chat_sessions(workspace_id, updated_at DESC, id);

  CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, sort_order)
  );

  CREATE TABLE space_resources (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('file', 'document', 'repository')),
    locator TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (workspace_id, locator)
  );
  CREATE INDEX space_resources_workspace_order
    ON space_resources(workspace_id, sort_order, id);

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
    updated_at INTEGER NOT NULL,
    UNIQUE (requirement_id, stage_id, relative_path, version)
  );
  CREATE UNIQUE INDEX artifacts_primary_per_stage
    ON artifacts(requirement_id, stage_id)
    WHERE is_primary = 1;

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
  );
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

  CREATE TABLE legacy_imports (
    source_key TEXT PRIMARY KEY,
    source_fingerprint TEXT NOT NULL,
    backup_path TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    report_json TEXT NOT NULL
  );
`

const P0_PRODUCT_CORE_SCHEMA = `
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

  ALTER TABLE workspaces ADD COLUMN work_root_id TEXT REFERENCES work_roots(id);
  ALTER TABLE workspaces ADD COLUMN directory_name TEXT;
  ALTER TABLE workspaces ADD COLUMN deleted_at INTEGER;

  ALTER TABLE requirements
    ADD COLUMN workflow_template_version_id TEXT;
  ALTER TABLE requirements ADD COLUMN directory_name TEXT;
  ALTER TABLE requirements
    ADD COLUMN sync_completed_artifacts_to_knowledge INTEGER NOT NULL DEFAULT 0
    CHECK (sync_completed_artifacts_to_knowledge IN (0, 1));
  ALTER TABLE requirements ADD COLUMN deleted_at INTEGER;

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
    sort_order INTEGER NOT NULL DEFAULT 0,
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
  );

  CREATE TABLE requirement_workflow_revisions (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL
      REFERENCES requirement_workflows(requirement_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    snapshot_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (requirement_id, revision)
  );

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
  );

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
  );

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
    updated_at INTEGER NOT NULL,
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

  CREATE TABLE model_call_metrics (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES model_providers(id),
    model_profile_id TEXT NOT NULL REFERENCES model_profiles(id),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    node_id TEXT REFERENCES requirement_nodes(id) ON DELETE SET NULL,
    conversation_id TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
    ai_run_id TEXT REFERENCES ai_runs(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cached_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
    reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
    first_token_latency_ms INTEGER CHECK (first_token_latency_ms >= 0),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'cancelled')),
    estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
    context_snapshot_id TEXT,
    error_code TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX model_call_metrics_created
    ON model_call_metrics(created_at DESC, id);

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

  ALTER TABLE chat_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'space'
    CHECK (kind IN ('general', 'space', 'requirement_node', 'schedule'));
  ALTER TABLE chat_sessions ADD COLUMN node_id TEXT
    REFERENCES requirement_nodes(id) ON DELETE SET NULL;
  ALTER TABLE chat_sessions ADD COLUMN folder_path TEXT;

  INSERT INTO workflow_templates (
    id, name, description, status, revision, created_at, updated_at
  ) VALUES (
    'builtin-sdlc', 'Software Delivery', 'Built-in six-stage delivery workflow',
    'published', 0, 0, 0
  );

  INSERT INTO workflow_template_versions (
    id, template_id, version, status, checksum, created_at, published_at
  ) VALUES (
    'builtin-sdlc-v1', 'builtin-sdlc', 1, 'published',
    'builtin-sdlc-v1', 0, 0
  );

  INSERT INTO workflow_nodes (
    id, template_version_id, stable_key, type, name, sort_order
  ) VALUES
    ('builtin-analysis', 'builtin-sdlc-v1', 'analysis', 'ai_generate', 'Analysis', 0),
    ('builtin-design', 'builtin-sdlc-v1', 'design', 'ai_generate', 'Design', 1),
    ('builtin-implementation', 'builtin-sdlc-v1', 'implementation', 'ai_generate', 'Implementation', 2),
    ('builtin-testing', 'builtin-sdlc-v1', 'testing', 'ai_generate', 'Testing', 3),
    ('builtin-release', 'builtin-sdlc-v1', 'release', 'approval', 'Release', 4),
    ('builtin-retrospective', 'builtin-sdlc-v1', 'retrospective', 'ai_generate', 'Retrospective', 5);

  INSERT INTO workflow_edges (
    id, template_version_id, source_node_id, target_node_id
  ) VALUES
    ('builtin-analysis-design', 'builtin-sdlc-v1', 'builtin-analysis', 'builtin-design'),
    ('builtin-design-implementation', 'builtin-sdlc-v1', 'builtin-design', 'builtin-implementation'),
    ('builtin-implementation-testing', 'builtin-sdlc-v1', 'builtin-implementation', 'builtin-testing'),
    ('builtin-testing-release', 'builtin-sdlc-v1', 'builtin-testing', 'builtin-release'),
    ('builtin-release-retrospective', 'builtin-sdlc-v1', 'builtin-release', 'builtin-retrospective');
`

const CONVERSATION_BINDINGS_SCHEMA = `
  CREATE TABLE chat_sessions_next (
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
  );

  INSERT INTO chat_sessions_next (
    id, workspace_id, requirement_id, kind, node_run_id, folder_path, title,
    sort_order, revision, created_at, updated_at
  )
  SELECT
    id, workspace_id, requirement_id,
    CASE WHEN kind = 'schedule' THEN 'general' ELSE kind END,
    NULL, folder_path, title, sort_order, revision, created_at, updated_at
  FROM chat_sessions;

  CREATE TABLE chat_messages_next (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions_next(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, sort_order)
  );

  INSERT INTO chat_messages_next (
    id, session_id, role, content, sort_order, created_at
  )
  SELECT id, session_id, role, content, sort_order, created_at
  FROM chat_messages;

  CREATE TEMP TABLE conversation_metric_bindings AS
    SELECT id, conversation_id
    FROM model_call_metrics
    WHERE conversation_id IS NOT NULL;

  DROP TABLE chat_messages;
  DROP TABLE chat_sessions;
  ALTER TABLE chat_sessions_next RENAME TO chat_sessions;
  ALTER TABLE chat_messages_next RENAME TO chat_messages;

  UPDATE model_call_metrics
  SET conversation_id = (
    SELECT binding.conversation_id
    FROM conversation_metric_bindings AS binding
    WHERE binding.id = model_call_metrics.id
  )
  WHERE id IN (SELECT id FROM conversation_metric_bindings);
  DROP TABLE conversation_metric_bindings;

  CREATE INDEX chat_sessions_workspace_updated
    ON chat_sessions(workspace_id, updated_at DESC, id);
  CREATE INDEX chat_sessions_recent_updated
    ON chat_sessions(kind, updated_at DESC, id);
`

const KNOWLEDGE_SYNC_SCHEMA = `
  CREATE TABLE knowledge_documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_requirement_id TEXT NOT NULL
      REFERENCES requirements(id) ON DELETE CASCADE,
    source_node_id TEXT REFERENCES requirement_nodes(id) ON DELETE SET NULL,
    source_artifact_id TEXT NOT NULL
      REFERENCES artifacts(id) ON DELETE CASCADE,
    source_version INTEGER NOT NULL CHECK (source_version > 0),
    source_path TEXT NOT NULL,
    checksum TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (source_requirement_id, source_path)
  );
  CREATE INDEX knowledge_documents_workspace_updated
    ON knowledge_documents(workspace_id, updated_at DESC, id);

  CREATE TABLE knowledge_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL
      REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    content TEXT NOT NULL,
    checksum TEXT NOT NULL,
    UNIQUE (document_id, chunk_index)
  );

  CREATE TABLE knowledge_sync_jobs (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'failed', 'completed')),
    retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
    attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    next_retry_at INTEGER
  );
  CREATE INDEX knowledge_sync_jobs_retry
    ON knowledge_sync_jobs(status, retryable, next_retry_at, id);
`

const WORKFLOW_EXECUTOR_CONFIG_SCHEMA = `
  ALTER TABLE ai_runs ADD COLUMN node_id TEXT;
  ALTER TABLE artifacts ADD COLUMN node_id TEXT;
  UPDATE ai_runs
  SET node_id = requirement_id || ':' || stage_id
  WHERE node_id IS NULL;
  UPDATE artifacts
  SET node_id = requirement_id || ':' || stage_id
  WHERE node_id IS NULL;
  DROP INDEX artifacts_primary_per_stage;
  CREATE UNIQUE INDEX artifacts_primary_per_node
    ON artifacts(requirement_id, node_id)
    WHERE is_primary = 1;

  UPDATE workflow_nodes
  SET config_json = CASE stable_key
    WHEN 'analysis' THEN '{"kind":"ai_generate","prompt":"Generate the analysis artifact for this requirement.","artifact":{"relativePath":"artifacts/analysis.md","kind":"markdown"},"legacyStageId":"analysis"}'
    WHEN 'design' THEN '{"kind":"ai_generate","prompt":"Generate the design artifact for this requirement.","artifact":{"relativePath":"artifacts/design.md","kind":"markdown"},"legacyStageId":"design"}'
    WHEN 'implementation' THEN '{"kind":"ai_generate","prompt":"Generate the implementation artifact for this requirement.","artifact":{"relativePath":"artifacts/implementation.md","kind":"markdown"},"legacyStageId":"implementation"}'
    WHEN 'testing' THEN '{"kind":"ai_generate","prompt":"Generate the testing artifact for this requirement.","artifact":{"relativePath":"artifacts/testing.md","kind":"markdown"},"legacyStageId":"testing"}'
    WHEN 'retrospective' THEN '{"kind":"ai_generate","prompt":"Generate the retrospective artifact for this requirement.","artifact":{"relativePath":"artifacts/retrospective.md","kind":"markdown"},"legacyStageId":"retrospective"}'
    ELSE config_json
  END
  WHERE template_version_id = 'builtin-sdlc-v1'
    AND type = 'ai_generate';

  UPDATE requirement_nodes
  SET config_json = CASE
    WHEN id LIKE '%:analysis' THEN '{"kind":"ai_generate","prompt":"Generate the analysis artifact for this requirement.","artifact":{"relativePath":"artifacts/analysis.md","kind":"markdown"},"legacyStageId":"analysis"}'
    WHEN id LIKE '%:design' THEN '{"kind":"ai_generate","prompt":"Generate the design artifact for this requirement.","artifact":{"relativePath":"artifacts/design.md","kind":"markdown"},"legacyStageId":"design"}'
    WHEN id LIKE '%:implementation' THEN '{"kind":"ai_generate","prompt":"Generate the implementation artifact for this requirement.","artifact":{"relativePath":"artifacts/implementation.md","kind":"markdown"},"legacyStageId":"implementation"}'
    WHEN id LIKE '%:testing' THEN '{"kind":"ai_generate","prompt":"Generate the testing artifact for this requirement.","artifact":{"relativePath":"artifacts/testing.md","kind":"markdown"},"legacyStageId":"testing"}'
    WHEN id LIKE '%:retrospective' THEN '{"kind":"ai_generate","prompt":"Generate the retrospective artifact for this requirement.","artifact":{"relativePath":"artifacts/retrospective.md","kind":"markdown"},"legacyStageId":"retrospective"}'
    ELSE config_json
  END
  WHERE requirement_id IN (
    SELECT requirement_id
    FROM requirement_workflows
    WHERE template_version_id = 'builtin-sdlc-v1'
  )
    AND type = 'ai_generate'
    AND config_json = '{}';
`

const WORKFLOW_DISPATCH_SCHEMA = `
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
`

const ENTITY_DELETION_SCHEMA = `
  CREATE TABLE entity_deletions (
    entity_type TEXT NOT NULL CHECK (entity_type IN ('workspace', 'requirement')),
    entity_id TEXT NOT NULL,
    original_path TEXT NOT NULL,
    trash_path TEXT NOT NULL UNIQUE,
    deleted_at INTEGER NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
  );
  CREATE INDEX entity_deletions_deleted_at
    ON entity_deletions(deleted_at DESC, entity_type, entity_id);
`

export const REALMFLOW_MIGRATIONS: readonly SqlMigration[] = [
  {
    version: 1,
    name: 'initial_business_schema',
    up: (database) => database.exec(INITIAL_SCHEMA)
  },
  {
    version: 2,
    name: 'p0_product_core',
    up: (database) => database.exec(P0_PRODUCT_CORE_SCHEMA)
  },
  {
    version: 3,
    name: 'conversation_bindings',
    up: (database) => database.exec(CONVERSATION_BINDINGS_SCHEMA)
  },
  {
    version: 4,
    name: 'knowledge_sync',
    up: (database) => database.exec(KNOWLEDGE_SYNC_SCHEMA)
  },
  {
    version: 5,
    name: 'workflow_executor_config',
    up: (database) => database.exec(WORKFLOW_EXECUTOR_CONFIG_SCHEMA)
  },
  {
    version: 6,
    name: 'workflow_dispatch_outbox',
    up: (database) => database.exec(WORKFLOW_DISPATCH_SCHEMA)
  },
  {
    version: 7,
    name: 'entity_deletion_lifecycle',
    up: (database) => database.exec(ENTITY_DELETION_SCHEMA)
  }
]

export function applyMigrations(
  database: Database.Database,
  migrations: readonly SqlMigration[] = REALMFLOW_MIGRATIONS
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

  const ordered = [...migrations].sort(
    (left, right) => left.version - right.version
  )
  assertValidMigrations(ordered)

  const appliedVersions = new Set(
    (
      database
        .prepare('SELECT version FROM schema_migrations')
        .all() as Array<{ version: number }>
    ).map(({ version }) => version)
  )
  const recordMigration = database.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at)
     VALUES (?, ?, ?)`
  )

  for (const migration of ordered) {
    if (appliedVersions.has(migration.version)) continue
    database.transaction(() => {
      migration.up(database)
      recordMigration.run(migration.version, migration.name, Date.now())
    })()
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
