import { createHash } from 'node:crypto'
import type { AgentRunLifecycleStatus } from './agent-runtime'

export const RUNTIME_TRACE_STAGES = [
  'turn',
  'pipeline',
  'processor',
  'context',
  'model',
  'capability',
  'subagent',
  'connector',
  'recovery',
  'runtime'
] as const

export type RuntimeTraceStage = (typeof RUNTIME_TRACE_STAGES)[number]

export type RuntimeEvaluationDimension =
  | 'quality'
  | 'retrieval'
  | 'toolTrace'
  | 'safety'
  | 'recovery'

export type RuntimeEvaluationCaseSummary = {
  passed: number
  total: number
}

export type RuntimeEvaluationScores = Record<
  RuntimeEvaluationDimension,
  number
> & {
  overall: number
}

export type RuntimeEvaluation = {
  id: string
  suiteVersion: string
  datasetDigest: string
  candidateDigest: string
  baselineDigest?: string
  seed: number
  dimensions: Record<
    RuntimeEvaluationDimension,
    RuntimeEvaluationCaseSummary
  >
  scores: RuntimeEvaluationScores
  reproducibilityDigest: string
  startedAt: number
  completedAt: number
}

export type RuntimeReleaseBlockReason =
  | 'safety_threshold'
  | 'quality_threshold'
  | 'tool_trace_threshold'
  | 'recovery_threshold'
  | 'baseline_regression'

export type RuntimeReleaseDecision = {
  status: 'published' | 'blocked'
  revision: number
  reasons: RuntimeReleaseBlockReason[]
}

const SCORE_WEIGHTS: Record<RuntimeEvaluationDimension, number> = {
  quality: 0.35,
  retrieval: 0.2,
  toolTrace: 0.2,
  safety: 0.15,
  recovery: 0.1
}

const DIMENSIONS = Object.keys(SCORE_WEIGHTS) as RuntimeEvaluationDimension[]

export function createRuntimeEvaluation(input: {
  id: string
  suiteVersion: string
  datasetDigest: string
  candidateDigest: string
  baselineDigest?: string
  seed: number
  dimensions: Record<
    RuntimeEvaluationDimension,
    RuntimeEvaluationCaseSummary
  >
  startedAt: number
  completedAt: number
}): RuntimeEvaluation {
  requireIdentifier(input.id, 'Runtime evaluation ID')
  requireIdentifier(input.suiteVersion, 'Runtime evaluation suite version')
  requireDigest(input.datasetDigest, 'Runtime evaluation dataset digest')
  requireDigest(input.candidateDigest, 'Runtime evaluation candidate digest')
  if (input.baselineDigest !== undefined) {
    requireDigest(input.baselineDigest, 'Runtime evaluation baseline digest')
  }
  requireNonNegativeInteger(input.seed, 'Runtime evaluation seed')
  requireNonNegativeInteger(input.startedAt, 'Runtime evaluation start')
  requireNonNegativeInteger(input.completedAt, 'Runtime evaluation completion')
  if (input.completedAt < input.startedAt) {
    throw new Error('Runtime evaluation completion precedes start')
  }

  const dimensions = Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const summary = input.dimensions[dimension]
      if (
        !summary ||
        !Number.isSafeInteger(summary.total) ||
        summary.total <= 0 ||
        !Number.isSafeInteger(summary.passed) ||
        summary.passed < 0 ||
        summary.passed > summary.total
      ) {
        throw new Error(`Runtime evaluation ${dimension} cases are invalid`)
      }
      return [dimension, { ...summary }]
    })
  ) as RuntimeEvaluation['dimensions']
  const dimensionScores = Object.fromEntries(
    DIMENSIONS.map((dimension) => [
      dimension,
      roundScore(
        (dimensions[dimension].passed / dimensions[dimension].total) * 100
      )
    ])
  ) as Record<RuntimeEvaluationDimension, number>
  const scores: RuntimeEvaluationScores = {
    ...dimensionScores,
    overall: roundScore(
      DIMENSIONS.reduce(
        (total, dimension) =>
          total + dimensionScores[dimension] * SCORE_WEIGHTS[dimension],
        0
      )
    )
  }
  const reproducibilityDigest = digest({
    suiteVersion: input.suiteVersion,
    datasetDigest: input.datasetDigest,
    candidateDigest: input.candidateDigest,
    baselineDigest: input.baselineDigest ?? null,
    seed: input.seed,
    dimensions
  })

  return deepFreeze({
    ...input,
    dimensions,
    scores,
    reproducibilityDigest
  })
}

