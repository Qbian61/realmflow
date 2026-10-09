import type {
  RequirementWorkflow,
  WorkflowRevisionMetadata
} from '../../../../domain/workflow'
import type {
  RequirementWorkflowRepository,
  SaveResult
} from '../ports/business-repositories'
import { WorkflowRuntime } from './workflow-runtime'

class MemoryWorkflowRepository implements RequirementWorkflowRepository {
  readonly revisionMetadata: WorkflowRevisionMetadata[] = []
  saveCalls = 0

  constructor(public workflow: RequirementWorkflow) {}

  async get(): Promise<RequirementWorkflow> {
    return structuredClone(this.workflow)
  }

  async save(
    workflow: RequirementWorkflow,
    expectedRevision: number,
    metadata: WorkflowRevisionMetadata
  ): Promise<SaveResult<RequirementWorkflow>> {
    this.saveCalls += 1
    if (expectedRevision !== this.workflow.revision) {
      return { status: 'conflict', entity: structuredClone(this.workflow) }
    }
    this.revisionMetadata.push(metadata)
    this.workflow = { ...structuredClone(workflow), revision: expectedRevision + 1 }
    return { status: 'saved', entity: structuredClone(this.workflow) }
  }

  async listRevisions() {
    return []
  }
}

function createWorkflow(): RequirementWorkflow {
  return {
    requirementId: 'requirement-1',
    templateVersionId: 'template-v1',
    revision: 2,
    maxParallelism: 1,
    nodes: [
      {
        id: 'analysis',
        type: 'ai_generate',
        name: 'Analysis',
        description: '',
        order: 0,
        status: 'running',
        allowSkip: false
      },
      {
        id: 'design',
        type: 'ai_generate',
        name: 'Design',
        description: '',
        order: 1,
        status: 'pending',
        allowSkip: false
      },
      {
        id: 'review',
        type: 'approval',
        name: 'Review',
        description: '',
        order: 2,
        status: 'pending',
        allowSkip: false
      }
    ],
    edges: [
      { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' },
      { id: 'edge-2', sourceNodeId: 'analysis', targetNodeId: 'review' }
    ]
  }
}

function createEditableWorkflow(): RequirementWorkflow {
  const current = createWorkflow()
  return {
    ...current,
    nodes: current.nodes.map((node, index) => ({
      ...node,
      status: index === 0 ? 'ready' : 'pending'
    }))
  }
}

describe('WorkflowRuntime', () => {
  it('pauses running nodes and resumes only user-paused nodes', async () => {
    const repository = new MemoryWorkflowRepository(createWorkflow())
    const runtime = new WorkflowRuntime(repository)

    const paused = await runtime.pauseNode({
      requirementId: 'requirement-1',
      nodeId: 'analysis',
      expectedRevision: 2
    })
    expect(paused.nodes[0].status).toBe('paused')
    expect(repository.revisionMetadata).toEqual([
      { reason: 'node_status_changed', triggerSource: 'system' }
    ])

    const resumed = await runtime.resumeNode({
      requirementId: 'requirement-1',
      nodeId: 'analysis',
      expectedRevision: 3
    })
    expect(resumed.nodes[0].status).toBe('ready')
  })

  it('does not complete a node until every completion gate passes', async () => {
    const repository = new MemoryWorkflowRepository(createWorkflow())
    const runtime = new WorkflowRuntime(repository)

    await expect(
      runtime.completeNode({
        requirementId: 'requirement-1',
        nodeId: 'analysis',
        expectedRevision: 2,
        gates: {
          executionFinished: true,
          requiredArtifactsValid: true,
          requiredTodosComplete: false,
          openRequiredQuestions: 0,
          approvalPassed: true,
          customGatePassed: true
        }
      })
    ).rejects.toThrow('Node completion gates are not satisfied')
  })

  it('completes the current node and selects only the first ready node', async () => {
    const repository = new MemoryWorkflowRepository(createWorkflow())
    const runtime = new WorkflowRuntime(repository)

    const result = await runtime.completeNode({
      requirementId: 'requirement-1',
      nodeId: 'analysis',
      expectedRevision: 2,
      gates: {
        executionFinished: true,
        requiredArtifactsValid: true,
        requiredTodosComplete: true,
        openRequiredQuestions: 0,
        approvalPassed: true,
        customGatePassed: true
      }
    })

    expect(result.nodes.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'analysis', status: 'completed' },
      { id: 'design', status: 'ready' },
      { id: 'review', status: 'pending' }
    ])
    expect(result.revision).toBe(3)
  })

  it('completes one branch and admits every stable candidate that fits', async () => {
    const current = createWorkflow()
    const repository = new MemoryWorkflowRepository({
      ...current,
      maxParallelism: 2
    })
    const runtime = new WorkflowRuntime(repository)

    const result = await runtime.completeNode({
      requirementId: 'requirement-1',
      nodeId: 'analysis',
      expectedRevision: 2,
      gates: {
        executionFinished: true,
        requiredArtifactsValid: true,
        requiredTodosComplete: true,
        openRequiredQuestions: 0,
        approvalPassed: true,
        customGatePassed: true
      }
    })

    expect(result.nodes.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'analysis', status: 'completed' },
      { id: 'design', status: 'ready' },
      { id: 'review', status: 'ready' }
    ])
  })

  it('persists edge and order revisions with user metadata', async () => {
    const repository = new MemoryWorkflowRepository(createEditableWorkflow())
    const protectionChecks: string[][] = []
    const runtime = new WorkflowRuntime(repository, {
      assertUnstarted: async (_requirementId, nodeIds) => {
        protectionChecks.push([...nodeIds])
      }
    })

    const edgeUpdated = await runtime.updateEdge({
      requirementId: 'requirement-1',
      expectedRevision: 2,
      edgeId: 'edge-2',
      edge: {
        id: 'ignored-edge-id',
        sourceNodeId: 'design',
        targetNodeId: 'review'
      }
    })
    const reordered = await runtime.reorder({
      requirementId: 'requirement-1',
      expectedRevision: edgeUpdated.revision,
      orderedNodeIds: ['analysis', 'review', 'design']
    })

    expect(reordered.revision).toBe(4)
    expect(repository.revisionMetadata).toEqual([
      { reason: 'edge_updated', triggerSource: 'user' },
      { reason: 'nodes_reordered', triggerSource: 'user' }
    ])
    expect(protectionChecks).toEqual([
      ['analysis', 'review', 'design'],
      ['design', 'review']
    ])
  })

  it('does not persist an unchanged topology command', async () => {
    const repository = new MemoryWorkflowRepository(createEditableWorkflow())
    const protectionChecks: string[][] = []
    const runtime = new WorkflowRuntime(repository, {
      assertUnstarted: async (_requirementId, nodeIds) => {
        protectionChecks.push([...nodeIds])
      }
    })

    const result = await runtime.updateEdge({
      requirementId: 'requirement-1',
      expectedRevision: 2,
      edgeId: 'edge-2',
      edge: {
        id: 'replacement-command-id',
        sourceNodeId: 'analysis',
        targetNodeId: 'review'
      }
    })

    expect(result.revision).toBe(2)
    expect(repository.saveCalls).toBe(0)
    expect(repository.revisionMetadata).toEqual([])
    expect(protectionChecks).toEqual([])
  })

  it('rejects topology changes with persisted started evidence before saving', async () => {
    const repository = new MemoryWorkflowRepository(createEditableWorkflow())
    const runtime = new WorkflowRuntime(repository, {
      assertUnstarted: async (_requirementId, nodeIds) => {
        const protectedNodeId = nodeIds.find((id) => id === 'design')
        if (protectedNodeId) {
          throw new Error(
            `Workflow node has already started and is protected: ${protectedNodeId}`
          )
        }
      }
    })

    await expect(
      runtime.updateEdge({
        requirementId: 'requirement-1',
        expectedRevision: 2,
        edgeId: 'edge-2',
        edge: {
          id: 'edge-2',
          sourceNodeId: 'design',
          targetNodeId: 'review'
        }
      })
    ).rejects.toThrow(
      'Workflow node has already started and is protected: design'
    )

    await expect(
      runtime.reorder({
        requirementId: 'requirement-1',
        expectedRevision: 2,
        orderedNodeIds: ['analysis', 'review', 'design']
      })
    ).rejects.toThrow(
      'Workflow node has already started and is protected: design'
    )
    expect(repository.saveCalls).toBe(0)
  })
})
