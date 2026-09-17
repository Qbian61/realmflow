import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  RequirementWorkflowRepository,
  SaveResult
} from '../ports/business-repositories'
import { WorkflowRuntime } from './workflow-runtime'

class MemoryWorkflowRepository implements RequirementWorkflowRepository {
  constructor(public workflow: RequirementWorkflow) {}

  async get(): Promise<RequirementWorkflow> {
    return structuredClone(this.workflow)
  }

  async save(
    workflow: RequirementWorkflow,
    expectedRevision: number
  ): Promise<SaveResult<RequirementWorkflow>> {
    if (expectedRevision !== this.workflow.revision) {
      return { status: 'conflict', entity: structuredClone(this.workflow) }
    }
    this.workflow = { ...structuredClone(workflow), revision: expectedRevision + 1 }
    return { status: 'saved', entity: structuredClone(this.workflow) }
  }
}

function createWorkflow(): RequirementWorkflow {
  return {
    requirementId: 'requirement-1',
    templateVersionId: 'template-v1',
    revision: 2,
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
})
