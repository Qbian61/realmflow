export const AGENT_RUNTIME_STATE_SCHEMA = `
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
`
