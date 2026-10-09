import type {
  AgentRunBudget,
  AgentRunScenarioId,
  AgentRunScope
} from './agent-runtime'

export const SUBAGENT_DELEGATION_TOOL_NAME = 'rf_delegate_research'
export const MAX_DELEGATION_CONCURRENCY = 4
export const MAX_DELEGATION_DEPTH = 2

export type DelegationTask = {
  id: string
  objective: string
  completionCriteria: string[]
  maxToolCalls: number
  resultFormat: 'research_summary'
  scope?: AgentRunScope
}

export type DelegationRequest = {
  tasks: DelegationTask[]
}

export type DelegationPolicy = {
  scenarioId: AgentRunScenarioId
  parentScope: AgentRunScope
  delegationDepth: number
  maximumDepth: number
  maximumConcurrency: number
  rootBudgets: AgentRunBudget
  consumedSubagents: number
  consumedToolCalls: number
}

export type ValidatedDelegationTask = DelegationTask & {
  ordinal: number
  scope: AgentRunScope
}

export type ValidatedDelegationRequest = {
  tasks: ValidatedDelegationTask[]
  concurrency: number
  reservation: {
    subagents: number
    toolCalls: number
  }
}

export type SubagentTaskResult = {
  taskId: string
  status: 'completed' | 'failed' | 'cancelled'
  summary: string
  evidence: Array<{
    title: string
    summary: string
    referenceId?: string
  }>
  unresolved: string[]
  artifactIds: string[]
  errorCode?: string
}

export type DelegationResult = {
  status: 'completed' | 'partial' | 'failed' | 'cancelled'
  tasks: SubagentTaskResult[]
}

export const DELEGATION_REQUEST_JSON_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_DELEGATION_CONCURRENCY,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 },
          objective: { type: 'string', minLength: 1 },
          completionCriteria: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 }
          },
          maxToolCalls: { type: 'integer', minimum: 1 },
          resultFormat: {
            type: 'string',
            enum: ['research_summary']
          }
        },
        required: [
          'id',
          'objective',
          'completionCriteria',
          'maxToolCalls',
          'resultFormat'
        ],
        additionalProperties: false
      }
    }
  },
  required: ['tasks'],
  additionalProperties: false
} as const

export function validateDelegationRequest(
  request: DelegationRequest,
  policy: DelegationPolicy
): ValidatedDelegationRequest {
  if (policy.scenarioId !== 'general' && policy.scenarioId !== 'space') {
    throw new Error('Subagent delegation is not allowed for this scenario')
  }
  if (policy.delegationDepth >= policy.maximumDepth) {
    throw new Error(
      `Subagent delegation depth exceeds ${policy.maximumDepth}`
    )
  }
  if (
    !Array.isArray(request.tasks) ||
    request.tasks.length === 0 ||
    request.tasks.length > MAX_DELEGATION_CONCURRENCY
  ) {
    throw new Error(
      `Subagent delegation supports at most ${MAX_DELEGATION_CONCURRENCY} tasks`
    )
  }

  const objectives = new Set<string>()
  const ids = new Set<string>()
  const tasks = request.tasks.map((task, index) => {
    assertTask(task)
    const objectiveKey = normalizeComparable(task.objective)
    if (objectives.has(objectiveKey)) {
      throw new Error('Subagent delegation contains a duplicate objective')
    }
    if (ids.has(task.id)) {
      throw new Error('Subagent delegation contains a duplicate task ID')
    }
    objectives.add(objectiveKey)
    ids.add(task.id)
    const scope = task.scope ?? policy.parentScope
    if (!scopeWithin(scope, policy.parentScope)) {
      throw new Error('Subagent scope must not expand the parent scope')
    }
    return {
      ...task,
      objective: task.objective.trim(),
      completionCriteria: task.completionCriteria.map((item) => item.trim()),
      scope: cloneScope(scope),
      ordinal: index + 1
    }
  })
  const reservation = {
    subagents: tasks.length,
    toolCalls: tasks.reduce((total, task) => total + task.maxToolCalls, 0)
  }
  if (
    policy.consumedSubagents + reservation.subagents >
      policy.rootBudgets.maxSubagents ||
    policy.consumedToolCalls + reservation.toolCalls >
      policy.rootBudgets.maxToolCalls
  ) {
    throw new Error('Subagent delegation exceeds the root budget')
  }
  const concurrency = Math.min(
    tasks.length,
    policy.maximumConcurrency,
    MAX_DELEGATION_CONCURRENCY
  )
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error('Subagent delegation concurrency is invalid')
  }
  return deepFreeze({ tasks, concurrency, reservation })
}

function assertTask(task: DelegationTask): void {
  if (
    !task ||
    typeof task.id !== 'string' ||
    task.id.trim().length === 0 ||
    typeof task.objective !== 'string' ||
    task.objective.trim().length === 0 ||
    !Array.isArray(task.completionCriteria) ||
    task.completionCriteria.length === 0 ||
    task.completionCriteria.some(
      (item) => typeof item !== 'string' || item.trim().length === 0
    ) ||
    !Number.isInteger(task.maxToolCalls) ||
    task.maxToolCalls <= 0 ||
    task.resultFormat !== 'research_summary'
  ) {
    throw new Error('Subagent delegation task is invalid')
  }
}

function scopeWithin(candidate: AgentRunScope, parent: AgentRunScope): boolean {
  if (candidate.kind !== parent.kind) return false
  switch (parent.kind) {
    case 'global':
      return true
    case 'folder':
      return (
        candidate.kind === 'folder' &&
        pathWithin(candidate.folderPath, parent.folderPath)
      )
    case 'workspace':
      return (
        candidate.kind === 'workspace' &&
        candidate.workspaceId === parent.workspaceId
      )
    case 'requirement-node':
      return (
        candidate.kind === 'requirement-node' &&
        candidate.workspaceId === parent.workspaceId &&
        candidate.requirementId === parent.requirementId &&
        candidate.nodeId === parent.nodeId &&
        candidate.nodeRunId === parent.nodeRunId
      )
    case 'workflow':
      return (
        candidate.kind === 'workflow' &&
        candidate.workspaceId === parent.workspaceId &&
        candidate.requirementId === parent.requirementId &&
        (!parent.nodeId || candidate.nodeId === parent.nodeId) &&
        (!parent.nodeRunId || candidate.nodeRunId === parent.nodeRunId)
      )
  }
}

function pathWithin(candidate: string, parent: string): boolean {
  const normalizedParent = parent.replace(/[\\/]+$/, '')
  return (
    candidate === normalizedParent ||
    candidate.startsWith(`${normalizedParent}/`) ||
    candidate.startsWith(`${normalizedParent}\\`)
  )
}

function cloneScope(scope: AgentRunScope): AgentRunScope {
  return { ...scope }
}

function normalizeComparable(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}
