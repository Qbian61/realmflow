import { describe, expect, it, vi } from 'vitest'
import {
  ControlWorkflowNodeUseCase,
  WorkflowNodeControlError
} from './control-workflow-node'

const command = {
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1',
  expectedWorkflowRevision: 5,
  expectedExecutionRevision: 1,
  expectedNodeRunRevision: 2
}

function createHarness() {
  const workflow = {
    requirementId: 'requirement-1',
    templateVersionId: 'builtin-sdlc-v1',
    revision: 5,
    maxParallelism: 1,
    nodes: [
      {
        id: 'custom-security-review',
        type: 'ai_generate' as const,
        name: 'Security review',
        description: '',
        order: 0,
        status: 'running' as const,
        allowSkip: true,
        executor: {
          kind: 'ai_generate' as const,
          prompt: 'Review security.',
          artifact: {
            relativePath: 'artifacts/security-review.md',
            kind: 'markdown'
          }
        }
      }
    ],
    edges: []
  }
  const execution = {
    id: 'execution-1',
    requirementId: 'requirement-1',
    status: 'running' as const,
    currentNodeId: 'custom-security-review',
    revision: 1,
    createdAt: 1,
    updatedAt: 1
  }
  const manager = {
    pauseNode: vi.fn().mockResolvedValue(undefined),
    resumeNode: vi.fn().mockResolvedValue(undefined),
    cancelNode: vi.fn().mockResolvedValue(undefined),
    skipNode: vi.fn().mockResolvedValue(undefined),
    prepareRetry: vi.fn().mockResolvedValue(undefined)
  }
  const nodeRuns = {
    get: vi.fn().mockResolvedValue({
      id: 'node-run-1',
      executionId: 'execution-1',
      nodeId: 'custom-security-review',
      aiRunId: 'ai-run-1',
      status: 'running',
      attempt: 1,
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    }),
    getLatestByNode: vi.fn()
  }
  const workflows = {
    get: vi.fn().mockResolvedValue(workflow)
  }
  const executions = {
    get: vi.fn().mockResolvedValue(execution),
    getActiveByRequirement: vi.fn().mockResolvedValue(execution)
  }
  const cancel = { execute: vi.fn().mockResolvedValue(undefined) }
  const executeNode = {
    execute: vi.fn().mockResolvedValue({
      runId: 'ai-run-2',
      completion: Promise.resolve()
    })
  }
  return {
    manager,
    nodeRuns,
    workflows,
    executions,
    cancel,
    executeNode,
    useCase: new ControlWorkflowNodeUseCase({
      manager,
      nodeRuns,
      workflows,
      executions,
      cancel,
      executeNode
    }),
    workflow,
    execution
  }
}

