import { describe, expect, it, vi } from 'vitest'
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
    const recordCall = vi.fn().mockResolvedValue(undefined)
    await repository.save({
      ...createAiRun('run-1', 'requirement-1', 'analysis'),
      status: 'running',
      workspaceId: 'workspace-1',
      modelProfileId: 'profile-1',
      contextSnapshotId: 'snapshot-1',
      startedAt: 100
    })
    await repository.save({
      ...createAiRun('run-2', 'requirement-1', 'design', 'node-1'),
      status: 'cancelling',
      workspaceId: 'workspace-1',
      modelProfileId: 'profile-1',
      startedAt: 200
    })
    await repository.save({
      ...createAiRun('run-3', 'requirement-1', 'testing'),
      status: 'completed'
    })
    const useCase = new RecoverInterruptedRunsUseCase(
      repository,
      { recordCall },
      () => 1_000
    )

    await expect(useCase.execute()).resolves.toBe(2)
    expect(repository.runs.get('run-1')).toMatchObject({
      status: 'interrupted',
      error: 'Application restarted before the AI run completed'
    })
    expect(repository.runs.get('run-2')?.status).toBe('interrupted')
    expect(repository.runs.get('run-3')?.status).toBe('completed')
    expect(recordCall).toHaveBeenNthCalledWith(1, {
      source: 'workflow_stage',
      modelProfileId: 'profile-1',
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      aiRunId: 'run-1',
      contextSnapshotId: 'snapshot-1',
      startedAt: 100,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      durationMs: 900,
      retryCount: 0,
      status: 'interrupted',
      errorCode: 'interrupted'
    })
    expect(recordCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: 'workflow_node',
        nodeId: 'node-1',
        aiRunId: 'run-2',
        status: 'interrupted'
      })
    )
    await expect(useCase.execute()).resolves.toBe(0)
    expect(recordCall).toHaveBeenCalledTimes(2)
  })

  it('keeps the interrupted state when metric persistence fails', async () => {
    const repository = new FakeAiRunRepository()
    await repository.save({
      ...createAiRun('run-1', 'requirement-1', 'analysis'),
      status: 'running',
      workspaceId: 'workspace-1',
      modelProfileId: 'profile-1',
      startedAt: 100
    })
    const useCase = new RecoverInterruptedRunsUseCase(
      repository,
      { recordCall: vi.fn().mockRejectedValue(new Error('SQLite unavailable')) },
      () => 1_000
    )

    await expect(useCase.execute()).resolves.toBe(1)
    expect(repository.runs.get('run-1')?.status).toBe('interrupted')
  })
})
