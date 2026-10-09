import { describe, expect, it } from 'vitest'
import type { RequirementNode, WorkflowEdge } from '../../../domain/workflow'
import type { RequirementExecutionViewDto } from '../../../shared/business'
import { createRequirementDagModel } from './requirement-dag-model'

describe('requirement DAG model', () => {
  it('lays out a serial workflow from left to right', () => {
    const model = createRequirementDagModel(
      view(
        [node('review', 2), node('analysis', 0), node('design', 1)],
        [edge('analysis', 'design'), edge('design', 'review')]
      ),
      'analysis'
    )

    expect(position(model, 'analysis').x).toBeLessThan(
      position(model, 'design').x
    )
    expect(position(model, 'design').x).toBeLessThan(
      position(model, 'review').x
    )
    expect(model.edges.map(({ source, target }) => [source, target])).toEqual([
      ['analysis', 'design'],
      ['design', 'review']
    ])
    expect(position(model, 'design').x - position(model, 'analysis').x).toBe(
      208
    )
    expect(position(model, 'review').x - position(model, 'design').x).toBe(
      208
    )
    expect(position(model, 'analysis').y).toBe(67)
    expect(position(model, 'analysis').y).toBe(67)
  })

  it('places ordered branch nodes in one stable rank', () => {
    const model = createRequirementDagModel(
      view(
        [node('start', 0), node('lower', 2), node('upper', 1)],
        [edge('start', 'lower'), edge('start', 'upper')]
      ),
      'start'
    )

    expect(position(model, 'upper').x).toBe(position(model, 'lower').x)
    expect(position(model, 'upper').y).toBeLessThan(position(model, 'lower').y)
    expect(position(model, 'upper').y).toBe(32)
    expect(position(model, 'lower').y).toBe(102)
    expect(position(model, 'upper').y).toBe(32)
    expect(position(model, 'lower').y).toBe(102)
  })

  it('places a join after every incoming branch', () => {
    const model = createRequirementDagModel(
      view(
        [
          node('start', 0),
          node('branch-a', 1),
          node('branch-b', 2),
          node('join', 3)
        ],
        [
          edge('start', 'branch-a'),
          edge('start', 'branch-b'),
          edge('branch-a', 'join'),
          edge('branch-b', 'join')
        ]
      ),
      'join'
    )

    expect(position(model, 'join').x).toBeGreaterThan(
      position(model, 'branch-a').x
    )
    expect(position(model, 'join').x).toBeGreaterThan(
      position(model, 'branch-b').x
    )
  })

  it('assigns non-overlapping positions to isolated nodes', () => {
    const model = createRequirementDagModel(
      view([node('isolated-b', 1), node('isolated-a', 0)], []),
      'isolated-a'
    )

    expect(position(model, 'isolated-a')).not.toEqual(
      position(model, 'isolated-b')
    )
  })

  it('keeps order-plus-id layout stable across input and selection changes', () => {
    const nodes = [
      node('start', 0),
      node('branch-b', 1),
      node('branch-a', 1),
      node('join', 2)
    ]
    const edges = [
      edge('start', 'branch-b'),
      edge('start', 'branch-a'),
      edge('branch-b', 'join'),
      edge('branch-a', 'join')
    ]
    const first = createRequirementDagModel(view(nodes, edges), 'branch-a')
    const second = createRequirementDagModel(
      view([...nodes].reverse(), [...edges].reverse()),
      'branch-b'
    )

    expect(position(first, 'branch-a').y).toBeLessThan(
      position(first, 'branch-b').y
    )
    expect(
      Object.fromEntries(first.nodes.map(({ id, position }) => [id, position]))
    ).toEqual(
      Object.fromEntries(second.nodes.map(({ id, position }) => [id, position]))
    )
  })

  it('projects authoritative node flags and source completion onto graph data', () => {
    const executionView = view(
      [
        node('completed', 0, 'completed'),
        node('skipped', 1, 'skipped'),
        node('running', 2, 'running'),
        node('pending', 3, 'pending')
      ],
      [
        edge('completed', 'running'),
        edge('skipped', 'running'),
        edge('running', 'pending')
      ],
      {
        currentNodeId: 'running',
        activeNodeIds: ['running'],
        focusedNodeId: 'pending'
      }
    )

    const model = createRequirementDagModel(executionView, 'completed')

    expect(model.nodes.find(({ id }) => id === 'completed')?.data).toEqual(
      expect.objectContaining({
        status: 'completed',
        current: false,
        active: false,
        focused: false,
        selected: true
      })
    )
    expect(model.nodes.find(({ id }) => id === 'running')?.data).toEqual(
      expect.objectContaining({
        status: 'running',
        current: true,
        active: true,
        focused: false,
        selected: false
      })
    )
    expect(model.nodes.find(({ id }) => id === 'pending')?.data.focused).toBe(
      true
    )
    expect(model.edges.map(({ data }) => data?.completed)).toEqual([
      true,
      true,
      false
    ])
  })
})

function position(
  model: ReturnType<typeof createRequirementDagModel>,
  nodeId: string
) {
  return model.nodes.find(({ id }) => id === nodeId)!.position
}

function view(
  nodes: RequirementNode[],
  edges: WorkflowEdge[],
  state: {
    currentNodeId?: string
    activeNodeIds?: string[]
    focusedNodeId?: string
  } = {}
): RequirementExecutionViewDto {
  const currentNodeId = state.currentNodeId
  const activeNodeIds = state.activeNodeIds ?? []
  const focusedNodeId = state.focusedNodeId
  return {
    workflow: {
      requirementId: 'requirement-1',
      templateVersionId: 'template-version-1',
      revision: 1,
      maxParallelism: 2,
      nodes,
      edges
    },
    ...(currentNodeId
      ? {
          execution: {
            id: 'execution-1',
            requirementId: 'requirement-1',
            status: 'running',
            currentNodeId,
            revision: 1,
            createdAt: 1,
            updatedAt: 1
          }
        }
      : {}),
    maxParallelism: 2,
    activeNodeIds,
    ...(focusedNodeId ? { focusedNodeId } : {}),
    progress: {
      completedNodes: nodes.filter(({ status }) =>
        ['completed', 'skipped'].includes(status)
      ).length,
      totalNodes: nodes.length,
      percent: 0
    },
    nodes: nodes.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      status: item.status,
      current: item.id === currentNodeId,
      active: activeNodeIds.includes(item.id),
      focused: item.id === focusedNodeId,
      todoCounts: {
        required: { completed: 0, total: 0 },
        optional: { completed: 0, total: 0 }
      },
      openQuestionCount: 0,
      approvalStatus: 'not_required',
      artifactCount: 0,
      capabilities: {
        retry: { enabled: false, reasonCode: 'invalid_state' },
        skip: { enabled: false, reasonCode: 'invalid_state' },
        delete: { enabled: false, reasonCode: 'invalid_state' },
        rollback: { enabled: false, reasonCode: 'no_execution_history' }
      }
    })),
    selectedNode: {
      id: nodes[0]?.id ?? '',
      contextSources: [],
      todos: [],
      questions: [],
      artifacts: []
    }
  }
}

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

function edge(sourceNodeId: string, targetNodeId: string): WorkflowEdge {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId
  }
}
