import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMigrations } from '../../infrastructure/sqlite/migrations'
import { SqliteRuntimeGovernanceRepository } from '../../infrastructure/sqlite/runtime-governance-repository'
import { RuntimeGovernanceService } from './runtime-governance-service'

const digest = (value: string) => value.repeat(64).slice(0, 64)

describe('RuntimeGovernanceService', () => {
  let database: Database.Database
  let service: RuntimeGovernanceService
  const evaluationRunner = {
    run: vi.fn().mockResolvedValue({
      suiteVersion: 'builtin.runtime.v1',
      datasetDigest: digest('a'),
      candidateDigest: digest('b'),
      seed: 42,
      dimensions: {
        quality: { passed: 9, total: 10 },
        retrieval: { passed: 9, total: 10 },
        toolTrace: { passed: 9, total: 10 },
        safety: { passed: 9, total: 10 },
        recovery: { passed: 9, total: 10 }
      }
    })
  }

  beforeEach(() => {
    evaluationRunner.run.mockClear()
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    applyMigrations(database)
    seedRuntimeFacts(database)
    service = new RuntimeGovernanceService({
      database,
      repository: new SqliteRuntimeGovernanceRepository(database),
      evaluationRunner,
      createId: vi
        .fn()
        .mockReturnValueOnce('evaluation-1')
        .mockReturnValueOnce('event-evaluation-1')
        .mockReturnValueOnce('event-release-1')
        .mockReturnValueOnce('event-export-1'),
      now: vi.fn().mockReturnValue(500)
    })
  })

  afterEach(() => database.close())

  it('projects local run health, failures, evaluations and generated capability provenance', async () => {
    database
      .prepare(
        `UPDATE runtime_observability_state
         SET retention_days = 7, maximum_events = 12, dropped_events = 4
         WHERE singleton_id = 1`
      )
      .run()
    const snapshot = await service.querySnapshot()

    expect(snapshot.summary).toEqual({
      totalRuns: 2,
      completedRuns: 1,
      failedRuns: 1,
      recoveryRate: 0,
      permissionWaits: 1,
      averageDurationMs: 75
    })
    expect(snapshot.failedRuns).toEqual([
      expect.objectContaining({
        runId: 'run-failed',
        scenarioId: 'general',
        stage: 'capability',
        errorCode: 'permission_denied',
        profileId: 'builtin.general',
        pipelineVersion: 'builtin.general.v1',
        relatedCalls: 1
      })
    ])
    expect(snapshot.evaluations).toEqual([])
    expect(snapshot.capabilities).toEqual([
      expect.objectContaining({
        capabilityId: 'generated.search',
        capabilityVersion: '1.0.0',
        source: 'generated',
        generationSessionId: 'generation-1',
        conversationId: 'session-1',
        confirmationDigest: digest('c'),
        scopeLabel: 'global',
        enabled: true,
        revision: 1
      })
    ])
    expect(snapshot.observability).toEqual({
      retentionDays: 7,
      maximumEvents: 12,
      droppedEvents: 4,
      storedEvents: 3
    })
  })

  it('locates a failed stage and exposes only fixed configuration digests and public trace summaries', async () => {
    const detail = await service.getRunDetail('run-failed')

    expect(detail).toEqual(
      expect.objectContaining({
        runId: 'run-failed',
        stage: 'capability',
        errorCode: 'permission_denied',
        configuration: {
          scenarioId: 'general',
          pipelineVersion: 'builtin.general.v1',
          profile: 'builtin.general@1.0.0',
          promptDigest: digest('p'),
          policyDigest: digest('q'),
          catalogDigest: digest('r'),
          bindingDigest: digest('s'),
          modelProfileId: 'model-1'
        }
      })
    )
    expect(detail.trace).toEqual([
      {
        eventId: 'assistant-event-1',
        sequence: 1,
        stage: 'capability',
        type: 'tool.call.requested',
        timestamp: 120,
        summary: 'search_files requested'
      },
      {
        eventId: 'assistant-event-2',
        sequence: 2,
        stage: 'capability',
        type: 'tool.call.permission_required',
        timestamp: 145,
        summary: 'Permission required'
      },
      {
        eventId: 'assistant-event-3',
        sequence: 3,
        stage: 'capability',
        type: 'tool.call.failed',
        timestamp: 150,
        summary: 'permission_denied'
      }
    ])
    expect(JSON.stringify(detail)).not.toContain('/Users/alice')
    expect(JSON.stringify(detail)).not.toContain('private request')
  })

  it('runs deterministic isolated evaluation and blocks an unsafe release', async () => {
    const evaluation = await service.runEvaluation()

    expect(evaluation.id).toBe('evaluation-1')
    expect(evaluationRunner.run).toHaveBeenCalledOnce()
    expect(
      await service.release({
        evaluationId: evaluation.id,
        expectedRevision: 1
      })
    ).toEqual({
      status: 'blocked',
      revision: 1,
      reasons: ['safety_threshold']
    })
    expect(await service.querySnapshot()).toEqual(
      expect.objectContaining({
        revision: 1,
        evaluations: [evaluation]
      })
    )
  })

  it('builds a default-redacted diagnostic package and audits only after write succeeds', async () => {
    const content = await service.createDiagnosticPackage('run-failed')
    const parsed = JSON.parse(content) as Record<string, unknown>

    expect(parsed).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        runId: 'run-failed',
        redaction: {
          messageContent: true,
          credentials: true,
          absolutePaths: true,
          rawToolArguments: true
        }
      })
    )
    expect(content).not.toContain('private request')
    expect(content).not.toContain('token-value')
    expect(content).not.toContain('/Users/alice')

    await service.recordDiagnosticExport('run-failed')
    expect(
      await new SqliteRuntimeGovernanceRepository(database).listEvents(10)
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: 'evaluation-1',
          type: 'diagnostic.exported'
        })
      ])
    )
  })
})