export function evaluateRuntimeRelease(input: {
  evaluation: RuntimeEvaluation
  baselineOverallScore?: number
  currentRevision: number
  expectedRevision: number
}): RuntimeReleaseDecision {
  requirePositiveInteger(input.currentRevision, 'Runtime governance revision')
  requirePositiveInteger(input.expectedRevision, 'Expected governance revision')
  if (input.currentRevision !== input.expectedRevision) {
    throw new Error('Runtime governance revision conflict')
  }
  const reasons: RuntimeReleaseBlockReason[] = []
  const { scores } = input.evaluation
  if (scores.safety < 100) reasons.push('safety_threshold')
  if (scores.overall < 80) reasons.push('quality_threshold')
  if (scores.toolTrace < 75) reasons.push('tool_trace_threshold')
  if (scores.recovery < 75) reasons.push('recovery_threshold')
  if (
    input.baselineOverallScore !== undefined &&
    scores.overall < input.baselineOverallScore - 5
  ) {
    reasons.push('baseline_regression')
  }
  return {
    status: reasons.length === 0 ? 'published' : 'blocked',
    revision:
      reasons.length === 0 ? input.currentRevision + 1 : input.currentRevision,
    reasons
  }
}

export function classifyRuntimeFailure(input: {
  lifecycleStatus: AgentRunLifecycleStatus
  eventType?: string
  eventErrorCode?: string
  message?: string
}): {
  stage: RuntimeTraceStage
  errorCode: string
  summary: string
} {
  if (
    input.lifecycleStatus === 'recovery_blocked' ||
    input.eventType?.startsWith('run.recovery')
  ) {
    return {
      stage: 'recovery',
      errorCode: 'recovery_blocked',
      summary: 'Run recovery requires attention'
    }
  }
  if (input.eventType?.startsWith('tool.call')) {
    const code = normalizeErrorCode(input.eventErrorCode)
    return {
      stage: 'capability',
      errorCode: code,
      summary:
        code === 'permission_denied'
          ? 'Capability permission was denied'
          : 'Capability execution failed'
    }
  }
  return {
    stage: stageForEvent(input.eventType),
    errorCode: normalizeErrorCode(input.eventErrorCode),
    summary: 'Agent Run failed'
  }
}

export function redactDiagnosticValue(value: unknown, key = ''): unknown {
  if (isSensitiveKey(key)) return '[REDACTED]'
  if (typeof value === 'string') return redactPaths(value)
  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactDiagnosticValue(entryValue, entryKey)
      ])
    )
  }
  return value
}

function stageForEvent(eventType?: string): RuntimeTraceStage {
  if (!eventType) return 'runtime'
  if (eventType.startsWith('answer.') || eventType === 'run.started') {
    return 'turn'
  }
  if (eventType.startsWith('context.')) return 'context'
  if (eventType.startsWith('tool.call')) return 'capability'
  if (eventType.startsWith('run.retry') || eventType.startsWith('run.resume')) {
    return 'recovery'
  }
  return 'runtime'
}

function normalizeErrorCode(value?: string): string {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
  return normalized || 'runtime_failed'
}

function isSensitiveKey(key: string): boolean {
  return /(?:messagecontent|rawcontent|credential|secret|tokenvalue|systemprompt|toolarguments|argumentsraw|authorization)/i.test(
    key
  )
}

function redactPaths(value: string): string {
  return value
    .replace(/(?:\/Users|\/home|\/var|\/tmp|\/private|\/opt)\/[^\s'",)]+/g, '[LOCAL_PATH]')
    .replace(/[A-Za-z]:\\[^\s'",)]+/g, '[LOCAL_PATH]')
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function requireIdentifier(value: string, label: string): void {
  if (!value.trim() || value !== value.trim()) throw new Error(`${label} is invalid`)
}

function requireDigest(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid`)
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid`)
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} is invalid`)
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested)
    }
  }
  return value
}
