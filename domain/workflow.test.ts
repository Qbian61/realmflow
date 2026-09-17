import {
  getReadyNodeIds,
  instantiateRequirementWorkflow,
  insertRequirementNode,
  reorderRequirementNodes,
  removeRequirementNode,
  updateRequirementEdge,
  validateWorkflow,
  type RequirementNode,
  type RequirementWorkflow
} from './workflow'

function node(
  id: string,
  order: number,
  status: RequirementNode['status'] = 'pending'
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

function workflow(
  nodes: RequirementNode[],
  edges: RequirementWorkflow['edges']
): RequirementWorkflow {
  return {
    requirementId: 'requirement-1',
    templateVersionId: 'template-version-1',
    revision: 0,
    nodes,
    edges
  }
}

describe('requirement workflow', () => {
  it('creates an independently editable instance from a template snapshot', () => {
    const instance = instantiateRequirementWorkflow(
      {
        id: 'template-v1',
        nodes: [
          {
            id: 'template-analysis',
            stableKey: 'analysis',
            type: 'ai_generate',
            name: 'Analysis',
            description: '',
            order: 0,
            allowSkip: false
          },
          {
            id: 'template-design',
            stableKey: 'design',
            type: 'ai_generate',
            name: 'Design',
            description: '',
            order: 1,
            allowSkip: false
          }
        ],
        edges: [
          {
            id: 'template-edge',
            sourceNodeId: 'template-analysis',
            targetNodeId: 'template-design'
          }
        ]
      },
      'requirement-1'
    )

    expect(instance).toMatchObject({
      requirementId: 'requirement-1',
      templateVersionId: 'template-v1',
      revision: 0,
      nodes: [
        { id: 'requirement-1:analysis', status: 'ready' },
        { id: 'requirement-1:design', status: 'pending' }
      ],
      edges: [
        {
          sourceNodeId: 'requirement-1:analysis',
          targetNodeId: 'requirement-1:design'
        }
      ]
    })
  })

  it('rejects cyclic workflows', () => {
    const result = validateWorkflow(
      workflow(
        [node('analysis', 0), node('design', 1)],
        [
          { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' },
          { id: 'edge-2', sourceNodeId: 'design', targetNodeId: 'analysis' }
        ]
      )
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Workflow must be acyclic')
  })

  it('inserts a node between connected pending nodes', () => {
    const original = workflow(
      [node('analysis', 0), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    const updated = insertRequirementNode(original, {
      node: node('review', 1),
      afterNodeId: 'analysis',
      beforeNodeId: 'design'
    })

    expect(updated.revision).toBe(1)
    expect(updated.nodes.map((item) => item.id)).toEqual([
      'analysis',
      'review',
      'design'
    ])
    expect(updated.edges).toEqual([
      { id: 'analysis--review', sourceNodeId: 'analysis', targetNodeId: 'review' },
      { id: 'review--design', sourceNodeId: 'review', targetNodeId: 'design' }
    ])
    expect(validateWorkflow(updated).valid).toBe(true)
  })

  it('removes a pending node and reconnects its predecessor and successor', () => {
    const original = workflow(
      [node('analysis', 0), node('review', 1), node('design', 2)],
      [
        { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'review' },
        { id: 'edge-2', sourceNodeId: 'review', targetNodeId: 'design' }
      ]
    )

    const updated = removeRequirementNode(original, 'review')

    expect(updated.revision).toBe(1)
    expect(updated.nodes.map((item) => item.id)).toEqual(['analysis', 'design'])
    expect(updated.edges).toEqual([
      { id: 'analysis--design', sourceNodeId: 'analysis', targetNodeId: 'design' }
    ])
  })

  it('does not allow completed nodes to be removed or rewritten by insertion', () => {
    const completed = workflow(
      [node('analysis', 0, 'completed'), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    expect(() => removeRequirementNode(completed, 'analysis')).toThrow(
      'Completed workflow nodes are immutable'
    )
    expect(() =>
      insertRequirementNode(completed, {
        node: node('review', 1),
        afterNodeId: 'analysis',
        beforeNodeId: 'design'
      })
    ).toThrow('Completed workflow nodes are immutable')
  })

  it('returns ready nodes in workflow order when every predecessor is complete', () => {
    const current = workflow(
      [
        node('analysis', 0, 'completed'),
        node('design', 2),
        node('research', 1),
        node('release', 3)
      ],
      [
        { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' },
        { id: 'edge-2', sourceNodeId: 'analysis', targetNodeId: 'research' },
        { id: 'edge-3', sourceNodeId: 'design', targetNodeId: 'release' },
        { id: 'edge-4', sourceNodeId: 'research', targetNodeId: 'release' }
      ]
    )

    expect(getReadyNodeIds(current)).toEqual(['research', 'design'])
  })

  it('updates edges only when the resulting topology remains valid', () => {
    const original = workflow(
      [node('analysis', 0), node('design', 1), node('testing', 2)],
      [
        { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' },
        { id: 'edge-2', sourceNodeId: 'design', targetNodeId: 'testing' }
      ]
    )

    const updated = updateRequirementEdge(original, 'edge-2', {
      id: 'edge-2',
      sourceNodeId: 'analysis',
      targetNodeId: 'testing'
    })

    expect(updated.revision).toBe(1)
    expect(updated.edges[1]).toEqual({
      id: 'edge-2',
      sourceNodeId: 'analysis',
      targetNodeId: 'testing'
    })
    expect(() =>
      updateRequirementEdge(original, 'edge-2', {
        id: 'edge-2',
        sourceNodeId: 'design',
        targetNodeId: 'analysis'
      })
    ).toThrow('Workflow must be acyclic')
  })

  it('reorders pending nodes but preserves completed node positions', () => {
    const original = workflow(
      [
        node('analysis', 0, 'completed'),
        node('design', 1),
        node('testing', 2)
      ],
      [
        { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' },
        { id: 'edge-2', sourceNodeId: 'analysis', targetNodeId: 'testing' }
      ]
    )

    expect(
      reorderRequirementNodes(original, ['analysis', 'testing', 'design']).nodes.map(
        ({ id }) => id
      )
    ).toEqual(['analysis', 'testing', 'design'])
    expect(() =>
      reorderRequirementNodes(original, ['design', 'analysis', 'testing'])
    ).toThrow('Completed workflow nodes are immutable')
  })
})
