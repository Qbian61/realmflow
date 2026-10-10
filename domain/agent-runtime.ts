import type { ReasoningDecision } from './reasoning-router'
import type { ResponseLanguageSnapshot } from './response-language'
import type { ToolPolicySnapshot } from './tool-policy'
import type { RunModelFacingSnapshot } from './tool-catalog'

export const AGENT_RUN_SCENARIO_IDS = [
  'general',
  'folder',
  'space',
  'requirement-node',
  'workflow-node',
  'scheduled',
  'sensitive',
  'management'
] as const

export type AgentRunScenarioId = (typeof AGENT_RUN_SCENARIO_IDS)[number]

export const AGENT_RUN_LIFECYCLE_STATUSES = [
  'preparing',
  'running',
  'waiting_permission',
  'waiting_input',
  'retrying',
  'paused',
  'recovery_blocked',
  'completed',
  'failed',
  'cancelled'
] as const

export type AgentRunLifecycleStatus =
  (typeof AGENT_RUN_LIFECYCLE_STATUSES)[number]

export type AgentRunBudget = {
  maxToolCalls: number
  maxSubagents: number
  timeoutMs: number
  maxRetries: number
}

export type AgentExecutionPolicy = {
  policyVersion: 1
  maxTurnsPerSegment: number
  maxContinuationAttempts: number
  maxParallelToolsPerTurn: number
  maxActiveRuntimeMs: number
  providerRequestTimeoutMs: number
  contextCompactionThreshold: number
  maxOutputTokens: number
  maxFileReadTokens: number
  maxRepeatedEquivalentCalls: number
  maxConsecutiveFailures: number
}

export type RunBudgetLedger = {
  segmentIndex: number
  agentTurns: number
  toolRequests: number
  toolExecutions: number
  permissionWaits: number
  sideEffects: number
  consecutiveFailures: number
  repeatedCallFingerprints: Record<string, number>
  activeRuntimeMs: number
  remainingContinuationAttempts: number
}

export const DEFAULT_AGENT_EXECUTION_POLICY: Readonly<AgentExecutionPolicy> =
  deepFreeze({
    policyVersion: 1,
    maxTurnsPerSegment: 180,
    maxContinuationAttempts: 2,
    maxParallelToolsPerTurn: 16,
    maxActiveRuntimeMs: 8 * 60 * 60_000,
    providerRequestTimeoutMs: 30 * 60_000,
    contextCompactionThreshold: 0.75,
    maxOutputTokens: 32_000,
    maxFileReadTokens: 25_000,
    maxRepeatedEquivalentCalls: 3,
    maxConsecutiveFailures: 5
  })

export const AGENT_RUN_HARD_LIMITS: Readonly<AgentRunBudget> =
  Object.freeze({
    maxToolCalls: 256,
    maxSubagents: 16,
    timeoutMs: 24 * 60 * 60_000,
    maxRetries: 8
  })

export type AgentRunLineage = {
  rootRunId: string
  parentRunId: string
  delegationDepth: number
  delegationOrdinal: number
}

export type AgentRunSourceCheckpoint = {
  runId: string
  ordinal: number
  resumeToken: string
}

export type AgentRunScope =
  | { kind: 'global' }
  | { kind: 'folder'; folderPath: string }
  | { kind: 'workspace'; workspaceId: string }
  | {
      kind: 'requirement-node'
      workspaceId: string
      requirementId: string
      nodeId: string
      nodeRunId: string
    }
  | {
      kind: 'workflow'
      workspaceId: string
      requirementId: string
      nodeId?: string
      nodeRunId?: string
    }

export type AgentRunScenario = {
  id: AgentRunScenarioId
  pipelineVersion: string
  agentProfileId: string
  agentProfileVersion: string
  defaultBudgets: AgentRunBudget
  executionPolicy: Readonly<AgentExecutionPolicy>
  recoveryPolicy: 'interrupt' | 'resume'
}

