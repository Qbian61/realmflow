import { describe, expect, it } from 'vitest'
import { createAiRun, type AiRun } from '../../../domain/ai-run'
import type { AiRunRepository } from './ports/business-repositories'
import { RecoverInterruptedRunsUseCase } from './recover-interrupted-runs'

class FakeAiRunRepository implements AiRunRepository {
  readonly runs = new Map<string, AiRun>()

  async get(runId: string): Promise<AiRun | undefined> {
    return this.runs.get(runId)
  }

  async save(run: AiRun): Promise<void> {
    this.runs.set(run.id, run)
  }

  async update(
    runId: string,
    updater: (run: AiRun) => AiRun | Promise<AiRun>
  ): Promise<AiRun | undefined> {
    const run = this.runs.get(runId)
    if (!run) return undefined
    const updated = await updater(run)
    this.runs.set(runId, updated)
    return updated
  }

  async listUnfinished(): Promise<AiRun[]> {
    return [...this.runs.values()].filter((run) =>
      ['created', 'running', 'cancelling'].includes(run.status)
    )
  }

  async appendEvent(): Promise<boolean> {
    return false
  }

  async listEvents(): Promise<[]> {
    return []
  }
}

describe('RecoverInterruptedRunsUseCase', () => {
  it('marks unfinished runs as interrupted and remains idempotent', async () => {
    const repository = new FakeAiRunRepository()
    await repository.save({
      ...createAiRun('run-1', 'requirement-1', 'analysis'),
      status: 'running'
    })
    await repository.save({
      ...createAiRun('run-2', 'requirement-1', 'design'),
      status: 'cancelling'
    })
    await repository.save({
      ...createAiRun('run-3', 'requirement-1', 'testing'),
      status: 'completed'
    })
    const useCase = new RecoverInterruptedRunsUseCase(repository)

    await expect(useCase.execute()).resolves.toBe(2)
    expect(repository.runs.get('run-1')).toMatchObject({
      status: 'interrupted',
      error: 'Application restarted before the AI run completed'
    })
    expect(repository.runs.get('run-2')?.status).toBe('interrupted')
    expect(repository.runs.get('run-3')?.status).toBe('completed')
    await expect(useCase.execute()).resolves.toBe(0)
  })
})
