import type Database from 'better-sqlite3'
import { BROWSER_SESSION_SCHEMA } from './browser-session-schema'
import { WEB_PROVIDER_SCHEMA } from './web-provider-schema'
import { AGENT_RUNTIME_STATE_SCHEMA } from './agent-runtime-state-schema'
import { AGENT_RUNTIME_BUDGET_SCHEMA } from './agent-runtime-budget-schema'
import { AGENT_DELEGATION_SCHEMA } from './agent-delegation-schema'
import { SKILL_REGISTRY_SCHEMA } from './skill-registry-schema'

export type SqlMigration = {
  version: number
  name: string
  up: (database: Database.Database) => void
  requiresForeignKeysDisabled?: boolean
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

const TRASH_LIFECYCLE_SCHEMA = `
  ALTER TABLE entity_deletions
    ADD COLUMN state TEXT NOT NULL DEFAULT 'trashed'
    CHECK (state IN ('trashed', 'purging'));
  ALTER TABLE entity_deletions
    ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'user'
    CHECK (trigger_source IN ('user'));
`

const SPACE_RELOCATION_SCHEMA = `
  ALTER TABLE workspaces ADD COLUMN relocated_at INTEGER;
  ALTER TABLE workspaces
    ADD COLUMN relocation_source TEXT
    CHECK (relocation_source IS NULL OR relocation_source IN ('user'));
`

const WORKFLOW_REVISION_METADATA_SCHEMA = `
  ALTER TABLE requirement_workflow_revisions
    ADD COLUMN diff_json TEXT NOT NULL DEFAULT
      '{"addedNodeIds":[],"removedNodeIds":[],"updatedNodeIds":[],"reorderedNodeIds":[],"addedEdgeIds":[],"removedEdgeIds":[],"updatedEdgeIds":[]}';
  ALTER TABLE requirement_workflow_revisions
    ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'system'
    CHECK (trigger_source IN ('user', 'system'));
`

const WORKFLOW_EXECUTION_TRANSITION_SCHEMA = `
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
`

const NODE_RUN_TRANSITION_SCHEMA = `
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
`

const NODE_TODO_TRANSITION_SCHEMA = `
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
`

const NODE_QUESTION_TRANSITION_SCHEMA = `
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
`

const NODE_APPROVAL_SCHEMA = `
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
`

const WORKFLOW_REVISION_RECOVERY_SOURCE_SCHEMA = `
  ALTER TABLE requirement_workflow_revisions
    RENAME TO requirement_workflow_revisions_legacy;

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

  INSERT INTO requirement_workflow_revisions (
    id, requirement_id, revision, snapshot_json, reason, created_at,
    diff_json, trigger_source
  )
  SELECT
    id, requirement_id, revision, snapshot_json, reason, created_at,
    diff_json, trigger_source
  FROM requirement_workflow_revisions_legacy;

  DROP TABLE requirement_workflow_revisions_legacy;
`

const WORKFLOW_AUDIT_EVENT_SCHEMA = `
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
        'execution_created', 'execution_status_changed',
        'execution_current_node_changed', 'node_run_created',
        'node_run_status_changed', 'advance_enqueued', 'advance_started',
        'advance_completed', 'advance_failed'
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
`

const MODEL_PROVIDER_EVENT_SCHEMA = `
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
`

const MODEL_PROFILE_MANAGEMENT_SCHEMA = `
  ALTER TABLE model_profiles ADD COLUMN timeout_ms INTEGER NOT NULL
    DEFAULT 120000 CHECK (timeout_ms BETWEEN 1 AND 600000);
  ALTER TABLE model_profiles ADD COLUMN max_retries INTEGER NOT NULL
    DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 10);
  ALTER TABLE model_profiles ADD COLUMN max_concurrency INTEGER NOT NULL
    DEFAULT 1 CHECK (max_concurrency BETWEEN 1 AND 32);

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
      SELECT 1 FROM model_call_metrics WHERE model_profile_id = OLD.id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Model profile is referenced');
    END;
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
`

const MODEL_AVAILABILITY_CHECK_SCHEMA = `
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
  CREATE TRIGGER model_availability_checks_prevent_delete
    BEFORE DELETE ON model_availability_checks
    BEGIN
      SELECT RAISE(ABORT, 'Model availability checks are immutable');
    END;
`

const MODEL_CREDENTIAL_KEY_ROTATION_SCHEMA = `
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
`

const CONTEXT_SNAPSHOT_SCHEMA = `
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

  CREATE TRIGGER model_call_metrics_validate_context_insert
    BEFORE INSERT ON model_call_metrics
    WHEN NEW.context_snapshot_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM context_snapshots
        WHERE id = NEW.context_snapshot_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'Context snapshot was not found');
    END;
  CREATE TRIGGER model_call_metrics_validate_context_update
    BEFORE UPDATE OF context_snapshot_id ON model_call_metrics
    WHEN NEW.context_snapshot_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM context_snapshots
        WHERE id = NEW.context_snapshot_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'Context snapshot was not found');
    END;
  CREATE TRIGGER context_snapshots_clear_metric_reference
    AFTER DELETE ON context_snapshots
    BEGIN
      UPDATE model_call_metrics
      SET context_snapshot_id = NULL
      WHERE context_snapshot_id = OLD.id;
    END;
`

const CONVERSATION_MESSAGE_LIFECYCLE_SCHEMA = `
  CREATE TABLE chat_messages_next (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    status TEXT NOT NULL DEFAULT 'completed'
      CHECK (status IN ('pending', 'completed', 'failed')),
    content TEXT NOT NULL,
    run_id TEXT,
    error TEXT,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, sort_order),
    CHECK (role != 'user' OR status = 'completed'),
    CHECK (status != 'completed' OR error IS NULL),
    CHECK (status != 'failed' OR error IS NOT NULL)
  );

  INSERT INTO chat_messages_next (
    id, session_id, role, status, content, run_id, error, sort_order, created_at
  )
  SELECT
    id, session_id, role, 'completed', content, NULL, NULL, sort_order, created_at
  FROM chat_messages;

  DROP TABLE chat_messages;
  ALTER TABLE chat_messages_next RENAME TO chat_messages;
`

const SIDECAR_RUN_METRICS_SCHEMA = `
  CREATE TABLE model_call_metrics_next (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES model_providers(id),
    model_profile_id TEXT NOT NULL REFERENCES model_profiles(id),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    node_id TEXT REFERENCES requirement_nodes(id) ON DELETE SET NULL,
    conversation_id TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
    ai_run_id TEXT,
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

  INSERT INTO model_call_metrics_next (
    id, provider_id, model_profile_id, workspace_id, requirement_id, node_id,
    conversation_id, ai_run_id, input_tokens, output_tokens, cached_tokens,
    reasoning_tokens, first_token_latency_ms, duration_ms, retry_count, status,
    estimated_cost, context_snapshot_id, error_code, created_at
  )
  SELECT
    id, provider_id, model_profile_id, workspace_id, requirement_id, node_id,
    conversation_id, ai_run_id, input_tokens, output_tokens, cached_tokens,
    reasoning_tokens, first_token_latency_ms, duration_ms, retry_count, status,
    estimated_cost, context_snapshot_id, error_code, created_at
  FROM model_call_metrics;

  DROP TRIGGER model_profiles_reject_referenced_delete;
  DROP TRIGGER model_call_metrics_validate_context_insert;
  DROP TRIGGER model_call_metrics_validate_context_update;
  DROP TRIGGER context_snapshots_clear_metric_reference;
  DROP TABLE model_call_metrics;
  ALTER TABLE model_call_metrics_next RENAME TO model_call_metrics;

  CREATE INDEX model_call_metrics_created
    ON model_call_metrics(created_at DESC, id);
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
      SELECT 1 FROM model_call_metrics WHERE model_profile_id = OLD.id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Model profile is referenced');
    END;
  CREATE TRIGGER model_call_metrics_validate_context_insert
    BEFORE INSERT ON model_call_metrics
    WHEN NEW.context_snapshot_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM context_snapshots
        WHERE id = NEW.context_snapshot_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'Context snapshot was not found');
    END;
  CREATE TRIGGER model_call_metrics_validate_context_update
    BEFORE UPDATE OF context_snapshot_id ON model_call_metrics
    WHEN NEW.context_snapshot_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM context_snapshots
        WHERE id = NEW.context_snapshot_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'Context snapshot was not found');
    END;
  CREATE TRIGGER context_snapshots_clear_metric_reference
    AFTER DELETE ON context_snapshots
    BEGIN
      UPDATE model_call_metrics
      SET context_snapshot_id = NULL
      WHERE context_snapshot_id = OLD.id;
    END;
`

const REQUIREMENT_NODE_CONVERSATION_SCHEMA = `
  ALTER TABLE chat_messages ADD COLUMN question_id TEXT
    REFERENCES node_questions(id) ON DELETE SET NULL;
  ALTER TABLE chat_messages ADD COLUMN todo_id TEXT
    REFERENCES node_todos(id) ON DELETE SET NULL;
  ALTER TABLE chat_messages ADD COLUMN tool_call_id TEXT;
  ALTER TABLE chat_messages ADD COLUMN artifact_id TEXT
    REFERENCES artifacts(id) ON DELETE SET NULL;

  CREATE UNIQUE INDEX chat_sessions_node_run_unique
    ON chat_sessions(node_run_id)
    WHERE node_run_id IS NOT NULL;
`

const MODEL_CALL_METRIC_DETAILS_SCHEMA = `
  DROP TRIGGER model_profiles_reject_referenced_delete;
  DROP TRIGGER model_call_metrics_validate_context_insert;
  DROP TRIGGER model_call_metrics_validate_context_update;
  DROP TRIGGER context_snapshots_clear_metric_reference;

  CREATE TABLE model_call_metrics_next (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK (
      source IN (
        'workflow_stage', 'workflow_node', 'general_conversation',
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
    created_at INTEGER NOT NULL,
    CHECK (
      first_token_latency_ms IS NULL OR first_token_latency_ms <= duration_ms
    )
  );

  INSERT INTO model_call_metrics_next (
    id, source, provider_id, model_profile_id, workspace_id, requirement_id,
    node_id, conversation_id, ai_run_id, input_tokens, output_tokens,
    cached_tokens, reasoning_tokens, first_token_latency_ms, duration_ms,
    throughput_tokens_per_second, retry_count, status, error_code,
    estimated_input_cost, estimated_output_cost, estimated_cost,
    context_snapshot_id, created_at
  )
  SELECT
    id,
    CASE
      WHEN conversation_id IS NOT NULL AND node_id IS NOT NULL
        THEN 'requirement_node_conversation'
      WHEN conversation_id IS NOT NULL AND workspace_id IS NOT NULL
        THEN 'space_conversation'
      WHEN conversation_id IS NOT NULL THEN 'general_conversation'
      WHEN node_id IS NOT NULL THEN 'workflow_node'
      ELSE 'workflow_stage'
    END,
    provider_id, model_profile_id, workspace_id, requirement_id, node_id,
    conversation_id, COALESCE(ai_run_id, id), input_tokens, output_tokens,
    cached_tokens, reasoning_tokens, first_token_latency_ms, duration_ms,
    CASE
      WHEN output_tokens = 0 THEN 0
      ELSE output_tokens * 1000.0 /
        MAX(duration_ms - COALESCE(first_token_latency_ms, 0), 1)
    END,
    retry_count, status, error_code, estimated_cost, 0, estimated_cost,
    context_snapshot_id, created_at
  FROM model_call_metrics;

  DROP TABLE model_call_metrics;
  ALTER TABLE model_call_metrics_next RENAME TO model_call_metrics;

  CREATE INDEX model_call_metrics_created
    ON model_call_metrics(created_at DESC, id);
  CREATE UNIQUE INDEX model_call_metrics_ai_run
    ON model_call_metrics(ai_run_id);
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
      SELECT 1 FROM model_call_metrics WHERE model_profile_id = OLD.id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Model profile is referenced');
    END;
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
`

const AI_RUN_METRIC_ATTRIBUTION_SCHEMA = `
  ALTER TABLE ai_runs
    ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
  ALTER TABLE ai_runs
    ADD COLUMN model_profile_id TEXT REFERENCES model_profiles(id) ON DELETE RESTRICT;
  ALTER TABLE ai_runs
    ADD COLUMN context_snapshot_id TEXT REFERENCES context_snapshots(id) ON DELETE SET NULL;
  ALTER TABLE ai_runs
    ADD COLUMN model_started_at INTEGER CHECK (
      model_started_at IS NULL OR model_started_at >= 0
    );
`

const OUTBOUND_CALL_AUDIT_SCHEMA = `
  CREATE TABLE outbound_calls (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    call_type TEXT NOT NULL CHECK (call_type IN (
      'model_completion', 'model_availability', 'connector',
      'online_document', 'remote_repository', 'app_update', 'online_help'
    )),
    target_type TEXT NOT NULL CHECK (target_type IN (
      'model_provider', 'connector', 'document_service', 'repository_host',
      'update_service', 'help_service'
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
      'request_cancelled', 'protocol_error', 'audit_unavailable', 'interrupted'
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
`

const OUTBOUND_CALL_CONNECTOR_ERRORS_SCHEMA = `
  DROP TRIGGER outbound_calls_validate_transition;
  DROP TRIGGER outbound_calls_prevent_delete;
  ALTER TABLE outbound_calls RENAME TO outbound_calls_legacy;

  CREATE TABLE outbound_calls (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    call_type TEXT NOT NULL CHECK (call_type IN (
      'model_completion', 'model_availability', 'connector',
      'online_document', 'remote_repository', 'app_update', 'online_help'
    )),
    target_type TEXT NOT NULL CHECK (target_type IN (
      'model_provider', 'connector', 'document_service', 'repository_host',
      'update_service', 'help_service'
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

  INSERT INTO outbound_calls (
    id, idempotency_key, call_type, target_type, target_id, owner_type, owner_id,
    provider_id, model_profile_id, workspace_id, requirement_id, node_id,
    node_run_id, conversation_id, ai_run_id, status, started_at, completed_at,
    duration_ms, retry_count, error_code, error_summary
  )
  SELECT
    id, idempotency_key, call_type, target_type, target_id, owner_type, owner_id,
    provider_id, model_profile_id, workspace_id, requirement_id, node_id,
    node_run_id, conversation_id, ai_run_id, status, started_at, completed_at,
    duration_ms, retry_count, error_code, error_summary
  FROM outbound_calls_legacy;

  DROP TABLE outbound_calls_legacy;
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
`

const KNOWLEDGE_SOURCE_LIFECYCLE_SCHEMA = `
  CREATE TABLE knowledge_sources (
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
    updated_at INTEGER NOT NULL,
    UNIQUE (workspace_id, locator)
  );

  INSERT INTO knowledge_sources (
    id, workspace_id, name, type, locator, detail, sort_order, status,
    revision, created_at, updated_at
  )
  SELECT
    id, workspace_id, name, type, locator, detail, sort_order, 'registered',
    CASE WHEN revision > 0 THEN revision ELSE 1 END, created_at, updated_at
  FROM space_resources;

  DROP INDEX space_resources_workspace_order;
  DROP TABLE space_resources;

  CREATE INDEX knowledge_sources_workspace_order
    ON knowledge_sources(workspace_id, sort_order, id);
  CREATE INDEX knowledge_sources_recovery
    ON knowledge_sources(status, updated_at, id);

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
`

const LOCAL_FILE_INGESTION_SCHEMA = `
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
`

const CONNECTOR_MANAGEMENT_SCHEMA = `
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
`

const ONLINE_DOCUMENT_SNAPSHOT_SCHEMA = `
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

  CREATE TABLE online_document_snapshots (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES online_document_sources(source_id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    content TEXT NOT NULL,
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
`

const REPOSITORY_INGESTION_SCHEMA = `
  CREATE TABLE repository_sources (
    source_id TEXT PRIMARY KEY
      REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    workspace_id TEXT NOT NULL
      REFERENCES workspaces(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('local', 'remote')),
    local_path TEXT,
    connector_id TEXT REFERENCES connectors(id) ON DELETE RESTRICT,
    path TEXT,
    managed_relative_path TEXT,
    locator TEXT NOT NULL UNIQUE,
    current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
    revision_label TEXT,
    file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
    total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
    last_scanned_at INTEGER CHECK (
      last_scanned_at IS NULL OR last_scanned_at >= 0
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    UNIQUE (workspace_id, local_path),
    UNIQUE (workspace_id, connector_id, path),
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

  CREATE TABLE repository_snapshots (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES repository_sources(source_id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    revision_label TEXT NOT NULL,
    manifest_checksum TEXT NOT NULL,
    file_count INTEGER NOT NULL CHECK (file_count >= 0),
    total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
    scanned_at INTEGER NOT NULL CHECK (scanned_at >= 0),
    UNIQUE (source_id, version)
  );
  CREATE INDEX repository_snapshots_current
    ON repository_snapshots(source_id, version DESC);

  CREATE TABLE repository_snapshot_files (
    snapshot_id TEXT NOT NULL
      REFERENCES repository_snapshots(id) ON DELETE RESTRICT,
    source_id TEXT NOT NULL
      REFERENCES repository_sources(source_id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    relative_path TEXT NOT NULL,
    content TEXT NOT NULL,
    content_checksum TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    PRIMARY KEY (snapshot_id, relative_path),
    UNIQUE (source_id, version, relative_path)
  );
  CREATE INDEX repository_snapshot_files_source_version
    ON repository_snapshot_files(source_id, version, relative_path);

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
`

const LOCAL_KNOWLEDGE_INDEX_SCHEMA = `
  CREATE TABLE knowledge_indexes (
    source_id TEXT PRIMARY KEY
      REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    current_version_id TEXT,
    current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE knowledge_index_versions (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    source_revision INTEGER NOT NULL CHECK (source_revision > 0),
    source_version TEXT NOT NULL,
    source_checksum TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0),
    chunker_version TEXT NOT NULL,
    document_count INTEGER NOT NULL CHECK (document_count >= 0),
    chunk_count INTEGER NOT NULL CHECK (chunk_count >= 0),
    created_at INTEGER NOT NULL,
    UNIQUE (source_id, version)
  );
  CREATE INDEX knowledge_index_versions_source
    ON knowledge_index_versions(source_id, version DESC);

  CREATE TABLE knowledge_index_documents (
    id TEXT PRIMARY KEY,
    index_version_id TEXT NOT NULL
      REFERENCES knowledge_index_versions(id) ON DELETE CASCADE,
    document_key TEXT NOT NULL,
    content_checksum TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    UNIQUE (index_version_id, document_key)
  );

  CREATE TABLE knowledge_index_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL
      REFERENCES knowledge_index_documents(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    content TEXT NOT NULL,
    start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
    end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
    start_line INTEGER NOT NULL CHECK (start_line > 0),
    end_line INTEGER NOT NULL CHECK (end_line >= start_line),
    checksum TEXT NOT NULL,
    embedding_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (document_id, ordinal)
  );

  CREATE TABLE knowledge_index_commands (
    idempotency_key TEXT PRIMARY KEY,
    source_id TEXT NOT NULL
      REFERENCES knowledge_sources(id) ON DELETE RESTRICT,
    command_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    result_version_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TRIGGER knowledge_index_versions_prevent_update
    BEFORE UPDATE ON knowledge_index_versions
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge index versions are immutable');
    END;
  CREATE TRIGGER knowledge_index_versions_prevent_delete
    BEFORE DELETE ON knowledge_index_versions
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge index versions are retained');
    END;
  CREATE TRIGGER knowledge_index_documents_prevent_update
    BEFORE UPDATE ON knowledge_index_documents
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge index documents are immutable');
    END;
  CREATE TRIGGER knowledge_index_documents_prevent_delete
    BEFORE DELETE ON knowledge_index_documents
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge index documents are retained');
    END;
  CREATE TRIGGER knowledge_index_chunks_prevent_update
    BEFORE UPDATE ON knowledge_index_chunks
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge index chunks are immutable');
    END;
  CREATE TRIGGER knowledge_index_chunks_prevent_delete
    BEFORE DELETE ON knowledge_index_chunks
    BEGIN
      SELECT RAISE(ABORT, 'Knowledge index chunks are retained');
    END;
`

const ARTIFACT_KNOWLEDGE_INDEX_SCHEMA = `
  ALTER TABLE knowledge_chunks
    ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE knowledge_chunks
    ADD COLUMN end_offset INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE knowledge_chunks
    ADD COLUMN start_line INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE knowledge_chunks
    ADD COLUMN end_line INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE knowledge_chunks
    ADD COLUMN embedding_model TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_chunks
    ADD COLUMN dimensions INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE knowledge_chunks
    ADD COLUMN chunker_version TEXT NOT NULL DEFAULT '';
  ALTER TABLE knowledge_chunks
    ADD COLUMN embedding_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE knowledge_chunks
    ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE knowledge_sync_jobs
    ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'requirement_completed'
      CHECK (trigger_source IN ('requirement_completed', 'retry', 'recovery'));
`

const SKILL_CATALOG_SCHEMA = `
  CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    current_version_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );

  CREATE TABLE skill_versions (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    version TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    entry_json TEXT NOT NULL,
    input_schema_json TEXT NOT NULL,
    output_schema_json TEXT NOT NULL,
    permissions_json TEXT NOT NULL,
    network_json TEXT NOT NULL,
    resources_json TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type = 'local_directory'),
    source_display_name TEXT NOT NULL,
    managed_relative_path TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL CHECK (
      length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'
    ),
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    file_count INTEGER NOT NULL CHECK (file_count > 0),
    installed_at INTEGER NOT NULL CHECK (installed_at >= 0),
    UNIQUE (skill_id, version)
  );
  CREATE INDEX skill_versions_skill_time
    ON skill_versions(skill_id, installed_at DESC, id);

  CREATE TABLE skill_version_integrity (
    skill_version_id TEXT PRIMARY KEY
      REFERENCES skill_versions(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (
      status IN ('verified', 'corrupted', 'missing')
    ),
    message TEXT NOT NULL,
    checked_at INTEGER NOT NULL CHECK (checked_at >= 0)
  );

  CREATE TABLE skill_events (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    skill_version_id TEXT,
    operation TEXT NOT NULL CHECK (
      operation IN (
        'installed', 'enabled', 'disabled', 'verified', 'integrity_failed'
      )
    ),
    skill_revision INTEGER NOT NULL CHECK (skill_revision > 0),
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('user', 'system')),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );
  CREATE INDEX skill_events_skill_time
    ON skill_events(skill_id, occurred_at, id);

  CREATE TABLE skill_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

  CREATE TRIGGER skill_versions_prevent_update
    BEFORE UPDATE ON skill_versions
    BEGIN
      SELECT RAISE(ABORT, 'Skill versions are immutable');
    END;
  CREATE TRIGGER skill_versions_prevent_delete
    BEFORE DELETE ON skill_versions
    BEGIN
      SELECT RAISE(ABORT, 'Skill versions are retained');
    END;
  CREATE TRIGGER skill_events_prevent_update
    BEFORE UPDATE ON skill_events
    BEGIN
      SELECT RAISE(ABORT, 'Skill events are immutable');
    END;
  CREATE TRIGGER skill_events_prevent_delete
    BEFORE DELETE ON skill_events
    BEGIN
      SELECT RAISE(ABORT, 'Skill events are immutable');
    END;
`

const CAPABILITY_PERMISSION_SCHEMA = `
  CREATE TABLE permission_grants (
    id TEXT PRIMARY KEY,
    grant_key TEXT NOT NULL UNIQUE,
    capability TEXT NOT NULL CHECK (
      capability IN (
        'filesystem.read',
        'filesystem.write',
        'terminal.execute',
        'repository.modify'
      )
    ),
    resource_json TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (
      mode IN ('session', 'requirement', 'space', 'persistent')
    ),
    context_json TEXT NOT NULL,
    app_session_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    revoked_at INTEGER CHECK (
      revoked_at IS NULL OR revoked_at >= created_at
    ),
    CHECK (
      (mode = 'session' AND app_session_id IS NOT NULL) OR
      (mode <> 'session' AND app_session_id IS NULL)
    ),
    CHECK (
      (status = 'active' AND revoked_at IS NULL) OR
      (status = 'revoked' AND revoked_at IS NOT NULL)
    )
  );
  CREATE INDEX permission_grants_active_lookup
    ON permission_grants(status, capability, mode, created_at, id);

  CREATE TABLE permission_events (
    id TEXT PRIMARY KEY,
    grant_id TEXT REFERENCES permission_grants(id) ON DELETE RESTRICT,
    operation TEXT NOT NULL CHECK (
      operation IN ('granted', 'reused', 'revoked', 'allowed_once', 'denied')
    ),
    capability TEXT NOT NULL CHECK (
      capability IN (
        'filesystem.read',
        'filesystem.write',
        'terminal.execute',
        'repository.modify'
      )
    ),
    resource_json TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (
      mode IN ('ask', 'session', 'requirement', 'space', 'persistent')
    ),
    trigger_source TEXT NOT NULL CHECK (
      trigger_source IN ('user', 'system')
    ),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );
  CREATE INDEX permission_events_grant_time
    ON permission_events(grant_id, occurred_at, id);

  CREATE TABLE permission_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

  CREATE TRIGGER permission_events_prevent_update
    BEFORE UPDATE ON permission_events
    BEGIN
      SELECT RAISE(ABORT, 'Permission events are immutable');
    END;
  CREATE TRIGGER permission_events_prevent_delete
    BEFORE DELETE ON permission_events
    BEGIN
      SELECT RAISE(ABORT, 'Permission events are immutable');
    END;
`

const SKILL_EXECUTION_SCHEMA = `
  CREATE TABLE skill_executions (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    skill_version_id TEXT NOT NULL
      REFERENCES skill_versions(id) ON DELETE RESTRICT,
    skill_version_checksum TEXT NOT NULL CHECK (
      length(skill_version_checksum) = 64
      AND skill_version_checksum NOT GLOB '*[^0-9a-f]*'
    ),
    trigger_source TEXT NOT NULL CHECK (
      trigger_source IN ('user', 'workflow', 'schedule')
    ),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    requirement_id TEXT REFERENCES requirements(id) ON DELETE RESTRICT,
    session_id TEXT,
    node_run_id TEXT REFERENCES node_runs(id) ON DELETE RESTRICT,
    schedule_run_id TEXT,
    scope_json TEXT NOT NULL,
    context_json TEXT NOT NULL,
    input_json TEXT NOT NULL,
    input_checksum TEXT NOT NULL CHECK (
      length(input_checksum) = 64
      AND input_checksum NOT GLOB '*[^0-9a-f]*'
    ),
    output_json TEXT,
    output_checksum TEXT CHECK (
      output_checksum IS NULL OR (
        length(output_checksum) = 64
        AND output_checksum NOT GLOB '*[^0-9a-f]*'
      )
    ),
    status TEXT NOT NULL CHECK (
      status IN (
        'running', 'succeeded', 'failed', 'cancelled', 'interrupted'
      )
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    cancellation_requested_at INTEGER,
    error_code TEXT,
    error_message TEXT,
    metrics_json TEXT,
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= started_at),
    finished_at INTEGER CHECK (
      finished_at IS NULL OR finished_at >= started_at
    ),
    CHECK (
      (status = 'running' AND finished_at IS NULL)
      OR (status <> 'running' AND finished_at IS NOT NULL)
    ),
    CHECK (
      (status = 'succeeded' AND output_json IS NOT NULL
        AND output_checksum IS NOT NULL AND error_code IS NULL)
      OR (status <> 'succeeded' AND output_json IS NULL
        AND output_checksum IS NULL)
    ),
    CHECK (
      (status IN ('failed', 'interrupted')
        AND error_code IS NOT NULL AND error_message IS NOT NULL)
      OR (status NOT IN ('failed', 'interrupted')
        AND error_code IS NULL AND error_message IS NULL)
    )
  );
  CREATE INDEX skill_executions_version_time
    ON skill_executions(skill_version_id, started_at DESC, id);
  CREATE INDEX skill_executions_requirement_time
    ON skill_executions(requirement_id, started_at DESC, id);
  CREATE INDEX skill_executions_workspace_time
    ON skill_executions(workspace_id, started_at DESC, id);
  CREATE INDEX skill_executions_node_run
    ON skill_executions(node_run_id, started_at DESC, id);
  CREATE INDEX skill_executions_status
    ON skill_executions(status, started_at, id);

  CREATE TABLE skill_execution_events (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL
      REFERENCES skill_executions(id) ON DELETE RESTRICT,
    operation TEXT NOT NULL CHECK (
      operation IN (
        'started', 'succeeded', 'failed', 'cancel_requested',
        'cancelled', 'interrupted'
      )
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    trigger_source TEXT NOT NULL CHECK (
      trigger_source IN ('user', 'workflow', 'schedule', 'system', 'recovery')
    ),
    detail_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );
  CREATE INDEX skill_execution_events_execution_time
    ON skill_execution_events(execution_id, occurred_at, id);

  CREATE TABLE skill_execution_commands (
    idempotency_key TEXT PRIMARY KEY,
    operation TEXT NOT NULL CHECK (operation IN ('execute', 'cancel')),
    command_fingerprint TEXT NOT NULL,
    execution_id TEXT REFERENCES skill_executions(id) ON DELETE RESTRICT,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

  CREATE TRIGGER skill_execution_events_prevent_update
    BEFORE UPDATE ON skill_execution_events
    BEGIN
      SELECT RAISE(ABORT, 'Skill execution events are immutable');
    END;
  CREATE TRIGGER skill_execution_events_prevent_delete
    BEFORE DELETE ON skill_execution_events
    BEGIN
      SELECT RAISE(ABORT, 'Skill execution events are immutable');
    END;
`

const SCHEDULE_MANAGEMENT_SCHEMA = `
  CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'paused')),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    model_profile_id TEXT NOT NULL
      REFERENCES model_profiles(id) ON DELETE RESTRICT,
    skill_version_id TEXT NOT NULL
      REFERENCES skill_versions(id) ON DELETE RESTRICT,
    skill_input_json TEXT NOT NULL,
    connector_bindings_json TEXT NOT NULL,
    permissions_json TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    last_run_at INTEGER,
    last_run_status TEXT CHECK (
      last_run_status IS NULL OR last_run_status IN (
        'succeeded', 'failed', 'cancelled', 'interrupted'
      )
    ),
    CHECK (
      (last_run_at IS NULL AND last_run_status IS NULL)
      OR (last_run_at IS NOT NULL AND last_run_status IS NOT NULL)
    )
  );
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
        'running', 'succeeded', 'failed', 'cancelled', 'interrupted'
      )
    ),
    skill_execution_id TEXT,
    error_code TEXT,
    error_message TEXT,
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    finished_at INTEGER CHECK (
      finished_at IS NULL OR finished_at >= started_at
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    CHECK (
      (status = 'running' AND finished_at IS NULL)
      OR (status <> 'running' AND finished_at IS NOT NULL)
    ),
    CHECK (
      (status IN ('failed', 'interrupted')
        AND error_code IS NOT NULL AND error_message IS NOT NULL)
      OR (status NOT IN ('failed', 'interrupted')
        AND error_code IS NULL AND error_message IS NULL)
    )
  );
  CREATE INDEX schedule_runs_schedule_time
    ON schedule_runs(schedule_id, started_at DESC, id);
  CREATE INDEX schedule_runs_status
    ON schedule_runs(status, started_at, id);

  CREATE TABLE schedule_events (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    schedule_run_id TEXT,
    operation TEXT NOT NULL CHECK (
      operation IN (
        'created', 'updated', 'paused', 'resumed', 'run_started',
        'run_succeeded', 'run_failed', 'run_cancelled',
        'run_interrupted', 'deleted'
      )
    ),
    schedule_revision INTEGER NOT NULL CHECK (schedule_revision > 0),
    detail_json TEXT NOT NULL,
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0)
  );
  CREATE INDEX schedule_events_schedule_time
    ON schedule_events(schedule_id, occurred_at, id);

  CREATE TABLE schedule_commands (
    idempotency_key TEXT PRIMARY KEY,
    command_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );

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
`

const CRON_SCHEDULING_SCHEMA = `
  ALTER TABLE schedule_runs RENAME TO schedule_runs_v40;

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
        'running', 'succeeded', 'failed', 'cancelled', 'interrupted'
      )
    ),
    skill_execution_id TEXT,
    error_code TEXT,
    error_message TEXT,
    scheduled_for INTEGER CHECK (
      scheduled_for IS NULL OR scheduled_for >= 0
    ),
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    finished_at INTEGER CHECK (
      finished_at IS NULL OR finished_at >= started_at
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    CHECK (
      (status = 'running' AND finished_at IS NULL)
      OR (status <> 'running' AND finished_at IS NOT NULL)
    ),
    CHECK (
      (status IN ('failed', 'interrupted')
        AND error_code IS NOT NULL AND error_message IS NOT NULL)
      OR (status NOT IN ('failed', 'interrupted')
        AND error_code IS NULL AND error_message IS NULL)
    ),
    CHECK (
      (trigger_source = 'cron' AND scheduled_for IS NOT NULL)
      OR (trigger_source = 'manual' AND scheduled_for IS NULL)
    ),
    CHECK (
      scheduled_for IS NULL OR scheduled_for <= started_at
    )
  );

  INSERT INTO schedule_runs (
    id, schedule_id, schedule_revision, schedule_name, trigger_source, status,
    skill_execution_id, error_code, error_message, scheduled_for, started_at,
    finished_at, revision
  )
  SELECT
    id, schedule_id, schedule_revision, schedule_name, trigger_source, status,
    skill_execution_id, error_code, error_message,
    CASE WHEN trigger_source = 'cron' THEN started_at ELSE NULL END,
    started_at, finished_at, revision
  FROM schedule_runs_v40;

  DROP TABLE schedule_runs_v40;

  CREATE INDEX schedule_runs_schedule_time
    ON schedule_runs(schedule_id, started_at DESC, id);
  CREATE INDEX schedule_runs_status
    ON schedule_runs(status, started_at, id);
  CREATE UNIQUE INDEX schedule_runs_cron_slot_unique
    ON schedule_runs(schedule_id, schedule_revision, scheduled_for)
    WHERE trigger_source = 'cron';

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
`

const MISSED_SCHEDULE_POLICY_SCHEMA = `
  ALTER TABLE schedules
    ADD COLUMN missed_run_policy TEXT NOT NULL DEFAULT 'skip'
      CHECK (missed_run_policy IN ('skip', 'run_once'));

  CREATE TABLE schedule_recovery_decisions (
    schedule_id TEXT NOT NULL,
    schedule_revision INTEGER NOT NULL CHECK (schedule_revision > 0),
    missed_due_at INTEGER NOT NULL CHECK (missed_due_at >= 0),
    policy TEXT NOT NULL CHECK (policy IN ('skip', 'run_once')),
    action TEXT NOT NULL CHECK (action IN ('skipped', 'run_once')),
    run_id TEXT REFERENCES schedule_runs(id) ON DELETE RESTRICT,
    decided_at INTEGER NOT NULL CHECK (decided_at >= 0),
    PRIMARY KEY (schedule_id, schedule_revision, missed_due_at),
    CHECK (
      (action = 'skipped' AND policy = 'skip' AND run_id IS NULL)
      OR (action = 'run_once' AND policy = 'run_once' AND run_id IS NOT NULL)
    )
  );
  CREATE INDEX schedule_recovery_decisions_latest
    ON schedule_recovery_decisions(schedule_id, decided_at DESC, missed_due_at DESC);

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
`

const APP_UPDATE_CHECK_SCHEMA = `
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
`

const BACKUP_OPERATION_SCHEMA = `
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
`

const WORKFLOW_TEMPLATE_MIGRATION_AUDIT_SCHEMA = `
  ALTER TABLE audit_events RENAME TO audit_events_before_template_migration;

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
        'template_migrated', 'execution_created',
        'execution_status_changed', 'execution_current_node_changed',
        'node_run_created', 'node_run_status_changed', 'advance_enqueued',
        'advance_started', 'advance_completed', 'advance_failed'
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

  INSERT INTO audit_events (
    id, idempotency_key, scope, scope_id, requirement_id, execution_id,
    node_run_id, template_id, template_version_id, event_type, actor_type,
    actor_id, trigger_source, from_state, to_state, reason,
    aggregate_revision, metadata_json, occurred_at
  )
  SELECT
    id, idempotency_key, scope, scope_id, requirement_id, execution_id,
    node_run_id, template_id, template_version_id, event_type, actor_type,
    actor_id, trigger_source, from_state, to_state, reason,
    aggregate_revision, metadata_json, occurred_at
  FROM audit_events_before_template_migration;

  DROP TABLE audit_events_before_template_migration;

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
`

const WORKFLOW_TEMPLATE_MIGRATION_SCHEMA = `
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
`

const PARALLEL_WORKFLOW_EXECUTION_SCHEMA = `
  ALTER TABLE requirement_workflows
    ADD COLUMN max_parallelism INTEGER NOT NULL DEFAULT 1
      CHECK (max_parallelism BETWEEN 1 AND 8);

  ALTER TABLE audit_events RENAME TO audit_events_before_parallel_execution;

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

  INSERT INTO audit_events (
    id, idempotency_key, scope, scope_id, requirement_id, execution_id,
    node_run_id, template_id, template_version_id, event_type, actor_type,
    actor_id, trigger_source, from_state, to_state, reason,
    aggregate_revision, metadata_json, occurred_at
  )
  SELECT
    id, idempotency_key, scope, scope_id, requirement_id, execution_id,
    node_run_id, template_id, template_version_id, event_type, actor_type,
    actor_id, trigger_source, from_state, to_state, reason,
    aggregate_revision, metadata_json, occurred_at
  FROM audit_events_before_parallel_execution;

  DROP TABLE audit_events_before_parallel_execution;

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
`

const CONVERSATION_MESSAGE_COMPLETION_TIME_SCHEMA = `
  ALTER TABLE chat_messages
  ADD COLUMN completed_at INTEGER
    CHECK (completed_at IS NULL OR completed_at >= created_at);
`

const CONVERSATION_MESSAGE_MODEL_SCHEMA = `
  ALTER TABLE chat_messages
  ADD COLUMN model_id TEXT;

  UPDATE chat_messages
  SET model_id = (
    SELECT model_profiles.model_id
    FROM chat_sessions
    JOIN model_profiles
      ON model_profiles.id = chat_sessions.model_profile_id
    WHERE chat_sessions.id = chat_messages.session_id
  )
  WHERE role = 'assistant';
`

const CONVERSATION_MESSAGE_MODEL_NAME_SCHEMA = `
  ALTER TABLE chat_messages ADD COLUMN model_name TEXT;

  UPDATE chat_messages
  SET model_name = COALESCE((
    SELECT model_profiles.display_name
    FROM model_call_metrics
    JOIN model_profiles
      ON model_profiles.id = model_call_metrics.model_profile_id
    WHERE model_call_metrics.ai_run_id = chat_messages.run_id
    ORDER BY model_call_metrics.created_at DESC, model_call_metrics.id DESC
    LIMIT 1
  ), (
    SELECT model_profiles.display_name
    FROM chat_sessions
    JOIN model_profiles
      ON model_profiles.id = chat_sessions.model_profile_id
    WHERE chat_sessions.id = chat_messages.session_id
  ))
  WHERE role = 'assistant'
    AND model_name IS NULL;
`

const WORKBENCH_HUB_LAYOUT_SCHEMA = `
  CREATE TABLE workbench_hub_layout (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    module_order_json TEXT NOT NULL,
    hidden_modules_json TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    updated_at INTEGER NOT NULL
  );
`

const WORKBENCH_TASK_SCHEMA = `
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
    completed_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX workbench_task_records_table_position
    ON workbench_task_records(table_id, deleted_at, position, id);
`

const WORKBENCH_ATTACHMENT_SCHEMA = `
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
`

const CONVERSATION_ATTACHMENT_SCHEMA = `
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
`

const WORKBENCH_SITE_SCHEMA = `
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

  INSERT INTO workbench_site_groups (
    id, name, position, system_key, revision, created_at, updated_at
  ) VALUES (
    'workbench-site-group-ungrouped', '未分组', 0, 'ungrouped', 0, 0, 0
  );
`

const WORKBENCH_MEMO_SCHEMA = `
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
`

const WORKBENCH_AUDIT_SCHEMA = `
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
`

const WORKBENCH_AUDIT_TARGETS = [
  {
    table: 'workbench_hub_layout',
    module: 'layout',
    entityType: 'layout',
    revision: 'revision',
    idColumn: 'singleton_id'
  },
  {
    table: 'workbench_task_tables',
    module: 'tasks',
    entityType: 'task_table',
    revision: 'revision',
    softDelete: true
  },
  {
    table: 'workbench_task_fields',
    module: 'tasks',
    entityType: 'task_field',
    softDelete: true
  },
  {
    table: 'workbench_task_records',
    module: 'tasks',
    entityType: 'task_record',
    revision: 'revision',
    softDelete: true
  },
  {
    table: 'workbench_attachments',
    module: 'attachments',
    entityType: 'attachment',
    softDelete: true
  },
  {
    table: 'workbench_site_groups',
    module: 'sites',
    entityType: 'site_group',
    revision: 'revision',
    softDelete: true
  },
  {
    table: 'workbench_sites',
    module: 'sites',
    entityType: 'site',
    revision: 'revision',
    softDelete: true
  },
  {
    table: 'workbench_memos',
    module: 'memos',
    entityType: 'memo',
    revision: 'revision',
    softDelete: true
  }
] as const

function installWorkbenchAudit(database: Database.Database): void {
  database.exec(WORKBENCH_AUDIT_SCHEMA)
  for (const target of WORKBENCH_AUDIT_TARGETS) {
    const revision = 'revision' in target
      ? `NEW.${target.revision}`
      : 'NULL'
    const oldRevision = 'revision' in target
      ? `OLD.${target.revision}`
      : 'NULL'
    const updateAction = 'softDelete' in target
      ? `CASE
          WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            THEN 'deleted'
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            THEN 'restored'
          ELSE 'updated'
        END`
      : "'updated'"
    const idColumn = 'idColumn' in target ? target.idColumn : 'id'
    database.exec(`
      CREATE TRIGGER ${target.table}_audit_insert
        AFTER INSERT ON ${target.table}
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), '${target.module}', 'created',
            '${target.entityType}', NEW.${idColumn}, ${revision}, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;
      CREATE TRIGGER ${target.table}_audit_update
        AFTER UPDATE ON ${target.table}
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), '${target.module}', ${updateAction},
            '${target.entityType}', NEW.${idColumn}, ${revision}, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;
      CREATE TRIGGER ${target.table}_audit_delete
        AFTER DELETE ON ${target.table}
        BEGIN
          INSERT INTO workbench_audit_events (
            id, module, action, entity_type, entity_id, entity_revision,
            metadata_json, occurred_at
          ) VALUES (
            lower(hex(randomblob(16))), '${target.module}', 'purged',
            '${target.entityType}', OLD.${idColumn}, ${oldRevision}, '{}',
            CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          );
        END;
    `)
  }
}

const MODEL_PROVIDER_API_TYPE_SCHEMA = `
  ALTER TABLE model_providers
  ADD COLUMN api_type TEXT NOT NULL DEFAULT 'openai_completions'
    CHECK (
      api_type IN (
        'openai_completions',
        'openai_responses',
        'anthropic_messages',
        'local'
      )
    );

  UPDATE model_providers
  SET api_type = 'local'
  WHERE type = 'local';
`

const MODEL_CATALOG_PROFILE_SCHEMA = `
  ALTER TABLE model_profiles
  ADD COLUMN source TEXT NOT NULL DEFAULT 'custom'
    CHECK (source IN ('catalog', 'custom'));
  ALTER TABLE model_profiles ADD COLUMN catalog_provider_id TEXT;
  ALTER TABLE model_profiles ADD COLUMN catalog_model_id TEXT;
  ALTER TABLE model_profiles
  ADD COLUMN catalog_version INTEGER CHECK (
    catalog_version IS NULL OR catalog_version > 0
  );
  ALTER TABLE model_profiles
  ADD COLUMN default_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (default_enabled IN (0, 1));
  ALTER TABLE model_profiles
  ADD COLUMN enabled_override INTEGER
    CHECK (enabled_override IS NULL OR enabled_override IN (0, 1));
  ALTER TABLE model_profiles
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'retired'));
  ALTER TABLE model_profiles
  ADD COLUMN input_types_json TEXT NOT NULL DEFAULT '["text"]'
    CHECK (
      json_valid(input_types_json) AND json_type(input_types_json) = 'array'
    );
  ALTER TABLE model_profiles
  ADD COLUMN reasoning INTEGER NOT NULL DEFAULT 0
    CHECK (reasoning IN (0, 1));
  ALTER TABLE model_profiles
  ADD COLUMN max_output_tokens INTEGER NOT NULL DEFAULT 4096
    CHECK (max_output_tokens > 0);

  UPDATE model_profiles SET default_enabled = enabled;

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
`

const MODEL_PROVIDER_METADATA_SCHEMA = `
  ALTER TABLE model_providers
  ADD COLUMN source TEXT NOT NULL DEFAULT 'custom'
    CHECK (source IN ('builtin', 'custom', 'discovered'));
  ALTER TABLE model_providers ADD COLUMN catalog_provider_id TEXT;
  ALTER TABLE model_providers ADD COLUMN icon TEXT;
  ALTER TABLE model_providers
  ADD COLUMN base_url_overridden INTEGER NOT NULL DEFAULT 0
    CHECK (base_url_overridden IN (0, 1));

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
`

const MODEL_PROFILE_ADVANCED_METADATA_SCHEMA = `
  ALTER TABLE model_profiles ADD COLUMN icon TEXT;
  ALTER TABLE model_profiles
  ADD COLUMN api_type TEXT CHECK (
    api_type IS NULL OR api_type IN (
      'openai_completions',
      'openai_responses',
      'anthropic_messages',
      'local'
    )
  );
  ALTER TABLE model_profiles
  ADD COLUMN deepseek_thinking INTEGER NOT NULL DEFAULT 0
    CHECK (deepseek_thinking IN (0, 1));
`

const CONVERSATION_MODEL_REFERENCE_SCHEMA = `
  ALTER TABLE chat_sessions
    ADD COLUMN model_profile_id TEXT
      REFERENCES model_profiles(id) ON DELETE RESTRICT;

  DROP TRIGGER model_profiles_reject_referenced_delete;
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

  DROP TRIGGER model_availability_checks_prevent_delete;
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
`

const MODEL_CONFIGURATION_SOFT_DELETE_SCHEMA = `
  ALTER TABLE model_providers
    ADD COLUMN deleted_at INTEGER CHECK (
      deleted_at IS NULL OR deleted_at >= 0
    );
  ALTER TABLE model_profiles
    ADD COLUMN deleted_at INTEGER CHECK (
      deleted_at IS NULL OR deleted_at >= 0
    );

  CREATE INDEX model_providers_active
    ON model_providers(name, id)
    WHERE deleted_at IS NULL;
  CREATE INDEX model_profiles_active_provider
    ON model_profiles(provider_id, display_name, id)
    WHERE deleted_at IS NULL;
`

const WORKFLOW_TEMPLATE_NODE_POSITION_SCHEMA = `
  ALTER TABLE workflow_nodes
    ADD COLUMN position_x REAL NOT NULL DEFAULT 0;
  ALTER TABLE workflow_nodes
    ADD COLUMN position_y REAL NOT NULL DEFAULT 0;
`

const MODEL_CALL_REASONING_ATTRIBUTION_SCHEMA = `
  ALTER TABLE model_call_metrics
    ADD COLUMN requested_reasoning TEXT
    CHECK (
      requested_reasoning IS NULL OR
      requested_reasoning IN ('inherit', 'off', 'low', 'medium', 'high')
    );
  ALTER TABLE model_call_metrics
    ADD COLUMN effective_reasoning TEXT
    CHECK (
      effective_reasoning IS NULL OR
      effective_reasoning IN ('off', 'low', 'medium', 'high')
    );
`

const WORKFLOW_ROLLBACK_OPERATION_SCHEMA = `
  ALTER TABLE artifacts ADD COLUMN node_run_id TEXT
    REFERENCES node_runs(id) ON DELETE RESTRICT;
  ALTER TABLE artifacts ADD COLUMN is_valid INTEGER NOT NULL DEFAULT 1
    CHECK (is_valid IN (0, 1));
  UPDATE artifacts
  SET node_run_id = (
    SELECT node_runs.id
    FROM ai_runs
    JOIN node_runs ON node_runs.ai_run_id = ai_runs.id
    WHERE ai_runs.artifact_id = artifacts.id
    ORDER BY node_runs.attempt DESC, node_runs.created_at DESC, node_runs.id DESC
    LIMIT 1
  )
  WHERE EXISTS (
    SELECT 1
    FROM ai_runs
    JOIN node_runs ON node_runs.ai_run_id = ai_runs.id
    WHERE ai_runs.artifact_id = artifacts.id
  );
  UPDATE artifacts
  SET is_primary = 0, is_valid = 0
  WHERE node_run_id IS NULL;
  DROP INDEX artifacts_primary_per_node;
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
`

const NODE_TODO_COMPLETION_TIME_SCHEMA = `
  ALTER TABLE node_todos ADD COLUMN completed_at INTEGER;
  UPDATE node_todos
  SET completed_at = updated_at
  WHERE status = 'completed';
  UPDATE node_todos SET required = 1 WHERE required = 0;
`

const QDRANT_VECTOR_INDEX_STATE_SCHEMA = `
  DROP TRIGGER IF EXISTS knowledge_index_chunks_prevent_delete;
  DROP TRIGGER IF EXISTS knowledge_index_chunks_prevent_update;
  DROP TRIGGER IF EXISTS knowledge_index_documents_prevent_delete;
  DROP TRIGGER IF EXISTS knowledge_index_documents_prevent_update;
  DROP TRIGGER IF EXISTS knowledge_index_versions_prevent_delete;
  DROP TRIGGER IF EXISTS knowledge_index_versions_prevent_update;

  DROP TABLE IF EXISTS knowledge_index_chunks;
  DROP TABLE IF EXISTS knowledge_index_documents;
  DROP TABLE IF EXISTS knowledge_indexes;
  DROP TABLE IF EXISTS knowledge_index_versions;
  DROP TABLE IF EXISTS knowledge_index_commands;

  DROP TABLE IF EXISTS knowledge_chunks;
  DROP TABLE IF EXISTS knowledge_documents;
  DROP TABLE IF EXISTS knowledge_sync_jobs;

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

  CREATE TABLE knowledge_index_documents (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL
      REFERENCES knowledge_index_generations(id) ON DELETE CASCADE,
    document_key TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    chunk_count INTEGER NOT NULL CHECK (chunk_count >= 0),
    UNIQUE (generation_id, document_key)
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
  );
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
`

const KNOWLEDGE_SCHEDULED_REFRESH_SCHEMA = `
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

  INSERT INTO knowledge_refresh_policies (
    source_id, enabled, preset, cron_expression, time_zone, revision,
    created_at, updated_at
  )
  SELECT
    id,
    1,
    CASE WHEN type = 'document' THEN '30m' ELSE '5m' END,
    CASE WHEN type = 'document' THEN '*/30 * * * *' ELSE '*/5 * * * *' END,
    'UTC',
    1,
    created_at,
    updated_at
  FROM knowledge_sources
  WHERE status <> 'removed';

  INSERT INTO knowledge_refresh_cursors (
    source_id, policy_revision, next_due_at, missed_due_at,
    last_checked_at, last_changed_at, updated_at
  )
  SELECT id, 1, 0, NULL, NULL, NULL, updated_at
  FROM knowledge_sources
  WHERE status <> 'removed';

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
`

const KNOWLEDGE_SOURCE_REMOVAL_VISIBILITY_SCHEMA = `
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
`

const CONVERSATION_KNOWLEDGE_SCOPE_SCHEMA = `
  ALTER TABLE chat_sessions
    ADD COLUMN knowledge_scope TEXT NOT NULL DEFAULT '{"kind":"none"}'
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
      );

  UPDATE chat_sessions
  SET knowledge_scope = CASE
    WHEN kind = 'space' AND workspace_id IS NOT NULL
      THEN json_object('kind', 'workspace', 'workspaceId', workspace_id)
    WHEN kind = 'requirement_node'
      THEN '{"kind":"node_configuration"}'
    ELSE '{"kind":"none"}'
  END;

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
`

const KNOWLEDGE_NOTE_SCHEMA = `
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
`

const REQUIREMENT_MEMORY_AND_MANIFEST_SCHEMA = `
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

  ALTER TABLE knowledge_index_documents
    RENAME TO knowledge_index_documents_v58;
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
  INSERT INTO knowledge_index_documents (
    id, generation_id, document_key, source_entity_id, source_version,
    checksum, byte_size, chunk_count
  )
  SELECT
    id, generation_id, document_key, source_entity_id, source_version,
    checksum, byte_size, chunk_count
  FROM knowledge_index_documents_v58;
  DROP TABLE knowledge_index_documents_v58;
`

const INDEX_RECOVERY_AND_WORKSPACE_CLEANUP_SCHEMA = `
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
`

const VECTOR_INDEX_PROFILE_RECOVERY_SCHEMA = `
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
`

const REPOSITORY_BRANCH_FILE_INDEX_SCHEMA = `
  ALTER TABLE repository_sources ADD COLUMN selected_branch TEXT;
  ALTER TABLE repository_snapshots ADD COLUMN branch TEXT;
  ALTER TABLE knowledge_index_jobs ADD COLUMN target_document_key TEXT;

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
`

const ACTIVE_KNOWLEDGE_SOURCE_IDENTITY_SCHEMA = `
  CREATE TABLE knowledge_sources_next (
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

  INSERT INTO knowledge_sources_next (
    id, workspace_id, name, type, locator, detail, sort_order, status,
    sync_started_at, indexed_at, error_code, error_message, revision,
    created_at, updated_at
  )
  SELECT
    id, workspace_id, name, type, locator, detail, sort_order, status,
    sync_started_at, indexed_at, error_code, error_message, revision,
    created_at, updated_at
  FROM knowledge_sources;

  DROP TRIGGER knowledge_sources_validate_transition;
  DROP TRIGGER knowledge_sources_prevent_delete;
  DROP TRIGGER knowledge_sources_create_refresh_policy;
  DROP TRIGGER knowledge_sources_cancel_refresh_on_remove;
  DROP TABLE knowledge_sources;
  ALTER TABLE knowledge_sources_next RENAME TO knowledge_sources;

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

  CREATE TABLE repository_sources_next (
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

  INSERT INTO repository_sources_next (
    source_id, workspace_id, mode, local_path, connector_id, path,
    managed_relative_path, locator, current_version, revision_label,
    file_count, total_bytes, last_scanned_at, created_at, updated_at,
    selected_branch
  )
  SELECT
    source_id, workspace_id, mode, local_path, connector_id, path,
    managed_relative_path, locator, current_version, revision_label,
    file_count, total_bytes, last_scanned_at, created_at, updated_at,
    selected_branch
  FROM repository_sources;

  DROP TABLE repository_sources;
  ALTER TABLE repository_sources_next RENAME TO repository_sources;
  CREATE INDEX repository_sources_workspace
    ON repository_sources(workspace_id, source_id);
  CREATE INDEX repository_sources_local_identity
    ON repository_sources(workspace_id, local_path)
    WHERE mode = 'local';
  CREATE INDEX repository_sources_remote_identity
    ON repository_sources(workspace_id, connector_id, path)
    WHERE mode = 'remote';
`

const TASK_RECORD_PERMANENT_DELETE_SCHEMA = `
  DELETE FROM workbench_attachments
  WHERE owner_type = 'task_record'
    AND owner_id IN (
      SELECT id
      FROM workbench_task_records
      WHERE deleted_at IS NOT NULL
    );

  DELETE FROM workbench_task_records
  WHERE deleted_at IS NOT NULL;
`

const TASK_RECORD_COMPLETION_REMOVAL_SCHEMA = `
  ALTER TABLE workbench_task_records DROP COLUMN completed_at;
`

const TOOL_RUNTIME_CLEAN_BREAK_SCHEMA = `
  DROP TABLE IF EXISTS skill_execution_events;
  DROP TABLE IF EXISTS skill_execution_commands;
  DROP TABLE IF EXISTS skill_executions;
  DROP TABLE IF EXISTS permission_events;
  DROP TABLE IF EXISTS permission_commands;
  DROP TABLE IF EXISTS permission_grants;
  DROP TABLE IF EXISTS skill_version_integrity;
  DROP TABLE IF EXISTS skill_events;
  DROP TABLE IF EXISTS skill_commands;
  DROP TABLE IF EXISTS skill_versions;
  DROP TABLE IF EXISTS skills;

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
  CREATE TABLE tool_outbox (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    message_key TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    headers_json TEXT NOT NULL CHECK (json_valid(headers_json)),
    status TEXT NOT NULL CHECK (
      status IN ('pending', 'leased', 'published', 'dead_letter')
    ),
    available_at INTEGER NOT NULL CHECK (available_at >= 0),
    lease_owner TEXT,
    lease_expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error_summary TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    published_at INTEGER
  );
  CREATE INDEX tool_outbox_available
    ON tool_outbox(status, available_at, created_at, id);
  CREATE TABLE tool_snapshots (
    stream_id TEXT PRIMARY KEY,
    stream_type TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    state_json TEXT NOT NULL CHECK (json_valid(state_json)),
    state_checksum TEXT NOT NULL CHECK (length(state_checksum) = 64),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  );
  CREATE TABLE tool_projection_checkpoints (
    projection_name TEXT PRIMARY KEY,
    global_position INTEGER NOT NULL CHECK (global_position >= 0),
    generation INTEGER NOT NULL CHECK (generation > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
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
  CREATE TABLE tool_execution_projections (
    execution_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    state_json TEXT NOT NULL CHECK (json_valid(state_json)),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );
  CREATE TABLE tool_permission_request_projections (
    request_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );
  CREATE TABLE tool_permission_grant_projections (
    grant_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );
  CREATE TABLE tool_catalog_search_projections (
    definition_key TEXT PRIMARY KEY,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );
  CREATE TABLE tool_adapter_health_projections (
    adapter_kind TEXT PRIMARY KEY,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );
  CREATE TABLE tool_usage_daily_projections (
    usage_key TEXT PRIMARY KEY,
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
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
`

const EVENT_SOURCED_SCHEDULE_SCHEMA = `
  DROP TABLE IF EXISTS schedule_recovery_decisions;
  DROP TABLE IF EXISTS schedule_trigger_cursors;
  DROP TABLE IF EXISTS schedule_runs;
  DROP TABLE IF EXISTS schedule_events;
  DROP TABLE IF EXISTS schedule_commands;
  DROP TABLE IF EXISTS schedules;

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
  );
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
        'running', 'succeeded', 'failed', 'cancelled', 'interrupted'
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
    revision INTEGER NOT NULL CHECK (revision > 0),
    CHECK (
      (status = 'running' AND finished_at IS NULL)
      OR (status <> 'running' AND finished_at IS NOT NULL)
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
        'run_interrupted', 'deleted'
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
`

const AGENT_RUNTIME_RUN_SCHEMA = `
  CREATE TABLE agent_runtime_runs (
    id TEXT PRIMARY KEY,
    provider_run_id TEXT UNIQUE,
    scenario_id TEXT NOT NULL CHECK (scenario_id IN (
      'general', 'folder', 'space', 'requirement-node', 'workflow-node',
      'scheduled', 'sensitive', 'management'
    )),
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN (
      'preparing', 'running', 'waiting_permission', 'waiting_input',
      'retrying', 'completed', 'failed', 'cancelled'
    )),
    snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
    error TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
  );
  CREATE INDEX agent_runtime_runs_status_updated
    ON agent_runtime_runs(lifecycle_status, updated_at, id);
  CREATE TRIGGER agent_runtime_runs_snapshot_immutable
    BEFORE UPDATE OF scenario_id, snapshot_json, created_at
    ON agent_runtime_runs
    BEGIN
      SELECT RAISE(ABORT, 'Agent Run snapshot is immutable');
    END;
`

const SUBAGENT_RUN_LINEAGE_SCHEMA = `
  ALTER TABLE agent_runtime_runs
    ADD COLUMN root_run_id TEXT
    GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.rootRunId')
    ) VIRTUAL;
  ALTER TABLE agent_runtime_runs
    ADD COLUMN parent_run_id TEXT
    GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.parentRunId')
    ) VIRTUAL;
  ALTER TABLE agent_runtime_runs
    ADD COLUMN delegation_depth INTEGER
    GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.delegationDepth')
    ) VIRTUAL;
  ALTER TABLE agent_runtime_runs
    ADD COLUMN delegation_ordinal INTEGER
    GENERATED ALWAYS AS (
      json_extract(snapshot_json, '$.delegationOrdinal')
    ) VIRTUAL;
  CREATE INDEX agent_runtime_runs_root
    ON agent_runtime_runs(
      root_run_id, delegation_depth, delegation_ordinal, created_at, id
    );
  CREATE INDEX agent_runtime_runs_parent
    ON agent_runtime_runs(
      parent_run_id, delegation_ordinal, created_at, id
    );
`

const CONVERSATION_PROCESSING_SCHEMA = `
  ALTER TABLE chat_messages ADD COLUMN processing_json TEXT
    CHECK (
      processing_json IS NULL OR (
        json_valid(processing_json) AND
        json_extract(processing_json, '$.schemaVersion') = 1
      )
    );
`

const ASSISTANT_RUN_TIMELINE_SCHEMA = `
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
  CREATE TRIGGER assistant_run_events_prevent_delete
    BEFORE DELETE ON assistant_run_events
    WHEN EXISTS (
      SELECT 1 FROM chat_messages WHERE id = OLD.assistant_message_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Assistant Run events are immutable');
    END;

  CREATE TABLE assistant_turn_projections (
    run_id TEXT PRIMARY KEY,
    assistant_message_id TEXT NOT NULL
      REFERENCES chat_messages(id) ON DELETE CASCADE,
    last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
    projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
  );
`

const FOLLOW_UP_SUGGESTION_SCHEMA = `
  ALTER TABLE chat_messages ADD COLUMN source_json TEXT
    CHECK (source_json IS NULL OR json_valid(source_json));

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
`

function addFollowUpSuggestionMetricSource(database: Database.Database): void {
  const row = database
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'table' AND name = 'model_call_metrics'`
    )
    .get() as { sql: string } | undefined
  if (!row || row.sql.includes("'follow_up_suggestion'")) return
  const dependentSql = database
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE (
         tbl_name = 'model_call_metrics'
         OR (type = 'trigger' AND sql LIKE '%model_call_metrics%')
       )
         AND type IN ('index', 'trigger')
         AND sql IS NOT NULL`
    )
    .all() as Array<{
      type: 'index' | 'trigger'
      name: string
      sql: string
    }>
  const nextSchema = row.sql
    .replace(
      /^CREATE TABLE\s+"?model_call_metrics"?/i,
      'CREATE TABLE model_call_metrics_next'
    )
    .replace(
      "'requirement_node_conversation'\n      )",
      "'requirement_node_conversation', 'follow_up_suggestion'\n      )"
    )
  if (!nextSchema.includes("'follow_up_suggestion'")) {
    throw new Error('Model call metric source constraint was not recognized')
  }
  const dropTriggers = dependentSql
    .filter(({ type }) => type === 'trigger')
    .map(({ name }) => `DROP TRIGGER ${quoteSqlIdentifier(name)};`)
    .join('\n')
  database.exec(`
    ${nextSchema};
    INSERT INTO model_call_metrics_next SELECT * FROM model_call_metrics;
    ${dropTriggers}
    DROP TABLE model_call_metrics;
    ALTER TABLE model_call_metrics_next RENAME TO model_call_metrics;
  `)
  for (const dependency of dependentSql) database.exec(dependency.sql)
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function removeMandatoryUngroupedSiteGroup(
  database: Database.Database
): void {
  const now = Date.now()
  database
    .prepare(
      `UPDATE workbench_site_groups
       SET deleted_at = ?, updated_at = ?, revision = revision + 1
       WHERE system_key = 'ungrouped'
         AND deleted_at IS NULL
         AND name = '未分组'
         AND revision = 0
         AND NOT EXISTS (
           SELECT 1 FROM workbench_sites
           WHERE group_id = workbench_site_groups.id
             AND deleted_at IS NULL
         )`
    )
    .run(now, now)
  database
    .prepare(
      `UPDATE workbench_site_groups
       SET system_key = NULL, updated_at = ?
       WHERE system_key = 'ungrouped'`
    )
    .run(now)
}

function repairSuspendedConversationBoundaries(
  database: Database.Database
): void {
  const rows = database
    .prepare(
      `SELECT p.run_id, p.projection_json, p.updated_at,
              m.id AS message_id, m.completed_at
       FROM assistant_turn_projections p
       JOIN chat_messages m ON m.id = p.assistant_message_id
       WHERE m.status = 'failed'
         AND m.error = 'Conversation run ended without a terminal event'
         AND json_extract(p.projection_json, '$.status') IN (
           'waiting_input', 'paused', 'recovery_blocked'
         )`
    )
    .all() as Array<{
      run_id: string
      projection_json: string
      updated_at: number
      message_id: string
      completed_at: number | null
    }>
  const updateProjection = database.prepare(
    `UPDATE assistant_turn_projections
     SET projection_json = ?, updated_at = ?
     WHERE run_id = ?`
  )
  const updateMessage = database.prepare(
    `UPDATE chat_messages
     SET status = 'completed', error = NULL
     WHERE id = ?`
  )
  for (const row of rows) {
    const parsed = JSON.parse(row.projection_json) as Record<string, unknown>
    const elapsedAt = row.completed_at ?? row.updated_at
    const toolCalls = Array.isArray(parsed.toolCalls)
      ? parsed.toolCalls.map((value) => {
          if (!value || typeof value !== 'object') return value
          const toolCall = value as Record<string, unknown>
          return toolCall.status === 'requested' ||
            toolCall.status === 'running'
            ? {
                ...toolCall,
                status: 'failed',
                completedAt: elapsedAt,
                errorCode: 'run_suspended',
                error: 'Run suspended before Tool execution completed'
              }
            : toolCall
        })
      : []
    updateProjection.run(
      JSON.stringify({
        ...parsed,
        elapsedAt:
          typeof parsed.elapsedAt === 'number'
            ? parsed.elapsedAt
            : elapsedAt,
        toolCalls
      }),
      Math.max(row.updated_at, elapsedAt),
      row.run_id
    )
    updateMessage.run(row.message_id)
  }
}

function backfillNoProgressConclusions(database: Database.Database): void {
  const rows = database
    .prepare(
      `SELECT m.id AS message_id, p.projection_json,
              COALESCE((
                SELECT user_message.content
                FROM chat_messages user_message
                WHERE user_message.session_id = m.session_id
                  AND user_message.role = 'user'
                  AND user_message.sort_order < m.sort_order
                ORDER BY user_message.sort_order DESC
                LIMIT 1
              ), '') AS user_content
       FROM chat_messages m
       JOIN assistant_turn_projections p ON p.assistant_message_id = m.id
       WHERE m.role = 'assistant'
         AND m.status = 'completed'
         AND m.content = ''
         AND json_extract(p.projection_json, '$.status') = 'waiting_input'
         AND json_extract(p.projection_json, '$.recovery.reason') IN (
           'repeated_tool_call',
           'consecutive_tool_failures',
           'capability_unavailable'
         )`
    )
    .all() as Array<{
      message_id: string
      projection_json: string
      user_content: string
    }>
  const updateMessage = database.prepare(
    `UPDATE chat_messages SET content = ? WHERE id = ? AND content = ''`
  )
  for (const row of rows) {
    const projection = JSON.parse(row.projection_json) as Record<string, unknown>
    const toolCalls = Array.isArray(projection.toolCalls)
      ? projection.toolCalls.filter(
          (value): value is Record<string, unknown> =>
            Boolean(value) && typeof value === 'object'
        )
      : []
    const artifactPaths = toolCalls
      .filter(
        (call) =>
          call.status === 'completed' &&
          typeof call.toolName === 'string' &&
          call.toolName.includes('document_create')
      )
      .flatMap((call) => {
        if (typeof call.argumentsSummary !== 'string') return []
        try {
          const argumentsValue = JSON.parse(
            call.argumentsSummary
          ) as Record<string, unknown>
          return typeof argumentsValue.outputPath === 'string'
            ? [argumentsValue.outputPath]
            : []
        } catch {
          return []
        }
      })
    const failureCodes = new Set(
      toolCalls
        .filter(
          (call) =>
            call.status === 'failed' &&
            typeof call.errorCode === 'string'
        )
        .map((call) => call.errorCode as string)
    )
    const reason =
      projection.recovery &&
      typeof projection.recovery === 'object' &&
      typeof (projection.recovery as Record<string, unknown>).reason ===
        'string'
        ? ((projection.recovery as Record<string, unknown>).reason as string)
        : 'consecutive_tool_failures'
    updateMessage.run(
      historicalDegradedConclusion({
        locale: historicalResponseLocale(row.user_content),
        reason,
        artifactPaths: [...new Set(artifactPaths)],
        pdfUnavailable: failureCodes.has('document_export_unavailable')
      }),
      row.message_id
    )
  }
}

function historicalResponseLocale(value: string): 'zh-CN' | 'en' | 'ja' {
  if (/[\u3040-\u30ff]/.test(value)) return 'ja'
  if (/[\u3400-\u9fff]/.test(value)) return 'zh-CN'
  return 'en'
}

function historicalDegradedConclusion(input: {
  locale: 'zh-CN' | 'en' | 'ja'
  reason: string
  artifactPaths: string[]
  pdfUnavailable: boolean
}): string {
  const artifacts = input.artifactPaths
    .map((path) => `\`${path}\``)
    .join(', ')
  if (input.locale === 'zh-CN') {
    if (input.pdfUnavailable) {
      return input.artifactPaths.length > 0
        ? `任务未能完成 PDF 交付：当前设备未检测到 LibreOffice，无法导出 PDF。已成功生成可用的 DOCX：${artifacts}。请安装 LibreOffice 后重试 PDF 导出，或直接使用该 DOCX。`
        : '任务未能完成 PDF 交付：当前设备未检测到 LibreOffice，无法导出 PDF。请安装 LibreOffice 后重试。'
    }
    return input.artifactPaths.length > 0
      ? `任务已暂停，未能完成最终交付。已保留中间产物：${artifacts}。请检查失败详情后继续。`
      : '任务已暂停，未能完成最终交付。请检查失败详情后继续。'
  }
  if (input.locale === 'ja') {
    if (input.pdfUnavailable) {
      return input.artifactPaths.length > 0
        ? `PDF の生成を完了できませんでした。現在の端末では LibreOffice が検出されません。利用可能な DOCX は生成済みです: ${artifacts}。LibreOffice をインストールして再試行するか、この DOCX を使用してください。`
        : 'PDF の生成を完了できませんでした。現在の端末では LibreOffice が検出されません。LibreOffice をインストールして再試行してください。'
    }
    return 'タスクを一時停止し、最終成果物を完成できませんでした。失敗の詳細を確認してから続行してください。'
  }
  if (input.pdfUnavailable) {
    return input.artifactPaths.length > 0
      ? `The task could not complete PDF delivery because LibreOffice is unavailable on this device. A usable DOCX was created: ${artifacts}. Install LibreOffice and retry PDF export, or use the DOCX directly.`
      : 'The task could not complete PDF delivery because LibreOffice is unavailable on this device. Install LibreOffice and retry.'
  }
  return 'The task paused and could not complete the final delivery. Review the failure details before continuing.'
}

const UNIFIED_CAPABILITY_CATALOG_SCHEMA = `
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
`

const CAPABILITY_PACKAGE_BINDINGS_SCHEMA = `
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
`

const CAPABILITY_GENERATION_SCHEMA = `
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
`

const RUNTIME_GOVERNANCE_SCHEMA = `
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
  INSERT INTO runtime_governance_revisions (
    singleton_id, revision, candidate_digest, updated_at
  ) VALUES (1, 1, NULL, 0);

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
`

const RUNTIME_OBSERVABILITY_STATE_SCHEMA = `
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
  INSERT INTO runtime_observability_state (
    singleton_id, retention_days, maximum_events, dropped_events, updated_at
  ) VALUES (1, 30, 50000, 0, 0);
`

const CONVERSATION_ATTACHMENT_CHUNK_SCHEMA = `
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
`

const ASSISTANT_RUN_RETENTION_SCHEMA = `
  DROP TRIGGER assistant_run_events_prevent_delete;

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
`

const AGENT_PROFILE_CATALOG_SCHEMA = `
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
`

const AGENT_RUN_CHECKPOINT_SCHEMA = `
  DROP TRIGGER agent_runtime_runs_snapshot_immutable;
  ALTER TABLE agent_runtime_runs RENAME TO agent_runtime_runs_before_checkpoint;

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
    current_checkpoint_ordinal INTEGER NOT NULL DEFAULT 0
      CHECK (current_checkpoint_ordinal >= 0),
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
  INSERT INTO agent_runtime_runs (
    id, provider_run_id, scenario_id, lifecycle_status, snapshot_json,
    error, current_checkpoint_ordinal, created_at, updated_at
  )
  SELECT
    id, provider_run_id, scenario_id, lifecycle_status, snapshot_json,
    error, 0, created_at, updated_at
  FROM agent_runtime_runs_before_checkpoint;
  DROP TABLE agent_runtime_runs_before_checkpoint;

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
  INSERT INTO agent_run_attempts (
    run_id, attempt_ordinal, provider_run_id, resume_token, created_at
  )
  SELECT id, 1, provider_run_id, NULL, updated_at
  FROM agent_runtime_runs
  WHERE provider_run_id IS NOT NULL;
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

  CREATE TABLE agent_run_checkpoints (
    run_id TEXT NOT NULL
      REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal > 0),
    resume_token TEXT NOT NULL UNIQUE CHECK (length(resume_token) = 64),
    projection_cursor INTEGER NOT NULL CHECK (projection_cursor >= 0),
    checkpoint_json TEXT NOT NULL CHECK (
      json_valid(checkpoint_json) AND
      json_extract(checkpoint_json, '$.schemaVersion') = 1
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY (run_id, ordinal)
  );
  CREATE INDEX agent_run_checkpoints_latest
    ON agent_run_checkpoints(run_id, ordinal DESC);
  CREATE TRIGGER agent_run_checkpoints_prevent_update
    BEFORE UPDATE ON agent_run_checkpoints
    BEGIN
      SELECT RAISE(ABORT, 'Agent Run checkpoints are immutable');
    END;
  CREATE TRIGGER agent_run_checkpoints_prevent_delete
    BEFORE DELETE ON agent_run_checkpoints
    BEGIN
      SELECT RAISE(ABORT, 'Agent Run checkpoints are immutable');
    END;
`

const DOCUMENT_DELIVERY_PERSISTENCE_SCHEMA = `
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

  ALTER TABLE artifacts ADD COLUMN media_type TEXT;
  ALTER TABLE artifacts ADD COLUMN verification_receipt_id TEXT
    REFERENCES document_delivery_receipts(id) ON DELETE SET NULL;
  CREATE INDEX artifacts_verification_receipt
    ON artifacts(verification_receipt_id)
    WHERE verification_receipt_id IS NOT NULL;
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
  },
  {
    version: 8,
    name: 'trash_lifecycle_state',
    up: (database) => database.exec(TRASH_LIFECYCLE_SCHEMA)
  },
  {
    version: 9,
    name: 'space_relocation_audit',
    up: (database) => database.exec(SPACE_RELOCATION_SCHEMA)
  },
  {
    version: 10,
    name: 'workflow_revision_metadata',
    up: (database) => database.exec(WORKFLOW_REVISION_METADATA_SCHEMA)
  },
  {
    version: 11,
    name: 'workflow_execution_transitions',
    up: (database) => database.exec(WORKFLOW_EXECUTION_TRANSITION_SCHEMA)
  },
  {
    version: 12,
    name: 'node_run_transitions',
    up: (database) => database.exec(NODE_RUN_TRANSITION_SCHEMA)
  },
  {
    version: 13,
    name: 'node_todo_transitions',
    up: (database) => database.exec(NODE_TODO_TRANSITION_SCHEMA)
  },
  {
    version: 14,
    name: 'node_question_transitions',
    up: (database) => database.exec(NODE_QUESTION_TRANSITION_SCHEMA)
  },
  {
    version: 15,
    name: 'node_approvals',
    up: (database) => database.exec(NODE_APPROVAL_SCHEMA)
  },
  {
    version: 16,
    name: 'workflow_revision_recovery_source',
    up: (database) =>
      database.exec(WORKFLOW_REVISION_RECOVERY_SOURCE_SCHEMA)
  },
  {
    version: 17,
    name: 'workflow_audit_events',
    up: (database) => database.exec(WORKFLOW_AUDIT_EVENT_SCHEMA)
  },
  {
    version: 18,
    name: 'model_provider_events',
    up: (database) => database.exec(MODEL_PROVIDER_EVENT_SCHEMA)
  },
  {
    version: 19,
    name: 'model_profile_management',
    up: (database) => database.exec(MODEL_PROFILE_MANAGEMENT_SCHEMA)
  },
  {
    version: 20,
    name: 'model_availability_checks',
    up: (database) => database.exec(MODEL_AVAILABILITY_CHECK_SCHEMA)
  },
  {
    version: 21,
    name: 'model_credential_key_rotations',
    up: (database) => database.exec(MODEL_CREDENTIAL_KEY_ROTATION_SCHEMA)
  },
  {
    version: 22,
    name: 'context_snapshots',
    up: (database) => database.exec(CONTEXT_SNAPSHOT_SCHEMA)
  },
  {
    version: 23,
    name: 'conversation_message_lifecycle',
    up: (database) => database.exec(CONVERSATION_MESSAGE_LIFECYCLE_SCHEMA)
  },
  {
    version: 24,
    name: 'sidecar_run_metrics',
    up: (database) => database.exec(SIDECAR_RUN_METRICS_SCHEMA)
  },
  {
    version: 25,
    name: 'requirement_node_conversations',
    up: (database) => database.exec(REQUIREMENT_NODE_CONVERSATION_SCHEMA)
  },
  {
    version: 26,
    name: 'model_call_metric_details',
    up: (database) => database.exec(MODEL_CALL_METRIC_DETAILS_SCHEMA)
  },
  {
    version: 27,
    name: 'ai_run_metric_attribution',
    up: (database) => database.exec(AI_RUN_METRIC_ATTRIBUTION_SCHEMA)
  },
  {
    version: 28,
    name: 'outbound_call_audit',
    up: (database) => database.exec(OUTBOUND_CALL_AUDIT_SCHEMA)
  },
  {
    version: 29,
    name: 'knowledge_source_lifecycle',
    up: (database) => database.exec(KNOWLEDGE_SOURCE_LIFECYCLE_SCHEMA)
  },
  {
    version: 30,
    name: 'local_file_ingestion',
    up: (database) => database.exec(LOCAL_FILE_INGESTION_SCHEMA)
  },
  {
    version: 31,
    name: 'connector_management',
    up: (database) => database.exec(CONNECTOR_MANAGEMENT_SCHEMA)
  },
  {
    version: 32,
    name: 'outbound_call_connector_errors',
    up: (database) => database.exec(OUTBOUND_CALL_CONNECTOR_ERRORS_SCHEMA)
  },
  {
    version: 33,
    name: 'online_document_snapshots',
    up: (database) => database.exec(ONLINE_DOCUMENT_SNAPSHOT_SCHEMA)
  },
  {
    version: 34,
    name: 'repository_ingestion',
    up: (database) => database.exec(REPOSITORY_INGESTION_SCHEMA)
  },
  {
    version: 35,
    name: 'local_knowledge_index',
    up: (database) => database.exec(LOCAL_KNOWLEDGE_INDEX_SCHEMA)
  },
  {
    version: 36,
    name: 'artifact_knowledge_index',
    up: (database) => database.exec(ARTIFACT_KNOWLEDGE_INDEX_SCHEMA)
  },
  {
    version: 37,
    name: 'skill_catalog',
    up: (database) => database.exec(SKILL_CATALOG_SCHEMA)
  },
  {
    version: 38,
    name: 'capability_scope_permissions',
    up: (database) => database.exec(CAPABILITY_PERMISSION_SCHEMA)
  },
  {
    version: 39,
    name: 'skill_execution_runtime',
    up: (database) => database.exec(SKILL_EXECUTION_SCHEMA)
  },
  {
    version: 40,
    name: 'schedule_management',
    up: (database) => database.exec(SCHEDULE_MANAGEMENT_SCHEMA)
  },
  {
    version: 41,
    name: 'cron_scheduling',
    up: (database) => database.exec(CRON_SCHEDULING_SCHEMA)
  },
  {
    version: 42,
    name: 'missed_schedule_policy',
    up: (database) => database.exec(MISSED_SCHEDULE_POLICY_SCHEMA)
  },
  {
    version: 43,
    name: 'app_update_checks',
    up: (database) => database.exec(APP_UPDATE_CHECK_SCHEMA)
  },
  {
    version: 44,
    name: 'backup_operations',
    up: (database) => database.exec(BACKUP_OPERATION_SCHEMA)
  },
  {
    version: 45,
    name: 'workflow_template_migrations',
    up: (database) => {
      const hasAuditEvents = database
        .prepare(
          `SELECT 1 FROM sqlite_master
           WHERE type = 'table' AND name = 'audit_events'`
        )
        .get()
      if (hasAuditEvents) {
        database.exec(WORKFLOW_TEMPLATE_MIGRATION_AUDIT_SCHEMA)
      }
      database.exec(WORKFLOW_TEMPLATE_MIGRATION_SCHEMA)
    }
  },
  {
    version: 46,
    name: 'parallel_workflow_execution',
    up: (database) => database.exec(PARALLEL_WORKFLOW_EXECUTION_SCHEMA)
  },
  {
    version: 47,
    name: 'conversation_message_completion_time',
    up: (database) =>
      database.exec(CONVERSATION_MESSAGE_COMPLETION_TIME_SCHEMA)
  },
  {
    version: 48,
    name: 'model_provider_api_type',
    up: (database) => database.exec(MODEL_PROVIDER_API_TYPE_SCHEMA)
  },
  {
    version: 49,
    name: 'model_catalog_profiles',
    up: (database) => database.exec(MODEL_CATALOG_PROFILE_SCHEMA)
  },
  {
    version: 50,
    name: 'model_provider_metadata',
    up: (database) => database.exec(MODEL_PROVIDER_METADATA_SCHEMA)
  },
  {
    version: 51,
    name: 'model_profile_advanced_metadata',
    up: (database) => database.exec(MODEL_PROFILE_ADVANCED_METADATA_SCHEMA)
  },
  {
    version: 52,
    name: 'conversation_model_references',
    up: (database) => database.exec(CONVERSATION_MODEL_REFERENCE_SCHEMA)
  },
  {
    version: 53,
    name: 'model_configuration_soft_delete',
    up: (database) =>
      database.exec(MODEL_CONFIGURATION_SOFT_DELETE_SCHEMA)
  },
  {
    version: 54,
    name: 'workflow_template_node_positions',
    up: (database) =>
      database.exec(WORKFLOW_TEMPLATE_NODE_POSITION_SCHEMA)
  },
  {
    version: 55,
    name: 'model_call_reasoning_attribution',
    up: (database) =>
      database.exec(MODEL_CALL_REASONING_ATTRIBUTION_SCHEMA)
  },
  {
    version: 56,
    name: 'workflow_rollback_operations',
    up: (database) =>
      database.exec(WORKFLOW_ROLLBACK_OPERATION_SCHEMA)
  },
  {
    version: 57,
    name: 'node_todo_completion_time',
    up: (database) => database.exec(NODE_TODO_COMPLETION_TIME_SCHEMA)
  },
  {
    version: 58,
    name: 'qdrant_vector_index_state',
    up: (database) => database.exec(QDRANT_VECTOR_INDEX_STATE_SCHEMA)
  },
  {
    version: 59,
    name: 'knowledge_scheduled_refresh',
    up: (database) => database.exec(KNOWLEDGE_SCHEDULED_REFRESH_SCHEMA)
  },
  {
    version: 60,
    name: 'knowledge_source_removal_visibility',
    up: (database) =>
      database.exec(KNOWLEDGE_SOURCE_REMOVAL_VISIBILITY_SCHEMA)
  },
  {
    version: 61,
    name: 'conversation_knowledge_scope',
    up: (database) =>
      database.exec(CONVERSATION_KNOWLEDGE_SCOPE_SCHEMA)
  },
  {
    version: 62,
    name: 'knowledge_notes',
    up: (database) => database.exec(KNOWLEDGE_NOTE_SCHEMA)
  },
  {
    version: 63,
    name: 'requirement_memories_and_generation_manifests',
    up: (database) =>
      database.exec(REQUIREMENT_MEMORY_AND_MANIFEST_SCHEMA)
  },
  {
    version: 64,
    name: 'index_recovery_and_workspace_cleanup',
    up: (database) =>
      database.exec(INDEX_RECOVERY_AND_WORKSPACE_CLEANUP_SCHEMA)
  },
  {
    version: 65,
    name: 'vector_index_profile_recovery',
    up: (database) =>
      database.exec(VECTOR_INDEX_PROFILE_RECOVERY_SCHEMA)
  },
  {
    version: 66,
    name: 'repository_branch_file_index',
    up: (database) =>
      database.exec(REPOSITORY_BRANCH_FILE_INDEX_SCHEMA)
  },
  {
    version: 67,
    name: 'conversation_message_model',
    up: (database) =>
      database.exec(CONVERSATION_MESSAGE_MODEL_SCHEMA)
  },
  {
    version: 68,
    name: 'conversation_message_model_name',
    up: (database) =>
      database.exec(CONVERSATION_MESSAGE_MODEL_NAME_SCHEMA)
  },
  {
    version: 69,
    name: 'workbench_hub_layout',
    up: (database) => database.exec(WORKBENCH_HUB_LAYOUT_SCHEMA)
  },
  {
    version: 70,
    name: 'workbench_tasks',
    up: (database) => database.exec(WORKBENCH_TASK_SCHEMA)
  },
  {
    version: 71,
    name: 'workbench_attachments',
    up: (database) => database.exec(WORKBENCH_ATTACHMENT_SCHEMA)
  },
  {
    version: 72,
    name: 'workbench_sites',
    up: (database) => database.exec(WORKBENCH_SITE_SCHEMA)
  },
  {
    version: 73,
    name: 'workbench_memos',
    up: (database) => database.exec(WORKBENCH_MEMO_SCHEMA)
  },
  {
    version: 74,
    name: 'workbench_audit_events',
    up: installWorkbenchAudit
  },
  {
    version: 75,
    name: 'tool_runtime_clean_break',
    up: (database) => database.exec(TOOL_RUNTIME_CLEAN_BREAK_SCHEMA)
  },
  {
    version: 76,
    name: 'event_sourced_schedule_targets',
    up: (database) => database.exec(EVENT_SOURCED_SCHEDULE_SCHEMA)
  },
  {
    version: 77,
    name: 'active_knowledge_source_identity',
    requiresForeignKeysDisabled: true,
    up: (database) => database.exec(ACTIVE_KNOWLEDGE_SOURCE_IDENTITY_SCHEMA)
  },
  {
    version: 78,
    name: 'task_record_permanent_delete',
    up: (database) => database.exec(TASK_RECORD_PERMANENT_DELETE_SCHEMA)
  },
  {
    version: 79,
    name: 'task_record_completion_removal',
    up: (database) => database.exec(TASK_RECORD_COMPLETION_REMOVAL_SCHEMA)
  },
  {
    version: 80,
    name: 'agent_runtime_runs',
    up: (database) => database.exec(AGENT_RUNTIME_RUN_SCHEMA)
  },
  {
    version: 81,
    name: 'conversation_processing_snapshot',
    up: (database) => database.exec(CONVERSATION_PROCESSING_SCHEMA)
  },
  {
    version: 82,
    name: 'assistant_run_timeline',
    up: (database) => database.exec(ASSISTANT_RUN_TIMELINE_SCHEMA)
  },
  {
    version: 83,
    name: 'unified_capability_catalog',
    up: (database) => database.exec(UNIFIED_CAPABILITY_CATALOG_SCHEMA)
  },
  {
    version: 84,
    name: 'capability_package_bindings',
    up: (database) => database.exec(CAPABILITY_PACKAGE_BINDINGS_SCHEMA)
  },
  {
    version: 85,
    name: 'conversation_attachments',
    up: (database) => database.exec(CONVERSATION_ATTACHMENT_SCHEMA)
  },
  {
    version: 86,
    name: 'subagent_run_lineage',
    up: (database) => database.exec(SUBAGENT_RUN_LINEAGE_SCHEMA)
  },
  {
    version: 87,
    name: 'capability_generation_sessions',
    up: (database) => database.exec(CAPABILITY_GENERATION_SCHEMA)
  },
  {
    version: 88,
    name: 'agent_run_checkpoints',
    requiresForeignKeysDisabled: true,
    up: (database) => database.exec(AGENT_RUN_CHECKPOINT_SCHEMA)
  },
  {
    version: 89,
    name: 'runtime_governance',
    up: (database) => database.exec(RUNTIME_GOVERNANCE_SCHEMA)
  },
  {
    version: 90,
    name: 'agent_profile_catalog',
    up: (database) => database.exec(AGENT_PROFILE_CATALOG_SCHEMA)
  },
  {
    version: 91,
    name: 'runtime_observability_state',
    up: (database) => database.exec(RUNTIME_OBSERVABILITY_STATE_SCHEMA)
  },
  {
    version: 92,
    name: 'conversation_attachment_chunks',
    up: (database) => database.exec(CONVERSATION_ATTACHMENT_CHUNK_SCHEMA)
  },
  {
    version: 93,
    name: 'assistant_run_retention',
    up: (database) => database.exec(ASSISTANT_RUN_RETENTION_SCHEMA)
  },
  {
    version: 94,
    name: 'follow_up_suggestions',
    up: (database) => database.exec(FOLLOW_UP_SUGGESTION_SCHEMA)
  },
  {
    version: 95,
    name: 'document_delivery_persistence',
    up: (database) => database.exec(DOCUMENT_DELIVERY_PERSISTENCE_SCHEMA)
  },
  {
    version: 96,
    name: 'follow_up_suggestion_model_metrics',
    requiresForeignKeysDisabled: true,
    up: addFollowUpSuggestionMetricSource
  },
  {
    version: 97,
    name: 'remove_mandatory_ungrouped_site_group',
    up: removeMandatoryUngroupedSiteGroup
  },
  {
    version: 98,
    name: 'repair_suspended_conversation_boundaries',
    up: repairSuspendedConversationBoundaries
  },
  {
    version: 99,
    name: 'backfill_no_progress_conclusions',
    up: backfillNoProgressConclusions
  },
  {
    version: 100,
    name: 'browser_runtime_sessions',
    up: (database) => database.exec(BROWSER_SESSION_SCHEMA)
  },
  {
    version: 101,
    name: 'web_provider_configuration',
    up: (database) => database.exec(WEB_PROVIDER_SCHEMA)
  },
  {
    version: 102,
    name: 'agent_runtime_orchestration_state',
    up: (database) => database.exec(AGENT_RUNTIME_STATE_SCHEMA)
  },
  {
    version: 103,
    name: 'agent_runtime_shared_budget',
    up: (database) => database.exec(AGENT_RUNTIME_BUDGET_SCHEMA)
  },
  {
    version: 104,
    name: 'agent_runtime_delegations',
    up: (database) => database.exec(AGENT_DELEGATION_SCHEMA)
  },
  {
    version: 105,
    name: 'conversation_generated_artifact_provenance',
    up: (database) => database.exec(`
      CREATE TABLE conversation_generated_artifact_runs (
        run_id TEXT PRIMARY KEY REFERENCES agent_runtime_runs(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL CHECK (json_valid(state_json))
      );
    `)
  },
  {
    version: 106,
    name: 'skill_registry',
    up: (database) => database.exec(SKILL_REGISTRY_SCHEMA)
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
    let existingForeignKeyViolations = new Set<string>()
    if (migration.requiresForeignKeysDisabled) {
      existingForeignKeyViolations = new Set(
        (
          database.pragma('foreign_key_check') as Array<
            Record<string, string | number>
          >
        ).map(foreignKeyViolationKey)
      )
    }
    const migrate = database.transaction(() => {
      migration.up(database)
      if (migration.requiresForeignKeysDisabled) {
        const violations = (
          database.pragma('foreign_key_check') as Array<
            Record<string, string | number>
          >
        ).filter(
          (violation) =>
            !existingForeignKeyViolations.has(
              foreignKeyViolationKey(violation)
            )
        )
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

    const foreignKeysEnabled =
      database.pragma('foreign_keys', { simple: true }) === 1
    database.pragma('foreign_keys = OFF')
    try {
      migrate()
    } finally {
      if (foreignKeysEnabled) database.pragma('foreign_keys = ON')
    }
  }
}

function foreignKeyViolationKey(
  violation: Record<string, string | number>
): string {
  return [
    violation.table,
    violation.rowid,
    violation.parent,
    violation.fkid
  ].join(':')
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
