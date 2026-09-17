import type {
  NodeRunRecord,
  NodeRunRepository,
  Revisioned
} from '../ports/business-repositories'

export interface InterruptedNodeRunResumer {
  resume: (
    nodeRun: Revisioned<NodeRunRecord>
  ) => Promise<{ aiRunId?: string }>
}

export class RecoverInterruptedNodeRunsUseCase {
  constructor(
    private readonly nodeRuns: NodeRunRepository,
    private readonly resumer: InterruptedNodeRunResumer,
    private readonly now: () => number = Date.now
  ) {}

  async execute(): Promise<{ resumed: number; failed: number }> {
    await this.nodeRuns.interruptRunning(this.now())
    const interrupted = await this.nodeRuns.listInterrupted()
    let resumed = 0
    let failed = 0
    for (const nodeRun of interrupted) {
      try {
        await this.resumer.resume(nodeRun)
        resumed += 1
      } catch (error) {
        const result = await this.nodeRuns.save(
          {
            ...nodeRun,
            status: 'interrupted',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: this.now()
          },
          nodeRun.revision
        )
        if (result.status === 'saved') failed += 1
      }
    }
    return { resumed, failed }
  }
}
