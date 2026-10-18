import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  createAssistantTurnProjection,
  projectAssistantTurn,
  type AssistantRunEvent
} from '../../../../domain/assistant-turn'
import {
  createPermissionGrant,
  normalizePermissionRequest
} from '../../../../domain/capability-permission'
import {
  ConversationProcessorPipeline,
  createBuiltinConversationProcessors
} from '../../../../domain/conversation-processor'
import {
  routeConversationReasoning
} from '../../../../domain/reasoning-router'
import type {
  RuntimeEvaluationCaseSummary,
  RuntimeEvaluationDimension
} from '../../../../domain/runtime-governance'
import {
  advanceDshSessionProjection,
  createDshSessionBinding,
  dshRunOwnerKey,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import {
  sealDshRunManifest,
  type DshRunManifest,
  type DshRunOwner
} from '../../../../domain/dsh-run-manifest'
import {
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  type DshRuntimeEventEnvelope,
  type DshRuntimeEventKind
} from '../../../../shared/dsh-runtime-event-contract'
import { DshHistorySync } from '../dsh/dsh-history-sync'
import { DshRuntimeEventIngestor } from '../dsh/dsh-runtime-event-ingestor'
import { DshRuntimeEventProjector } from '../dsh/dsh-runtime-event-projector'

export type RuntimeEvaluationCase = {
  id: string
  dimension: RuntimeEvaluationDimension
  execute: () => boolean | Promise<boolean>
}

export type RuntimeEvaluationRunnerResult = {
  suiteVersion: string
  datasetDigest: string
  candidateDigest: string
  seed: number
  dimensions: Record<
    RuntimeEvaluationDimension,
    RuntimeEvaluationCaseSummary
  >
}

export interface RuntimeEvaluationRunner {
  run: () => Promise<RuntimeEvaluationRunnerResult>
}

type RunnerOptions = {
  database: Database.Database
  cases?: readonly RuntimeEvaluationCase[]
}

const SUITE_VERSION = 'builtin.runtime.v2'
const SEED = 42
const DIMENSIONS: RuntimeEvaluationDimension[] = [
  'quality',
  'retrieval',
  'toolTrace',
  'safety',
  'recovery'
]

export class BuiltinRuntimeEvaluationRunner
  implements RuntimeEvaluationRunner
{
  private readonly cases: readonly RuntimeEvaluationCase[]

  constructor(private readonly options: RunnerOptions) {
    this.cases = options.cases ?? builtinCases()
    assertSuiteCoverage(this.cases)
  }

  async run(): Promise<RuntimeEvaluationRunnerResult> {
    const dimensions = Object.fromEntries(
      await Promise.all(
        DIMENSIONS.map(async (dimension) => {
          const cases = this.cases.filter(
            (candidate) => candidate.dimension === dimension
          )
          let passed = 0
          for (const evaluationCase of cases) {
            try {
              if (await evaluationCase.execute()) passed += 1
            } catch {
              // A fault-injection failure is an evaluation result, not a crash.
            }
          }
          return [dimension, { passed, total: cases.length }]
        })
      )
    ) as RuntimeEvaluationRunnerResult['dimensions']

    return {
      suiteVersion: SUITE_VERSION,
      datasetDigest: digest(
        this.cases.map(({ id, dimension }) => ({ id, dimension }))
      ),
      candidateDigest: candidateDigest(this.options.database),
      seed: SEED,
      dimensions
    }
  }
}

function builtinCases(): RuntimeEvaluationCase[] {
  return [
    {
      id: 'quality.processor-determinism',
      dimension: 'quality',
      execute: async () => {
        const pipeline = new ConversationProcessorPipeline(
          createBuiltinConversationProcessors()
        )
        const input = {
          messageId: 'evaluation-message',
          content: '  只分析 src/main.ts，不要修改文件。确保给出风险清单。  ',
          scenarioId: 'space' as const,
          bindings: {
            workspaceId: 'evaluation-workspace',
            fileReferences: ['src/main.ts']
          },
          createdAt: 100
        }
        const first = await pipeline.run(input)
        const replay = await pipeline.run(input)
        return (
          JSON.stringify(first) === JSON.stringify(replay) &&
          first.rawUserInput.content === input.content &&
          first.executionBrief.capabilityRestrictions.allowWrites === false &&
          first.gate.status === 'continue'
        )
      }
    },
    {
      id: 'quality.reasoning-risk-routing',
      dimension: 'quality',
      execute: () => {
        const decision = routeConversationReasoning(
          {
            messageLength: 900,
            intent: 'modify_files',
            entityKinds: ['file', 'file'],
            constraintCount: 3,
            acceptanceCriteriaCount: 1,
            riskLevel: 'high',
            toolRequired: true,
            historicalFailureCount: 1
          },
          'auto'
        )
        return (
          decision.selectedMode === 'high' &&
          decision.budgets.maxToolCalls === 8
        )
      }
    },
    {
      id: 'retrieval.query-plan',
      dimension: 'retrieval',
      execute: async () => {
        const snapshot = await evaluationPipelineSnapshot()
        return (
          snapshot.semanticUnderstanding.retrievalQueries
            .map(({ kind }) => kind)
            .join(',') === 'original,keyword,semantic'
        )
      }
    },
    {
      id: 'retrieval.provenance',
      dimension: 'retrieval',
      execute: async () => {
        const snapshot = await evaluationPipelineSnapshot()
        return snapshot.semanticUnderstanding.retrievalQueries.every(
          (query) =>
            query.sourceMessageId === 'evaluation-message' &&
            query.processorVersion.length > 0 &&
            query.reason.length > 0
        )
      }
    },
    {
      id: 'tool-trace.lifecycle',
      dimension: 'toolTrace',
      execute: () => {
        let projection = createAssistantTurnProjection({
          runId: 'evaluation-run',
          turnId: 'evaluation-turn',
          assistantMessageId: 'evaluation-assistant',
          startedAt: 100
        })
        for (const event of [
          assistantEvent(1, 'tool.call.requested', {
            callId: 'evaluation-call',
            toolName: 'filesystem.read',
            category: 'filesystem',
            argumentsSummary: '[evaluation]/README.md'
          }),
          assistantEvent(2, 'tool.call.started', {
            callId: 'evaluation-call',
            toolExecutionId: 'evaluation-execution'
          }),
          assistantEvent(3, 'tool.call.completed', {
            callId: 'evaluation-call',
            toolExecutionId: 'evaluation-execution',
            resultSummary: 'Read complete'
          })
        ] satisfies AssistantRunEvent[]) {
          projection = projectAssistantTurn(projection, event)
        }
        return (
          projection.lastSequence === 3 &&
          projection.toolCalls.length === 1 &&
          projection.toolCalls[0].status === 'completed'
        )
      }
    },
    {
      id: 'tool-trace.sequence-gap',
      dimension: 'toolTrace',
      execute: () => {
        const projection = projectAssistantTurn(
          createAssistantTurnProjection({
            runId: 'evaluation-run',
            turnId: 'evaluation-turn',
            assistantMessageId: 'evaluation-assistant',
            startedAt: 100
          }),
          assistantEvent(1, 'answer.delta', { delta: 'A' })
        )
        try {
          projectAssistantTurn(
            projection,
            assistantEvent(3, 'run.completed', {})
          )
          return false
        } catch (error) {
          return (
            error instanceof Error &&
            error.message.includes('sequence gap')
          )
        }
      }
    },
    {
      id: 'safety.capability-resource-mismatch',
      dimension: 'safety',
      execute: () => {
        try {
          normalizePermissionRequest({
            capability: 'filesystem.read',
            resource: {
              kind: 'network',
              service: 'evaluation.invalid'
            },
            context: {},
            risk: 'low'
          })
          return false
        } catch {
          return true
        }
      }
    },
    {
      id: 'safety.critical-persistence',
      dimension: 'safety',
      execute: () => {
        try {
          createPermissionGrant({
            id: 'evaluation-grant',
            request: {
              capability: 'realmflow.write',
              resource: {
                kind: 'workspace',
                workspaceId: 'evaluation-workspace'
              },
              context: { workspaceId: 'evaluation-workspace' },
              risk: 'critical'
            },
            mode: 'persistent',
            appSessionId: 'evaluation-session',
            at: 100
          })
          return false
        } catch {
          return true
        }
      }
    },
    {
      id: 'recovery.dsh-history-sync',
      dimension: 'recovery',
      execute: async () => {
        const result = await evaluateDshHistoryRecovery([
          dshRuntimeEvent(1, 'run.started', { summary: 'Evaluation started' }),
          dshRuntimeEvent(2, 'runtime.completed', {
            resultSummary: 'Evaluation completed'
          })
        ])
        return (
          result.synced.projectedEvents === 2 &&
          result.synced.toSequence === 2 &&
          result.binding.lastProjectedSequence === 2
        )
      }
    },
    {
      id: 'recovery.product-command-idempotency',
      dimension: 'recovery',
      execute: async () => {
        const result = await evaluateDshHistoryRecovery([
          dshRuntimeEvent(1, 'product_command.completed', {
            commandId: 'command-1',
            command: 'realmflow.requirements.get',
            idempotencyKey: 'evaluation-command-1',
            productVersion: 'requirements-v1',
            output: { requirementId: 'requirement-1' }
          })
        ])
        return (
          result.synced.productCommandResultsReconciled === 1 &&
          result.reconciledCommandKeys.join(',') ===
            'evaluation-command-1' &&
          result.binding.lastProjectedSequence === 1
        )
      }
    }
  ]
}

async function evaluationPipelineSnapshot() {
  return new ConversationProcessorPipeline(
    createBuiltinConversationProcessors()
  ).run({
    messageId: 'evaluation-message',
    content: '只分析 src/main.ts，不要修改文件。确保给出风险清单。',
    scenarioId: 'space',
    bindings: {
      workspaceId: 'evaluation-workspace',
      fileReferences: ['src/main.ts']
    },
    createdAt: 100
  })
}

type EvaluationDshEvent = {
  sequence: number
  kind: DshRuntimeEventKind
  data: DshRuntimeEventEnvelope['data']
}

const EVALUATION_DSH_RUNTIME_ID = 'runtime-evaluation'

function dshRuntimeEvent(
  sequence: number,
  kind: DshRuntimeEventKind,
  data: DshRuntimeEventEnvelope['data']
): EvaluationDshEvent {
  return { sequence, kind, data }
}

async function evaluateDshHistoryRecovery(events: EvaluationDshEvent[]) {
  const manifest = evaluationRunManifest()
  const sessions = new EvaluationDshSessions(
    createDshSessionBinding({
      owner: manifest.owner,
      dshSessionId: manifest.sessionId,
      runManifestDigest: manifest.digest,
      runtimeBuildDigest: '9'.repeat(64),
      createdAt: 100
    })
  )
  const storedEvents = events.map((event) =>
    materializeDshRuntimeEvent(manifest, event)
  )
  const reconciledCommandKeys: string[] = []
  const ingestor = new DshRuntimeEventIngestor({
    sessions,
    projector: new DshRuntimeEventProjector(),
    now: () => 200
  })
  const sync = new DshHistorySync({
    sessions,
    ingestor,
    history: {
      readRange: (input) => {
        const rangeEvents = storedEvents.filter(
          (event) => event.sequence > input.afterSequence
        )
        return {
          session: {
            runtimeInstanceId: EVALUATION_DSH_RUNTIME_ID,
            sessionId: manifest.sessionId,
            runId: manifest.runId,
            manifestDigest: manifest.digest,
            owner: manifest.owner
          },
          afterSequence: input.afterSequence,
          nextAfterSequence:
            rangeEvents.at(-1)?.sequence ?? input.afterSequence,
          hasMore: false,
          events: rangeEvents
        }
      }
    },
    productCommandResults: {
      reconcileCompletedResult: (result) => {
        reconciledCommandKeys.push(result.idempotencyKey)
        return 'recorded'
      }
    },
    defaultLimit: 10
  })
  const synced = await sync.syncRun({
    runtimeInstanceId: EVALUATION_DSH_RUNTIME_ID,
    manifest,
    limit: 10
  })
  return {
    synced,
    binding: sessions.binding,
    reconciledCommandKeys
  }
}

class EvaluationDshSessions {
  constructor(public binding: DshSessionBinding) {}

  getByOwner(owner: DshRunOwner): DshSessionBinding | undefined {
    return dshRunOwnerKey(owner) === this.binding.ownerKey
      ? this.binding
      : undefined
  }

  getByDshSessionId(dshSessionId: string): DshSessionBinding | undefined {
    return dshSessionId === this.binding.dshSessionId
      ? this.binding
      : undefined
  }

  advanceProjection(
    dshSessionId: string,
    sequence: number,
    updatedAt: number
  ): DshSessionBinding {
    if (dshSessionId !== this.binding.dshSessionId) {
      throw new Error('Evaluation DSH session is unavailable')
    }
    this.binding = advanceDshSessionProjection(
      this.binding,
      sequence,
      updatedAt
    )
    return this.binding
  }
}

function materializeDshRuntimeEvent(
  manifest: DshRunManifest,
  event: EvaluationDshEvent
): DshRuntimeEventEnvelope {
  return {
    schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
    runtimeInstanceId: EVALUATION_DSH_RUNTIME_ID,
    sessionId: manifest.sessionId,
    runId: manifest.runId,
    manifestDigest: manifest.digest,
    owner: manifest.owner,
    eventId: `evaluation-event-${event.sequence}`,
    sequence: event.sequence,
    kind: event.kind,
    occurredAt: 100 + event.sequence,
    data: event.data
  }
}

function evaluationRunManifest(): DshRunManifest {
  return sealDshRunManifest({
    schemaVersion: 1,
    manifestId: 'evaluation-manifest',
    runId: 'evaluation-run',
    sessionId: 'evaluation-session',
    owner: {
      conversationId: 'evaluation-conversation'
    },
    model: {
      kind: 'model',
      providerId: 'provider-local',
      providerType: 'local',
      profileId: 'profile-local',
      modelId: 'local-evaluation-model',
      reasoningEffort: 'low',
      options: {}
    },
    tools: [],
    skills: [],
    agents: [],
    mcpServers: [],
    connectors: [],
    context: {
      kind: 'context-access',
      scope: { kind: 'global' },
      roots: [],
      attachments: []
    },
    knowledge: {
      kind: 'knowledge-runtime',
      enabled: false,
      scope: { kind: 'none' },
      snapshotId: 'evaluation-knowledge',
      workspaceIds: [],
      generationIds: [],
      embeddingProfile: {
        provider: 'local',
        model: 'Alibaba-NLP/gte-multilingual-base',
        revision: '2024-08-01',
        dimensions: 768,
        normalization: 'L2',
        distance: 'Cosine',
        profileDigest: 'a'.repeat(64)
      },
      indexLease: {
        leaseId: 'evaluation-lease',
        collection: 'evaluation-collection',
        expiresAt: 1_000
      },
      limits: {
        maxQueries: 0,
        topKPerQuery: 0,
        maxReturnedChunks: 0,
        maxContextCharacters: 0
      }
    },
    policy: {
      kind: 'runtime-policy',
      approvalMode: 'protected',
      defaultDecision: 'deny',
      allowRuntimeWidening: false,
      toolPolicyDigest: 'b'.repeat(64),
      maximumRisk: 'low'
    },
    budget: {
      kind: 'runtime-budget',
      maxModelRequests: 1,
      maxToolCalls: 1,
      maxSubagents: 0,
      maxRuntimeMs: 1_000,
      maxRetries: 0,
      maxInputTokens: 1,
      maxOutputTokens: 1,
      maxCostUsd: 0
    },
    productCommands: [
      {
        kind: 'product-command',
        grantId: 'evaluation-command-grant',
        command: 'realmflow.requirements.get',
        scope: { kind: 'global' },
        inputSchemaDigest: 'c'.repeat(64),
        maxInvocations: 1
      }
    ],
    credentialReferences: []
  })
}

function candidateDigest(database: Database.Database): string {
  const profiles = database
    .prepare(
      `SELECT profile_id, profile_version, source, scenario_id, workspace_id,
              profile_digest
       FROM agent_profile_publications
       ORDER BY profile_id, profile_version`
    )
    .all()
  const capabilities = database
    .prepare(
      `SELECT capability_id, capability_version, capability_digest,
              scope_kind, scope_key, enabled, lifecycle_status, revision
       FROM capability_installations
       ORDER BY capability_id, scope_kind, scope_key`
    )
    .all()
  const revision = database
    .prepare(
      `SELECT revision FROM runtime_governance_revisions
       WHERE singleton_id = 1`
    )
    .pluck()
    .get()
  return digest({ profiles, capabilities, revision })
}

function assertSuiteCoverage(
  cases: readonly RuntimeEvaluationCase[]
): void {
  const ids = new Set<string>()
  for (const evaluationCase of cases) {
    if (!evaluationCase.id.trim() || ids.has(evaluationCase.id)) {
      throw new Error('Runtime evaluation case IDs must be unique')
    }
    ids.add(evaluationCase.id)
  }
  for (const dimension of DIMENSIONS) {
    if (!cases.some((evaluationCase) => evaluationCase.dimension === dimension)) {
      throw new Error(
        `Runtime evaluation suite is missing ${dimension} cases`
      )
    }
  }
}

function assistantEvent<T extends AssistantRunEvent['type']>(
  sequence: number,
  type: T,
  data: Extract<AssistantRunEvent, { type: T }>['data']
): Extract<AssistantRunEvent, { type: T }> {
  return {
    id: `evaluation-event-${sequence}`,
    runId: 'evaluation-run',
    sequence,
    type,
    timestamp: 100 + sequence,
    data
  } as Extract<AssistantRunEvent, { type: T }>
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
