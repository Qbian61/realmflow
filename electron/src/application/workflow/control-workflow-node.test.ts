import { describe, expect, it, vi } from 'vitest'
import { ControlWorkflowNodeUseCase } from './control-workflow-node'

const command = {
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1',
  expectedWorkflowRevision: 4,
  expectedNodeRunRevision: 2
}

function createHarness() {
  const workflow = {
    requirementId: 'requirement-1',
    templateVersionId: 'builtin-sdlc-v1',
    revision: 5,
    nodes: [],
    edges: []
  }
  const manager = {
    pauseNode: vi.fn().mockResolvedValue(undefined),
    resumeNode: vi.fn().mockResolvedValue(undefined)
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
    })
  }
  const workflows = {
    get: vi.fn().mockResolvedValue(workflow)
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
    cancel,
    executeNode,
    useCase: new ControlWorkflowNodeUseCase({
      manager,
      nodeRuns,
      workflows,
      cancel,
      executeNode
    }),
    workflow
  }
}

describe('ControlWorkflowNodeUseCase', () => {
  it('pauses the node before cancelling its active AI run', async () => {
    const { useCase, manager, cancel, workflow } = createHarness()

    await expect(useCase.pause(command)).resolves.toEqual(workflow)

    expect(manager.pauseNode).toHaveBeenCalledWith(command)
    expect(cancel.execute).toHaveBeenCalledWith('ai-run-1')
    expect(manager.pauseNode.mock.invocationCallOrder[0]).toBeLessThan(
      cancel.execute.mock.invocationCallOrder[0]
    )
  })

  it('resumes the node with a new AI run and selected model', async () => {
    const { useCase, manager, executeNode, workflow } = createHarness()

    await expect(
      useCase.resume({ ...command, modelProfileId: 'profile-1' })
    ).resolves.toEqual(workflow)

    expect(manager.resumeNode).toHaveBeenCalledWith(command)
    expect(executeNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-security-review',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1'
    })
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
