import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  createRunCheckpoint,
  decideAgentRunRecovery
} from '../../../../domain/agent-run-recovery'
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
      id: 'recovery.unknown-side-effect',
      dimension: 'recovery',
      execute: () =>
        decideAgentRunRecovery({
          checkpoint: recoveryCheckpoint(),
          configuration: availableConfiguration(),
          pendingCalls: [
            { callId: 'evaluation-call', outcome: 'unknown' }
          ]
        }).action === 'block'
    },
    {
      id: 'recovery.reconciled-side-effect',
      dimension: 'recovery',
      execute: () =>
        decideAgentRunRecovery({
          checkpoint: recoveryCheckpoint(),
          configuration: availableConfiguration(),
          pendingCalls: [
            { callId: 'evaluation-call', outcome: 'completed' }
          ]
        }).action === 'resume'
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

function recoveryCheckpoint() {
  return createRunCheckpoint({
    runId: 'evaluation-run',
    ordinal: 1,
    reason: 'tool_completed',
    snapshotDigest: 'a'.repeat(64),
    configurationDigests: {
      agentProfile: 'b'.repeat(64),
      prompt: 'c'.repeat(64),
      policy: 'd'.repeat(64),
      capabilityCatalog: 'e'.repeat(64),
      capabilityBinding: 'f'.repeat(64)
    },
    messageWindow: [
      {
        id: 'evaluation-message',
        role: 'user',
        content: 'Evaluate recovery'
      }
    ],
    pendingCalls: [
      {
        callId: 'evaluation-call',
        executionId: 'evaluation-execution',
        effect: 'external_write',
        idempotency: 'supported',
        status: 'requested'
      }
    ],
    remainingBudgets: {
      toolCalls: 1,
      subagents: 0,
      retries: 1,
      timeoutMs: 1_000,
      tokens: 1_024
    },
    projectionCursor: 1,
    createdAt: 100
  })
}

function availableConfiguration() {
  return {
    profileAvailable: true,
    capabilitiesAvailable: true,
    modelAvailable: true,
    permissionValid: true,
    credentialAvailable: true
  }
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
