import { describe, expect, it, vi } from 'vitest'
import type { AiRun } from '../../../../domain/ai-run'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import { ExecuteWorkflowNodeUseCase } from './execute-workflow-node'

const workflow: RequirementWorkflow = {
  requirementId: 'requirement-1',
  templateVersionId: 'template-v1',
  revision: 4,
  maxParallelism: 1,
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
  options: {
    bindFails?: boolean
    generateFails?: boolean
    runStatus?: AiRun['status']
    routeUnavailable?: boolean
    checkpointModelProfileId?: string
    superseded?: boolean
    workflow?: RequirementWorkflow
  } = {}
) {
  const calls: string[] = []
  const currentWorkflow = options.workflow ?? workflow
  const generate = {
    execute: vi.fn(async () => {
      calls.push('generate')
      if (options.generateFails) throw new Error('provider unavailable')
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
    }),
    failRecovery: vi.fn(async () => {
      calls.push('interrupt')
      return {
        workflow: {
          ...workflow,
          revision: 6,
          nodes: workflow.nodes.map((node) => ({
            ...node,
            status: 'interrupted' as const
          }))
        },
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: 'custom-security',
          status: 'interrupted' as const,
          attempt: 1,
          revision: 5,
          createdAt: 1,
          updatedAt: 4
        }
      }
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
  const advance = { drain: vi.fn().mockResolvedValue(undefined) }
  const models = {
    routeModel: vi.fn(async (request: { strategy: string; profileId?: string }) => {
      calls.push('route')
      if (options.routeUnavailable) {
        return {
          outcome: 'unavailable' as const,
          code: 'no_capability_match' as const,
          message: 'No enabled model satisfies text'
        }
      }
      return {
        outcome: 'selected' as const,
        reason: request.strategy as 'fixed' | 'capability',
        profile: {
          id: request.profileId ?? 'profile-routed',
          providerId: 'provider-1',
          modelId: 'routed-model',
          displayName: 'Routed Model',
          enabled: true,
          capabilities: {
            text: true,
            vision: true,
            toolCalling: true,
            structuredOutput: true
          },
          contextWindow: 128_000,
          timeoutMs: 120_000,
          maxRetries: 2,
          maxConcurrency: 4,
          inputCostPerMillionTokens: 1,
          outputCostPerMillionTokens: 2,
          revision: 1
        },
        provider: {
          id: 'provider-1',
          type: 'local' as const,
          name: 'Local',
          baseUrl: 'http://127.0.0.1:4555',
          enabled: true,
          revision: 1
        }
      }
    })
  }
  const useCase = new ExecuteWorkflowNodeUseCase({
    generate,
    cancel,
    runs: { get: vi.fn().mockResolvedValue(runningRun) },
    requirements: {
      get: vi.fn().mockResolvedValue({ id: 'requirement-1', revision: 2 })
    },
    workflows: {
      get: vi.fn().mockResolvedValue(currentWorkflow)
    },
    nodeRuns: {
      get: vi.fn().mockResolvedValue({
        id: 'node-run-1',
        executionId: 'execution-1',
        nodeId: currentWorkflow.nodes[0].id,
        aiRunId: 'ai-run-1',
        revision: 4,
        ...(options.checkpointModelProfileId
          ? {
              checkpoint: {
                modelProfileId: options.checkpointModelProfileId
              }
            }
          : {})
      }),
      getLatestByNode: vi.fn().mockResolvedValue(
        options.superseded
          ? {
              id: 'node-run-2',
              executionId: 'execution-1',
              nodeId: currentWorkflow.nodes[0].id,
              aiRunId: 'ai-run-2',
              revision: 1
            }
          : {
              id: 'node-run-1',
              executionId: 'execution-1',
              nodeId: currentWorkflow.nodes[0].id,
              aiRunId: 'ai-run-1',
              revision: 4
            }
      )
    },
    advance,
    manager,
    models
  })
  return {
    calls,
    cancel,
    generate,
    models,
    advance,
    manager,
    useCase
  }
}

describe('ExecuteWorkflowNodeUseCase', () => {
  it('executes a target-free Tool node through the model Tool Loop', async () => {
    const toolWorkflow: RequirementWorkflow = {
      ...workflow,
      nodes: [
        {
          id: 'custom-tool',
          type: 'tool',
          name: 'Run planning Skill',
          description: '',
          order: 0,
          status: 'ready',
          allowSkip: false,
          configuration: {
            input: {
              includeRequirementBody: false,
              predecessorArtifacts: 'none',
              includeSpaceKnowledge: false,
              attachments: []
            },
            prompt: 'Plan the delivery.',
            model: { strategy: 'inherit' },
            connectorIds: [],
            permissions: [],
            artifact: {
              required: false,
              relativePath: '',
              kind: ''
            },
            todos: [],
            completionGate: { requireApproval: false },
            retry: { maxAttempts: 1, backoffMs: 0 },
            skip: { allowed: false, requireReason: false }
          },
          executor: {
            kind: 'ai_generate',
            prompt: 'Plan the delivery.',
            artifact: {
              relativePath: 'artifacts/custom-tool.md',
              kind: 'markdown'
            }
          }
        }
      ]
    }
    const harness = createHarness({ workflow: toolWorkflow })

    const handle = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-tool',
      nodeRunId: 'node-run-1'
    })

    expect(harness.models.routeModel).toHaveBeenCalledOnce()
    expect(harness.generate.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-tool',
      nodeRunId: 'node-run-1',
      executor: {
        kind: 'ai_generate',
        prompt: 'Plan the delivery.',
        artifact: {
          relativePath: 'artifacts/custom-tool.md',
          kind: 'markdown'
        }
      },
      modelProfileId: 'profile-routed'
    })
    expect(handle.runId).toBe('ai-run-1')
  })

  it('reserves and runs a custom node from its explicit executor config', async () => {
    const harness = createHarness()

    const handle = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1'
    })

    expect(harness.calls).toEqual(['route', 'reserve', 'generate', 'bind'])
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
      'route',
      'reserve',
      'generate',
      'bind',
      'cancel',
      'finish'
    ])
  })

  it('keeps an automatic recovery interrupted when relaunch fails', async () => {
    const harness = createHarness({ generateFails: true })

    await expect(
      harness.useCase.execute({
        requirementId: 'requirement-1',
        nodeId: 'custom-security',
        nodeRunId: 'node-run-1',
        recovery: true
      })
    ).rejects.toThrow('provider unavailable')

    expect(harness.manager.finishNode).not.toHaveBeenCalled()
    expect(harness.manager.failRecovery).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      error: 'provider unavailable'
    })
    expect(harness.calls).toEqual(['route', 'reserve', 'generate', 'interrupt'])
  })

  it('delegates persisted completion gate evaluation after the AI run completes', async () => {
    const harness = createHarness({ runStatus: 'completed' })

    const handle = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1'
    })
    await handle.completion

    expect(harness.manager.completeNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 4,
      expectedWorkflowRevision: workflow.revision,
      expectedRequirementRevision: 2,
      executionFinished: true
    })
    expect(harness.advance.drain).toHaveBeenCalledOnce()
  })

  it('ignores a settled stream from a superseded node run attempt', async () => {
    const harness = createHarness({
      runStatus: 'completed',
      superseded: true
    })

    const handle = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1'
    })
    await handle.completion

    expect(harness.manager.completeNode).not.toHaveBeenCalled()
    expect(harness.manager.finishNode).not.toHaveBeenCalled()
    expect(harness.manager.waitForUser).not.toHaveBeenCalled()
    expect(harness.advance.drain).not.toHaveBeenCalled()
  })

  it('routes a capability strategy before reserving the node', async () => {
    const capabilityWorkflow: RequirementWorkflow = {
      ...workflow,
      nodes: workflow.nodes.map((node) => ({
        ...node,
        configuration: {
          input: {
            includeRequirementBody: true,
            predecessorArtifacts: 'direct',
            includeSpaceKnowledge: false,
            attachments: []
          },
          prompt: node.executor?.prompt ?? '',
          model: {
            strategy: 'capability',
            requiredCapabilities: ['vision', 'structuredOutput'],
            minimumContextWindow: 32_000
          },
          connectorIds: [],
          permissions: [],
          artifact: {
            required: true,
            relativePath: 'artifacts/security-review.md',
            kind: 'markdown'
          },
          todos: [],
          completionGate: { requireApproval: false },
          retry: { maxAttempts: 1, backoffMs: 0 },
          skip: { allowed: true, requireReason: false }
        }
      }))
    }
    const harness = createHarness({ workflow: capabilityWorkflow })

    await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1'
    })

    expect(harness.models.routeModel).toHaveBeenCalledWith({
      strategy: 'capability',
      requiredCapabilities: ['vision', 'structuredOutput'],
      minimumContextWindow: 32_000
    })
    expect(harness.calls.slice(0, 3)).toEqual(['route', 'reserve', 'generate'])
    expect(harness.generate.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modelProfileId: 'profile-routed' })
    )
  })

  it('reuses a checkpoint model as a fixed route during recovery', async () => {
    const harness = createHarness({
      checkpointModelProfileId: 'profile-checkpoint'
    })

    await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'custom-security',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-command',
      recovery: true
    })

    expect(harness.models.routeModel).toHaveBeenCalledWith({
      strategy: 'fixed',
      profileId: 'profile-checkpoint'
    })
  })

  it('does not reserve a node when no model can satisfy its route', async () => {
    const harness = createHarness({ routeUnavailable: true })

    await expect(
      harness.useCase.execute({
        requirementId: 'requirement-1',
        nodeId: 'custom-security',
        nodeRunId: 'node-run-1'
      })
    ).rejects.toThrow('No enabled model satisfies text')

    expect(harness.manager.reserveNode).not.toHaveBeenCalled()
    expect(harness.generate.execute).not.toHaveBeenCalled()
    expect(harness.calls).toEqual(['route'])
  })
})
