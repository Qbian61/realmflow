import { describe, expect, it, vi } from 'vitest'
import type { RequirementNode } from '../../../../domain/workflow'
import { NodeCompletionGateEvaluator } from './node-completion-gate-evaluator'

const node: RequirementNode = {
  id: 'security-review',
  type: 'ai_generate',
  name: 'Security Review',
  description: '',
  order: 0,
  status: 'running',
  allowSkip: false,
  executor: {
    kind: 'ai_generate',
    prompt: 'Review the implementation.',
    artifact: {
      relativePath: 'artifacts/security-review.md',
      kind: 'markdown'
    }
  }
}

function createEvaluator(
  artifacts: Array<{
    nodeId?: string
    relativePath: string
    kind: string
    isPrimary: boolean
    checksum?: string
    byteSize?: number
    verificationReceiptId?: string
  }>,
  options: {
    requiredTodoStatuses?: Array<'pending' | 'completed'>
    optionalTodoStatuses?: Array<'pending' | 'completed'>
    requiredQuestionStatuses?: Array<'open' | 'answered' | 'dismissed'>
    approvalResult?: 'approved' | 'rejected'
    verifiedBinary?: boolean
  } = {}
) {
  return new NodeCompletionGateEvaluator({
    artifacts: {
      listByRequirement: vi.fn().mockResolvedValue(
        artifacts.map((artifact, index) => ({
          id: `artifact-${index}`,
          requirementId: 'requirement-1',
          stageId: 'analysis' as const,
          checksum: artifact.checksum ?? 'checksum',
          version: 1,
          byteSize: artifact.byteSize ?? 12,
          createdAt: 1,
          updatedAt: 1,
          revision: 1,
          ...artifact
        }))
      ),
      verifyRegisteredBinary: vi.fn().mockResolvedValue(
        options.verifiedBinary ?? false
      )
    },
    todos: {
      listByNodeRun: vi.fn().mockResolvedValue(
        [
          ...(options.requiredTodoStatuses ?? []).map((status) => ({
            status,
            required: true
          })),
          ...(options.optionalTodoStatuses ?? []).map((status) => ({
            status,
            required: false
          }))
        ].map(({ status, required }, index) => ({
            id: `todo-${index}`,
            nodeRunId: 'node-run-1',
            title: `Todo ${index}`,
            required,
            status,
            createdAt: 1,
            updatedAt: 1,
            revision: 1
          }))
      )
    },
    questions: {
      listByNodeRun: vi.fn().mockResolvedValue(
        (options.requiredQuestionStatuses ?? []).map((status, index) => ({
          id: `question-${index}`,
          nodeRunId: 'node-run-1',
          prompt: `Question ${index}`,
          required: true,
          status,
          ...(status === 'answered' ? { answer: 'Answered' } : {}),
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        }))
      )
    },
    approvals: {
      getByNodeRun: vi.fn().mockResolvedValue(
        options.approvalResult
          ? {
              nodeRunId: 'node-run-1',
              decisionId: 'decision-1',
              result: options.approvalResult,
              actorType: 'local_user',
              actorId: 'local-user',
              decidedAt: 1,
              createdAt: 1,
              updatedAt: 1,
              revision: 1
            }
          : undefined
      )
    }
  })
}

