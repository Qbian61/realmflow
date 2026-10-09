import { planWorkflowRollback } from './workflow-rollback'
import type {
  RequirementNode,
  RequirementWorkflow,
  WorkflowEdge
} from './workflow'

function node(
  id: string,
  order: number,
  status: RequirementNode['status'] = 'completed'
): RequirementNode {
  return {
    id,
    type: 'ai_generate',
    name: id,
    description: '',
    order,
    status,
    allowSkip: false
  }
}

function edge(sourceNodeId: string, targetNodeId: string): WorkflowEdge {
  return {
    id: `${sourceNodeId}--${targetNodeId}`,
    sourceNodeId,
    targetNodeId
  }
}

function workflow(
  nodes: RequirementNode[],
  edges: WorkflowEdge[],
  maxParallelism = 1
): RequirementWorkflow {
  return {
    requirementId: 'requirement-1',
    templateVersionId: 'template-version-1',
    revision: 7,
    maxParallelism,
    nodes,
    edges
  }
}

describe('workflow rollback planning', () => {
  it('collects the target and every transitive successor in a serial graph', () => {
    const result = planWorkflowRollback({
      workflow: workflow(
        [node('analysis', 0), node('design', 1), node('build', 2)],
        [edge('analysis', 'design'), edge('design', 'build')]
      ),
      targetNodeId: 'analysis'
    })

    expect(result).toMatchObject({
      targetNodeId: 'analysis',
      affectedNodeIds: ['analysis', 'design', 'build'],
      retainedNodeIds: [],
      readyNodeIds: ['analysis'],
      pendingNodeIds: ['design', 'build']
    })
  })

  it('uses stable workflow order for fork successors regardless of edge order', () => {
    const result = planWorkflowRollback({
      workflow: workflow(
        [
          node('root', 0),
          node('branch-z', 1),
          node('branch-a', 1),
          node('later', 2)
        ],
        [
          edge('root', 'later'),
          edge('root', 'branch-z'),
          edge('root', 'branch-a')
        ]
      ),
      targetNodeId: 'root'
    })

    expect(result.affectedNodeIds).toEqual([
      'root',
      'branch-a',
      'branch-z',
      'later'
    ])
    expect(result.attempts.map((attempt) => attempt.nodeId)).toEqual(
      result.affectedNodeIds
    )
  })

  it('includes a join and its descendants only once', () => {
    const result = planWorkflowRollback({
      workflow: workflow(
        [
          node('root', 0),
          node('left', 1),
          node('right', 2),
          node('join', 3),
          node('release', 4)
        ],
        [
          edge('root', 'left'),
          edge('root', 'right'),
          edge('left', 'join'),
          edge('right', 'join'),
          edge('join', 'release')
        ]
      ),
      targetNodeId: 'root'
    })

    expect(result.affectedNodeIds).toEqual([
      'root',
      'left',
      'right',
      'join',
      'release'
    ])
  })

  it('retains disconnected nodes and unrelated parallel branches unchanged', () => {
    const current = workflow(
      [
        node('root', 0),
        node('left', 1),
        node('left-child', 2),
        node('unrelated', 3, 'running'),
        node('isolated', 4, 'failed')
      ],
      [edge('root', 'left'), edge('left', 'left-child')],
      3
    )

    const result = planWorkflowRollback({
      workflow: current,
      targetNodeId: 'left'
    })

    expect(result.affectedNodeIds).toEqual(['left', 'left-child'])
    expect(result.retainedNodeIds).toEqual(['root', 'unrelated', 'isolated'])
    expect(result.retainedNodes).toEqual([
      current.nodes[0],
      current.nodes[3],
      current.nodes[4]
    ])
  })

  it('keeps the target pending when retained active nodes consume every slot', () => {
    const result = planWorkflowRollback({
      workflow: workflow(
        [
          node('target', 0, 'failed'),
          node('running', 1, 'running'),
          node('waiting', 2, 'waiting_user')
        ],
        [],
        2
      ),
      targetNodeId: 'target'
    })

    expect(result.readyNodeIds).toEqual([])
    expect(result.pendingNodeIds).toEqual(['target'])
    expect(result.attempts).toEqual([
      { nodeId: 'target', status: 'pending' }
    ])
  })

  it('admits only the target when a parallel slot is available', () => {
    const result = planWorkflowRollback({
      workflow: workflow(
        [
          node('target', 0),
          node('child', 1),
          node('running', 2, 'running')
        ],
        [edge('target', 'child')],
        2
      ),
      targetNodeId: 'target'
    })

    expect(result.attempts).toEqual([
      { nodeId: 'target', status: 'ready' },
      { nodeId: 'child', status: 'pending' }
    ])
  })

  it('rejects targets outside the workflow instance', () => {
    expect(() =>
      planWorkflowRollback({
        workflow: workflow([node('analysis', 0)], []),
        targetNodeId: 'other-instance:analysis'
      })
    ).toThrow('Workflow rollback target not found: other-instance:analysis')
  })

  it('rejects an unstarted target because rollback would have no business effect', () => {
    for (const status of ['pending', 'ready'] as const) {
      expect(() =>
        planWorkflowRollback({
          workflow: workflow([node('analysis', 0, status)], []),
          targetNodeId: 'analysis'
        })
      ).toThrow('Workflow rollback would produce no state change')
    }
  })

  it('rejects another unresolved rollback for the same target', () => {
    expect(() =>
      planWorkflowRollback({
        workflow: workflow([node('analysis', 0)], []),
        targetNodeId: 'analysis',
        unresolvedTargetNodeIds: ['other', 'analysis']
      })
    ).toThrow('Workflow rollback target already has an unresolved operation')
  })

  it('describes new attempts without mutating terminal nodes in place', () => {
    const current = workflow(
      [node('analysis', 0, 'completed'), node('design', 1, 'skipped')],
      [edge('analysis', 'design')]
    )

    const result = planWorkflowRollback({
      workflow: current,
      targetNodeId: 'analysis'
    })

    expect(current.nodes.map((item) => item.status)).toEqual([
      'completed',
      'skipped'
    ])
    expect(result.attempts).toEqual([
      { nodeId: 'analysis', status: 'ready' },
      { nodeId: 'design', status: 'pending' }
    ])
    expect(result.attempts[0]).not.toBe(current.nodes[0])
  })
})
