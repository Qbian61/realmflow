import type { SubagentTaskResult } from '../../../../domain/subagent'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { RuntimeDelegationSummary } from '../../../../shared/agent-runtime-state'
import type { DshRuntimeEventEnvelope } from '../../../../shared/dsh-runtime-event-contract'
import { sanitizeRuntimeText } from '../agent-runtime/runtime-state-service'

export type DshSubagentLineageProjection = Readonly<{
  parentRunId: string
  childRunId: string
  childSessionId: string
  ordinal: number
  taskId: string
  agentId?: string
  agentName?: string
}>

export type DshSubagentProjection = Readonly<{
  groupId: string
  callId: string
  parentRunId: string
  rootRunId: string
  lineage: DshSubagentLineageProjection[]
  delegations: RuntimeDelegationSummary[]
  governanceFact: JsonObject
}>

type DshSubagentStatus = RuntimeDelegationSummary['status']

const SUBAGENT_STATUSES = new Set<DshSubagentStatus>([
  'registered',
  'running',
  'completed',
  'failed',
  'cancelled'
])

export class DshSubagentProjector {
  project(event: DshRuntimeEventEnvelope): DshSubagentProjection {
    if (event.kind !== 'subagent.lifecycle') {
      throw new Error('DSH subagent event is required')
    }
    const groupId = dataText(event.data, 'groupId', `subagent:${event.eventId}`)
    const callId = dataText(event.data, 'callId', event.eventId)
    const parentRunId = dataText(event.data, 'parentRunId', event.runId)
    const rootRunId = dataText(event.data, 'rootRunId', parentRunId)
    const children = subagentChildren(event.data.children, parentRunId)
    return deepFreeze({
      groupId,
      callId,
      parentRunId,
      rootRunId,
      lineage: children.map(({ lineage }) => lineage),
      delegations: children.map(({ delegation }) => delegation),
      governanceFact: {
        kind: 'dsh.subagent',
        groupId,
        callId,
        childCount: children.length,
        sequence: event.sequence
      }
    } satisfies DshSubagentProjection)
  }
}

function subagentChildren(
  value: unknown,
  parentRunId: string
): Array<{
  lineage: DshSubagentLineageProjection
  delegation: RuntimeDelegationSummary
}> {
  if (!Array.isArray(value)) {
    throw new Error('DSH subagent children are invalid')
  }
  return value
    .map((item, index) => subagentChild(item, index, parentRunId))
    .sort((left, right) => left.lineage.ordinal - right.lineage.ordinal)
}

function subagentChild(
  value: unknown,
  index: number,
  parentRunId: string
): {
  lineage: DshSubagentLineageProjection
  delegation: RuntimeDelegationSummary
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DSH subagent child lineage is invalid')
  }
  const child = value as Record<string, unknown>
  const taskId = requireText(child.taskId, 'DSH subagent child task ID')
  const childRunId = requireText(
    child.childRunId,
    'DSH subagent child run ID'
  )
  const childSessionId = requireText(
    child.childSessionId,
    'DSH subagent child session ID'
  )
  const ordinal = integerValue(child.ordinal, index + 1)
  if (ordinal < 1) {
    throw new Error('DSH subagent child lineage is invalid')
  }
  const status = subagentStatus(child.status)
  const lineage: DshSubagentLineageProjection = {
    parentRunId,
    childRunId,
    childSessionId,
    ordinal,
    taskId,
    ...optionalText(child.agentId, 'agentId'),
    ...optionalText(child.agentName, 'agentName')
  }
  const delegation: RuntimeDelegationSummary = {
    runId: childRunId,
    sessionId: childSessionId,
    parentRunId,
    status,
    objective: sanitizeRuntimeText(
      requireText(child.objective, 'DSH subagent child objective')
    ),
    ...(isTerminalSubagentStatus(status)
      ? { result: subagentResult(child, taskId, status) }
      : {})
  }
  return { lineage, delegation }
}

function subagentResult(
  child: Record<string, unknown>,
  taskId: string,
  status: SubagentTaskResult['status']
): SubagentTaskResult {
  return {
    taskId,
    status,
    summary: sanitizeRuntimeText(
      dataText(child, 'resultSummary', dataText(child, 'summary', status))
    ),
    evidence: evidence(child.evidence),
    unresolved: stringArray(child.unresolved).map(sanitizeRuntimeText),
    artifactIds: stringArray(child.artifactIds),
    ...optionalText(child.errorCode, 'errorCode')
  }
}

function evidence(value: unknown): SubagentTaskResult['evidence'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const title = dataText(record, 'title')
    const summary = dataText(record, 'summary')
    if (!title || !summary) return []
    return [
      {
        title: sanitizeRuntimeText(title),
        summary: sanitizeRuntimeText(summary),
        ...optionalText(record.referenceId, 'referenceId')
      }
    ]
  })
}

function subagentStatus(value: unknown): DshSubagentStatus {
  const normalized =
    typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : 'running'
  if (!SUBAGENT_STATUSES.has(normalized as DshSubagentStatus)) {
    throw new Error('DSH subagent child status is invalid')
  }
  return normalized as DshSubagentStatus
}

function isTerminalSubagentStatus(
  status: DshSubagentStatus
): status is SubagentTaskResult['status'] {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is invalid`)
  }
  return value.trim()
}

function dataText(
  data: Record<string, unknown>,
  key: string,
  fallback = ''
): string {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function optionalText(
  value: unknown,
  key: string
): Record<string, string> {
  return typeof value === 'string' && value.trim()
    ? { [key]: sanitizeRuntimeText(value) }
    : {}
}

function integerValue(value: unknown, fallback = 0): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
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