describe('NodeCompletionGateEvaluator', () => {
  it('rejects completion when the configured primary artifact is missing', async () => {
    const evaluator = createEvaluator([])

    await expect(
      evaluator.evaluate({
        requirementId: 'requirement-1',
        node,
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: node.id,
          status: 'running',
          attempt: 1,
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        },
        executionFinished: true
      })
    ).resolves.toMatchObject({
      executionFinished: true,
      requiredArtifactsValid: false,
      requiredTodosComplete: true,
      openRequiredQuestions: 0,
      approvalPassed: true,
      customGatePassed: true,
      allowed: false,
      reasons: ['required_artifact_invalid']
    })
  })

  it('accepts only a non-empty matching primary artifact from the current node', async () => {
    const evaluator = createEvaluator([
      {
        nodeId: node.id,
        relativePath: 'artifacts/security-review.md',
        kind: 'markdown',
        isPrimary: true
      }
    ])

    await expect(
      evaluator.evaluate({
        requirementId: 'requirement-1',
        node,
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: node.id,
          status: 'running',
          attempt: 1,
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        },
        executionFinished: true
      })
    ).resolves.toMatchObject({ requiredArtifactsValid: true })
  })

  it('requires a matching verified receipt and current disk checksum for documents', async () => {
    const documentNode: RequirementNode = {
      ...node,
      executor: {
        ...node.executor!,
        artifact: {
          relativePath: 'artifacts/security-review.pdf',
          kind: 'pdf'
        }
      }
    }
    const artifact = {
      nodeId: node.id,
      relativePath: 'artifacts/security-review.pdf',
      kind: 'pdf',
      isPrimary: true,
      verificationReceiptId: 'document-delivery-receipt:verify-1'
    }

    await expect(
      createEvaluator([artifact]).evaluate({
        requirementId: 'requirement-1',
        node: documentNode,
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: node.id,
          status: 'running',
          attempt: 1,
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        },
        executionFinished: true
      })
    ).resolves.toMatchObject({
      allowed: false,
      reasons: ['required_artifact_invalid']
    })

    await expect(
      createEvaluator([artifact], { verifiedBinary: true }).evaluate({
        requirementId: 'requirement-1',
        node: documentNode,
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: node.id,
          status: 'running',
          attempt: 1,
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        },
        executionFinished: true
      })
    ).resolves.toMatchObject({
      allowed: true,
      requiredArtifactsValid: true,
      reasons: []
    })
  })

  it('blocks completion while any optional todo remains unfinished', async () => {
    const evaluator = createEvaluator(
      [
        {
          nodeId: node.id,
          relativePath: 'artifacts/security-review.md',
          kind: 'markdown',
          isPrimary: true
        }
      ],
      { optionalTodoStatuses: ['pending'] }
    )

    await expect(
      evaluator.evaluate({
        requirementId: 'requirement-1',
        node,
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: node.id,
          status: 'running',
          attempt: 1,
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        },
        executionFinished: true
      })
    ).resolves.toMatchObject({
      requiredTodosComplete: false,
      allowed: false,
      reasons: ['required_todos_incomplete']
    })
  })

  it('requires the current approval record and explicit custom checkpoint result', async () => {
    const evaluator = createEvaluator([], { approvalResult: 'approved' })
    const gatedNode: RequirementNode = {
      ...node,
      type: 'approval',
      executor: undefined,
      completionGate: {
        requireApproval: true,
        customGateId: 'security-policy'
      }
    }
    const nodeRun = {
      id: 'node-run-1',
      executionId: 'execution-1',
      nodeId: gatedNode.id,
      status: 'running' as const,
      attempt: 1,
      checkpoint: {
        approvalResult: 'approved',
        customGateResults: { 'security-policy': true }
      },
      createdAt: 1,
      updatedAt: 1,
      revision: 1
    }

    await expect(
      evaluator.evaluate({
        requirementId: 'requirement-1',
        node: gatedNode,
        nodeRun,
        executionFinished: true
      })
    ).resolves.toEqual({
      executionFinished: true,
      requiredArtifactsValid: true,
      requiredTodosComplete: true,
      openRequiredQuestions: 0,
      approvalPassed: true,
      customGatePassed: true,
      allowed: true,
      reasons: []
    })

    await expect(
      evaluator.evaluate({
        requirementId: 'requirement-1',
        node: gatedNode,
        nodeRun: { ...nodeRun, checkpoint: {} },
        executionFinished: true
      })
    ).resolves.toMatchObject({
      approvalPassed: true,
      customGatePassed: false,
      allowed: false,
      reasons: ['custom_gate_not_passed']
    })
  })

  it('returns every failed gate as an ordered diagnostic reason', async () => {
    const evaluator = createEvaluator([], {
      requiredTodoStatuses: ['pending'],
      requiredQuestionStatuses: ['open'],
      approvalResult: 'rejected'
    })
    const gatedNode: RequirementNode = {
      ...node,
      type: 'approval',
      completionGate: {
        requireApproval: true,
        customGateId: 'security-policy'
      }
    }

    await expect(
      evaluator.evaluate({
        requirementId: 'requirement-1',
        node: gatedNode,
        nodeRun: {
          id: 'node-run-1',
          executionId: 'execution-1',
          nodeId: gatedNode.id,
          status: 'waiting_user',
          attempt: 1,
          checkpoint: {
            approvalResult: 'approved',
            customGateResults: { 'security-policy': false }
          },
          createdAt: 1,
          updatedAt: 1,
          revision: 1
        },
        executionFinished: false
      })
    ).resolves.toEqual({
      executionFinished: false,
      requiredArtifactsValid: false,
      requiredTodosComplete: false,
      openRequiredQuestions: 1,
      approvalPassed: false,
      customGatePassed: false,
      allowed: false,
      reasons: [
        'execution_not_finished',
        'required_artifact_invalid',
        'required_todos_incomplete',
        'required_questions_open',
        'approval_not_passed',
        'custom_gate_not_passed'
      ]
    })
  })
})
