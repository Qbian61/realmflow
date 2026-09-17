import { vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import {
  CancelAiRunUseCase,
  GenerateStageArtifactUseCase
} from './generate-stage-artifact'
import { InMemoryRunRepository } from '../infrastructure/in-memory-run-repository'

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data'] = {}
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    timestamp: new Date(sequence).toISOString(),
    data
  }
}

function createHarness(events: AiRunEvent[]) {
  const runs = new InMemoryRunRepository()
  const gateway = {
    createRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    streamEvents: vi.fn().mockImplementation(async function* () {
      yield* events
    }),
    cancelRun: vi.fn().mockResolvedValue(undefined)
  }
  const contexts = {
    load: vi.fn().mockResolvedValue({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      stageId: 'analysis',
      workspaceName: 'shop',
      existingArtifacts: []
    }),
    loadNode: vi.fn().mockImplementation(async (input) => ({
      requirementId: input.requirementId,
      requirementTitle: 'Checkout',
      nodeId: input.nodeId,
      workspaceName: 'shop',
      prompt: input.executor.prompt,
      artifactPath: input.executor.artifact.relativePath,
      existingArtifacts: []
    }))
  }
  const artifacts = { commit: vi.fn().mockResolvedValue(undefined) }
  const publisher = { publish: vi.fn() }
  const models = {
    resolveExecution: vi.fn().mockResolvedValue({
      providerType: 'openai_compatible' as const,
      baseUrl: 'https://models.example.com/v1',
      modelId: 'reasoning-model',
      apiKey: 'secret'
    }),
    recordCall: vi.fn().mockResolvedValue(undefined)
  }
  return {
    runs,
    gateway,
    artifacts,
    publisher,
    models,
    generate: new GenerateStageArtifactUseCase({
      runs,
      gateway,
      contexts,
      artifacts,
      publisher,
      models,
      now: () => 100
    })
  }
}

