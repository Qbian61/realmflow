import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import type { ToolPolicySnapshot } from '../../../../domain/tool-policy'
import type { ToolExecutionCommand } from './tool-execution-application-service'
import { ToolPolicyEngine } from './tool-policy-engine'

const CLOSED_POLICY = new ToolPolicyEngine().resolve([], { layers: [{ allow: [] }] })
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

type Dependencies = {
  active(runId: string): ToolPolicySnapshot | undefined
  stored(runId: string): Promise<AgentRuntimeRun | undefined>
}

/** Resolves authorization using Main-owned runtime identities only. */
export class RunToolPolicyResolver {
  constructor(private readonly dependencies: Dependencies) {}

  async resolve(command: ToolExecutionCommand): Promise<ToolPolicySnapshot | undefined> {
    const runId = command.context.parentExecutionId
    if (!runId) return command.triggerSource === 'model' ? CLOSED_POLICY : undefined
    const active = this.dependencies.active(runId)
    if (active) return active
    const run = await this.dependencies.stored(runId)
    if (!run || TERMINAL.has(run.status)) return CLOSED_POLICY
    return run.snapshot.toolPolicy ?? CLOSED_POLICY
  }
}
