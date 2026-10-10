import type { DelegationRequest, SubagentTaskResult, ValidatedDelegationTask } from '../../../../domain/subagent'
import type { ConversationGeneratedArtifactSource } from '../../../../domain/follow-up-suggestion'

export type RuntimeDelegation = {
  runId: string
  sessionId: string
  parentRunId: string
  rootRunId: string
  requestId: string
  status: 'registered' | 'running' | SubagentTaskResult['status']
  task: ValidatedDelegationTask
  result?: SubagentTaskResult
  createdAt: number
  updatedAt: number
}

export interface RuntimeDelegationStore {
  prepare(runId: string, requestId: string, request: DelegationRequest, at: number): RuntimeDelegation[]
  list(parentRunId: string): RuntimeDelegation[]
  listUnfinished(): RuntimeDelegation[]
  get(runId: string): RuntimeDelegation | undefined
  claim(runId: string, at: number): boolean
  finish(runId: string, result: SubagentTaskResult, at: number, source?: ConversationGeneratedArtifactSource): void
  cancel(runId: string, at: number): void
}