function seedRuntimeFacts(database: Database.Database): void {
  database
    .prepare(
      `INSERT INTO chat_sessions (
        id, workspace_id, title, kind, knowledge_scope, sort_order, revision,
        created_at, updated_at
      ) VALUES (
        'session-1', NULL, 'Private session', 'general', '{"kind":"none"}',
        0, 0, 1, 1
      )`
    )
    .run()
  database
    .prepare(
      `INSERT INTO chat_messages (
        id, session_id, role, status, content, run_id, error, sort_order,
        created_at
      ) VALUES (
        'assistant-1', 'session-1', 'assistant', 'failed',
        'private request at /Users/alice/project', 'run-failed',
        'permission denied', 0, 100
      )`
    )
    .run()

  insertRun(database, 'run-failed', 'failed', 100, 150, 'permission denied')
  insertRun(database, 'run-completed', 'completed', 200, 300)
  database
    .prepare(
      `INSERT INTO assistant_run_events (
        event_id, run_id, assistant_message_id, sequence, event_type,
        event_timestamp, started_at, schema_version, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      'assistant-event-1',
      'run-failed',
      'assistant-1',
      1,
      'tool.call.requested',
      120,
      100,
      JSON.stringify({
        callId: 'call-1',
        toolName: 'search_files',
        argumentsSummary: '/Users/alice/private token=token-value'
      })
    )
  database
    .prepare(
      `INSERT INTO assistant_run_events (
        event_id, run_id, assistant_message_id, sequence, event_type,
        event_timestamp, started_at, schema_version, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      'assistant-event-3',
      'run-failed',
      'assistant-1',
      3,
      'tool.call.failed',
      150,
      100,
      JSON.stringify({
        callId: 'call-1',
        toolExecutionId: 'tool-1',
        errorCode: 'permission_denied',
        message: 'token-value'
      })
    )
  database
    .prepare(
      `INSERT INTO assistant_run_events (
        event_id, run_id, assistant_message_id, sequence, event_type,
        event_timestamp, started_at, schema_version, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      'assistant-event-2',
      'run-failed',
      'assistant-1',
      2,
      'tool.call.permission_required',
      145,
      100,
      JSON.stringify({ callId: 'call-1', toolExecutionId: 'tool-1' })
    )

  database
    .prepare(
      `INSERT INTO capability_definitions (
        capability_id, capability_version, capability_kind, definition_digest,
        definition_json, published_at
      ) VALUES (?, ?, 'skill', ?, ?, 100)`
    )
    .run(
      'generated.search',
      '1.0.0',
      digest('d'),
      JSON.stringify({
        id: 'generated.search',
        version: '1.0.0',
        source: 'generated'
      })
    )
  database
    .prepare(
      `INSERT INTO capability_installations (
        installation_id, capability_id, capability_version, capability_digest,
        scope_kind, scope_key, enabled, lifecycle_status, installation_json,
        revision, installed_at, updated_at
      ) VALUES (?, ?, ?, ?, 'global', '*', 1, 'enabled', ?, 1, 100, 100)`
    )
    .run(
      'installation-1',
      'generated.search',
      '1.0.0',
      digest('d'),
      JSON.stringify({
        id: 'installation-1',
        capabilityId: 'generated.search',
        capabilityVersion: '1.0.0',
        scope: { kind: 'global' },
        enabled: true,
        revision: 1
      })
    )
  database
    .prepare(
      `INSERT INTO capability_generation_sessions (
        session_id, conversation_id, requested_by, status, revision,
        session_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'installed', 4, ?, 80, 100)`
    )
    .run(
      'generation-1',
      'session-1',
      'user-1',
      JSON.stringify({
        id: 'generation-1',
        conversationId: 'session-1',
        spec: { schemaVersion: 1, specDigest: digest('s') },
        installedApproval: { packageDigest: digest('c') },
        installedResult: {
          definition: { id: 'generated.search', version: '1.0.0' }
        }
      })
    )
}

function insertRun(
  database: Database.Database,
  id: string,
  status: 'failed' | 'completed',
  createdAt: number,
  updatedAt: number,
  error?: string
): void {
  database
    .prepare(
      `INSERT INTO agent_runtime_runs (
        id, provider_run_id, scenario_id, lifecycle_status, snapshot_json,
        error, created_at, updated_at
      ) VALUES (?, NULL, 'general', ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      status,
      JSON.stringify({
        schemaVersion: 1,
        runId: id,
        rootRunId: id,
        delegationDepth: 0,
        delegationOrdinal: 0,
        scenarioId: 'general',
        pipelineVersion: 'builtin.general.v1',
        agentProfileId: 'builtin.general',
        agentProfileVersion: '1.0.0',
        agentProfileDigest: digest('o'),
        promptDigest: digest('p'),
        policyDigest: digest('q'),
        capabilityCatalogDigest: digest('r'),
        capabilityBindingDigest: digest('s'),
        permissionSnapshotDigest: digest('t'),
        modelProfileId: 'model-1',
        scope: { kind: 'global' },
        budgets: {
          maxToolCalls: 8,
          maxSubagents: 0,
          timeoutMs: 1000,
          maxRetries: 2
        },
        createdAt
      }),
      error ?? null,
      createdAt,
      updatedAt
    )
}
