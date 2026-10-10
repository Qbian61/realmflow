export const AGENT_DELEGATION_SCHEMA = `
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
`