export type AgentRunSnapshot = {
  schemaVersion: 1
  runId: string
  conversationId?: string
  scheduleRunId?: string
  contextSnapshotId?: string
  triggerBindingId?: string
  triggerEventId?: string
  rootRunId: string
  parentRunId?: string
  delegationDepth: number
  delegationOrdinal: number
  sourceCheckpoint?: AgentRunSourceCheckpoint
  delegationMode?: 'research'
  scenarioId: AgentRunScenarioId
  pipelineVersion: string
  agentProfileId: string
  agentProfileVersion: string
  agentProfileDigest: string
  promptDigest: string
  policyDigest: string
  toolPolicy?: ToolPolicySnapshot
  modelFacing?: RunModelFacingSnapshot
  capabilityCatalogDigest: string
  capabilityBindingDigest: string
  permissionSnapshotDigest: string
  modelProfileId?: string
  reasoningDecision?: ReasoningDecision
  responseLanguage?: ResponseLanguageSnapshot
  scope: AgentRunScope
  executionPolicy: AgentExecutionPolicy
  budgetLedger: RunBudgetLedger
  budgets: AgentRunBudget
  createdAt: number
}

export type AgentRuntimeRun = {
  id: string
  providerRunId?: string
  status: AgentRunLifecycleStatus
  snapshot: AgentRunSnapshot
  error?: string
  createdAt: number
  updatedAt: number
}

type AgentRunContext = {
  conversationId?: string
  messages?: readonly unknown[]
  workspaceId?: string
  folderPath?: string
  requirementId?: string
  nodeId?: string
  nodeRunId?: string
  scheduleRunId?: string
  contextSnapshotId?: string
  triggerBindingId?: string
  triggerEventId?: string
  requestedScenarioId?: 'sensitive' | 'management'
  responseLanguage?: ResponseLanguageSnapshot
}

const DEFAULT_BUDGETS: AgentRunBudget = {
  maxToolCalls: AGENT_RUN_HARD_LIMITS.maxToolCalls,
  maxSubagents: 0,
  timeoutMs: 15 * 60_000,
  maxRetries: 2
}

const SCENARIOS: Readonly<Record<AgentRunScenarioId, AgentRunScenario>> =
  Object.freeze(
    Object.fromEntries(
      AGENT_RUN_SCENARIO_IDS.map((id) => [
        id,
        deepFreeze({
          id,
          pipelineVersion: `builtin.${id}.v1`,
          agentProfileId: `builtin.${id}`,
          agentProfileVersion: '1.0.0',
          defaultBudgets: { ...DEFAULT_BUDGETS },
          executionPolicy: DEFAULT_AGENT_EXECUTION_POLICY,
          recoveryPolicy:
            id === 'workflow-node' || id === 'scheduled'
              ? 'resume'
              : 'interrupt'
        })
      ])
    ) as Record<AgentRunScenarioId, AgentRunScenario>
  )

const LIFECYCLE_TRANSITIONS: Record<
  AgentRunLifecycleStatus,
  ReadonlySet<AgentRunLifecycleStatus>
