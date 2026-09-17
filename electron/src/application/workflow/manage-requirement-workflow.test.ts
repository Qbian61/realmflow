import { describe, expect, it } from 'vitest'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  RequirementWorkflowRepository,
  Revisioned,
  SaveResult,
  WorkflowExecutionRecord
} from '../ports/business-repositories'
import { ManageRequirementWorkflowUseCase } from './manage-requirement-workflow'

function createHarness() {
  let inTransaction = false
  let workflow: RequirementWorkflow = {
    requirementId: 'requirement-1',
    templateVersionId: 'template-v1',
    revision: 2,
    nodes: [
      {
        id: 'node-analysis',
        type: 'ai_generate',
        name: 'Analysis',
        description: '',
        order: 0,
        status: 'ready',
        allowSkip: false,
        executor: {
          kind: 'ai_generate',
          prompt: 'Analyze the requirement.',
          artifact: {
            relativePath: 'artifacts/analysis.md',
            kind: 'markdown'
          }
        }
      }
    ],
    edges: []
  }
  const execution: Revisioned<WorkflowExecutionRecord> = {
    id: 'execution-1',
    requirementId: 'requirement-1',
    status: 'created',
    currentNodeId: 'node-analysis',
    revision: 1,
    createdAt: 1,
    updatedAt: 1
  }
  const nodeRuns: Array<Revisioned<NodeRunRecord>> = [
    {
      id: 'node-run-analysis',
      executionId: execution.id,
      nodeId: 'node-analysis',
      status: 'ready',
      attempt: 1,
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
  ]
  const transactionObservations: boolean[] = []

  const workflows: RequirementWorkflowRepository = {
    get: async () => structuredClone(workflow),
    save: async (next, expectedRevision) => {
      if (workflow.revision !== expectedRevision) {
        return {
          status: 'conflict',
          entity: structuredClone(workflow)
        } satisfies SaveResult<RequirementWorkflow>
      }
      workflow = structuredClone(next)
      transactionObservations.push(inTransaction)
      return {
        status: 'saved',
        entity: structuredClone(workflow)
      } satisfies SaveResult<RequirementWorkflow>
    }
  }

  const useCase = new ManageRequirementWorkflowUseCase(
    {
      workflows,
      executions: {
        getActiveByRequirement: async () => structuredClone(execution),
        listByStatus: async () => [structuredClone(execution)],
        save: async () => {
          throw new Error('not used')
        }
      },
      nodeRuns: {
        get: async (id) =>
          structuredClone(nodeRuns.find((nodeRun) => nodeRun.id === id)),
        getLatestByNode: async (executionId, nodeId) =>
          structuredClone(
            nodeRuns.find(
              (nodeRun) =>
                nodeRun.executionId === executionId && nodeRun.nodeId === nodeId
            )
          ),
        interruptRunning: async () => 0,
        listInterrupted: async () => [],
        save: async (nodeRun, expectedRevision) => {
          expect(expectedRevision).toBe(0)
          transactionObservations.push(inTransaction)
          const saved = { ...structuredClone(nodeRun), revision: 1 }
          nodeRuns.push(saved)
          return { status: 'saved', entity: saved }
        },
        deleteByNode: async (executionId, nodeId) => {
          transactionObservations.push(inTransaction)
          const retained = nodeRuns.filter(
            (nodeRun) =>
              nodeRun.executionId !== executionId || nodeRun.nodeId !== nodeId
          )
          const deleted = nodeRuns.length - retained.length
          nodeRuns.splice(0, nodeRuns.length, ...retained)
          return deleted
        }
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
      }
    },
    () => 100,
    () => 'node-run-custom'
  )

  return {
    get workflow() {
      return workflow
    },
    nodeRuns,
    transactionObservations,
    useCase
  }
}

const customNode = {
  id: 'custom-node',
  type: 'ai_generate' as const,
  name: 'Security Review',
  description: 'Review the implementation for security risks.',
  order: 1,
  status: 'pending' as const,
  allowSkip: true,
  executor: {
    kind: 'ai_generate' as const,
    prompt: 'Review all predecessor artifacts for security risks.',
    artifact: {
      relativePath: 'artifacts/security-review.md',
      kind: 'markdown'
    }
  }
}

describe('ManageRequirementWorkflowUseCase', () => {
  it('inserts a configured node and its initial node run atomically', async () => {
    const harness = createHarness()

    const result = await harness.useCase.insertNode({
      requirementId: 'requirement-1',
      expectedRevision: 2,
      mutation: {
        node: customNode,
        afterNodeId: 'node-analysis'
      }
    })

    expect(result.workflow.nodes).toContainEqual(customNode)
    expect(result.nodeRun).toMatchObject({
      id: 'node-run-custom',
      executionId: 'execution-1',
      nodeId: 'custom-node',
      status: 'pending',
      attempt: 1,
      revision: 1,
      createdAt: 100,
      updatedAt: 100
    })
    expect(harness.transactionObservations).toEqual([true, true])
  })

  it('removes a node and all of its node runs atomically', async () => {
    const harness = createHarness()
    await harness.useCase.insertNode({
      requirementId: 'requirement-1',
      expectedRevision: 2,
      mutation: {
        node: customNode,
        afterNodeId: 'node-analysis'
      }
    })
    harness.transactionObservations.splice(
      0,
      harness.transactionObservations.length
    )

    const result = await harness.useCase.removeNode({
      requirementId: 'requirement-1',
      expectedRevision: 3,
      nodeId: customNode.id
    })

    expect(result.nodes).not.toContainEqual(
      expect.objectContaining({ id: customNode.id })
    )
    expect(harness.nodeRuns).not.toContainEqual(
      expect.objectContaining({ nodeId: customNode.id })
    )
    expect(harness.transactionObservations).toEqual([true, true])
  })
})
