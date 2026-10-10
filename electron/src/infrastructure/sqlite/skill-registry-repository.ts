import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  RegisteredSkill,
  RegisteredSkillVersion,
  SkillActivationPreference,
  SkillReview,
  SkillReviewStatus,
  SkillSource,
} from '../../../../domain/skill-registry'

type SourceRow = {
  id: string
  kind: SkillSource['kind']
  display_name: string
  locator: string
  revision: number
  last_scanned_at: number
}

type VersionRow = {
  skill_id: string
  version: string
  digest: string
  source_id: string
  definition_json: string
  instructions_digest: string
  instructions_text: string
  boundary_notes: string
  risk: RegisteredSkillVersion['risk']
  discovered_at: number
}

type ReviewRow = {
  skill_id: string
  version: string
  digest: string
  status: SkillReview['status']
  notes: string
  revision: number
  reviewed_at: number
}

type ActivationRow = {
  skill_id: string
  version: string
  digest: string
  enabled: number
  revision: number
  updated_at: number
}

type CommandRow = {
  fingerprint: string
  result_json: string
}

type ReviewCommand = {
  skillId: string
  version: string
  digest: string
  status: Exclude<SkillReviewStatus, 'pending'>
  notes: string
  expectedRevision: number
  requestId: string
  at: number
}

type ActivationCommand = {
  skillId: string
  version: string
  digest: string
  enabled: boolean
  expectedRevision: number
  requestId: string
  at: number
}

export class SqliteSkillRegistryRepository {
  constructor(private readonly database: Database.Database) {}

