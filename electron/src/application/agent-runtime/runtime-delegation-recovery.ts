import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import type { AgentRunCheckpointRepository } from '../../ai-run/application/ports'
import type { RuntimeDelegationStore } from './runtime-delegation'

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

/** Startup reconciliation only. Existing runs are resumed by the normal checkpoint recovery workflow. */
export class ReconcileRuntimeDelegations {
  constructor(private readonly dependencies: {
    store: RuntimeDelegationStore
    runs: { getById(id: string): AgentRuntimeRun | undefined | Promise<AgentRuntimeRun | undefined> }
    checkpoints: AgentRunCheckpointRepository
  }, private readonly now: () => number = Date.now) {}

  async execute(): Promise<void> {
    for (const record of this.dependencies.store.listUnfinished()) {
      const run = await this.dependencies.runs.getById(record.runId)
      if (run && !TERMINAL.has(run.status)) {
        let ancestorId: string | undefined = record.parentRunId
        const seen = new Set<string>()
        while (ancestorId && !seen.has(ancestorId)) {
          seen.add(ancestorId)
          const ancestor = await this.dependencies.runs.getById(ancestorId)
          if (!ancestor || TERMINAL.has(ancestor.status)) {
            this.dependencies.store.cancel(record.runId, this.now())
            break
          }
          ancestorId = ancestor.snapshot.parentRunId
        }
        continue
      }
      const checkpoint = run ? await this.dependencies.checkpoints.getLatest(run.id) : undefined
      const status = run?.status === 'completed' ? 'completed'
        : run?.status === 'cancelled' ? 'cancelled' : 'failed'
      const summary = status === 'completed'
        ? checkpoint?.messageWindow.filter((message) => message.role === 'assistant' && !message.toolCalls?.length)
          .map((message) => message.content).filter(Boolean).at(-1) || 'Task completed; stored answer unavailable'
        : status === 'cancelled' ? 'Subagent task was cancelled'
        : run?.error || 'Subagent startup was interrupted'
      this.dependencies.store.finish(record.runId, {
        taskId: record.task.id, status, summary, evidence: [], artifactIds: [],
        unresolved: status === 'failed' ? [summary] : [],
        ...(status === 'failed' ? { errorCode: run ? 'subagent_failed' : 'interrupted' } : {})
      }, this.now())
    }
  }
}
