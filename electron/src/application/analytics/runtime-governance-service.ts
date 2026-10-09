import type Database from 'better-sqlite3'
import {
  classifyRuntimeFailure,
  createRuntimeEvaluation,
  redactDiagnosticValue,
  type RuntimeEvaluation,
  type RuntimeTraceStage
} from '../../../../domain/runtime-governance'
import type {
  RuntimeFailedRunSummary,
  RuntimeGovernanceSnapshot,
  RuntimeGovernedCapability,
  RuntimeRunDetail,
  RuntimeTraceItem
} from '../../../../shared/runtime-governance'
import type {
  SqliteRuntimeGovernanceRepository
} from '../../infrastructure/sqlite/runtime-governance-repository'
import type {
  AgentRunLifecycleStatus,
  AgentRunSnapshot
} from '../../../../domain/agent-runtime'
import type {
  RuntimeEvaluationRunner
} from './runtime-evaluation-runner'

type ServiceOptions = {
  database: Database.Database
  repository: SqliteRuntimeGovernanceRepository
  evaluationRunner: RuntimeEvaluationRunner
  createId?: () => string
  now?: () => number
}

type RunRow = {
  id: string
  lifecycle_status: AgentRunLifecycleStatus
  snapshot_json: string
  error: string | null
  created_at: number
  updated_at: number
}

type EventRow = {
  event_id: string
  sequence: number
  event_type: string
  event_timestamp: number
  payload_json: string
}

type CapabilityRow = {
  capability_id: string
  capability_version: string
  capability_kind: RuntimeGovernedCapability['kind']
  definition_json: string
  installation_json: string
  scope_kind: string
  scope_key: string
  enabled: number
  revision: number
}

type GenerationRow = {
  session_id: string
  conversation_id: string
  session_json: string
}

export class RuntimeGovernanceService {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(private readonly options: ServiceOptions) {
    this.createId = options.createId ?? crypto.randomUUID
    this.now = options.now ?? Date.now
  }

  async querySnapshot(): Promise<RuntimeGovernanceSnapshot> {
    const runs = this.listRuns()
    const terminalRuns = runs.filter((run) =>
      ['completed', 'failed', 'cancelled'].includes(run.lifecycle_status)
    )
    const recoveryAttempts = Number(
      this.options.database
        .prepare(
          `SELECT COUNT(DISTINCT run_id)
           FROM assistant_run_events
           WHERE event_type IN ('run.retrying', 'run.recovery_blocked')`
        )
        .pluck()
        .get()
    )
    const recoveredRuns = Number(
      this.options.database
        .prepare(
          `SELECT COUNT(DISTINCT run_id)
           FROM assistant_run_events WHERE event_type = 'run.resumed'`
        )
        .pluck()
        .get()
    )
    const permissionWaits = Number(
      this.options.database
        .prepare(
          `SELECT COUNT(*) FROM assistant_run_events
           WHERE event_type = 'tool.call.permission_required'`
        )
        .pluck()
        .get()
    )
    return {
      revision: await this.options.repository.getRevision(),
      summary: {
        totalRuns: runs.length,
        completedRuns: runs.filter(
          (run) => run.lifecycle_status === 'completed'
        ).length,
        failedRuns: runs.filter((run) => run.lifecycle_status === 'failed')
          .length,
        recoveryRate:
          recoveryAttempts === 0 ? 0 : (recoveredRuns / recoveryAttempts) * 100,
        permissionWaits,
        averageDurationMs:
          terminalRuns.length === 0
            ? null
            : terminalRuns.reduce(
                (total, run) => total + run.updated_at - run.created_at,
                0
              ) / terminalRuns.length
      },
      failedRuns: runs
        .filter((run) =>
          ['failed', 'recovery_blocked'].includes(run.lifecycle_status)
        )
        .map((run) => this.toFailedRun(run))
        .sort((left, right) => right.failedAt - left.failedAt)
        .slice(0, 20),
      evaluations: await this.options.repository.listEvaluations(20),
      capabilities: this.listCapabilities(),
      observability: await this.options.repository.getObservability()
    }
  }