describe('ControlWorkflowNodeUseCase', () => {
  it('starts a ready node through the Main executor and returns its committed snapshot', async () => {
    const { useCase, nodeRuns, workflows, executeNode, execution } =
      createHarness()
    const readyNodeRun = {
      ...(await nodeRuns.get('node-run-1')),
      status: 'ready' as const
    }
    const readyWorkflow = {
      ...(await workflows.get('requirement-1')),
      revision: 5,
      nodes: [
        {
          ...(await workflows.get('requirement-1')).nodes[0],
          status: 'ready' as const
        }
      ]
    }
    nodeRuns.get.mockResolvedValueOnce(readyNodeRun).mockResolvedValue({
      ...readyNodeRun,
      status: 'running',
      revision: 3
    })
    workflows.get.mockResolvedValueOnce(readyWorkflow).mockResolvedValue({
      ...readyWorkflow,
      revision: 6,
      nodes: [{ ...readyWorkflow.nodes[0], status: 'running' }]
    })

    await expect(
      useCase.start({ ...command, modelProfileId: 'profile-1' })
    ).resolves.toMatchObject({
      outcome: 'applied',
      action: 'start',
      execution,
      nodeRun: { status: 'running', revision: 3 },
      workflow: {
        revision: 6,
        nodes: [{ status: 'running' }]
      }
    })
    expect(executeNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-security-review',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1'
    })
  })

  it('starts a configured tool node through the shared workflow executor', async () => {
    const { useCase, nodeRuns, workflows, executeNode } = createHarness()
    const readyNodeRun = {
      ...(await nodeRuns.get('node-run-1')),
      status: 'ready' as const
    }
    const toolNode = {
      id: 'custom-security-review',
      type: 'tool' as const,
      name: 'Security tool',
      description: '',
      order: 0,
      status: 'ready' as const,
      allowSkip: false,
      configuration: {
        input: {
          includeRequirementBody: false,
          predecessorArtifacts: 'none' as const,
          includeSpaceKnowledge: false,
          attachments: []
        },
        prompt: 'Review the requirement security.',
        model: { strategy: 'inherit' as const },
        connectorIds: [],
        permissions: [],
        artifact: { required: false, relativePath: '', kind: '' },
        todos: [],
        completionGate: { requireApproval: false },
        retry: { maxAttempts: 1, backoffMs: 0 },
        skip: { allowed: false, requireReason: false }
      },
      executor: {
        kind: 'ai_generate' as const,
        prompt: 'Review the requirement security.',
        artifact: {
          relativePath: 'artifacts/custom-security-review.md',
          kind: 'markdown'
        }
      }
    }
    nodeRuns.get.mockResolvedValueOnce(readyNodeRun).mockResolvedValue({
      ...readyNodeRun,
      status: 'running',
      revision: 3
    })
    workflows.get.mockResolvedValueOnce({
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 5,
      maxParallelism: 1,
      nodes: [toolNode],
      edges: []
    }).mockResolvedValue({
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 6,
      maxParallelism: 1,
      nodes: [{ ...toolNode, status: 'running' }],
      edges: []
    })

    await expect(useCase.start(command)).resolves.toMatchObject({
      outcome: 'applied',
      nodeRun: { status: 'running' }
    })
    expect(executeNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-security-review',
      nodeRunId: 'node-run-1'
    })
  })

  it('treats a repeated start as idempotent without creating another AI run', async () => {
    const { useCase, executeNode } = createHarness()

    await expect(useCase.start(command)).resolves.toMatchObject({
      outcome: 'idempotent',
      action: 'start',
      workflow: { revision: 5 },
      nodeRun: { status: 'running', revision: 2 }
    })
    expect(executeNode.execute).not.toHaveBeenCalled()
  })

  it('controls the latest active node run even when another node has focus', async () => {
    const {
      useCase,
      workflow,
      execution,
      nodeRuns,
      workflows,
      executions,
      executeNode
    } =
      createHarness()
    const parallelNodeRun = {
      ...(await nodeRuns.get('node-run-1')),
      id: 'node-run-parallel',
      nodeId: 'parallel-review'
    }
    nodeRuns.get.mockResolvedValue(parallelNodeRun)
    nodeRuns.getLatestByNode.mockResolvedValue(parallelNodeRun)
    workflows.get.mockResolvedValue({
      ...workflow,
      maxParallelism: 2,
      nodes: [
        workflow.nodes[0],
        {
          ...workflow.nodes[0],
          id: 'parallel-review',
          order: 1,
          status: 'running'
        }
      ]
    })
    executions.get.mockResolvedValue({
      ...execution,
      currentNodeId: 'custom-security-review'
    })

    await expect(
      useCase.start({
        ...command,
        nodeRunId: 'node-run-parallel'
      })
    ).resolves.toMatchObject({
      outcome: 'idempotent',
      nodeRun: { id: 'node-run-parallel', nodeId: 'parallel-review' }
    })
    expect(executeNode.execute).not.toHaveBeenCalled()
  })

  it('rejects a superseded node run attempt', async () => {
    const { useCase, nodeRuns, executeNode } = createHarness()
    const current = await nodeRuns.get('node-run-1')
    nodeRuns.getLatestByNode.mockResolvedValue({
      ...current,
      id: 'node-run-2',
      attempt: 2
    })

    await expect(useCase.start(command)).rejects.toMatchObject({
      code: 'ownership_mismatch'
    })
    expect(executeNode.execute).not.toHaveBeenCalled()
  })

  it('rejects a node from another execution before starting an AI run', async () => {
    const { useCase, nodeRuns, executeNode } = createHarness()
    nodeRuns.get.mockResolvedValue({
      id: 'node-run-1',
      executionId: 'execution-other',
      nodeId: 'custom-security-review',
      status: 'ready',
      attempt: 1,
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    })

    await expect(useCase.start(command)).rejects.toEqual(
      new WorkflowNodeControlError(
        'ownership_mismatch',
        'Workflow execution does not match node run'
      )
    )
    expect(executeNode.execute).not.toHaveBeenCalled()
  })

  it('rejects a stale start with a structured revision error', async () => {
    const { useCase, nodeRuns, workflows, executeNode } = createHarness()
    nodeRuns.get.mockResolvedValue({
      ...(await nodeRuns.get('node-run-1')),
      status: 'ready'
    })
    workflows.get.mockResolvedValue({
      ...(await workflows.get('requirement-1')),
      nodes: [
        {
          ...(await workflows.get('requirement-1')).nodes[0],
          status: 'ready'
        }
      ]
    })

    await expect(
      useCase.start({ ...command, expectedNodeRunRevision: 1 })
    ).rejects.toMatchObject({ code: 'revision_conflict' })
    expect(executeNode.execute).not.toHaveBeenCalled()
  })

  it('pauses the node before cancelling its active AI run', async () => {
    const { useCase, manager, cancel, workflow, execution, nodeRuns } =
      createHarness()
    manager.pauseNode.mockResolvedValue({
      workflow: {
        ...workflow,
        revision: 6,
        nodes: [{ ...workflow.nodes[0], status: 'paused' }]
      },
      execution: { ...execution, status: 'paused', revision: 2 },
      nodeRun: {
        ...(await nodeRuns.get('node-run-1')),
        status: 'paused',
        revision: 3
      }
    })

    await expect(useCase.pause(command)).resolves.toMatchObject({
      outcome: 'applied',
      action: 'pause',
      workflow: { revision: 6 },
      execution: { status: 'paused', revision: 2 },
      nodeRun: { status: 'paused', revision: 3 }
    })

    expect(manager.pauseNode).toHaveBeenCalledWith(command)
    expect(cancel.execute).toHaveBeenCalledWith('ai-run-1')
    expect(manager.pauseNode.mock.invocationCallOrder[0]).toBeLessThan(
      cancel.execute.mock.invocationCallOrder[0]
    )
  })

  it('resumes the node with a new AI run and selected model', async () => {
    const {
      useCase,
      manager,
      executeNode,
      workflow,
      execution,
      nodeRuns,
      workflows
    } = createHarness()
    nodeRuns.get.mockResolvedValue({
      ...(await nodeRuns.get('node-run-1')),
      status: 'paused'
    })
    workflows.get.mockResolvedValue({
      ...workflow,
      nodes: [{ ...workflow.nodes[0], status: 'paused' }]
    })
    manager.resumeNode.mockResolvedValue({
      workflow: {
        ...workflow,
        revision: 6,
        nodes: [{ ...workflow.nodes[0], status: 'ready' }]
      },
      execution: { ...execution, status: 'running', revision: 2 },
      nodeRun: {
        ...(await nodeRuns.get('node-run-1')),
        status: 'ready',
        revision: 3
      }
    })

    await expect(
      useCase.resume({ ...command, modelProfileId: 'profile-1' })
    ).resolves.toMatchObject({
      outcome: 'applied',
      action: 'resume'
    })

    expect(manager.resumeNode).toHaveBeenCalledWith(command)
    expect(executeNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-security-review',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1'
    })
  })

  it('commits cancellation before cancelling the bound AI run', async () => {
    const { useCase, manager, cancel, workflow, execution, nodeRuns } =
      createHarness()
    manager.cancelNode.mockResolvedValue({
      workflow: {
        ...workflow,
        revision: 6,
        nodes: [{ ...workflow.nodes[0], status: 'cancelled' }]
      },
      execution: { ...execution, status: 'cancelled', revision: 2 },
      nodeRun: {
        ...(await nodeRuns.get('node-run-1')),
        status: 'cancelled',
        revision: 3
      }
    })

    await expect(useCase.cancel(command)).resolves.toMatchObject({
      outcome: 'applied',
      action: 'cancel',
      workflow: { revision: 6 },
      execution: { status: 'cancelled' },
      nodeRun: { status: 'cancelled' }
    })
    expect(manager.cancelNode).toHaveBeenCalledWith(command)
    expect(manager.cancelNode.mock.invocationCallOrder[0]).toBeLessThan(
      cancel.execute.mock.invocationCallOrder[0]
    )
  })

  it('treats a repeated cancellation as idempotent after the execution is terminal', async () => {
    const { useCase, manager, cancel, workflow, execution, nodeRuns, workflows, executions } =
      createHarness()
    const cancelledNodeRun = {
      ...(await nodeRuns.get('node-run-1')),
      status: 'cancelled' as const,
      revision: 3
    }
    nodeRuns.get.mockResolvedValue(cancelledNodeRun)
    workflows.get.mockResolvedValue({
      ...workflow,
      revision: 6,
      nodes: [{ ...workflow.nodes[0], status: 'cancelled' }]
    })
    executions.get.mockResolvedValue({
      ...execution,
      status: 'cancelled',
      revision: 2,
      completedAt: 2
    })
    executions.getActiveByRequirement.mockResolvedValue(undefined)

    await expect(useCase.cancel(command)).resolves.toMatchObject({
      outcome: 'idempotent',
      action: 'cancel',
      nodeRun: { status: 'cancelled' }
    })
    expect(manager.cancelNode).not.toHaveBeenCalled()
    expect(cancel.execute).not.toHaveBeenCalled()
  })

  it('skips an allowed ready node with its user reason', async () => {
    const { useCase, manager, workflow, execution, nodeRuns, workflows } =
      createHarness()
    const readyWorkflow = {
      ...workflow,
      nodes: [{ ...workflow.nodes[0], status: 'ready' as const }]
    }
    const readyNodeRun = {
      ...(await nodeRuns.get('node-run-1')),
      status: 'ready' as const
    }
    workflows.get.mockResolvedValue(readyWorkflow)
    nodeRuns.get.mockResolvedValue(readyNodeRun)
    manager.skipNode.mockResolvedValue({
      workflow: {
        ...readyWorkflow,
        revision: 6,
        nodes: [{ ...readyWorkflow.nodes[0], status: 'skipped' }]
      },
      execution: { ...execution, status: 'completed', revision: 2 },
      nodeRun: { ...readyNodeRun, status: 'skipped', revision: 3 },
      requirementCompleted: true
    })

    await expect(
      useCase.skip({
        ...command,
        expectedRequirementRevision: 4,
        reason: 'Covered elsewhere'
      })
    ).resolves.toMatchObject({
      outcome: 'applied',
      action: 'skip',
      workflow: { revision: 6 },
      nodeRun: { status: 'skipped' }
    })
    expect(manager.skipNode).toHaveBeenCalledWith({
      ...command,
      expectedRequirementRevision: 4,
      reason: 'Covered elsewhere'
    })
  })

  it('rejects skip when the node does not allow it', async () => {
    const { useCase, manager, workflow, nodeRuns, workflows } = createHarness()
    workflows.get.mockResolvedValue({
      ...workflow,
      nodes: [
        {
          ...workflow.nodes[0],
          status: 'ready',
          allowSkip: false
        }
      ]
    })
    nodeRuns.get.mockResolvedValue({
      ...(await nodeRuns.get('node-run-1')),
      status: 'ready'
    })

    await expect(
      useCase.skip({
        ...command,
        expectedRequirementRevision: 4,
        reason: 'Not needed'
      })
    ).rejects.toMatchObject({ code: 'skip_not_allowed' })
    expect(manager.skipNode).not.toHaveBeenCalled()
  })

  it('treats a repeated skip as idempotent after the current node advances', async () => {
    const { useCase, manager, workflow, execution, nodeRuns, workflows, executions } =
      createHarness()
    nodeRuns.get.mockResolvedValue({
      ...(await nodeRuns.get('node-run-1')),
      status: 'skipped',
      revision: 3
    })
    workflows.get.mockResolvedValue({
      ...workflow,
      revision: 6,
      nodes: [{ ...workflow.nodes[0], status: 'skipped' }]
    })
    executions.get.mockResolvedValue({
      ...execution,
      currentNodeId: 'node-2',
      revision: 2
    })

    await expect(
      useCase.skip({
        ...command,
        expectedRequirementRevision: 4
      })
    ).resolves.toMatchObject({
      outcome: 'idempotent',
      action: 'skip',
      nodeRun: { status: 'skipped' }
    })
    expect(manager.skipNode).not.toHaveBeenCalled()
  })

  it('retries a failed node with one fresh attempt and selected model', async () => {
    const {
      useCase,
      manager,
      workflow,
      execution,
      nodeRuns,
      workflows,
      executeNode
    } = createHarness()
    const failedNodeRun = {
      ...(await nodeRuns.get('node-run-1')),
      status: 'failed' as const
    }
    const failedWorkflow = {
      ...workflow,
      nodes: [
        {
          ...workflow.nodes[0],
          status: 'failed' as const,
          configuration: {
            input: {
              includeRequirementBody: true,
              predecessorArtifacts: 'direct' as const,
              includeSpaceKnowledge: false,
              attachments: []
            },
            prompt: 'Retry.',
            model: { strategy: 'inherit' as const },
            connectorIds: [],
            permissions: [],
            artifact: {
              required: true,
              relativePath: 'artifacts/retry.md',
              kind: 'markdown'
            },
            todos: [],
            completionGate: { requireApproval: false },
            retry: { maxAttempts: 3, backoffMs: 0 },
            skip: { allowed: false, requireReason: false }
          }
        }
      ]
    }
    const failedExecution = { ...execution, status: 'failed' as const }
    const retryNodeRun = {
      ...failedNodeRun,
      id: 'node-run-1:retry:2',
      status: 'ready' as const,
      attempt: 2,
      revision: 1,
      aiRunId: undefined
    }
    workflows.get.mockResolvedValue(failedWorkflow)
    nodeRuns.get
      .mockResolvedValueOnce(failedNodeRun)
      .mockResolvedValue(retryNodeRun)
    nodeRuns.getLatestByNode.mockResolvedValue(failedNodeRun)
    manager.prepareRetry.mockResolvedValue({
      workflow: failedWorkflow,
      execution: failedExecution,
      nodeRun: retryNodeRun
    })

    await expect(
      useCase.retry({ ...command, modelProfileId: 'profile-1' })
    ).resolves.toMatchObject({
      outcome: 'applied',
      action: 'retry',
      nodeRun: { id: 'node-run-1:retry:2', attempt: 2 }
    })
    expect(executeNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-security-review',
      nodeRunId: 'node-run-1:retry:2',
      modelProfileId: 'profile-1'
    })
  })

  it('rejects retry when the configured attempt limit is reached', async () => {
    const { useCase, manager, workflow, nodeRuns, workflows } = createHarness()
    nodeRuns.get.mockResolvedValue({
      ...(await nodeRuns.get('node-run-1')),
      status: 'failed'
    })
    nodeRuns.getLatestByNode.mockResolvedValue(undefined)
    workflows.get.mockResolvedValue({
      ...workflow,
      nodes: [{ ...workflow.nodes[0], status: 'failed' }]
    })

    await expect(useCase.retry(command)).rejects.toMatchObject({
      code: 'retry_limit_reached'
    })
    expect(manager.prepareRetry).not.toHaveBeenCalled()
  })

  it('rejects recovery when the node run does not exist', async () => {
    const { useCase, nodeRuns, executeNode } = createHarness()
    nodeRuns.get.mockResolvedValue(undefined)

    await expect(useCase.resume(command)).rejects.toThrow(
      'Node run not found: node-run-1'
    )
    expect(executeNode.execute).not.toHaveBeenCalled()
  })
})