describe('GenerateStageArtifactUseCase', () => {
  it('generates a custom node from explicit prompt and artifact configuration', async () => {
    const harness = createHarness([
      event(1, 'run.started'),
      event(2, 'artifact.ready', {
        artifact: {
          path: 'artifacts/security-review.md',
          content: '# Security Review'
        }
      }),
      event(3, 'run.completed')
    ])
    const executor = {
      kind: 'ai_generate' as const,
      prompt: 'Review predecessor artifacts for security risks.',
      artifact: {
        relativePath: 'artifacts/security-review.md',
        kind: 'markdown'
      }
    }

    const handle = await harness.generate.executeNode({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1',
      executor
    })
    await handle.completion

    expect(harness.gateway.createRun).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'custom-security',
      workspaceName: 'shop',
      prompt: executor.prompt,
      artifactPath: executor.artifact.relativePath,
      existingArtifacts: []
    }, undefined)
    expect(harness.artifacts.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: 'requirement-1',
        nodeId: 'custom-security',
        legacyStageId: undefined,
        artifact: {
          path: 'artifacts/security-review.md',
          content: '# Security Review'
        }
      })
    )
  })

  it('commits a validated artifact only after run.completed', async () => {
    const harness = createHarness([
      event(1, 'run.started'),
      event(2, 'content.delta', { delta: '# Scope' }),
      event(3, 'artifact.ready', {
        artifact: { path: 'artifacts/analysis.md', content: '# Scope' }
      }),
      event(4, 'run.completed')
    ])

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await handle.completion

    expect(harness.artifacts.commit).toHaveBeenCalledWith({
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'analysis',
      artifact: { path: 'artifacts/analysis.md', content: '# Scope' },
      completionEvent: event(4, 'run.completed')
    })
    await expect(harness.runs.get('run-1')).resolves.toMatchObject({
      status: 'completed',
      lastSequence: 4
    })
  })

  it('resolves the selected model and records completed usage metrics', async () => {
    const completed = event(4, 'run.completed', {
      usage: {
        inputTokens: 120,
        outputTokens: 45,
        cachedTokens: 10,
        reasoningTokens: 5
      },
      firstTokenLatencyMs: 80,
      durationMs: 600,
      retryCount: 1
    })
    const harness = createHarness([
      event(1, 'run.started'),
      event(2, 'artifact.ready', {
        artifact: { path: 'artifacts/analysis.md', content: '# Scope' }
      }),
      completed
    ])

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis',
      modelProfileId: 'profile-1'
    })
    await handle.completion

    expect(harness.models.resolveExecution).toHaveBeenCalledWith('profile-1')
    expect(harness.gateway.createRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        modelId: 'reasoning-model',
        apiKey: 'secret'
      })
    )
    expect(harness.models.recordCall).toHaveBeenCalledWith({
      modelProfileId: 'profile-1',
      requirementId: 'requirement-1',
      aiRunId: 'run-1',
      startedAt: 100,
      inputTokens: 120,
      outputTokens: 45,
      cachedTokens: 10,
      reasoningTokens: 5,
      firstTokenLatencyMs: 80,
      durationMs: 600,
      retryCount: 1,
      status: 'completed'
    })
  })

  it.each([
    [
      'failure',
      [event(1, 'run.started'), event(2, 'run.failed', { message: 'offline' })],
      'failed'
    ],
    [
      'cancellation',
      [event(1, 'run.started'), event(2, 'run.cancelled')],
      'cancelled'
    ]
  ])('does not commit partial content after %s', async (_name, events, status) => {
    const harness = createHarness(events as AiRunEvent[])

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await handle.completion

    expect(harness.artifacts.commit).not.toHaveBeenCalled()
    await expect(harness.runs.get('run-1')).resolves.toMatchObject({ status })
  })

  it('deduplicates sequences and maps an invalid event to run.failed', async () => {
    const harness = createHarness([
      event(1, 'run.started'),
      event(2, 'content.delta', { delta: 'one' }),
      event(2, 'content.delta', { delta: 'duplicate' }),
      event(3, 'run.completed')
    ])

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await handle.completion

    expect(harness.artifacts.commit).not.toHaveBeenCalled()
    expect(harness.publisher.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        type: 'run.failed',
        data: { message: 'Run completed without a valid artifact' }
      })
    )
  })

  it('maps Sidecar creation errors to a typed run.failed event', async () => {
    const harness = createHarness([])
    harness.gateway.createRun.mockRejectedValue(new Error('Sidecar is unavailable'))

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await handle.completion

    expect(handle.runId).toMatch(/^local-/)
    expect(harness.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: handle.runId,
        type: 'run.failed',
        data: { message: 'Sidecar is unavailable' }
      })
    )
  })

  it('ignores late non-terminal events while cancellation is pending', async () => {
    let release!: () => void
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    const harness = createHarness([])
    harness.gateway.streamEvents.mockImplementation(async function* () {
      yield event(1, 'run.started')
      await wait
      yield event(2, 'content.delta', { delta: 'late' })
      yield event(3, 'run.cancelled')
    })
    const cancel = new CancelAiRunUseCase({
      runs: harness.runs,
      gateway: harness.gateway,
      publisher: harness.publisher
    })

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await Promise.resolve()
    await cancel.execute('run-1')
    release()
    await handle.completion

    expect(harness.publisher.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'content.delta' })
    )
    await expect(harness.runs.get('run-1')).resolves.toMatchObject({
      status: 'cancelled'
    })
  })

  it('maps Sidecar cancellation errors to a typed run.failed event', async () => {
    const harness = createHarness([])
    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await Promise.resolve()
    harness.gateway.cancelRun.mockRejectedValue(
      new Error('Sidecar cancellation failed')
    )
    const cancel = new CancelAiRunUseCase({
      runs: harness.runs,
      gateway: harness.gateway,
      publisher: harness.publisher
    })

    await cancel.execute(handle.runId)

    await expect(harness.runs.get(handle.runId)).resolves.toMatchObject({
      status: 'failed',
      error: 'Sidecar cancellation failed'
    })
    expect(harness.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: handle.runId,
        type: 'run.failed',
        data: { message: 'Sidecar cancellation failed' }
      })
    )
  })
})
