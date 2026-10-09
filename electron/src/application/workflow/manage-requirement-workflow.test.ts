import { describe, expect, it } from 'vitest'
import type {
  RequirementWorkflow,
  WorkflowRevisionMetadata
} from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  NodeTodoRecord,
  RequirementWorkflowRepository,
  Revisioned,
  SaveResult,
  WorkflowExecutionRecord
} from '../ports/business-repositories'
import { ManageRequirementWorkflowUseCase } from './manage-requirement-workflow'

function createHarness(protectedNodeIds: string[] = []) {
  let inTransaction = false
  let workflow: RequirementWorkflow = {
    requirementId: 'requirement-1',
    templateVersionId: 'template-v1',
    revision: 2,
    maxParallelism: 1,
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
  const nodeTodos: Array<Revisioned<NodeTodoRecord>> = []
  const transactionObservations: boolean[] = []
  const revisionMetadata: WorkflowRevisionMetadata[] = []
  const protectionChecks: string[][] = []

  const workflows: RequirementWorkflowRepository = {
    get: async () => structuredClone(workflow),
    save: async (next, expectedRevision, metadata) => {
      if (workflow.revision !== expectedRevision) {
        return {
          status: 'conflict',
          entity: structuredClone(workflow)
        } satisfies SaveResult<RequirementWorkflow>
      }
      workflow = structuredClone(next)
      revisionMetadata.push(metadata)
      transactionObservations.push(inTransaction)
      return {
        status: 'saved',
        entity: structuredClone(workflow)
      } satisfies SaveResult<RequirementWorkflow>
    },
    listRevisions: async () => []
  }

  const useCase = new ManageRequirementWorkflowUseCase(
    {
      workflows,
      executions: {
        getActiveByRequirement: async () => structuredClone(execution)
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
      todos: {
        save: async (todo, expectedRevision) => {
          expect(expectedRevision).toBe(0)
          transactionObservations.push(inTransaction)
          const saved = { ...structuredClone(todo), revision: 1 }
          nodeTodos.push(saved)
          return { status: 'saved', entity: saved }
        }
      },
      nodeProtection: {
        assertUnstarted: async (_requirementId, nodeIds) => {
          protectionChecks.push([...nodeIds])
          const protectedNodeId = nodeIds.find((nodeId) =>
            protectedNodeIds.includes(nodeId)
          )
          if (protectedNodeId) {
            throw new Error(
              `Workflow node has already started and is protected: ${protectedNodeId}`
            )
          }
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
    nodeTodos,
    protectionChecks,
    revisionMetadata,
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
  configuration: {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: 'direct' as const,
      includeSpaceKnowledge: false,
      attachments: []
    },
    prompt: 'Review the implementation for security risks.',
    model: { strategy: 'inherit' as const },
    connectorIds: [],
    permissions: [],
    artifact: {
      required: true,
      relativePath: 'artifacts/security-review.md',
      kind: 'markdown'
    },
    todos: [{ title: 'Confirm security findings', required: true }],
    completionGate: { requireApproval: false },
    retry: { maxAttempts: 1, backoffMs: 0 },
    skip: { allowed: true, requireReason: false }
  },
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
    expect(harness.nodeTodos).toEqual([
      expect.objectContaining({
        id: 'node-run-custom:todo:1',
        nodeRunId: 'node-run-custom',
        title: 'Confirm security findings',
        required: true,
        status: 'pending',
        revision: 1
      })
    ])
    expect(harness.transactionObservations).toEqual([true, true, true])
    expect(harness.revisionMetadata).toEqual([
      { reason: 'node_inserted', triggerSource: 'user' }
    ])
  })

  it('updates editable node content with user revision metadata', async () => {
    const harness = createHarness()

    const result = await harness.useCase.updateNode({
      requirementId: 'requirement-1',
      expectedRevision: 2,
      nodeId: 'node-analysis',
      changes: {
        name: '  Discovery  ',
        description: 'Clarify scope before implementation.',
        allowSkip: true
      }
    })

    expect(result).toMatchObject({
      revision: 3,
      nodes: [
        {
          id: 'node-analysis',
          name: 'Discovery',
          description: 'Clarify scope before implementation.',
          status: 'ready',
          allowSkip: true
        }
      ]
    })
    expect(harness.transactionObservations).toEqual([true])
    expect(harness.revisionMetadata).toEqual([
      { reason: 'node_updated', triggerSource: 'user' }
    ])
    expect(harness.nodeRuns[0]).toMatchObject({
      nodeId: 'node-analysis',
      status: 'ready',
      revision: 1
    })
  })

  it('does not persist a node update when the workflow revision is stale', async () => {
    const harness = createHarness()

    await expect(
      harness.useCase.updateNode({
        requirementId: 'requirement-1',
        expectedRevision: 1,
        nodeId: 'node-analysis',
        changes: { name: 'Stale change' }
      })
    ).rejects.toThrow('Requirement workflow revision conflict')

    expect(harness.workflow.nodes[0].name).toBe('Analysis')
    expect(harness.revisionMetadata).toEqual([])
    expect(harness.transactionObservations).toEqual([])
  })

  it('rejects updating a node with persisted execution evidence before saving', async () => {
    const harness = createHarness(['node-analysis'])

    await expect(
      harness.useCase.updateNode({
        requirementId: 'requirement-1',
        expectedRevision: 2,
        nodeId: 'node-analysis',
        changes: { name: 'Unsafe rewrite' }
      })
    ).rejects.toThrow(
      'Workflow node has already started and is protected: node-analysis'
    )

    expect(harness.protectionChecks).toEqual([['node-analysis']])
    expect(harness.workflow.nodes[0].name).toBe('Analysis')
    expect(harness.revisionMetadata).toEqual([])
    expect(harness.transactionObservations).toEqual([])
  })

  it('rejects insertion beside a protected anchor before creating a node run', async () => {
    const harness = createHarness(['node-analysis'])

    await expect(
      harness.useCase.insertNode({
        requirementId: 'requirement-1',
        expectedRevision: 2,
        mutation: {
          node: customNode,
          afterNodeId: 'node-analysis'
        }
      })
    ).rejects.toThrow(
      'Workflow node has already started and is protected: node-analysis'
    )

    expect(harness.protectionChecks).toEqual([['node-analysis']])
    expect(harness.nodeRuns).toHaveLength(1)
    expect(harness.revisionMetadata).toEqual([])
    expect(harness.transactionObservations).toEqual([])
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
    expect(harness.revisionMetadata).toEqual([
      { reason: 'node_inserted', triggerSource: 'user' },
      { reason: 'node_removed', triggerSource: 'user' }
    ])
  })

  it('preserves node run history when persisted evidence protects removal', async () => {
    const harness = createHarness(['custom-node'])
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

    await expect(
      harness.useCase.removeNode({
        requirementId: 'requirement-1',
        expectedRevision: 3,
        nodeId: customNode.id
      })
    ).rejects.toThrow(
      'Workflow node has already started and is protected: custom-node'
    )

    expect(harness.workflow.nodes).toContainEqual(customNode)
    expect(harness.nodeRuns).toContainEqual(
      expect.objectContaining({ nodeId: customNode.id })
    )
    expect(harness.transactionObservations).toEqual([])
  })
})
