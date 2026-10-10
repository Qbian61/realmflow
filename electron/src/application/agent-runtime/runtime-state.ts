import type { AgentRuntimeState } from '../../../../shared/agent-runtime-state'

export type RuntimeStateCommit = {
  origin?: { runId: string; requestId: string; fingerprint: string }
  runId: string
  requestId: string
  fingerprint: string
  expectedRevision: number
  state: AgentRuntimeState
  kind: 'goal' | 'progress' | 'steer' | 'instructions_applied'
  at: number
}

export interface RuntimeStateStore {
  read(runId: string): AgentRuntimeState
  replay(runId: string, requestId: string, fingerprint: string): AgentRuntimeState | undefined
  commit(input: RuntimeStateCommit): AgentRuntimeState
}
