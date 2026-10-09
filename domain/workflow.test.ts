import {
  createWorkflowTopologyDiff,
  getWorkflowExecutionProjection,
  getReadyNodeIds,
  getStableReadyNodeId,
  getStableReadyNodeIds,
  instantiateRequirementWorkflow,
  insertRequirementNode,
  reorderRequirementNodes,
  removeRequirementNode,
  setWorkflowParallelism,
  updateRequirementEdge,
  updateRequirementNode,
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
  edges: RequirementWorkflow['edges'],
  maxParallelism = 1
): RequirementWorkflow {
  return {
    requirementId: 'requirement-1',
    templateVersionId: 'template-version-1',
    revision: 0,
    maxParallelism,
    nodes,
    edges
  } as RequirementWorkflow
}

describe('requirement workflow', () => {
  it('describes initial workflow creation as added topology', () => {
    const created = workflow(
      [node('analysis', 0, 'ready'), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    expect(createWorkflowTopologyDiff(undefined, created)).toEqual({
      addedNodeIds: ['analysis', 'design'],
      removedNodeIds: [],
      updatedNodeIds: [],
      reorderedNodeIds: [],
      addedEdgeIds: ['edge-1'],
      removedEdgeIds: [],
      updatedEdgeIds: []
    })
  })

  it('describes node, edge, and order changes with stable identifiers', () => {
    const previous = workflow(
      [node('analysis', 0, 'ready'), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )
    const updated = workflow(
      [
        { ...node('design', 0), name: 'Detailed Design' },
        node('testing', 1)
      ],
      [{ id: 'edge-1', sourceNodeId: 'design', targetNodeId: 'testing' }]
    )

    expect(createWorkflowTopologyDiff(previous, updated)).toEqual({
      addedNodeIds: ['testing'],
      removedNodeIds: ['analysis'],
      updatedNodeIds: ['design'],
      reorderedNodeIds: ['design'],
      addedEdgeIds: [],
      removedEdgeIds: [],
      updatedEdgeIds: ['edge-1']
    })
  })

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
      maxParallelism: 1,
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

  it('deeply isolates node configuration and edges from the template snapshot', () => {
    const template = {
      id: 'template-v1',
      nodes: [
        {
          id: 'template-analysis',
          stableKey: 'analysis',
          type: 'ai_generate' as const,
          name: 'Analysis',
          description: '',
          order: 0,
          allowSkip: true,
          configuration: {
            input: {
              includeRequirementBody: true,
              predecessorArtifacts: 'none' as const,
              includeSpaceKnowledge: true,
              attachments: ['brief.md']
            },
            prompt: 'Analyze the requirement.',
            model: { strategy: 'fixed' as const, profileId: 'model-1' },
            connectorIds: ['docs'],
            permissions: [
              {
                capability: 'filesystem.read' as const,
                scope: 'requirement' as const
              }
            ],
            artifact: {
              required: true,
              relativePath: 'analysis.md',
              kind: 'markdown'
            },
            todos: [{ title: 'Review sources', required: true }],
            completionGate: {
              requireApproval: true,
              customGateId: 'gate-1'
            },
            retry: { maxAttempts: 2, backoffMs: 1000 },
            skip: { allowed: true, requireReason: true }
          },
          executor: {
            kind: 'ai_generate' as const,
            prompt: 'Legacy prompt',
            artifact: {
              relativePath: 'legacy.md',
              kind: 'markdown'
            },
            context: { attachments: ['legacy.txt'] }
          },
          completionGate: {
            requireApproval: true,
            customGateId: 'gate-1'
          }
        }
      ],
      edges: [] as RequirementWorkflow['edges']
    }

    const instance = instantiateRequirementWorkflow(template, 'requirement-1')
    template.nodes[0].configuration.input.attachments.push('changed.md')
    template.nodes[0].configuration.connectorIds.push('changed-connector')
    template.nodes[0].configuration.permissions[0].scope = 'space'
    template.nodes[0].configuration.todos[0].title = 'Changed'
    template.nodes[0].executor.context!.attachments!.push('changed.txt')
    template.nodes[0].completionGate.customGateId = 'changed-gate'
    template.edges.push({
      id: 'late-edge',
      sourceNodeId: 'template-analysis',
      targetNodeId: 'template-analysis'
    })

    expect(instance.nodes[0].configuration).toMatchObject({
      input: { attachments: ['brief.md'] },
      connectorIds: ['docs'],
      permissions: [{ scope: 'requirement' }],
      todos: [{ title: 'Review sources' }]
    })
    expect(instance.nodes[0].executor?.context?.attachments).toEqual([
      'legacy.txt'
    ])
    expect(instance.nodes[0].completionGate?.customGateId).toBe('gate-1')
    expect(instance.edges).toEqual([])
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
      {
        id: 'analysis--review',
        sourceNodeId: 'analysis',
        targetNodeId: 'review'
      },
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
      {
        id: 'analysis--design',
        sourceNodeId: 'analysis',
        targetNodeId: 'design'
      }
    ])
  })

  it('updates editable content for pending and ready nodes without mutating identity or state', () => {
    const original = workflow(
      [node('analysis', 0, 'ready'), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    const updated = updateRequirementNode(original, 'analysis', {
      name: '  Discovery  ',
      description: 'Clarify the requirement',
      allowSkip: true,
      completionGate: { requireApproval: true }
    })

    expect(updated.revision).toBe(1)
    expect(updated.nodes[0]).toEqual({
      ...original.nodes[0],
      name: 'Discovery',
      description: 'Clarify the requirement',
      allowSkip: true,
      completionGate: { requireApproval: true }
    })
    expect(original.nodes[0].name).toBe('analysis')
  })

  it('isolates updated nested node configuration from command mutation', () => {
    const changes = {
      configuration: {
        input: {
          includeRequirementBody: true,
          predecessorArtifacts: 'direct' as const,
          includeSpaceKnowledge: false,
          attachments: ['brief.md']
        },
        prompt: 'Review the brief',
        model: { strategy: 'inherit' as const },
        connectorIds: [],
        permissions: [
          {
            capability: 'filesystem.read' as const,
            scope: 'requirement' as const
          }
        ],
        artifact: {
          required: true,
          relativePath: 'artifacts/analysis.md',
          kind: 'markdown'
        },
        todos: [{ title: 'Confirm scope', required: true }],
        completionGate: { requireApproval: false },
        retry: { maxAttempts: 2, backoffMs: 1000 },
        skip: { allowed: false, requireReason: false }
      }
    }
    const updated = updateRequirementNode(
      workflow([node('analysis', 0)], []),
      'analysis',
      changes
    )

    changes.configuration.input.attachments.push('changed.md')
    changes.configuration.connectorIds.push('changed')
    changes.configuration.todos[0].title = 'Changed'

    expect(updated.nodes[0].configuration).toMatchObject({
      input: { attachments: ['brief.md'] },
      connectorIds: [],
      todos: [{ title: 'Confirm scope' }]
    })
  })

  it('rejects node updates after execution starts and rejects empty names', () => {
    for (const status of [
      'running',
      'waiting_user',
      'paused',
      'blocked',
      'completed',
      'failed',
      'skipped',
      'cancelled',
      'interrupted'
    ] satisfies RequirementNode['status'][]) {
      expect(() =>
        updateRequirementNode(
          workflow([node('analysis', 0, status)], []),
          'analysis',
          { name: 'Changed' }
        )
      ).toThrow('Only pending or ready workflow nodes can be updated')
    }

    expect(() =>
      updateRequirementNode(
        workflow([node('analysis', 0, 'pending')], []),
        'analysis',
        { name: '   ' }
      )
    ).toThrow('Workflow node name is required')
  })

  it('allows deletion only for pending nodes', () => {
    for (const status of [
      'ready',
      'running',
      'waiting_user',
      'paused',
      'blocked',
      'completed',
      'failed',
      'skipped',
      'cancelled',
      'interrupted'
    ] satisfies RequirementNode['status'][]) {
      expect(() =>
        removeRequirementNode(workflow([node('analysis', 0, status)], []), 'analysis')
      ).toThrow('Only pending workflow nodes can be removed')
    }
  })

  it('requires inserted nodes to be pending and insertion anchors to be unexecuted', () => {
    const pending = workflow(
      [node('analysis', 0), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )
    expect(() =>
      insertRequirementNode(pending, {
        node: node('review', 1, 'ready'),
        afterNodeId: 'analysis',
        beforeNodeId: 'design'
      })
    ).toThrow('Inserted workflow nodes must be pending')

    const completed = workflow(
      [node('analysis', 0, 'completed'), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    expect(() => removeRequirementNode(completed, 'analysis')).toThrow(
      'Only pending workflow nodes can be removed'
    )
    expect(() =>
      insertRequirementNode(completed, {
        node: node('review', 1),
        afterNodeId: 'analysis',
        beforeNodeId: 'design'
      })
    ).toThrow('Only pending or ready workflow nodes can be edited')
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

  it('selects one stable ready node from unordered branch candidates', () => {
    const current = workflow(
      [
        node('design-z', 2),
        node('analysis', 0, 'completed'),
        node('design-b', 1),
        node('design-a', 1)
      ],
      [
        { id: 'edge-z', sourceNodeId: 'analysis', targetNodeId: 'design-z' },
        { id: 'edge-b', sourceNodeId: 'analysis', targetNodeId: 'design-b' },
        { id: 'edge-a', sourceNodeId: 'analysis', targetNodeId: 'design-a' }
      ]
    )

    expect(getStableReadyNodeId(current)).toBe('design-a')
    expect(getStableReadyNodeId(current)).toBe('design-a')
  })

  it('does not activate pending candidates while another node owns execution', () => {
    for (const status of [
      'running',
      'waiting_user',
      'paused',
      'blocked'
    ] as const) {
      const current = workflow(
        [
          node('analysis', 0, 'completed'),
          node('active', 1, status),
          node('candidate', 2)
        ],
        [
          {
            id: 'edge-candidate',
            sourceNodeId: 'analysis',
            targetNodeId: 'candidate'
          }
        ]
      )

      expect(getStableReadyNodeId(current)).toBeUndefined()
    }
  })

  it('keeps the first eligible ready node as the stable queue head', () => {
    const current = workflow(
      [
        node('ready-z', 2, 'ready'),
        node('ready-a', 1, 'ready'),
        node('candidate', 0)
      ],
      []
    )

    expect(getStableReadyNodeId(current)).toBe('ready-a')
  })

  it('does not select a stale ready node while another node is active', () => {
    const current = workflow(
      [
        node('running', 0, 'running'),
        node('stale-ready', 1, 'ready'),
        node('candidate', 2)
      ],
      []
    )

    expect(getStableReadyNodeId(current)).toBeUndefined()
  })

  it('requires every direct predecessor to be completed or skipped', () => {
    const current = workflow(
      [
        node('analysis', 0, 'completed'),
        node('research', 1, 'running'),
        node('merge', 2)
      ],
      [
        { id: 'edge-a', sourceNodeId: 'analysis', targetNodeId: 'merge' },
        { id: 'edge-r', sourceNodeId: 'research', targetNodeId: 'merge' }
      ]
    )

    expect(getReadyNodeIds(current)).not.toContain('merge')
    expect(getStableReadyNodeId(current)).toBeUndefined()
  })

  it('admits a stable batch up to the persisted parallelism limit', () => {
    const current = workflow(
      [
        node('design-z', 2),
        node('analysis', 0, 'completed'),
        node('design-b', 1),
        node('design-a', 1)
      ],
      [
        { id: 'edge-z', sourceNodeId: 'analysis', targetNodeId: 'design-z' },
        { id: 'edge-b', sourceNodeId: 'analysis', targetNodeId: 'design-b' },
        { id: 'edge-a', sourceNodeId: 'analysis', targetNodeId: 'design-a' }
      ],
      2
    )

    expect(getStableReadyNodeIds(current)).toEqual([
      'design-a',
      'design-b'
    ])
  })

  it('counts existing active nodes and never removes them after a limit decrease', () => {
    const current = workflow(
      [
        node('running', 0, 'running'),
        node('waiting', 1, 'waiting_user'),
        node('candidate', 2)
      ],
      [],
      1
    )

    expect(getStableReadyNodeIds(current)).toEqual(['running', 'waiting'])
    expect(getWorkflowExecutionProjection(current)).toMatchObject({
      activeNodeIds: ['running', 'waiting'],
      focusedNodeId: 'running',
      status: 'running'
    })
  })

  it('treats ready, paused, blocked, and interrupted nodes as occupied slots', () => {
    for (const status of [
      'ready',
      'paused',
      'blocked',
      'interrupted'
    ] as const) {
      const current = workflow(
        [node('occupied', 0, status), node('candidate', 1)],
        [],
        1
      )

      expect(getStableReadyNodeIds(current)).toEqual(['occupied'])
    }
  })

  it('keeps a join pending until every direct predecessor succeeds or skips', () => {
    const current = workflow(
      [
        node('left', 0, 'completed'),
        node('right', 1, 'running'),
        node('join', 2),
        node('independent', 3)
      ],
      [
        { id: 'edge-left', sourceNodeId: 'left', targetNodeId: 'join' },
        { id: 'edge-right', sourceNodeId: 'right', targetNodeId: 'join' }
      ],
      2
    )

    expect(getStableReadyNodeIds(current)).toEqual([
      'right',
      'independent'
    ])
    expect(getStableReadyNodeIds({
      ...current,
      nodes: current.nodes.map((item) =>
        item.id === 'right' ? { ...item, status: 'skipped' } : item
      )
    })).toEqual(['join', 'independent'])
  })

  it('validates and revises workflow parallelism without mutating the source', () => {
    const current = workflow([node('analysis', 0, 'ready')], [])

    const updated = setWorkflowParallelism(current, 4)

    expect(updated).toMatchObject({ maxParallelism: 4, revision: 1 })
    expect(current).toMatchObject({ maxParallelism: 1, revision: 0 })
    expect(setWorkflowParallelism(updated, 4)).toBe(updated)
    for (const invalid of [0, 9, 1.5, Number.NaN]) {
      expect(() => setWorkflowParallelism(current, invalid)).toThrow(
        'Workflow parallelism must be an integer from 1 to 8'
      )
    }
  })

  it('derives stable focus and aggregate execution status from node facts', () => {
    expect(
      getWorkflowExecutionProjection(
        workflow(
          [
            node('failed', 0, 'failed'),
            node('runnable', 2),
            node('ready', 1, 'ready')
          ],
          [],
          2
        )
      )
    ).toEqual({
      activeNodeIds: ['ready'],
      focusedNodeId: 'ready',
      status: 'running'
    })

    expect(
      getWorkflowExecutionProjection(
        workflow(
          [
            node('done', 0, 'completed'),
            node('waiting', 1, 'waiting_user'),
            node('blocked-child', 2)
          ],
          [
            {
              id: 'edge-waiting',
              sourceNodeId: 'waiting',
              targetNodeId: 'blocked-child'
            }
          ],
          2
        )
      )
    ).toMatchObject({
      activeNodeIds: ['waiting'],
      focusedNodeId: 'waiting',
      status: 'waiting_user'
    })

    expect(
      getWorkflowExecutionProjection(
        workflow([node('paused', 0, 'paused')], [])
      ).status
    ).toBe('paused')
    expect(
      getWorkflowExecutionProjection(
        workflow([node('interrupted', 0, 'interrupted')], [])
      ).status
    ).toBe('interrupted')
    expect(
      getWorkflowExecutionProjection(
        workflow([node('failed', 0, 'failed')], [])
      ).status
    ).toBe('failed')
    expect(
      getWorkflowExecutionProjection(
        workflow([
          node('done', 0, 'completed'),
          node('skipped', 1, 'skipped')
        ], [])
      ).status
    ).toBe('completed')
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

  it('recalculates pending and ready nodes after an edge update', () => {
    const original = workflow(
      [
        node('foundation', 0, 'completed'),
        node('analysis', 1, 'ready'),
        node('design', 2),
        node('testing', 3)
      ],
      [
        {
          id: 'edge-foundation',
          sourceNodeId: 'foundation',
          targetNodeId: 'analysis'
        },
        {
          id: 'edge-editable',
          sourceNodeId: 'design',
          targetNodeId: 'testing'
        }
      ]
    )

    const updated = updateRequirementEdge(original, 'edge-editable', {
      id: 'ignored-command-id',
      sourceNodeId: 'design',
      targetNodeId: 'analysis'
    })

    expect(updated.edges[1].id).toBe('edge-editable')
    expect(updated.nodes.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'foundation', status: 'completed' },
      { id: 'analysis', status: 'pending' },
      { id: 'design', status: 'ready' },
      { id: 'testing', status: 'pending' }
    ])
  })

  it.each([
    'running',
    'waiting_user',
    'paused',
    'blocked',
    'completed',
    'failed',
    'skipped',
    'cancelled',
    'interrupted'
  ] as const)('protects %s node edges from replacement', (status) => {
    const original = workflow(
      [node('protected', 0, status), node('design', 1), node('testing', 2)],
      [
        {
          id: 'edge-protected',
          sourceNodeId: 'protected',
          targetNodeId: 'design'
        },
        { id: 'edge-editable', sourceNodeId: 'design', targetNodeId: 'testing' }
      ]
    )

    expect(() =>
      updateRequirementEdge(original, 'edge-protected', {
        id: 'edge-protected',
        sourceNodeId: 'design',
        targetNodeId: 'testing'
      })
    ).toThrow('Only pending or ready workflow nodes can edit topology')
  })

  it('does not create a revision when edge endpoints are unchanged', () => {
    const original = workflow(
      [node('analysis', 0, 'ready'), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    const updated = updateRequirementEdge(original, 'edge-1', {
      id: 'different-command-id',
      sourceNodeId: 'analysis',
      targetNodeId: 'design'
    })

    expect(updated).toBe(original)
    expect(updated.revision).toBe(0)
  })

  it('reorders pending nodes but preserves completed node positions', () => {
    const original = workflow(
      [node('analysis', 0, 'completed'), node('design', 1), node('testing', 2)],
      [
        { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' },
        { id: 'edge-2', sourceNodeId: 'analysis', targetNodeId: 'testing' }
      ]
    )

    expect(
      reorderRequirementNodes(original, [
        'analysis',
        'testing',
        'design'
      ]).nodes.map(({ id }) => id)
    ).toEqual(['analysis', 'testing', 'design'])
    expect(() =>
      reorderRequirementNodes(original, ['design', 'analysis', 'testing'])
    ).toThrow('Only pending or ready workflow nodes can edit topology')
  })

  it('protects every started node state from reordering', () => {
    const original = workflow(
      [node('analysis', 0, 'paused'), node('design', 1), node('testing', 2)],
      [
        { id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' },
        { id: 'edge-2', sourceNodeId: 'analysis', targetNodeId: 'testing' }
      ]
    )

    expect(() =>
      reorderRequirementNodes(original, ['design', 'analysis', 'testing'])
    ).toThrow('Only pending or ready workflow nodes can edit topology')
  })

  it('recalculates editable node readiness after reordering', () => {
    const original = workflow(
      [node('analysis', 0, 'pending'), node('design', 1, 'ready')],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    const updated = reorderRequirementNodes(original, ['design', 'analysis'])

    expect(updated.nodes.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'design', status: 'pending' },
      { id: 'analysis', status: 'ready' }
    ])
  })

  it('does not create a revision when node order is unchanged', () => {
    const original = workflow(
      [node('analysis', 0, 'ready'), node('design', 1)],
      [{ id: 'edge-1', sourceNodeId: 'analysis', targetNodeId: 'design' }]
    )

    const updated = reorderRequirementNodes(original, ['analysis', 'design'])

    expect(updated).toBe(original)
    expect(updated.revision).toBe(0)
  })
})
