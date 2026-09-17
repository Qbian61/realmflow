import { describe, expect, it, vi } from 'vitest'
import { ResolveNodeGateUseCase } from './resolve-node-gate'

function createHarness() {
  let nodeRun = {
    id: 'node-run-approval',
    executionId: 'execution-1',
    nodeId: 'approval',
    status: 'ready' as const,
    attempt: 1,
    checkpoint: {
      customGateResults: { 'security-policy': true }
    },
    revision: 2,
    createdAt: 1,
    updatedAt: 1
  }
  const workflow = {
    requirementId: 'requirement-1',
    revision: 4,
    nodes: [
      {
        id: 'approval',
        type: 'approval' as const,
        name: 'Release approval',
        description: '',
        order: 0,
        status: 'ready' as const,
        allowSkip: false,
        completionGate: {
          requireApproval: true,
          customGateId: 'security-policy'
        }
      }
    ],
    edges: []
  }
  const completeNode = vi.fn().mockResolvedValue({
    workflow: {
      ...workflow,
      revision: 5,
      nodes: [{ ...workflow.nodes[0], status: 'completed' }]
    }
  })
  const drain = vi.fn().mockResolvedValue(undefined)
  const useCase = new ResolveNodeGateUseCase(
    {
      requirements: {
        get: vi.fn().mockResolvedValue({
          id: 'requirement-1',
          revision: 3
        })
      },
      workflows: {
        get: vi.fn().mockResolvedValue(workflow)
      },
      nodeRuns: {
        get: vi.fn().mockImplementation(async () => structuredClone(nodeRun)),
        save: vi.fn().mockImplementation(async (entity, expectedRevision) => {
          if (nodeRun.revision !== expectedRevision) {
            return { status: 'conflict', entity: structuredClone(nodeRun) }
          }
          nodeRun = {
            ...structuredClone(entity),
            revision: expectedRevision + 1
          }
          return { status: 'saved', entity: structuredClone(nodeRun) }
        })
      },
      unitOfWork: {
        execute: async (operation) => operation()
      },
      evaluator: {
        evaluate: vi.fn().mockResolvedValue({
          executionFinished: true,
          requiredArtifactsValid: true,
          approvalPassed: true,
          customGatePassed: true
        })
      },
      manager: { completeNode },
      worker: { drain }
    },
    () => 100
  )
  return { completeNode, drain, getNodeRun: () => nodeRun, useCase, workflow }
}

describe('ResolveNodeGateUseCase', () => {
  it('records approval with CAS and completes the node through evaluated gates', async () => {
    const { completeNode, drain, getNodeRun, useCase } = createHarness()

    await useCase.execute({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-approval',
      expectedNodeRunRevision: 2,
      gate: { kind: 'approval', result: 'approved' }
    })

    expect(getNodeRun()).toMatchObject({
      checkpoint: {
        approvalResult: 'approved',
        customGateResults: { 'security-policy': true }
      },
      revision: 3,
      updatedAt: 100
    })
    expect(completeNode).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-approval',
      expectedNodeRunRevision: 3,
      expectedWorkflowRevision: 4,
      expectedRequirementRevision: 3,
      executionFinished: true,
      requiredArtifactsValid: true,
      approvalPassed: true,
      customGatePassed: true
    })
    expect(drain).toHaveBeenCalledOnce()
  })

  it('records a negative gate result without completing the node', async () => {
    const { completeNode, drain, getNodeRun, useCase, workflow } = createHarness()

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-approval',
        expectedNodeRunRevision: 2,
        gate: {
          kind: 'custom',
          gateId: 'security-policy',
          passed: false
        }
      })
    ).resolves.toEqual(workflow)

    expect(getNodeRun().checkpoint).toMatchObject({
      customGateResults: { 'security-policy': false }
    })
    expect(completeNode).not.toHaveBeenCalled()
    expect(drain).not.toHaveBeenCalled()
  })

  it('rejects gate writes that are not configured on the node', async () => {
    const { getNodeRun, useCase } = createHarness()

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-approval',
        expectedNodeRunRevision: 2,
        gate: { kind: 'custom', gateId: 'unknown-policy', passed: true }
      })
    ).rejects.toThrow('Workflow node does not configure custom gate: unknown-policy')

    expect(getNodeRun().revision).toBe(2)
  })
})