> = {
  preparing: new Set([
    'running',
    'retrying',
    'recovery_blocked',
    'failed',
    'cancelled'
  ]),
  running: new Set([
    'waiting_permission',
    'waiting_input',
    'retrying',
    'paused',
    'recovery_blocked',
    'completed',
    'failed',
    'cancelled'
  ]),
  waiting_permission: new Set([
    'running',
    'recovery_blocked',
    'completed',
    'failed',
    'cancelled'
  ]),
  waiting_input: new Set([
    'running',
    'recovery_blocked',
    'completed',
    'failed',
    'cancelled'
  ]),
  retrying: new Set([
    'running',
    'paused',
    'recovery_blocked',
    'completed',
    'failed',
    'cancelled'
  ]),
  paused: new Set(['running', 'recovery_blocked', 'failed', 'cancelled']),
  recovery_blocked: new Set(['running', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set()
}

export function resolveAgentRunScenario(
  context: AgentRunContext
): AgentRunScenario {
  const requested = context.requestedScenarioId
  if (requested) return SCENARIOS[requested]
  if (context.scheduleRunId) return SCENARIOS.scheduled
  if (context.conversationId) {
    if (
      context.requirementId &&
      context.nodeId &&
      context.nodeRunId &&
      context.workspaceId
    ) {
      return SCENARIOS['requirement-node']
    }
    if (context.folderPath) return SCENARIOS.folder
    if (context.workspaceId) return SCENARIOS.space
    return SCENARIOS.general
  }
  if (context.requirementId && context.workspaceId) {
    return SCENARIOS['workflow-node']
  }
  throw new Error('Agent Run scenario cannot be resolved')
}

export function createAgentRunSnapshot(
  context: AgentRunContext,
  input: {
    runId: string
    agentProfileId: string
    agentProfileVersion: string
    agentProfileDigest: string
    promptDigest: string
    policyDigest: string
    toolPolicy?: ToolPolicySnapshot
    modelFacing?: RunModelFacingSnapshot
    capabilityCatalogDigest: string
    capabilityBindingDigest: string
    permissionSnapshotDigest: string
    modelProfileId?: string
    reasoningDecision?: ReasoningDecision
    maxToolCalls?: number
    timeoutMs?: number
    maxSubagents?: number
    maxRetries?: number
    pipelineVersion?: string
    lineage?: AgentRunLineage
    sourceCheckpoint?: AgentRunSourceCheckpoint
    delegationMode?: 'research'
    createdAt?: number
  }
): AgentRunSnapshot {
  const scenario = resolveAgentRunScenario(context)
  const budgets = {
    ...scenario.defaultBudgets,
    ...(input.maxToolCalls === undefined
      ? {}
      : { maxToolCalls: input.maxToolCalls }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.maxSubagents === undefined
      ? {}
      : { maxSubagents: input.maxSubagents }),
    ...(input.maxRetries === undefined
      ? {}
      : { maxRetries: input.maxRetries })
  }
  assertValidBudgets(budgets)
  const lineage = resolveLineage(input.runId, input.lineage)
  assertSourceCheckpoint(input.sourceCheckpoint)
  assertOptionalIdentifier(context.contextSnapshotId)
  assertOptionalIdentifier(context.triggerBindingId)
  assertOptionalIdentifier(context.triggerEventId)
  return deepFreeze({
    schemaVersion: 1,
    runId: input.runId,
    ...(context.conversationId
      ? { conversationId: context.conversationId }
      : {}),
    ...(context.scheduleRunId
      ? { scheduleRunId: context.scheduleRunId }
      : {}),
    ...(context.contextSnapshotId
      ? { contextSnapshotId: context.contextSnapshotId }
      : {}),
    ...(context.triggerBindingId
      ? { triggerBindingId: context.triggerBindingId }
      : {}),
    ...(context.triggerEventId
      ? { triggerEventId: context.triggerEventId }
      : {}),
    ...lineage,
    ...(input.sourceCheckpoint
      ? { sourceCheckpoint: { ...input.sourceCheckpoint } }
      : {}),
    ...(input.delegationMode ? { delegationMode: input.delegationMode } : {}),
    scenarioId: scenario.id,
    pipelineVersion: input.pipelineVersion ?? scenario.pipelineVersion,
    agentProfileId: input.agentProfileId,
    agentProfileVersion: input.agentProfileVersion,
    agentProfileDigest: input.agentProfileDigest,
    promptDigest: input.promptDigest,
    policyDigest: input.policyDigest,
    ...(input.toolPolicy ? { toolPolicy: structuredClone(input.toolPolicy) } : {}),
    ...(input.modelFacing ? { modelFacing: structuredClone(input.modelFacing) } : {}),
    capabilityCatalogDigest: input.capabilityCatalogDigest,
    capabilityBindingDigest: input.capabilityBindingDigest,
    permissionSnapshotDigest: input.permissionSnapshotDigest,
    ...(input.modelProfileId
      ? { modelProfileId: input.modelProfileId }
      : {}),
    ...(input.reasoningDecision
      ? { reasoningDecision: input.reasoningDecision }
      : {}),
    ...(context.responseLanguage
      ? { responseLanguage: { ...context.responseLanguage } }
      : {}),
    scope: resolveAgentRunScope(context, scenario.id),
    executionPolicy: { ...scenario.executionPolicy },
    budgetLedger: createInitialRunBudgetLedger(scenario.executionPolicy),
    budgets,
    createdAt: input.createdAt ?? Date.now()
  })
}

export function createInitialRunBudgetLedger(
  policy: Pick<AgentExecutionPolicy, 'maxContinuationAttempts'>
): RunBudgetLedger {
  return {
    segmentIndex: 0,
    agentTurns: 0,
    toolRequests: 0,
    toolExecutions: 0,
    permissionWaits: 0,
    sideEffects: 0,
    consecutiveFailures: 0,
    repeatedCallFingerprints: {},
    activeRuntimeMs: 0,
    remainingContinuationAttempts: policy.maxContinuationAttempts
  }
}

function resolveLineage(
  runId: string,
  lineage: AgentRunLineage | undefined
): Pick<
  AgentRunSnapshot,
  'rootRunId' | 'parentRunId' | 'delegationDepth' | 'delegationOrdinal'
> {
  if (!lineage) {
    return {
      rootRunId: runId,
      delegationDepth: 0,
      delegationOrdinal: 0
    }
  }
  if (
    !lineage.rootRunId.trim() ||
    !lineage.parentRunId.trim() ||
    lineage.parentRunId === runId ||
    !Number.isInteger(lineage.delegationDepth) ||
    lineage.delegationDepth < 1 ||
    lineage.delegationDepth > 2 ||
    !Number.isInteger(lineage.delegationOrdinal) ||
    lineage.delegationOrdinal < 1
  ) {
    throw new Error('Invalid Agent Run delegation lineage')
  }
  return { ...lineage }
}

export function transitionAgentRunLifecycle(
  current: AgentRunLifecycleStatus,
  next: AgentRunLifecycleStatus
): AgentRunLifecycleStatus {
  if (current === next) return current
  if (!LIFECYCLE_TRANSITIONS[current].has(next)) {
    throw new Error(
      `Invalid Agent Run lifecycle transition: ${current} -> ${next}`
    )
  }
  return next
}

export function isTerminalAgentRunLifecycle(
  status: AgentRunLifecycleStatus
): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  )
}

