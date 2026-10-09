import { vi } from 'vitest'
import {
  createAiRun,
  type AiRunEvent
} from '../../../../domain/ai-run'
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
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      existingArtifacts: []
    }),
    loadNode: vi.fn().mockImplementation(async (input) => ({
      requirementId: input.requirementId,
      requirementTitle: 'Checkout',
      nodeId: input.nodeId,
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      prompt: input.executor.prompt,
      requestedReasoning: 'inherit' as const,
      contextSnapshotId: 'context-snapshot-1',
      artifactPath: input.executor.artifact.relativePath,
      existingArtifacts: []
    }))
  }
  const artifactCommitter = {
    execute: vi.fn().mockResolvedValue(undefined)
  }
  const publisher = { publish: vi.fn() }
  const models = {
    resolveExecution: vi.fn().mockResolvedValue({
      providerType: 'openai_completions' as const,
      baseUrl: 'https://models.example.com/v1',
      modelId: 'reasoning-model',
      apiKey: 'secret'
    }),
    recordCall: vi.fn().mockResolvedValue(undefined)
  }
  return {
    runs,
    gateway,
    contexts,
    artifacts: { commit: artifactCommitter.execute },
    publisher,
    models,
    generate: new GenerateStageArtifactUseCase({
      runs,
      gateway,
      contexts,
      artifactCommitter,
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
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      prompt: executor.prompt,
      requestedReasoning: 'inherit',
      contextSnapshotId: 'context-snapshot-1',
      artifactPath: executor.artifact.relativePath,
      existingArtifacts: []
    }, undefined)
    expect(harness.artifacts.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: 'requirement-1',
        nodeId: 'custom-security',
        nodeRunId: 'node-run-1',
        expectedArtifact: executor.artifact,
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
      event(2, 'tool.call.requested', {
        toolCall: {
          index: 0,
          id: 'call-1',
          name: 'lookup',
          arguments: '{}'
        }
      }),
      event(3, 'answer.delta', { delta: '# Scope' }),
      event(4, 'artifact.ready', {
        artifact: { path: 'artifacts/analysis.md', content: '# Scope' }
      }),
      event(5, 'run.completed')
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
      expectedArtifact: {
        relativePath: 'artifacts/analysis.md',
        kind: 'markdown'
      },
      artifact: { path: 'artifacts/analysis.md', content: '# Scope' },
      completionEvent: event(5, 'run.completed')
    })
    await expect(harness.runs.get('run-1')).resolves.toMatchObject({
      status: 'completed',
      lastSequence: 5
    })
  })

  it('maps a formal commit rejection to run.failed without publishing completion', async () => {
    const harness = createHarness([
      event(1, 'run.started'),
      event(2, 'artifact.ready', {
        artifact: { path: 'artifacts/analysis.md', content: '# Scope' }
      }),
      event(3, 'run.completed')
    ])
    harness.artifacts.commit.mockRejectedValueOnce(
      new Error('Formal artifact commit conflicted')
    )

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await handle.completion

    await expect(harness.runs.get('run-1')).resolves.toMatchObject({
      status: 'failed',
      error: 'Formal artifact commit conflicted'
    })
    expect(harness.publisher.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run.completed' })
    )
    expect(harness.publisher.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'run.failed',
        sequence: 3
      })
    )
  })

  it('resolves the selected model and records completed usage metrics', async () => {
    const completed = event(3, 'run.completed', {
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
      source: 'workflow_stage',
      modelProfileId: 'profile-1',
      workspaceId: 'workspace-1',
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

  it('links a terminal node model metric to its context snapshot', async () => {
    const harness = createHarness([
      event(1, 'run.started'),
      event(2, 'artifact.ready', {
        artifact: { path: 'artifacts/analysis.md', content: '# Scope' }
      }),
      event(3, 'run.completed')
    ])

    const handle = await harness.generate.executeNode({
      requirementId: 'requirement-1',
      nodeId: 'node-1',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1',
      executor: {
        kind: 'ai_generate',
        prompt: 'Analyze.',
        artifact: {
          relativePath: 'artifacts/analysis.md',
          kind: 'markdown'
        }
      }
    })
    await handle.completion

    expect(harness.models.recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'workflow_node',
        workspaceId: 'workspace-1',
        nodeId: 'node-1',
        contextSnapshotId: 'context-snapshot-1',
        requestedReasoning: 'inherit'
      })
    )
    expect(harness.models.recordCall).toHaveBeenCalledWith(
      expect.not.objectContaining({ effectiveReasoning: expect.anything() })
    )
  })

  it('records the requested and effective reasoning for a workflow node', async () => {
    const harness = createHarness([
      event(1, 'run.started'),
      event(2, 'artifact.ready', {
        artifact: { path: 'artifacts/analysis.md', content: '# Scope' }
      }),
      event(3, 'run.completed')
    ])
    harness.contexts.loadNode.mockResolvedValueOnce({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'node-1',
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      prompt: 'Analyze.',
      reasoning: 'medium',
      requestedReasoning: 'medium',
      effectiveReasoning: 'medium',
      contextSnapshotId: 'context-snapshot-1',
      artifactPath: 'artifacts/analysis.md',
      existingArtifacts: []
    })

    const handle = await harness.generate.executeNode({
      requirementId: 'requirement-1',
      nodeId: 'node-1',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1',
      executor: {
        kind: 'ai_generate',
        prompt: 'Analyze.',
        reasoning: 'medium',
        artifact: {
          relativePath: 'artifacts/analysis.md',
          kind: 'markdown'
        }
      }
    })
    await handle.completion

    expect(harness.models.recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'workflow_node',
        requestedReasoning: 'medium',
        effectiveReasoning: 'medium'
      })
    )
  })

  it('records a failed metric when the Main event stream fails', async () => {
    const harness = createHarness([])
    harness.gateway.streamEvents.mockImplementation(async function* () {
      yield event(1, 'run.started')
      throw new Error('stream disconnected with secret response')
    })

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis',
      modelProfileId: 'profile-1'
    })
    await handle.completion

    expect(harness.models.recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'workflow_stage',
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        aiRunId: 'run-1',
        status: 'failed',
        errorCode: 'stream_error'
      })
    )
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
      event(2, 'answer.delta', { delta: 'one' }),
      event(2, 'answer.delta', { delta: 'duplicate' }),
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
        data: {
          message: 'Run completed without a valid artifact',
          errorCode: 'stream_error'
        }
      })
    )
  })

  it('fails the run when the gateway yields a sequence gap', async () => {
    const harness = createHarness([
      event(1, 'run.started'),
      event(3, 'run.cancelled')
    ])

    const handle = await harness.generate.execute({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
    await handle.completion

    await expect(harness.runs.get('run-1')).resolves.toMatchObject({
      status: 'failed',
      error: 'AI run event sequence gap'
    })
    expect(harness.publisher.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 3 })
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

  it('cancels a created Sidecar run when initial Main persistence fails', async () => {
    const harness = createHarness([])
    vi.spyOn(harness.runs, 'save').mockRejectedValueOnce(
      new Error('SQLite write failed')
    )

    await expect(
      harness.generate.execute({
        requirementId: 'requirement-1',
        stageId: 'analysis'
      })
    ).rejects.toThrow('SQLite write failed')

    expect(harness.gateway.cancelRun).toHaveBeenCalledWith('run-1')
    expect(harness.gateway.streamEvents).not.toHaveBeenCalled()
    expect(harness.publisher.publish).not.toHaveBeenCalled()
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
      yield event(2, 'answer.delta', { delta: 'late' })
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
      expect.objectContaining({ type: 'answer.delta' })
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

    await expect(cancel.execute(handle.runId)).rejects.toThrow(
      'Sidecar cancellation failed'
    )

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

  it.each(['failed', 'interrupted'] as const)(
    'forces provider cancellation when the local run is already %s',
    async (status) => {
      const harness = createHarness([])
      await harness.runs.save({
        ...createAiRun('run-terminal', 'requirement-1', 'analysis'),
        status
      })
      const cancel = new CancelAiRunUseCase({
        runs: harness.runs,
        gateway: harness.gateway,
        publisher: harness.publisher
      })

      await cancel.execute('run-terminal', { forceProvider: true })

      expect(harness.gateway.cancelRun).toHaveBeenCalledWith('run-terminal')
      await expect(harness.runs.get('run-terminal')).resolves.toMatchObject({
        status
      })
    }
  )
})
