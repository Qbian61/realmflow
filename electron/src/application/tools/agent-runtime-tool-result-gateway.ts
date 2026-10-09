import type { AiRunToolResult } from '../../../../domain/ai-run'
import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import type { AgentRuntimeRunRepository } from '../../ai-run/application/ports'

type SidecarToolResultGateway = {
  submitToolResult(runId: string, result: AiRunToolResult): Promise<void>
  suspendToolCall(
    runId: string,
    suspension: {
      callId: string
      requestId: string
      toolExecutionId: string
    }
  ): Promise<void>
}

type Dependencies = {
  runs: Pick<AgentRuntimeRunRepository, 'listByRootRunId'>
  sidecar: SidecarToolResultGateway
}

export class AgentRuntimeToolResultGateway {
  constructor(private readonly dependencies: Dependencies) {}

  async submitToolResult(
    runId: string,
    result: AiRunToolResult
  ): Promise<void> {
    await this.dependencies.sidecar.submitToolResult(
      await this.providerRunId(runId),
      result
    )
  }

  async suspendToolCall(
    runId: string,
    suspension: {
      callId: string
      requestId: string
      toolExecutionId: string
    }
  ): Promise<void> {
    await this.dependencies.sidecar.suspendToolCall(
      await this.providerRunId(runId),
      suspension
    )
  }

  private async providerRunId(runId: string): Promise<string> {
    const run = await this.findRuntimeRun(runId)
    if (!run?.providerRunId) {
      throw new Error('AI provider run is not bound')
    }
    return run.providerRunId
  }

  private async findRuntimeRun(
    runId: string
  ): Promise<AgentRuntimeRun | undefined> {
    const runs = await this.dependencies.runs.listByRootRunId(runId)
    return runs.find((run) => run.id === runId) ?? runs[0]
  }
}