  async getRunDetail(runId: string): Promise<RuntimeRunDetail> {
    const run = this.options.database
      .prepare(
        `SELECT id, lifecycle_status, snapshot_json, error, created_at,
                updated_at
         FROM agent_runtime_runs WHERE id = ?`
      )
      .get(runId) as RunRow | undefined
    if (!run) throw new Error('Agent Runtime Run not found')
    const snapshot = parseSnapshot(run)
    return {
      ...this.toFailedRun(run),
      configuration: {
        scenarioId: snapshot.scenarioId,
        pipelineVersion: snapshot.pipelineVersion,
        profile: `${snapshot.agentProfileId}@${snapshot.agentProfileVersion}`,
        promptDigest: snapshot.promptDigest,
        policyDigest: snapshot.policyDigest,
        catalogDigest: snapshot.capabilityCatalogDigest,
        bindingDigest: snapshot.capabilityBindingDigest,
        ...(snapshot.modelProfileId
          ? { modelProfileId: snapshot.modelProfileId }
          : {})
      },
      trace: this.listEvents(run.id).map(mapTrace)
    }
  }

  async runEvaluation(): Promise<RuntimeEvaluation> {
    const startedAt = this.now()
    const result = await this.options.evaluationRunner.run()
    const completedAt = this.now()
    const evaluation = createRuntimeEvaluation({
      id: this.createId(),
      ...result,
      startedAt,
      completedAt
    })
    await this.options.repository.recordEvaluation(evaluation)
    await this.options.repository.appendEvent({
      eventId: this.createId(),
      type: 'evaluation.completed',
      evaluationId: evaluation.id,
      revision: await this.options.repository.getRevision(),
      occurredAt: completedAt
    })
    return evaluation
  }

  async release(input: {
    evaluationId: string
    expectedRevision: number
    baselineOverallScore?: number
  }) {
    return this.options.repository.release({
      eventId: this.createId(),
      ...input,
      occurredAt: this.now()
    })
  }

