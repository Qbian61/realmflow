export const SKILL_REGISTRY_SCHEMA = `
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
`
