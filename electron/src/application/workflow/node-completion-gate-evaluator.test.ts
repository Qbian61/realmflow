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
  }>
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
      approvalPassed: true,
      customGatePassed: true
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

  it('requires explicit checkpoint results for configured approval and custom gates', async () => {
    const evaluator = createEvaluator([])
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
      approvalPassed: true,
      customGatePassed: true
    })

    await expect(
      evaluator.evaluate({
        requirementId: 'requirement-1',
        node: gatedNode,
        nodeRun: { ...nodeRun, checkpoint: {} },
        executionFinished: true
      })
    ).resolves.toMatchObject({
      approvalPassed: false,
      customGatePassed: false
    })
  })
})
