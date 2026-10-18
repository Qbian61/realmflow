import type { RuntimeBudgetManifest } from '../../../../domain/dsh-run-manifest'

export type RuntimeBudgetCommand = {
  runId: string
  requestId: string
  fingerprint: string
  at: number
}

export type RuntimeBudgetReservation = RuntimeBudgetCommand & {
  allocations: Array<{ runId: string; toolCalls: number }>
}

export type RuntimeBudgetStatus = {
  availableToolCalls: number
  allocatedToolCalls: number
  consumedToolCalls: number
  remainingSubagents: number
}

export interface RuntimeBudgetStore {
  read(runId: string): RuntimeBudgetStatus
  consume(input: RuntimeBudgetCommand): void
  reserve(input: RuntimeBudgetReservation): void
}

export const DSH_RUNTIME_BUDGET_BOUNDARIES = [
  'model',
  'tool',
  'goal',
  'subagent'
] as const

export type DshRuntimeBudgetBoundary =
  (typeof DSH_RUNTIME_BUDGET_BOUNDARIES)[number]

export type DshRuntimeBudgetUsage = {
  modelRequests: number
  toolCalls: number
  subagents: number
  runtimeMs: number
  retries: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type DshRuntimeBudgetRemaining = DshRuntimeBudgetUsage

export type DshRuntimeBudgetBoundaryDecision = Readonly<{
  boundary: DshRuntimeBudgetBoundary
  allowed: boolean
  stopDshWork: boolean
  reason?: 'runtime_budget_exhausted'
}>

export type DshRuntimeBudgetPolicy = Readonly<{
  runId: string
  author: 'realmflow'
  budget: RuntimeBudgetManifest
  usage: DshRuntimeBudgetUsage
  remaining: DshRuntimeBudgetRemaining
  boundaries: Readonly<Record<
    DshRuntimeBudgetBoundary,
    DshRuntimeBudgetBoundaryDecision
  >>
}>

export type AuthorDshRuntimeBudgetPolicyInput = Readonly<{
  runId: string
  budget: RuntimeBudgetManifest
  usage?: Partial<DshRuntimeBudgetUsage>
}>

export class RuntimeBudgetHardLimitExhaustedError extends Error {
  readonly code = 'runtime_budget_exhausted'
  readonly stopDshWork = true

  constructor(
    readonly boundary: DshRuntimeBudgetBoundary,
    readonly decision: DshRuntimeBudgetBoundaryDecision
  ) {
    super(`DSH runtime budget exhausted at ${boundary} boundary`)
    this.name = 'RuntimeBudgetHardLimitExhaustedError'
  }
}

const EMPTY_USAGE: DshRuntimeBudgetUsage = {
  modelRequests: 0,
  toolCalls: 0,
  subagents: 0,
  runtimeMs: 0,
  retries: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0
}

const BOUNDARY_COST: Record<
  DshRuntimeBudgetBoundary,
  Partial<DshRuntimeBudgetUsage>
> = {
  model: { modelRequests: 1 },
  tool: { toolCalls: 1 },
  goal: { modelRequests: 1 },
  subagent: { subagents: 1 }
}

export function authorDshRuntimeBudgetPolicy(
  input: AuthorDshRuntimeBudgetPolicyInput
): DshRuntimeBudgetPolicy {
  if (!input.runId.trim()) throw new Error('DSH runtime budget run ID is invalid')
  const usage = normalizeUsage(input.usage)
  const remaining = remainingBudget(input.budget, usage)
  const policy: DshRuntimeBudgetPolicy = {
    runId: input.runId,
    author: 'realmflow',
    budget: { ...input.budget },
    usage,
    remaining,
    boundaries: {
      model: decideBoundary('model', remaining),
      tool: decideBoundary('tool', remaining),
      goal: decideBoundary('goal', remaining),
      subagent: decideBoundary('subagent', remaining)
    }
  }
  return deepFreeze(policy)
}

export function assertDshRuntimeBudgetBoundary(
  policy: DshRuntimeBudgetPolicy,
  boundary: DshRuntimeBudgetBoundary
): DshRuntimeBudgetBoundaryDecision {
  const decision = policy.boundaries[boundary]
  if (decision.allowed) return decision
  throw new RuntimeBudgetHardLimitExhaustedError(boundary, decision)
}

function decideBoundary(
  boundary: DshRuntimeBudgetBoundary,
  remaining: DshRuntimeBudgetRemaining
): DshRuntimeBudgetBoundaryDecision {
  const requested = BOUNDARY_COST[boundary]
  const allowed =
    remaining.runtimeMs > 0 &&
    Object.entries(requested).every(([key, amount]) => {
      const remainingAmount = remaining[key as keyof DshRuntimeBudgetRemaining]
      return remainingAmount >= (amount ?? 0)
    })
  return allowed
    ? {
        boundary,
        allowed: true,
        stopDshWork: false
      }
    : {
        boundary,
        allowed: false,
        stopDshWork: true,
        reason: 'runtime_budget_exhausted'
      }
}

function normalizeUsage(
  usage: Partial<DshRuntimeBudgetUsage> | undefined
): DshRuntimeBudgetUsage {
  const value = { ...EMPTY_USAGE, ...(usage ?? {}) }
  for (const [key, nested] of Object.entries(value)) {
    if (
      typeof nested !== 'number' ||
      !Number.isFinite(nested) ||
      nested < 0 ||
      (key !== 'costUsd' && !Number.isInteger(nested))
    ) {
      throw new Error(`DSH runtime budget usage ${key} is invalid`)
    }
  }
  return value
}

function remainingBudget(
  budget: RuntimeBudgetManifest,
  usage: DshRuntimeBudgetUsage
): DshRuntimeBudgetRemaining {
  return {
    modelRequests: remainingInteger(budget.maxModelRequests, usage.modelRequests),
    toolCalls: remainingInteger(budget.maxToolCalls, usage.toolCalls),
    subagents: remainingInteger(budget.maxSubagents, usage.subagents),
    runtimeMs: remainingInteger(budget.maxRuntimeMs, usage.runtimeMs),
    retries: remainingInteger(budget.maxRetries, usage.retries),
    inputTokens: remainingInteger(budget.maxInputTokens, usage.inputTokens),
    outputTokens: remainingInteger(budget.maxOutputTokens, usage.outputTokens),
    costUsd: remainingNumber(budget.maxCostUsd, usage.costUsd)
  }
}

function remainingInteger(limit: number, consumed: number): number {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('DSH runtime budget manifest is invalid')
  }
  return Math.max(0, limit - consumed)
}

function remainingNumber(limit: number, consumed: number): number {
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error('DSH runtime budget manifest is invalid')
  }
  return Math.max(0, limit - consumed)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child)
  }
  return value
}
