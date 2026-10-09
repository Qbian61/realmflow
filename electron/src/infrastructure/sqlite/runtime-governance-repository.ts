import type Database from 'better-sqlite3'
import {
  createRuntimeEvaluation,
  evaluateRuntimeRelease,
  type RuntimeEvaluation,
  type RuntimeReleaseBlockReason,
  type RuntimeReleaseDecision
} from '../../../../domain/runtime-governance'

export type RuntimeGovernanceEvent = {
  eventId: string
  type:
    | 'evaluation.completed'
    | 'release.blocked'
    | 'release.published'
    | 'diagnostic.exported'
  evaluationId?: string
  revision: number
  reasons?: RuntimeReleaseBlockReason[]
  occurredAt: number
}

type EvaluationRow = {
  evaluation_json: string
}

type EventRow = {
  event_id: string
  event_type: RuntimeGovernanceEvent['type']
  evaluation_id: string | null
  revision: number
  event_json: string
  occurred_at: number
}

type ObservabilityRow = {
  retention_days: number
  maximum_events: number
  dropped_events: number
  stored_events: number
}

export class SqliteRuntimeGovernanceRepository {
  constructor(private readonly database: Database.Database) {}

  async recordEvaluation(evaluation: RuntimeEvaluation): Promise<boolean> {
    const value = createRuntimeEvaluation(evaluation)
    const serialized = JSON.stringify(value)
    const inserted = this.database
      .prepare(
        `INSERT OR IGNORE INTO runtime_evaluation_runs (
          evaluation_id, suite_version, candidate_digest,
          reproducibility_digest, overall_score, evaluation_json, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        value.id,
        value.suiteVersion,
        value.candidateDigest,
        value.reproducibilityDigest,
        value.scores.overall,
        serialized,
        value.completedAt
      )
    if (inserted.changes === 1) return true
    const existing = this.database
      .prepare(
        `SELECT evaluation_json FROM runtime_evaluation_runs
         WHERE evaluation_id = ?`
      )
      .get(value.id) as EvaluationRow | undefined
    if (!existing || existing.evaluation_json !== serialized) {
      throw new Error('Runtime evaluation conflicts with persisted fact')
    }
    return false
  }

  async getEvaluation(
    evaluationId: string
  ): Promise<RuntimeEvaluation | undefined> {
    const row = this.database
      .prepare(
        `SELECT evaluation_json FROM runtime_evaluation_runs
         WHERE evaluation_id = ?`
      )
      .get(evaluationId) as EvaluationRow | undefined
    return row ? parseEvaluation(row) : undefined
  }

  async listEvaluations(limit: number): Promise<RuntimeEvaluation[]> {
    requireLimit(limit)
    const rows = this.database
      .prepare(
        `SELECT evaluation_json
         FROM runtime_evaluation_runs
         ORDER BY completed_at DESC, evaluation_id
         LIMIT ?`
      )
      .all(limit) as EvaluationRow[]
    return rows.map(parseEvaluation)
  }

  async getRevision(): Promise<number> {
    return this.getRevisionSync()
  }

  async release(input: {
    eventId: string
    evaluationId: string
    expectedRevision: number
    baselineOverallScore?: number
    occurredAt: number
  }): Promise<RuntimeReleaseDecision> {
    return this.database.transaction(() => {
      const evaluation = this.getEvaluationSync(input.evaluationId)
      if (!evaluation) throw new Error('Runtime evaluation not found')
      const currentRevision = this.getRevisionSync()
      const decision = evaluateRuntimeRelease({
        evaluation,
        ...(input.baselineOverallScore === undefined
          ? {}
          : { baselineOverallScore: input.baselineOverallScore }),
        currentRevision,
        expectedRevision: input.expectedRevision
      })
      if (decision.status === 'published') {
        const updated = this.database
          .prepare(
            `UPDATE runtime_governance_revisions
             SET revision = ?, candidate_digest = ?, updated_at = ?
             WHERE singleton_id = 1 AND revision = ?`
          )
          .run(
            decision.revision,
            evaluation.candidateDigest,
            input.occurredAt,
            input.expectedRevision
          )
        if (updated.changes !== 1) {
          throw new Error('Runtime governance revision conflict')
        }
      }
      this.appendEventSync({
        eventId: input.eventId,
        type:
          decision.status === 'published'
            ? 'release.published'
            : 'release.blocked',
        evaluationId: evaluation.id,
        revision: decision.revision,
        reasons: decision.reasons,
        occurredAt: input.occurredAt
      })
      return decision
    })()
  }

  async appendEvent(event: RuntimeGovernanceEvent): Promise<void> {
    this.database.transaction(() => this.appendEventSync(event))()
  }

  async listEvents(limit: number): Promise<RuntimeGovernanceEvent[]> {
    requireLimit(limit)
    const rows = this.database
      .prepare(
        `SELECT event_id, event_type, evaluation_id, revision, event_json,
                occurred_at
         FROM runtime_governance_events
         ORDER BY occurred_at DESC, sequence DESC
         LIMIT ?`
      )
      .all(limit) as EventRow[]
    return rows.map(mapEvent)
  }

  async getObservability(): Promise<{
    retentionDays: number
    maximumEvents: number
    droppedEvents: number
    storedEvents: number
  }> {
    const row = this.database
      .prepare(
        `SELECT state.retention_days, state.maximum_events,
                state.dropped_events,
                (SELECT COUNT(*) FROM assistant_run_events) AS stored_events
         FROM runtime_observability_state state
         WHERE state.singleton_id = 1`
      )
      .get() as ObservabilityRow | undefined
    if (!row) throw new Error('Runtime observability state is unavailable')
    return {
      retentionDays: row.retention_days,
      maximumEvents: row.maximum_events,
      droppedEvents: row.dropped_events,
      storedEvents: row.stored_events
    }
  }

  async recordDroppedEvents(count = 1): Promise<void> {
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error('Dropped Runtime event count is invalid')
    }
    const updated = this.database
      .prepare(
        `UPDATE runtime_observability_state
         SET dropped_events = dropped_events + ?, updated_at = ?
         WHERE singleton_id = 1`
      )
      .run(count, Date.now())
    if (updated.changes !== 1) {
      throw new Error('Runtime observability state is unavailable')
    }
  }

  private getEvaluationSync(
    evaluationId: string
  ): RuntimeEvaluation | undefined {
    const row = this.database
      .prepare(
        `SELECT evaluation_json FROM runtime_evaluation_runs
         WHERE evaluation_id = ?`
      )
      .get(evaluationId) as EvaluationRow | undefined
    return row ? parseEvaluation(row) : undefined
  }

  private getRevisionSync(): number {
    return Number(
      this.database
        .prepare(
          `SELECT revision FROM runtime_governance_revisions
           WHERE singleton_id = 1`
        )
        .pluck()
        .get()
    )
  }

  private appendEventSync(event: RuntimeGovernanceEvent): void {
    if (!event.eventId.trim()) {
      throw new Error('Runtime governance event ID is invalid')
    }
    const value: RuntimeGovernanceEvent = {
      ...event,
      ...(event.reasons ? { reasons: [...event.reasons] } : {})
    }
    try {
      this.database
        .prepare(
          `INSERT INTO runtime_governance_events (
            event_id, event_type, evaluation_id, revision, event_json,
            occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          value.eventId,
          value.type,
          value.evaluationId ?? null,
          value.revision,
          JSON.stringify(value),
          value.occurredAt
        )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed')
      ) {
        throw new Error('Runtime governance event already exists')
      }
      throw error
    }
  }
}

function parseEvaluation(row: EvaluationRow): RuntimeEvaluation {
  return createRuntimeEvaluation(
    JSON.parse(row.evaluation_json) as RuntimeEvaluation
  )
}

function mapEvent(row: EventRow): RuntimeGovernanceEvent {
  const parsed = JSON.parse(row.event_json) as RuntimeGovernanceEvent
  return {
    eventId: row.event_id,
    type: row.event_type,
    ...(row.evaluation_id ? { evaluationId: row.evaluation_id } : {}),
    revision: row.revision,
    ...(parsed.reasons ? { reasons: parsed.reasons } : {}),
    occurredAt: row.occurred_at
  }
}

function requireLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Runtime governance query limit is invalid')
  }
}
