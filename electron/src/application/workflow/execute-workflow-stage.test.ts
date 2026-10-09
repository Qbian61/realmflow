import { describe, expect, it, vi } from 'vitest'
import type { AiRun } from '../../../../domain/ai-run'
import { ExecuteWorkflowStageUseCase } from './execute-workflow-stage'
import { NodeCompletionGateError } from './node-completion-gate-evaluator'

function run(status: AiRun['status']): AiRun {
  return {
    id: 'ai-run-1',
    requirementId: 'requirement-1',
    stageId: 'analysis',
    status,
    lastSequence: 2,
    content: '# Analysis',
    ...(status === 'completed'
      ? { artifact: { path: 'requirements/analysis.md', content: '# Analysis' } }
      : {}),
    ...(status === 'failed' ? { error: 'Provider failed' } : {})
  }
}

function createHarness(
  status: AiRun['status'],
  completion: Promise<void> = Promise.resolve(),
  superseded = false
) {
  const generate = {
    execute: vi.fn().mockResolvedValue({
      runId: 'ai-run-1',
      completion
    })
  }
  const manager = {
    startNode: vi.fn().mockResolvedValue(undefined),
    completeNode: vi.fn().mockResolvedValue(undefined),
    waitForUser: vi.fn().mockResolvedValue(undefined),
    finishNode: vi.fn().mockResolvedValue(undefined)
  }
  const useCase = new ExecuteWorkflowStageUseCase({
    generate,
    runs: { get: vi.fn().mockResolvedValue(run(status)) },
    requirements: {
      get: vi.fn().mockResolvedValue({ id: 'requirement-1', revision: 7 })
    },
    workflows: {
      get: vi.fn().mockResolvedValue({ requirementId: 'requirement-1', revision: 5 })
    },
    nodeRuns: {
      get: vi.fn().mockResolvedValue({
        id: 'node-run-1',
        executionId: 'execution-1',
        nodeId: 'analysis',
        aiRunId: 'ai-run-1',
        revision: 3
      }),
      getLatestByNode: vi.fn().mockResolvedValue(
        superseded
          ? {
              id: 'node-run-2',
              executionId: 'execution-1',
              nodeId: 'analysis',
              aiRunId: 'ai-run-2',
              revision: 1
            }
          : {
              id: 'node-run-1',
              executionId: 'execution-1',
              nodeId: 'analysis',
              aiRunId: 'ai-run-1',
              revision: 3
            }
      )
    },
    manager
  })
  return { generate, manager, useCase }
}

const input = {
  requirementId: 'requirement-1',
  stageId: 'analysis' as const,
  nodeRunId: 'node-run-1',
  modelProfileId: 'profile-1'
}

describe('ExecuteWorkflowStageUseCase', () => {
  it('binds the generated AI run to the workflow node before settling', async () => {
    const { generate, manager, useCase } = createHarness('running')

    const handle = await useCase.execute(input)

    expect(generate.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      stageId: 'analysis',
      modelProfileId: 'profile-1'
    })
    expect(manager.startNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      aiRunId: 'ai-run-1'
    })
    await handle.completion
  })

  it('completes the workflow node after the artifact run completes', async () => {
    const { manager, useCase } = createHarness('completed')

    const handle = await useCase.execute(input)
    await handle.completion

    expect(manager.completeNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 3,
      expectedWorkflowRevision: 5,
      expectedRequirementRevision: 7,
      executionFinished: true
    })
  })

  it('waits for user input when completion gates remain open', async () => {
    const { manager, useCase } = createHarness('completed')
    manager.completeNode.mockRejectedValue(
      new NodeCompletionGateError({
        executionFinished: true,
        requiredArtifactsValid: false,
        requiredTodosComplete: true,
        openRequiredQuestions: 0,
        approvalPassed: true,
        customGatePassed: true,
        allowed: false,
        reasons: ['required_artifact_invalid']
      })
    )

    const handle = await useCase.execute(input)
    await handle.completion

    expect(manager.waitForUser).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1'
    })
  })

  it.each([
    ['failed', 'Provider failed'],
    ['cancelled', undefined]
  ] as const)('synchronizes the %s terminal state', async (status, error) => {
    const { manager, useCase } = createHarness(status)

    const handle = await useCase.execute(input)
    await handle.completion

    expect(manager.finishNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      status,
      error
    })
  })

  it('marks the node failed when background completion rejects', async () => {
    const { manager, useCase } = createHarness(
      'running',
      Promise.reject(new Error('stream disconnected'))
    )

    const handle = await useCase.execute(input)
    await expect(handle.completion).resolves.toBeUndefined()

    expect(manager.finishNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      status: 'failed',
      error: 'stream disconnected'
    })
  })

  it('ignores a settled legacy stream from a superseded node run attempt', async () => {
    const { manager, useCase } = createHarness(
      'completed',
      Promise.resolve(),
      true
    )

    const handle = await useCase.execute(input)
    await handle.completion

    expect(manager.completeNode).not.toHaveBeenCalled()
    expect(manager.finishNode).not.toHaveBeenCalled()
    expect(manager.waitForUser).not.toHaveBeenCalled()
  })
})
