import { describe, expect, it, vi } from 'vitest'
import { NodeCompletionGateError } from './node-completion-gate-evaluator'
import { ResolveNodeGateUseCase } from './resolve-node-gate'

function createHarness(options: { completionBlocked?: boolean } = {}) {
  let inTransaction = false
  let completionInTransaction = false
  let approval:
    | {
        nodeRunId: string
        decisionId: string
        result: 'approved' | 'rejected'
        actorType: 'local_user'
        actorId: string
        note?: string
        revision: number
        createdAt: number
        updatedAt: number
        decidedAt: number
      }
    | undefined
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
  const completeNodeInTransaction = vi.fn().mockImplementation(async () => {
    completionInTransaction = inTransaction
    if (options.completionBlocked) {
      throw new NodeCompletionGateError({
        executionFinished: true,
        requiredArtifactsValid: false,
        requiredTodosComplete: true,
        openRequiredQuestions: 0,
        approvalPassed: true,
        customGatePassed: true,
        allowed: false,
        reasons: ['required_artifact_invalid']
      })
    }
    return {
      workflow: {
        ...workflow,
        revision: 5,
        nodes: [{ ...workflow.nodes[0], status: 'completed' as const }]
      },
      nodeRun,
      requirementCompleted: false,
      gates: {
        executionFinished: true,
        requiredArtifactsValid: true,
        requiredTodosComplete: true,
        openRequiredQuestions: 0,
        approvalPassed: true,
        customGatePassed: true,
        allowed: true,
        reasons: []
      }
    }
  })
  const finalizeNodeCompletion = vi.fn().mockResolvedValue(false)
  const decideApproval = vi.fn().mockImplementation(async (input) => {
    approval = {
      nodeRunId: input.nodeRunId,
      decisionId: input.decisionId,
      result: input.result,
      actorType: input.actorType,
      actorId: input.actorId,
      ...(input.note ? { note: input.note } : {}),
      revision: input.expectedRevision + 1,
      createdAt: input.decidedAt,
      updatedAt: input.decidedAt,
      decidedAt: input.decidedAt
    }
    return { status: 'saved' as const, entity: approval }
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
      approvals: {
        getByNodeRun: vi.fn().mockImplementation(async () => approval),
        decide: decideApproval
      },
      unitOfWork: {
        execute: async (operation) => {
          inTransaction = true
          try {
            return await operation()
          } finally {
            inTransaction = false
          }
        }
      },
      manager: {
        completeNodeInTransaction,
        finalizeNodeCompletion
      },
      worker: { drain }
    },
    () => 100
  )
  return {
    completeNodeInTransaction,
    completionWasInTransaction: () => completionInTransaction,
    decideApproval,
    drain,
    finalizeNodeCompletion,
    getNodeRun: () => nodeRun,
    useCase,
    workflow
  }
}

describe('ResolveNodeGateUseCase', () => {
  it('records approval with CAS and completes the node through evaluated gates', async () => {
    const {
      completeNodeInTransaction,
      completionWasInTransaction,
      decideApproval,
      drain,
      getNodeRun,
      useCase
    } = createHarness()

    await useCase.execute({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-approval',
      expectedNodeRunRevision: 2,
      gate: {
        kind: 'approval',
        decisionId: 'decision-1',
        expectedApprovalRevision: 0,
        result: 'approved',
        note: 'Ready to release'
      }
    })

    expect(decideApproval).toHaveBeenCalledWith({
      nodeRunId: 'node-run-approval',
      decisionId: 'decision-1',
      expectedRevision: 0,
      result: 'approved',
      actorType: 'local_user',
      actorId: 'local-user',
      note: 'Ready to release',
      decidedAt: 100
    })
    expect(getNodeRun()).toMatchObject({
      checkpoint: {
        approvalResult: 'approved',
        customGateResults: { 'security-policy': true }
      },
      revision: 3,
      updatedAt: 100
    })
    expect(completeNodeInTransaction).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-approval',
      expectedNodeRunRevision: 3,
      expectedWorkflowRevision: 4,
      expectedRequirementRevision: 3,
      executionFinished: true
    })
    expect(completionWasInTransaction()).toBe(true)
    expect(drain).toHaveBeenCalledOnce()
  })

  it('records a rejected approval without completing the node', async () => {
    const {
      completeNodeInTransaction,
      decideApproval,
      drain,
      getNodeRun,
      useCase,
      workflow
    } = createHarness()

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-approval',
        expectedNodeRunRevision: 2,
        gate: {
          kind: 'approval',
          decisionId: 'decision-rejected',
          expectedApprovalRevision: 0,
          result: 'rejected',
          note: 'Needs evidence'
        }
      })
    ).resolves.toEqual(workflow)

    expect(decideApproval).toHaveBeenCalledOnce()
    expect(getNodeRun()).toMatchObject({
      checkpoint: {
        approvalResult: 'rejected',
        customGateResults: { 'security-policy': true }
      },
      revision: 3
    })
    expect(completeNodeInTransaction).not.toHaveBeenCalled()
    expect(drain).not.toHaveBeenCalled()
  })

  it('treats an identical approval decision retry as a no-op', async () => {
    const {
      completeNodeInTransaction,
      decideApproval,
      getNodeRun,
      useCase
    } = createHarness()
    const command = {
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-approval',
      expectedNodeRunRevision: 2,
      gate: {
        kind: 'approval' as const,
        decisionId: 'decision-retry',
        expectedApprovalRevision: 0,
        result: 'approved' as const,
        note: 'Ready to release'
      }
    }

    await useCase.execute(command)
    await useCase.execute(command)

    expect(decideApproval).toHaveBeenCalledOnce()
    expect(completeNodeInTransaction).toHaveBeenCalledOnce()
    expect(getNodeRun().revision).toBe(3)
  })

  it('records a negative gate result without completing the node', async () => {
    const { completeNodeInTransaction, drain, getNodeRun, useCase, workflow } =
      createHarness()

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
    expect(completeNodeInTransaction).not.toHaveBeenCalled()
    expect(drain).not.toHaveBeenCalled()
  })

  it('completes a positive custom gate in the decision transaction', async () => {
    const {
      completeNodeInTransaction,
      completionWasInTransaction,
      drain,
      useCase
    } = createHarness()

    await useCase.execute({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-approval',
      expectedNodeRunRevision: 2,
      gate: {
        kind: 'custom',
        gateId: 'security-policy',
        passed: true
      }
    })

    expect(completeNodeInTransaction).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-approval',
      expectedNodeRunRevision: 3,
      expectedWorkflowRevision: 4,
      expectedRequirementRevision: 3,
      executionFinished: true
    })
    expect(completionWasInTransaction()).toBe(true)
    expect(drain).toHaveBeenCalledOnce()
  })

  it('commits a positive decision without completion when another gate blocks', async () => {
    const {
      completeNodeInTransaction,
      decideApproval,
      drain,
      getNodeRun,
      useCase,
      workflow
    } = createHarness({ completionBlocked: true })

    await expect(
      useCase.execute({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-approval',
        expectedNodeRunRevision: 2,
        gate: {
          kind: 'approval',
          decisionId: 'decision-blocked',
          expectedApprovalRevision: 0,
          result: 'approved'
        }
      })
    ).resolves.toEqual(workflow)

    expect(decideApproval).toHaveBeenCalledOnce()
    expect(getNodeRun().revision).toBe(3)
    expect(completeNodeInTransaction).toHaveBeenCalledOnce()
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