  publish(input: {
    source: SkillSource
    version: RegisteredSkillVersion
  }): RegisteredSkill {
    return this.database.transaction(() => {
      if (input.version.sourceId !== input.source.id) {
        throw new Error('skill_source_mismatch')
      }
      this.upsertSource(input.source)
      const existing = this.getVersion(input.version)
      if (existing) {
        if (canonicalVersion(existing) !== canonicalVersion(input.version)) {
          throw new Error('skill_version_digest_conflict')
        }
        this.writeSourceEntry(input.version, input.source.lastScannedAt)
        return this.getRegistered(input.version)
      }

      this.database
        .prepare(
          `INSERT INTO skill_registry_versions (
            skill_id, version, digest, source_id, definition_json,
            instructions_digest, instructions_text, boundary_notes, risk,
            discovered_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.version.skillId,
          input.version.version,
          input.version.digest,
          input.version.sourceId,
          JSON.stringify(input.version.definition),
          input.version.instructionsDigest,
          input.version.instructions,
          input.version.boundaryNotes,
          input.version.risk,
          input.version.discoveredAt,
        )
      this.writeSourceEntry(input.version, input.source.lastScannedAt)

      const trusted = input.source.kind === 'builtin'
      const review: SkillReview = {
        skillId: input.version.skillId,
        version: input.version.version,
        digest: input.version.digest,
        status: trusted ? 'approved' : 'pending',
        notes: trusted ? 'Trusted built-in Skill' : '',
        revision: 1,
        reviewedAt: input.version.discoveredAt,
      }
      this.insertReview(review)

      const current = this.getActivation(input.version.skillId)
      if (!current || trusted) {
        const activation: SkillActivationPreference = {
          skillId: input.version.skillId,
          version: input.version.version,
          digest: input.version.digest,
          enabled: trusted,
          revision: (current?.revision ?? 0) + 1,
          updatedAt: input.version.discoveredAt,
        }
        this.writeActivation(activation)
      }
      this.writeEvent({
        skillId: input.version.skillId,
        version: input.version.version,
        digest: input.version.digest,
        operation: 'published',
        revision: 1,
        payload: { sourceId: input.source.id, trusted },
        at: input.version.discoveredAt,
      })
      return this.getRegistered(input.version)
    })()
  }

  list(): RegisteredSkill[] {
    const rows = this.database
      .prepare(
        `SELECT
          v.*, s.kind, s.display_name, s.locator, s.revision AS source_revision,
          s.last_scanned_at, r.status AS review_status, r.notes,
          r.revision AS review_revision, r.reviewed_at,
          a.version AS active_version, a.digest AS active_digest,
          a.enabled AS active_enabled, a.revision AS activation_revision,
          a.updated_at AS activation_updated_at,
          CASE WHEN e.skill_id IS NULL THEN 0 ELSE 1 END AS present
        FROM skill_registry_versions v
        JOIN skill_sources s ON s.id = v.source_id
        JOIN skill_reviews r
          ON r.skill_id = v.skill_id
          AND r.version = v.version
          AND r.digest = v.digest
        LEFT JOIN skill_activation_preferences a ON a.skill_id = v.skill_id
        LEFT JOIN skill_source_entries e
          ON e.source_id = v.source_id
          AND e.skill_id = v.skill_id
          AND e.version = v.version
          AND e.digest = v.digest
        ORDER BY v.skill_id, v.version, v.digest`,
      )
      .all() as Array<
      VersionRow & {
        kind: SkillSource['kind']
        display_name: string
        locator: string
        source_revision: number
        last_scanned_at: number
        review_status: SkillReview['status']
        notes: string
        review_revision: number
        reviewed_at: number
        active_version: string | null
        active_digest: string | null
        active_enabled: number | null
        activation_revision: number | null
        activation_updated_at: number | null
        present: number
      }
    >
    return rows.map((row) => {
      const selected =
        row.active_version === row.version && row.active_digest === row.digest
      return {
        source: {
          id: row.source_id,
          kind: row.kind,
          displayName: row.display_name,
          locator: row.locator,
          revision: row.source_revision,
          lastScannedAt: row.last_scanned_at,
        },
        version: mapVersion(row),
        review: {
          skillId: row.skill_id,
          version: row.version,
          digest: row.digest,
          status: row.review_status,
          notes: row.notes,
          revision: row.review_revision,
          reviewedAt: row.reviewed_at,
        },
        activation: {
          skillId: row.skill_id,
          version: row.version,
          digest: row.digest,
          enabled: selected && row.active_enabled === 1,
          revision: row.activation_revision ?? 0,
          updatedAt: row.activation_updated_at ?? 0,
        },
        present: row.present === 1,
      }
    })
  }

  listAvailable(): RegisteredSkill[] {
    return this.list().filter(
      ({ review, activation, present }) =>
        present && review.status === 'approved' && activation.enabled,
    )
  }

  touchSource(source: SkillSource): void {
    this.upsertSource(source)
  }

  reconcileSource(
    sourceId: string,
    versions: Array<
      Pick<RegisteredSkillVersion, 'skillId' | 'version' | 'digest'>
    >,
    at: number,
  ): void {
    this.database.transaction(() => {
      const observedSkillIds = new Set(versions.map(({ skillId }) => skillId))
      const existing = this.database
        .prepare(
          'SELECT DISTINCT skill_id FROM skill_source_entries WHERE source_id = ?',
        )
        .all(sourceId) as Array<{ skill_id: string }>
      const remove = this.database.prepare(
        'DELETE FROM skill_source_entries WHERE source_id = ? AND skill_id = ?',
      )
      for (const { skill_id: skillId } of existing) {
        if (!observedSkillIds.has(skillId)) remove.run(sourceId, skillId)
      }
      const insert = this.database.prepare(
        `INSERT INTO skill_source_entries (
          source_id, skill_id, version, digest, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_id, skill_id, version, digest) DO UPDATE SET
          last_seen_at = MAX(
            skill_source_entries.last_seen_at,
            excluded.last_seen_at
          )`,
      )
      for (const version of versions) {
        insert.run(
          sourceId,
          version.skillId,
          version.version,
          version.digest,
          at,
        )
      }
    })()
  }

  readInstructions(
    identity: Pick<RegisteredSkillVersion, 'skillId' | 'version' | 'digest'>,
  ): string {
    const row = this.getVersion(identity)
    if (!row) throw new Error('skill_version_unavailable')
    return row.instructions_text
  }

  review(command: ReviewCommand): SkillReview {
    const fingerprint = digest({
      kind: 'review',
      skillId: command.skillId,
      version: command.version,
      digest: command.digest,
      status: command.status,
      notes: command.notes,
      expectedRevision: command.expectedRevision,
    })
    return this.database.transaction(() => {
      const replay = this.readReplay<SkillReview>(
        command.requestId,
        fingerprint,
      )
      if (replay) return replay
      const current = this.getReview(command)
      if (!current) throw new Error('skill_version_unavailable')
      if (current.revision !== command.expectedRevision) {
        throw new Error('skill_review_changed')
      }
      const review: SkillReview = {
        skillId: command.skillId,
        version: command.version,
        digest: command.digest,
        status: command.status,
        notes: command.notes.trim(),
        revision: current.revision + 1,
        reviewedAt: command.at,
      }
      this.database
        .prepare(
          `UPDATE skill_reviews SET
            status = ?, notes = ?, revision = ?, reviewed_at = ?
          WHERE skill_id = ? AND version = ? AND digest = ?`,
        )
        .run(
          review.status,
          review.notes,
          review.revision,
          review.reviewedAt,
          review.skillId,
          review.version,
          review.digest,
        )
      if (review.status === 'rejected') {
        const activation = this.getActivation(review.skillId)
        if (
          activation?.version === review.version &&
          activation.digest === review.digest &&
          activation.enabled
        ) {
          this.writeActivation({
            ...activation,
            enabled: false,
            revision: activation.revision + 1,
            updatedAt: command.at,
          })
        }
      }
      this.writeEvent({
        requestId: command.requestId,
        skillId: review.skillId,
        version: review.version,
        digest: review.digest,
        operation: 'reviewed',
        revision: review.revision,
        payload: review,
        at: command.at,
      })
      this.writeReceipt(command.requestId, fingerprint, review, command.at)
      return review
    })()
  }

  setActivation(command: ActivationCommand): SkillActivationPreference {
    const fingerprint = digest({
      kind: 'activation',
      skillId: command.skillId,
      version: command.version,
      digest: command.digest,
      enabled: command.enabled,
      expectedRevision: command.expectedRevision,
    })
    return this.database.transaction(() => {
      const replay = this.readReplay<SkillActivationPreference>(
        command.requestId,
        fingerprint,
      )
      if (replay) return replay
      const current = this.getActivation(command.skillId)
      if (
        !current ||
        current.revision !== command.expectedRevision ||
        (!command.enabled &&
          (current.version !== command.version ||
            current.digest !== command.digest))
      ) {
        throw new Error('skill_activation_changed')
      }
      const review = this.getReview(command)
      if (!review) throw new Error('skill_version_unavailable')
      if (command.enabled && review.status !== 'approved') {
        throw new Error('skill_review_required')
      }
      const activation: SkillActivationPreference = {
        skillId: command.skillId,
        version: command.version,
        digest: command.digest,
        enabled: command.enabled,
        revision: current.revision + 1,
        updatedAt: command.at,
      }
      this.writeActivation(activation)
      this.writeEvent({
        requestId: command.requestId,
        skillId: activation.skillId,
        version: activation.version,
        digest: activation.digest,
        operation: activation.enabled ? 'activated' : 'deactivated',
        revision: activation.revision,
        payload: activation,
        at: command.at,
      })
      this.writeReceipt(
        command.requestId,
        fingerprint,
        activation,
        command.at,
      )
      return activation
    })()
  }

  private upsertSource(source: SkillSource): void {
    const current = this.database
      .prepare('SELECT * FROM skill_sources WHERE id = ?')
      .get(source.id) as SourceRow | undefined
    if (current && (current.kind !== source.kind || current.locator !== source.locator)) {
      throw new Error('skill_source_identity_conflict')
    }
    this.database
      .prepare(
        `INSERT INTO skill_sources (
          id, kind, display_name, locator, revision, last_scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          display_name = excluded.display_name,
          revision = CASE
            WHEN excluded.last_scanned_at > skill_sources.last_scanned_at
            THEN skill_sources.revision + 1
            ELSE skill_sources.revision
          END,
          last_scanned_at = MAX(
            skill_sources.last_scanned_at,
            excluded.last_scanned_at
          )`,
      )
      .run(
        source.id,
        source.kind,
        source.displayName,
        source.locator,
        source.revision,
        source.lastScannedAt,
      )
  }

  private getRegistered(
    identity: Pick<RegisteredSkillVersion, 'skillId' | 'version' | 'digest'>,
  ): RegisteredSkill {
    const item = this.list().find(
      ({ version }) =>
        version.skillId === identity.skillId &&
        version.version === identity.version &&
        version.digest === identity.digest,
    )
    if (!item) throw new Error('skill_version_unavailable')
    return item
  }

  private getVersion(
    identity: Pick<RegisteredSkillVersion, 'skillId' | 'version' | 'digest'>,
  ): VersionRow | undefined {
    return this.database
      .prepare(
        `SELECT * FROM skill_registry_versions
         WHERE skill_id = ? AND version = ? AND digest = ?`,
      )
      .get(identity.skillId, identity.version, identity.digest) as
      | VersionRow
      | undefined
  }

  private getReview(
    identity: Pick<RegisteredSkillVersion, 'skillId' | 'version' | 'digest'>,
  ): SkillReview | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM skill_reviews
         WHERE skill_id = ? AND version = ? AND digest = ?`,
      )
      .get(identity.skillId, identity.version, identity.digest) as
      | ReviewRow
      | undefined
    return row && mapReview(row)
  }

  private getActivation(
    skillId: string,
  ): SkillActivationPreference | undefined {
    const row = this.database
      .prepare('SELECT * FROM skill_activation_preferences WHERE skill_id = ?')
      .get(skillId) as ActivationRow | undefined
    return row && mapActivation(row)
  }

  private insertReview(review: SkillReview): void {
    this.database
      .prepare(
        `INSERT INTO skill_reviews (
          skill_id, version, digest, status, notes, revision, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        review.skillId,
        review.version,
        review.digest,
        review.status,
        review.notes,
        review.revision,
        review.reviewedAt,
      )
  }

  private writeActivation(activation: SkillActivationPreference): void {
    this.database
      .prepare(
        `INSERT INTO skill_activation_preferences (
          skill_id, version, digest, enabled, revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id) DO UPDATE SET
          version = excluded.version,
          digest = excluded.digest,
          enabled = excluded.enabled,
          revision = excluded.revision,
          updated_at = excluded.updated_at`,
      )
      .run(
        activation.skillId,
        activation.version,
        activation.digest,
        activation.enabled ? 1 : 0,
        activation.revision,
        activation.updatedAt,
      )
  }

  private writeSourceEntry(
    version: RegisteredSkillVersion,
    at: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO skill_source_entries (
          source_id, skill_id, version, digest, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_id, skill_id, version, digest) DO UPDATE SET
          last_seen_at = MAX(skill_source_entries.last_seen_at, excluded.last_seen_at)`,
      )
      .run(
        version.sourceId,
        version.skillId,
        version.version,
        version.digest,
        at,
      )
  }

  private writeEvent(input: {
    requestId?: string
    skillId: string
    version: string
    digest: string
    operation: 'published' | 'reviewed' | 'activated' | 'deactivated'
    revision: number
    payload: unknown
    at: number
  }): void {
    this.database
      .prepare(
        `INSERT INTO skill_registry_events (
          request_id, skill_id, version, digest, operation, revision,
          payload_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.requestId ?? null,
        input.skillId,
        input.version,
        input.digest,
        input.operation,
        input.revision,
        JSON.stringify(input.payload),
        input.at,
      )
  }

  private readReplay<T>(requestId: string, fingerprint: string): T | undefined {
    const row = this.database
      .prepare(
        'SELECT fingerprint, result_json FROM skill_registry_commands WHERE request_id = ?',
      )
      .get(requestId) as CommandRow | undefined
    if (!row) return undefined
    if (row.fingerprint !== fingerprint) {
      throw new Error('skill_registry_idempotency_conflict')
    }
    return JSON.parse(row.result_json) as T
  }

  private writeReceipt(
    requestId: string,
    fingerprint: string,
    result: unknown,
    at: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO skill_registry_commands (
          request_id, fingerprint, result_json, created_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(requestId, fingerprint, JSON.stringify(result), at)
  }
}

function mapVersion(row: VersionRow): RegisteredSkillVersion {
  return {
    skillId: row.skill_id,
    version: row.version,
    digest: row.digest,
    sourceId: row.source_id,
    definition: JSON.parse(
      row.definition_json,
    ) as RegisteredSkillVersion['definition'],
    instructionsDigest: row.instructions_digest,
    instructions: row.instructions_text,
    boundaryNotes: row.boundary_notes,
    risk: row.risk,
    discoveredAt: row.discovered_at,
  }
}

function mapReview(row: ReviewRow): SkillReview {
  return {
    skillId: row.skill_id,
    version: row.version,
    digest: row.digest,
    status: row.status,
    notes: row.notes,
    revision: row.revision,
    reviewedAt: row.reviewed_at,
  }
}

function mapActivation(row: ActivationRow): SkillActivationPreference {
  return {
    skillId: row.skill_id,
    version: row.version,
    digest: row.digest,
    enabled: row.enabled === 1,
    revision: row.revision,
    updatedAt: row.updated_at,
  }
}

function canonicalVersion(
  value: RegisteredSkillVersion | VersionRow,
): string {
  const normalized =
    'skill_id' in value
      ? {
          skillId: value.skill_id,
          version: value.version,
          digest: value.digest,
          sourceId: value.source_id,
          definition: JSON.parse(value.definition_json),
          instructionsDigest: value.instructions_digest,
          instructions: value.instructions_text,
          boundaryNotes: value.boundary_notes,
          risk: value.risk,
        }
      : {
          skillId: value.skillId,
          version: value.version,
          digest: value.digest,
          sourceId: value.sourceId,
          definition: value.definition,
          instructionsDigest: value.instructionsDigest,
          instructions: value.instructions,
          boundaryNotes: value.boundaryNotes,
          risk: value.risk,
        }
  return JSON.stringify(normalized)
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