export function resolveAgentRunScope(
  context: AgentRunContext,
  scenarioId: AgentRunScenarioId
): AgentRunScope {
  if (
    scenarioId === 'requirement-node' &&
    context.workspaceId &&
    context.requirementId &&
    context.nodeId &&
    context.nodeRunId
  ) {
    return {
      kind: 'requirement-node',
      workspaceId: context.workspaceId,
      requirementId: context.requirementId,
      nodeId: context.nodeId,
      nodeRunId: context.nodeRunId
    }
  }
  if (
    scenarioId === 'workflow-node' &&
    context.workspaceId &&
    context.requirementId
  ) {
    return {
      kind: 'workflow',
      workspaceId: context.workspaceId,
      requirementId: context.requirementId,
      ...(context.nodeId ? { nodeId: context.nodeId } : {}),
      ...(context.nodeRunId ? { nodeRunId: context.nodeRunId } : {})
    }
  }
  if (scenarioId === 'folder' && context.folderPath) {
    return { kind: 'folder', folderPath: context.folderPath }
  }
  if (scenarioId === 'space' && context.workspaceId) {
    return { kind: 'workspace', workspaceId: context.workspaceId }
  }
  return { kind: 'global' }
}

function assertValidBudgets(budgets: AgentRunBudget): void {
  if (
    !Number.isInteger(budgets.maxToolCalls) ||
    budgets.maxToolCalls <= 0 ||
    !Number.isInteger(budgets.maxSubagents) ||
    budgets.maxSubagents < 0 ||
    !Number.isInteger(budgets.timeoutMs) ||
    budgets.timeoutMs <= 0 ||
    !Number.isInteger(budgets.maxRetries) ||
    budgets.maxRetries < 0 ||
    budgets.maxToolCalls > AGENT_RUN_HARD_LIMITS.maxToolCalls ||
    budgets.maxSubagents > AGENT_RUN_HARD_LIMITS.maxSubagents ||
    budgets.timeoutMs > AGENT_RUN_HARD_LIMITS.timeoutMs ||
    budgets.maxRetries > AGENT_RUN_HARD_LIMITS.maxRetries
  ) {
    throw new Error('Invalid Agent Run budget')
  }
}

function assertSourceCheckpoint(
  source: AgentRunSourceCheckpoint | undefined
): void {
  if (!source) return
  if (
    !source.runId.trim() ||
    !Number.isInteger(source.ordinal) ||
    source.ordinal < 1 ||
    !/^[a-f0-9]{64}$/.test(source.resumeToken)
  ) {
    throw new Error('Invalid Agent Run source checkpoint')
  }
}

function assertOptionalIdentifier(value: string | undefined): void {
  if (value !== undefined && !value.trim()) {
    throw new Error('Invalid Agent Run snapshot identifier')
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}
