import { transitionAiRun } from '../../../domain/ai-run'
import type { ModelCallMetric } from '../../../domain/model'
import type { AiRunRepository } from './ports/business-repositories'

const INTERRUPTION_MESSAGE =
  'Application restarted before the AI run completed'

export class RecoverInterruptedRunsUseCase {
  constructor(
    private readonly runs: AiRunRepository,
    private readonly models?: {
      recordCall: (
        input: Omit<
          ModelCallMetric,
          | 'id'
          | 'providerId'
          | 'throughputTokensPerSecond'
          | 'estimatedInputCost'
          | 'estimatedOutputCost'
          | 'estimatedCost'
        >
      ) => Promise<unknown>
    },
    private readonly now: () => number = Date.now
  ) {}

  async execute(): Promise<number> {
    const unfinished = await this.runs.listUnfinished()
    let recovered = 0
    for (const run of unfinished) {
      const updated = await this.runs.update(run.id, (current) => ({
        ...transitionAiRun(current, 'interrupted'),
        error: INTERRUPTION_MESSAGE
      }))
      if (updated?.status !== 'interrupted') continue
      recovered += 1
      if (
        !this.models ||
        !updated.workspaceId ||
        !updated.modelProfileId ||
        updated.startedAt === undefined
      ) {
        continue
      }
      await this.models
        .recordCall({
          source: updated.nodeId ? 'workflow_node' : 'workflow_stage',
          modelProfileId: updated.modelProfileId,
          workspaceId: updated.workspaceId,
          requirementId: updated.requirementId,
          ...(updated.nodeId ? { nodeId: updated.nodeId } : {}),
          aiRunId: updated.id,
          ...(updated.contextSnapshotId
            ? { contextSnapshotId: updated.contextSnapshotId }
            : {}),
          startedAt: updated.startedAt,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          durationMs: Math.max(this.now() - updated.startedAt, 0),
          retryCount: 0,
          status: 'interrupted',
          errorCode: 'interrupted'
        })
        .catch(() => undefined)
    }
    return recovered
  }
}
