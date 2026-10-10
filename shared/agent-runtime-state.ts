import type { AgentRunBudget, AgentRunLifecycleStatus } from '../domain/agent-runtime'
import type { SubagentTaskResult } from '../domain/subagent'

export type RuntimeGoal = {
  objective: string
  status: 'active' | 'blocked' | 'completed' | 'cancelled'
  revision: number
  updatedAt: number
}

export type RuntimeProgressCard = {
  id: string
  title: string
  message: string
  status: 'pending' | 'running' | 'blocked' | 'completed' | 'failed'
  completed?: number
  total?: number
  revision: number
  updatedAt: number
}

export type RuntimeInstruction = {
  id: string
  sourceRunId: string
  message: string
  status: 'queued' | 'applied'
  createdAt: number
  appliedAt?: number
  checkpointOrdinal?: number
}

export type AgentRuntimeState = {
  runId: string
  revision: number
  goal?: RuntimeGoal
  cards: RuntimeProgressCard[]
  instructions: RuntimeInstruction[]
}

export type RuntimeRunSummary = {
  runId: string
  sessionId?: string
  rootRunId: string
  parentRunId?: string
  status: AgentRunLifecycleStatus
  createdAt: number
  updatedAt: number
}

export type AgentRuntimeStatus = RuntimeRunSummary & {
  budgets: AgentRunBudget
  children: RuntimeRunSummary[]
  delegations: RuntimeDelegationSummary[]
  state: AgentRuntimeState
}

export type RuntimeDelegationSummary = {
  runId: string
  sessionId: string
  parentRunId: string
  status: 'registered' | 'running' | SubagentTaskResult['status']
  objective: string
  result?: SubagentTaskResult
}

export type RuntimeGoalCommand = {
  runId: string
  requestId: string
  objective: string
  status: RuntimeGoal['status']
  expectedRevision: number
}

export type RuntimeSteerCommand = { runId: string; requestId: string; message: string }
export type RuntimeCancelCommand = { runId: string; sessionId: string }

export type AgentRuntimeApi = {
  get(runId: string): Promise<AgentRuntimeStatus>
  updateGoal(command: RuntimeGoalCommand): Promise<AgentRuntimeStatus>
  steer(command: RuntimeSteerCommand): Promise<AgentRuntimeStatus>
  cancel(command: RuntimeCancelCommand): Promise<void>
}
