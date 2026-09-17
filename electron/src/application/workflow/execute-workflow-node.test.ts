import { describe, expect, it, vi } from 'vitest'
import type { AiRun } from '../../../../domain/ai-run'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import { ExecuteWorkflowNodeUseCase } from './execute-workflow-node'

const workflow: RequirementWorkflow = {
  requirementId: 'requirement-1',
  templateVersionId: 'template-v1',
  revision: 4,
  nodes: [
    {
      id: 'custom-security',
      type: 'ai_generate',
      name: 'Security Review',
      description: '',
      order: 0,
      status: 'ready',
      allowSkip: true,
      executor: {
        kind: 'ai_generate',
        prompt: 'Review predecessor artifacts for security risks.',
        artifact: {
          relativePath: 'artifacts/security-review.md',
          kind: 'markdown'
        }
      }
    }
  ],
  edges: []
}

function createHarness(
  options: { bindFails?: boolean; runStatus?: AiRun['status'] } = {}
) {
  const calls: string[] = []
  const generate = {
    execute: vi.fn(async () => {
      calls.push('generate')
      return { runId: 'ai-run-1', completion: Promise.resolve() }
    })
  }
  const manager = {
    reserveNode: vi.fn(async () => {
      calls.push('reserve')
      return {
        workflow: {
          ...workflow,
          revision: 5,
          nodes: workflow.nodes.map((node) => ({
            ...node,
            status: 'running' as const
          }))
        },
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: 'custom-security',
          status: 'running' as const,
          attempt: 1,
          revision: 3,
          createdAt: 1,
          updatedAt: 2
        }
      }
    }),
    bindAiRun: vi.fn(async () => {
      calls.push('bind')
      if (options.bindFails) throw new Error('Node run revision conflict')
      return {
        id: 'node-run-1',
        executionId: 'execution-1',
        nodeId: 'custom-security',
        aiRunId: 'ai-run-1',
        status: 'running' as const,
        attempt: 1,
        revision: 4,
        createdAt: 1,
        updatedAt: 3
      }
    }),
    completeNode: vi.fn().mockResolvedValue({ workflow }),
    waitForUser: vi.fn(),
    finishNode: vi.fn(async () => {
      calls.push('finish')
      return undefined
    })
  }
  const cancel = {
    execute: vi.fn(async () => {
      calls.push('cancel')
    })
  }
  const runningRun: AiRun = {
    id: 'ai-run-1',
    requirementId: 'requirement-1',
    stageId: 'analysis',
    status: options.runStatus ?? 'running',
    lastSequence: 0,
    content: ''
  }
  const gateEvaluator = {
    evaluate: vi.fn().mockResolvedValue({
      executionFinished: true,
      requiredArtifactsValid: false,
      approvalPassed: true,
      customGatePassed: true
    })
  }
  const advance = { drain: vi.fn().mockResolvedValue(undefined) }
  const useCase = new ExecuteWorkflowNodeUseCase({
    generate,
    cancel,
    runs: { get: vi.fn().mockResolvedValue(runningRun) },
    requirements: {
      get: vi.fn().mockResolvedValue({ id: 'requirement-1', revision: 2 })
    },
    workflows: {
      get: vi.fn().mockResolvedValue(workflow)
    },
    nodeRuns: {
      get: vi.fn().mockResolvedValue({
        id: 'node-run-1',
        nodeId: 'custom-security',
        revision: 4
      })
    },
    gateEvaluator,
    advance,
    manager
  })
  return {
    calls,
    cancel,
    generate,
    gateEvaluator,
    advance,
    manager,
    useCase
  }
}

describe('ExecuteWorkflowNodeUseCase', () => {
  it('reserves and runs a custom node from its explicit executor config', async () => {
    const harness = createHarness()

    const handle = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1'
    })

    expect(harness.calls).toEqual(['reserve', 'generate', 'bind'])
    expect(harness.generate.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1',
      executor: workflow.nodes[0].executor,
      modelProfileId: 'profile-1'
    })
    expect(harness.manager.bindAiRun).toHaveBeenCalledWith({
      nodeRunId: 'node-run-1',
      aiRunId: 'ai-run-1',
      expectedNodeRunRevision: 4
    })
    expect(handle.runId).toBe('ai-run-1')
  })

  it('cancels the external run and fails the reservation when binding fails', async () => {
    const harness = createHarness({ bindFails: true })

    await expect(
      harness.useCase.execute({
        requirementId: 'requirement-1',
        nodeId: 'custom-security',
        nodeRunId: 'node-run-1'
      })
    ).rejects.toThrow('Node run revision conflict')

    expect(harness.cancel.execute).toHaveBeenCalledWith('ai-run-1')
    expect(harness.manager.finishNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      status: 'failed',
      error: 'Node run revision conflict'
    })
    expect(harness.calls).toEqual([
      'reserve',
      'generate',
      'bind',
      'cancel',
      'finish'
    ])
  })

  it('uses persisted completion gate results after the AI run completes', async () => {
    const harness = createHarness({ runStatus: 'completed' })

    const handle = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1'
    })
    await handle.completion

    expect(harness.gateEvaluator.evaluate).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      node: workflow.nodes[0],
      nodeRun: expect.objectContaining({
        id: 'node-run-1',
        nodeId: 'custom-security'
      }),
      executionFinished: true
    })
    expect(harness.manager.completeNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 4,
      expectedWorkflowRevision: workflow.revision,
      expectedRequirementRevision: 2,
      executionFinished: true,
      requiredArtifactsValid: false,
      approvalPassed: true,
      customGatePassed: true
    })
    expect(harness.advance.drain).toHaveBeenCalledOnce()
  })
})
