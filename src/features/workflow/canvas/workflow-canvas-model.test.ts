import { describe, expect, it } from 'vitest'
import type { WorkflowTemplateDraftDto } from '../../../../shared/business'
import {
  applyWorkflowCanvasIssues,
  createWorkflowCanvasModel,
  layoutWorkflowNodes
} from './workflow-canvas-model'

describe('workflow canvas model', () => {
  it('lays out a DAG deterministically from left to right', () => {
    const template = createTemplate(
      [node('review', 2), node('analysis', 0), node('design', 1)],
      [edge('analysis', 'design'), edge('design', 'review')]
    )

    const first = layoutWorkflowNodes(
      template.currentVersion.nodes,
      template.currentVersion.edges
    )
    const second = layoutWorkflowNodes(
      [...template.currentVersion.nodes].reverse(),
      [...template.currentVersion.edges].reverse()
    )

    expect(second).toEqual(first)
    expect(first.analysis.x).toBeLessThan(first.design.x)
    expect(first.design.x).toBeLessThan(first.review.x)
  })

  it('assigns stable non-overlapping positions to disconnected nodes', () => {
    const template = createTemplate([
      node('analysis', 0),
      node('review', 1),
      node('release', 2)
    ])

    const positions = layoutWorkflowNodes(
      template.currentVersion.nodes,
      template.currentVersion.edges
    )

    expect(
      new Set(Object.values(positions).map(({ x, y }) => `${x}:${y}`)).size
    ).toBe(3)
  })

  it('preserves explicit positions while filling missing positions', () => {
    const template = createTemplate(
      [
        { ...node('analysis', 0), position: { x: 48, y: 96 } },
        node('review', 1)
      ],
      [edge('analysis', 'review')]
    )

    const model = createWorkflowCanvasModel(template)

    expect(model.nodes.find(({ id }) => id === 'analysis')?.position).toEqual({
      x: 48,
      y: 96
    })
    expect(model.nodes.find(({ id }) => id === 'review')?.position).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number)
      })
    )
  })

  it('treats fully overlapping legacy coordinates as missing layout', () => {
    const template = createTemplate(
      [
        { ...node('analysis', 0), position: { x: 0, y: 0 } },
        { ...node('review', 1), position: { x: 0, y: 0 } }
      ],
      [edge('analysis', 'review')]
    )

    const model = createWorkflowCanvasModel(template)

    expect(model.nodes[0].position).not.toEqual(model.nodes[1].position)
  })

  it('maps edges with direction markers and accessible endpoint names', () => {
    const template = createTemplate(
      [node('analysis', 0), node('review', 1)],
      [edge('analysis', 'review')]
    )

    const model = createWorkflowCanvasModel(template)

    expect(model.edges[0]).toEqual(
      expect.objectContaining({
        source: 'analysis',
        target: 'review',
        ariaLabel: 'analysis → review',
        markerEnd: expect.objectContaining({ type: 'arrowclosed' })
      })
    )
  })

  it('marks publication issues on nodes and edges with non-color labels', () => {
    const template = createTemplate(
      [node('analysis', 0), node('review', 1)],
      [edge('analysis', 'review')]
    )
    const model = applyWorkflowCanvasIssues(createWorkflowCanvasModel(template), [
      {
        code: 'missing_node_configuration',
        scope: 'node',
        message: 'Configure analysis',
        nodeId: 'analysis'
      },
      {
        code: 'invalid_edge_reference',
        scope: 'edge',
        message: 'Invalid edge',
        edgeId: 'analysis-review'
      }
    ])

    expect(model.nodes[0].data.issues).toEqual(['Configure analysis'])
    expect(model.edges[0]).toEqual(
      expect.objectContaining({
        className: 'workflow-canvas-edge-error',
        label: '!',
        ariaLabel: 'analysis → review，Publication issue'
      })
    )
  })

  it('builds a 100-node and 150-edge canvas model without overlap', () => {
    const nodes = Array.from({ length: 100 }, (_, index) =>
      node(`node-${index}`, index)
    )
    const edges = [
      ...Array.from({ length: 99 }, (_, index) =>
        edge(`node-${index}`, `node-${index + 1}`)
      ),
      ...Array.from({ length: 51 }, (_, index) =>
        edge(`node-${index}`, `node-${index + 2}`)
      )
    ]

    const model = createWorkflowCanvasModel(createTemplate(nodes, edges))

    expect(model.nodes).toHaveLength(100)
    expect(model.edges).toHaveLength(150)
    expect(
      new Set(model.nodes.map(({ position }) => `${position.x}:${position.y}`))
        .size
    ).toBe(100)
  })
})

function createTemplate(
  nodes: WorkflowTemplateDraftDto['currentVersion']['nodes'],
  edges: WorkflowTemplateDraftDto['currentVersion']['edges'] = []
): WorkflowTemplateDraftDto {
  return {
    id: 'template-1',
    name: 'Delivery',
    description: '',
    status: 'draft',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    currentVersion: {
      id: 'template-1-v1',
      version: 1,
      status: 'draft',
      checksum: 'checksum',
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes,
      edges
    }
  }
}

function node(stableKey: string, order: number) {
  return {
    id: stableKey,
    stableKey,
    type: 'ai_generate' as const,
    name: stableKey,
    description: '',
    order,
    allowSkip: false
  }
}

function edge(sourceNodeId: string, targetNodeId: string) {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId
  }
}
