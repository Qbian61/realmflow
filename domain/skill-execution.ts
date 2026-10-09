import { createHash } from 'node:crypto'

export type SkillExecutionStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type SkillExecutionTriggerSource = 'user' | 'workflow' | 'schedule'

export type SkillExecutionErrorCode =
  | 'skill_version_unavailable'
  | 'skill_input_invalid'
  | 'skill_output_invalid'
  | 'skill_context_invalid'
  | 'skill_permission_required'
  | 'skill_permission_denied'
  | 'skill_connector_unavailable'
  | 'skill_sandbox_unavailable'
  | 'skill_timeout'
  | 'skill_memory_limit'
  | 'skill_output_limit'
  | 'skill_execution_failed'
  | 'skill_revision_conflict'
  | 'skill_idempotency_conflict'
  | 'skill_execution_unavailable'

export type SkillExecutionScope =
  | { kind: 'requirement'; requirementId: string }
  | { kind: 'space'; workspaceId: string }

export type SkillExecutionContext = {
  scope: SkillExecutionScope
  workspaceId: string
  requirementId?: string
  sessionId?: string
  nodeRunId?: string
  scheduleRunId?: string
}

export type SkillExecutionMetrics = {
  durationMs: number
  outputBytes: number
  peakMemoryBytes?: number
}

export type SkillExecutionError = {
  code: SkillExecutionErrorCode
  message: string
}

export type SkillExecution = {
  id: string
  skillId: string
  skillVersionId: string
  skillVersionChecksum: string
  triggerSource: SkillExecutionTriggerSource
  context: SkillExecutionContext
  input: Record<string, unknown>
  inputChecksum: string
  status: SkillExecutionStatus
  revision: number
  startedAt: number
  updatedAt: number
  cancellationRequestedAt?: number
  output?: Record<string, unknown>
  outputChecksum?: string
  metrics?: SkillExecutionMetrics
  error?: SkillExecutionError
  finishedAt?: number
}

export function createSkillExecution(input: {
  id: string
  skillId: string
  skillVersionId: string
  skillVersionChecksum: string
  triggerSource: SkillExecutionTriggerSource
  context: SkillExecutionContext
  input: Record<string, unknown>
  startedAt: number
}): SkillExecution {
  const id = requireIdentifier(input.id, 'ID')
  const skillId = requireIdentifier(input.skillId, 'Skill ID')
  const skillVersionId = requireIdentifier(
    input.skillVersionId,
    'Skill version ID'
  )
  const skillVersionChecksum = input.skillVersionChecksum.toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(skillVersionChecksum)) {
    throw new Error('Skill execution version checksum is invalid')
  }
  if (
    input.triggerSource !== 'user' &&
    input.triggerSource !== 'workflow' &&
    input.triggerSource !== 'schedule'
  ) {
    throw new Error('Skill execution trigger source is invalid')
  }
  const context = normalizeContext(input.context, input.triggerSource)
  const executionInput = cloneJsonObject(input.input, 'input')
  requireTimestamp(input.startedAt)
  return {
    id,
    skillId,
    skillVersionId,
    skillVersionChecksum,
    triggerSource: input.triggerSource,
    context,
    input: executionInput,
    inputChecksum: checksum(executionInput),
    status: 'running',
    revision: 1,
    startedAt: input.startedAt,
    updatedAt: input.startedAt
  }
}

export function requestSkillExecutionCancellation(
  current: SkillExecution,
  requestedAt: number
): SkillExecution {
  assertRunning(current)
  requireForwardTime(current, requestedAt)
  return {
    ...cloneExecution(current),
    revision: current.revision + 1,
    cancellationRequestedAt: requestedAt,
    updatedAt: requestedAt
  }
}

export function finishSkillExecution(
  current: SkillExecution,
  transition:
    | {
        status: 'succeeded'
        output: Record<string, unknown>
        metrics: SkillExecutionMetrics
        finishedAt: number
      }
    | {
        status: 'failed'
        error: SkillExecutionError
        metrics: SkillExecutionMetrics
        finishedAt: number
      }
    | {
        status: 'cancelled'
        metrics: SkillExecutionMetrics
        finishedAt: number
      }
): SkillExecution {
  assertRunning(current)
  requireForwardTime(current, transition.finishedAt)
  const metrics = normalizeMetrics(transition.metrics)
  const base: SkillExecution = {
    ...cloneExecution(current),
    status: transition.status,
    revision: current.revision + 1,
    metrics,
    finishedAt: transition.finishedAt,
    updatedAt: transition.finishedAt
  }
  if (transition.status === 'succeeded') {
    if (transition.output === undefined) {
      throw new Error('Skill execution output is required')
    }
    const output = cloneJsonObject(transition.output, 'output')
    return {
      ...base,
      output,
      outputChecksum: checksum(output)
    }
  }
  if (transition.status === 'failed') {
    if (!transition.error) {
      throw new Error('Skill execution error is required')
    }
    return {
      ...base,
      error: normalizeError(transition.error)
    }
  }
  return base
}

export function interruptSkillExecution(
  current: SkillExecution,
  interruptedAt: number,
  message: string
): SkillExecution {
  assertRunning(current)
  requireForwardTime(current, interruptedAt)
  return {
    ...cloneExecution(current),
    status: 'interrupted',
    revision: current.revision + 1,
    error: {
      code: 'skill_execution_unavailable',
      message: sanitizeSkillExecutionDiagnostic(message)
    },
    finishedAt: interruptedAt,
    updatedAt: interruptedAt
  }
}

