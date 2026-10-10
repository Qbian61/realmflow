export const BROWSER_SESSION_SCHEMA = `
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
`
