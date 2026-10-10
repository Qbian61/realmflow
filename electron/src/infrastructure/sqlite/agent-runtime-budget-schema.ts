export const AGENT_RUNTIME_BUDGET_SCHEMA = `
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
`