export function sanitizeSkillExecutionDiagnostic(value: string): string {
  const redacted = value
    .replace(
      /(?:\/(?:Users|home|private|var|tmp)\/|[A-Za-z]:\\)[^\s"'<>]+/g,
      '[redacted-path]'
    )
    .replace(/Authorization:\s*[^\s]+\s+[^\s]+/gi, 'Authorization: [redacted]')
    .replace(/\b(token|secret|password|api[_-]?key)=\S+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  return Buffer.from(redacted, 'utf8').subarray(0, 1_024).toString('utf8')
}

function normalizeContext(
  value: SkillExecutionContext,
  triggerSource: SkillExecutionTriggerSource
): SkillExecutionContext {
  if (!value || typeof value !== 'object' || !value.scope) {
    throw new Error('Skill execution context is invalid')
  }
  const workspaceId = requireIdentifier(value.workspaceId, 'workspace ID')
  const requirementId = optionalIdentifier(
    value.requirementId,
    'requirement ID'
  )
  const sessionId = optionalIdentifier(value.sessionId, 'session ID')
  const nodeRunId = optionalIdentifier(value.nodeRunId, 'node run ID')
  const scheduleRunId = optionalIdentifier(
    value.scheduleRunId,
    'schedule run ID'
  )
  let scope: SkillExecutionScope
  if (value.scope.kind === 'requirement') {
    const scopeRequirementId = requireIdentifier(
      value.scope.requirementId,
      'scope requirement ID'
    )
    if (!requirementId || requirementId !== scopeRequirementId) {
      throw new Error('Skill execution requirement scope is invalid')
    }
    scope = { kind: 'requirement', requirementId: scopeRequirementId }
  } else if (value.scope.kind === 'space') {
    const scopeWorkspaceId = requireIdentifier(
      value.scope.workspaceId,
      'scope workspace ID'
    )
    if (scopeWorkspaceId !== workspaceId) {
      throw new Error('Skill execution space scope is invalid')
    }
    scope = { kind: 'space', workspaceId: scopeWorkspaceId }
  } else {
    throw new Error('Skill execution scope is invalid')
  }
  if (triggerSource === 'workflow' && !nodeRunId) {
    throw new Error('Skill execution workflow context requires a node run')
  }
  if (triggerSource === 'schedule' && !scheduleRunId) {
    throw new Error('Skill execution schedule context requires a schedule run')
  }
  return {
    scope,
    workspaceId,
    ...(requirementId ? { requirementId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(nodeRunId ? { nodeRunId } : {}),
    ...(scheduleRunId ? { scheduleRunId } : {})
  }
}

function normalizeMetrics(value: SkillExecutionMetrics): SkillExecutionMetrics {
  const durationMs = requireNonNegativeInteger(
    value?.durationMs,
    'duration'
  )
  const outputBytes = requireNonNegativeInteger(
    value?.outputBytes,
    'output bytes'
  )
  const peakMemoryBytes =
    value.peakMemoryBytes === undefined
      ? undefined
      : requireNonNegativeInteger(value.peakMemoryBytes, 'peak memory')
  return {
    durationMs,
    outputBytes,
    ...(peakMemoryBytes === undefined ? {} : { peakMemoryBytes })
  }
}

function normalizeError(value: SkillExecutionError): SkillExecutionError {
  if (!SKILL_EXECUTION_ERROR_CODES.has(value?.code)) {
    throw new Error('Skill execution error code is invalid')
  }
  const message = sanitizeSkillExecutionDiagnostic(value.message)
  if (!message) throw new Error('Skill execution error message is required')
  return { code: value.code, message }
}

function assertRunning(value: SkillExecution): void {
  if (value.status !== 'running') {
    throw new Error('Skill execution is already terminal')
  }
}

function requireForwardTime(
  current: SkillExecution,
  timestamp: number
): void {
  requireTimestamp(timestamp)
  if (timestamp < current.updatedAt) {
    throw new Error('Skill execution time cannot move backwards')
  }
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Skill execution ${field} is invalid`)
  }
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) {
    throw new Error(`Skill execution ${field} is invalid`)
  }
  return normalized
}

function optionalIdentifier(
  value: unknown,
  field: string
): string | undefined {
  return value === undefined ? undefined : requireIdentifier(value, field)
}

function cloneJsonObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Skill execution ${field} must be a JSON object`)
  }
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown
    if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) {
      throw new Error()
    }
    return cloned as Record<string, unknown>
  } catch {
    throw new Error(`Skill execution ${field} must be JSON serializable`)
  }
}

function cloneExecution(value: SkillExecution): SkillExecution {
  return {
    ...value,
    context: {
      ...value.context,
      scope: { ...value.context.scope }
    },
    input: cloneJsonObject(value.input, 'input'),
    ...(value.output
      ? { output: cloneJsonObject(value.output, 'output') }
      : {}),
    ...(value.metrics ? { metrics: { ...value.metrics } } : {}),
    ...(value.error ? { error: { ...value.error } } : {})
  }
}

function checksum(value: Record<string, unknown>): string {
  return createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Record<string, unknown>)[key]
          )}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function requireTimestamp(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('Skill execution timestamp is invalid')
  }
}

function requireNonNegativeInteger(
  value: unknown,
  field: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Skill execution ${field} is invalid`)
  }
  return value as number
}

const SKILL_EXECUTION_ERROR_CODES =
  new Set<SkillExecutionErrorCode>([
    'skill_version_unavailable',
    'skill_input_invalid',
    'skill_output_invalid',
    'skill_context_invalid',
    'skill_permission_required',
    'skill_permission_denied',
    'skill_connector_unavailable',
    'skill_sandbox_unavailable',
    'skill_timeout',
    'skill_memory_limit',
    'skill_output_limit',
    'skill_execution_failed',
    'skill_revision_conflict',
    'skill_idempotency_conflict',
    'skill_execution_unavailable'
  ])
