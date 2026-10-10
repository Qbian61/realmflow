import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import type { RunCheckpoint } from '../../../../domain/agent-run-recovery'
import type { AiRunEvent } from '../../../../domain/ai-run'
import { collectDelegatedRunResult } from '../../ai-run/application/delegated-run-result'
import type { RecoveredRunActivation } from '../recover-agent-runtime-runs'
import type { RuntimeDelegationStore } from './runtime-delegation'
import type { RuntimeDelegationService } from './runtime-delegation-service'

export class RuntimeRunResumer {
  constructor(private readonly dependencies: {
    store: RuntimeDelegationStore
    delegations: RuntimeDelegationService
    attach(run: AgentRuntimeRun, checkpoint: RunCheckpoint): Promise<void>
    events(runId: string, signal: AbortSignal): AsyncIterable<AiRunEvent>
    project(event: AiRunEvent): Promise<void>
    cancel(runId: string): Promise<void>
    onError(runId: string, error: unknown): void
  }) {}

  async resume(run: AgentRuntimeRun, checkpoint: RunCheckpoint): Promise<RecoveredRunActivation> {
    const dependencies = this.dependencies
    const cancel = () => { void dependencies.cancel(run.id).catch(() => undefined) }
    const attach = async (signal: AbortSignal) => {
      if (signal.aborted) throw new Error('request_cancelled')
      await dependencies.attach(run, checkpoint)
      if (signal.aborted) {
        cancel()
        throw new Error('request_cancelled')
      }
      signal.addEventListener('abort', cancel, { once: true })
    }
    const events = async function* (signal: AbortSignal) {
      try {
        for await (const event of dependencies.events(run.id, signal)) {
          await dependencies.project(event)
          yield event
        }
      } finally {
        signal.removeEventListener('abort', cancel)
      }
    }
    const record = dependencies.store.get(run.id)
    if (record) {
      const activation = await dependencies.delegations.resume(run.id, attach, (signal) =>
        collectDelegatedRunResult(record.task.id, events(signal), signal,
          checkpoint.messageWindow.filter((message) => message.role === 'assistant' && !message.toolCalls?.length)
            .map((message) => message.content).filter(Boolean).at(-1)))
      return { start: activation.start, cancel: () => dependencies.delegations.cancel(run.id) }
    }
    const controller = new AbortController()
    await attach(controller.signal)
    let started = false
    return {
      start: () => {
        if (started) return
        started = true
        void (async () => {
          for await (const _event of events(controller.signal)) { /* projected by iterator */ }
        })().catch((error) => dependencies.onError(run.id, error))
      },
      cancel: () => controller.abort()
    }
  }
}