  async createDiagnosticPackage(runId: string): Promise<string> {
    const detail = await this.getRunDetail(runId)
    return JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: this.now(),
        runId,
        detail: redactDiagnosticValue(detail),
        redaction: {
          messageContent: true,
          credentials: true,
          absolutePaths: true,
          rawToolArguments: true
        }
      },
      null,
      2
    )
  }

  async recordDiagnosticExport(_runId: string): Promise<void> {
    await this.options.repository.appendEvent({
      eventId: this.createId(),
      type: 'diagnostic.exported',
      revision: await this.options.repository.getRevision(),
      occurredAt: this.now()
    })
  }

  private listRuns(): RunRow[] {
    return this.options.database
      .prepare(
        `SELECT id, lifecycle_status, snapshot_json, error, created_at,
                updated_at
         FROM agent_runtime_runs
         ORDER BY updated_at DESC, id`
      )
      .all() as RunRow[]
  }

  private listEvents(runId: string): EventRow[] {
    return this.options.database
      .prepare(
        `SELECT event_id, sequence, event_type, event_timestamp, payload_json
         FROM assistant_run_events
         WHERE run_id = ?
         ORDER BY sequence`
      )
      .all(runId) as EventRow[]
  }

  private toFailedRun(run: RunRow): RuntimeFailedRunSummary {
    const snapshot = parseSnapshot(run)
    const events = this.listEvents(run.id)
    const failedEvent = [...events]
      .reverse()
      .find((event) => event.event_type.endsWith('.failed'))
    const payload = failedEvent ? parsePayload(failedEvent) : {}
    const failure = classifyRuntimeFailure({
      lifecycleStatus: run.lifecycle_status,
      eventType: failedEvent?.event_type,
      eventErrorCode:
        typeof payload.errorCode === 'string' ? payload.errorCode : undefined,
      message: run.error ?? undefined
    })
    return {
      runId: run.id,
      scenarioId: snapshot.scenarioId,
      stage: failure.stage,
      errorCode: failure.errorCode,
      profileId: snapshot.agentProfileId,
      pipelineVersion: snapshot.pipelineVersion,
      relatedCalls: events.filter(
        (event) => event.event_type === 'tool.call.requested'
      ).length,
      failedAt: run.updated_at
    }
  }

  private listCapabilities(): RuntimeGovernedCapability[] {
    const capabilities = this.options.database
      .prepare(
        `SELECT definition.capability_id, definition.capability_version,
                definition.capability_kind, definition.definition_json,
                installation.installation_json, installation.scope_kind,
                installation.scope_key, installation.enabled,
                installation.revision
         FROM capability_installations installation
         JOIN capability_definitions definition
           ON definition.capability_id = installation.capability_id
          AND definition.capability_version = installation.capability_version
         ORDER BY definition.capability_id`
      )
      .all() as CapabilityRow[]
    const generations = this.options.database
      .prepare(
        `SELECT session_id, conversation_id, session_json
         FROM capability_generation_sessions
         WHERE status = 'installed'
         ORDER BY updated_at DESC`
      )
      .all() as GenerationRow[]

    return capabilities.map((row) => {
      const definition = parseRecord(row.definition_json)
      const generation = generations
        .map((candidate) => ({
          row: candidate,
          value: parseRecord(candidate.session_json)
        }))
        .find(({ value }) => {
          const installed = asRecord(value.installedResult)
          const installedDefinition = asRecord(installed?.definition)
          return (
            installedDefinition?.id === row.capability_id &&
            installedDefinition?.version === row.capability_version
          )
        })
      const approval = asRecord(generation?.value.installedApproval)
      return {
        capabilityId: row.capability_id,
        capabilityVersion: row.capability_version,
        kind: row.capability_kind,
        source: generation
          ? 'generated'
          : definition.source === 'builtin'
            ? 'builtin'
            : row.capability_kind === 'connector'
              ? 'connector'
              : 'imported',
        ...(generation
          ? {
              generationSessionId: generation.row.session_id,
              conversationId: generation.row.conversation_id
            }
          : {}),
        ...(typeof approval?.packageDigest === 'string'
          ? { confirmationDigest: approval.packageDigest }
          : {}),
        scopeLabel:
          row.scope_kind === 'global'
            ? 'global'
            : `${row.scope_kind}:${row.scope_key}`,
        enabled: row.enabled === 1,
        revision: row.revision
      }
    })
  }
}

function parseSnapshot(row: RunRow): AgentRunSnapshot {
  return JSON.parse(row.snapshot_json) as AgentRunSnapshot
}

function parsePayload(row: EventRow): Record<string, unknown> {
  return parseRecord(row.payload_json)
}

function parseRecord(value: string): Record<string, unknown>
function parseRecord(value: unknown): Record<string, unknown>
function parseRecord(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  return asRecord(parsed) ?? {}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function mapTrace(row: EventRow): RuntimeTraceItem {
  const payload = parsePayload(row)
  return {
    eventId: row.event_id,
    sequence: row.sequence,
    stage: stageForEvent(row.event_type),
    type: row.event_type,
    timestamp: row.event_timestamp,
    summary: publicEventSummary(row.event_type, payload)
  }
}

function stageForEvent(type: string): RuntimeTraceStage {
  if (type.startsWith('tool.call')) return 'capability'
  if (type.startsWith('context.')) return 'context'
  if (type.startsWith('run.retry') || type.startsWith('run.recover')) {
    return 'recovery'
  }
  if (type.startsWith('answer.') || type === 'run.started') return 'turn'
  return 'runtime'
}

function publicEventSummary(
  type: string,
  payload: Record<string, unknown>
): string {
  if (type === 'tool.call.requested') {
    return `${String(payload.toolName ?? 'Capability')} requested`
  }
  if (type === 'tool.call.permission_required') return 'Permission required'
  if (type === 'tool.call.failed') {
    return String(payload.errorCode ?? 'capability_failed')
  }
  return type.replaceAll('.', ' ')
}
