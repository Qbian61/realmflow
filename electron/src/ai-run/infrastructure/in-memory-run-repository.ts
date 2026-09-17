import type { AiRun, AiRunEvent } from '../../../../domain/ai-run'
import type { RunRepository } from '../application/ports'

export class InMemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, AiRun>()
  private readonly events = new Map<string, Map<number, AiRunEvent>>()
  private queue: Promise<void> = Promise.resolve()

  async get(runId: string): Promise<AiRun | undefined> {
    const run = this.runs.get(runId)
    return run ? structuredClone(run) : undefined
  }

  async save(run: AiRun): Promise<void> {
    await this.exclusive(async () => {
      this.runs.set(run.id, structuredClone(run))
    })
  }

  update(
    runId: string,
    updater: (run: AiRun) => AiRun | Promise<AiRun>
  ): Promise<AiRun | undefined> {
    return this.exclusive(async () => {
      const current = this.runs.get(runId)
      if (!current) return undefined
      const next = await updater(structuredClone(current))
      this.runs.set(runId, structuredClone(next))
      return structuredClone(next)
    })
  }

  async appendEvent(event: AiRunEvent): Promise<boolean> {
    if (event.type === 'content.delta' || event.type === 'heartbeat') return false
    const events = this.events.get(event.runId) ?? new Map<number, AiRunEvent>()
    if (events.has(event.sequence)) return false
    events.set(event.sequence, structuredClone(event))
    this.events.set(event.runId, events)
    return true
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
