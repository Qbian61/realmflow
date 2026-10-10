export const WEB_PROVIDER_SCHEMA = `
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
`
