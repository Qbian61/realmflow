import type {
  RuntimeEvaluation,
  RuntimeReleaseBlockReason,
  RuntimeReleaseDecision,
  RuntimeTraceStage
} from '../domain/runtime-governance'
import type { AgentRunScenarioId } from '../domain/agent-runtime'

export type RuntimeGovernanceSummary = {
  totalRuns: number
  completedRuns: number
  failedRuns: number
  recoveryRate: number
  permissionWaits: number
  averageDurationMs: number | null
}

export type RuntimeFailedRunSummary = {
  runId: string
  scenarioId: AgentRunScenarioId
  stage: RuntimeTraceStage
  errorCode: string
  profileId: string
  pipelineVersion: string
  relatedCalls: number
  failedAt: number
}

export type RuntimeTraceItem = {
  eventId: string
  sequence: number
  stage: RuntimeTraceStage
  type: string
  timestamp: number
  summary: string
}

export type RuntimeRunDetail = RuntimeFailedRunSummary & {
  configuration: {
    scenarioId: AgentRunScenarioId
    pipelineVersion: string
    profile: string
    promptDigest: string
    policyDigest: string
    catalogDigest: string
    bindingDigest: string
    modelProfileId?: string
  }
  trace: RuntimeTraceItem[]
}

export type RuntimeGovernedCapability = {
  capabilityId: string
  capabilityVersion: string
  kind: 'tool' | 'skill' | 'agent' | 'connector'
  source: 'builtin' | 'imported' | 'generated' | 'connector'
  generationSessionId?: string
  conversationId?: string
  confirmationDigest?: string
  scopeLabel: string
  enabled: boolean
  revision: number
}

export type RuntimeGovernanceSnapshot = {
  revision: number
  summary: RuntimeGovernanceSummary
  failedRuns: RuntimeFailedRunSummary[]
  evaluations: RuntimeEvaluation[]
  capabilities: RuntimeGovernedCapability[]
  observability: {
    retentionDays: number
    maximumEvents: number
    droppedEvents: number
    storedEvents: number
  }
}

export type ReleaseRuntimeCandidateCommand = {
  evaluationId: string
  expectedRevision: number
  baselineOverallScore?: number
}

export type ExportRuntimeDiagnosticCommand = {
  runId: string
}

export type ExportRuntimeDiagnosticResult =
  | { status: 'cancelled' }
  | { status: 'exported'; fileName: string }

export interface RuntimeGovernanceApi {
  getSnapshot: () => Promise<RuntimeGovernanceSnapshot>
  getRunDetail: (runId: string) => Promise<RuntimeRunDetail>
  runEvaluation: () => Promise<RuntimeEvaluation>
  release: (
    command: ReleaseRuntimeCandidateCommand
  ) => Promise<RuntimeReleaseDecision>
  exportDiagnostic: (
    runId: string
  ) => Promise<ExportRuntimeDiagnosticResult>
}

export type {
  RuntimeEvaluation,
  RuntimeReleaseBlockReason,
  RuntimeReleaseDecision
}
