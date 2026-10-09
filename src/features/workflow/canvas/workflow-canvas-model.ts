import dagre from '@dagrejs/dagre'
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type {
  WorkflowTemplateDraftDto,
  WorkflowTemplateNodeDto,
  WorkflowTemplatePublicationIssueDto
} from '../../../../shared/business'
import type { WorkflowNodePosition } from '../../../../domain/workflow'

export const WORKFLOW_CANVAS_NODE_WIDTH = 240
export const WORKFLOW_CANVAS_NODE_HEIGHT = 104

export type WorkflowCanvasNodeData = {
  node: WorkflowTemplateNodeDto
  readOnly?: boolean
  issues?: string[]
}

export type WorkflowCanvasNode = Node<WorkflowCanvasNodeData, 'workflowNode'>

export type WorkflowCanvasEdge = Edge

export type WorkflowCanvasModel = {
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
}

export function createWorkflowCanvasModel(
  template: WorkflowTemplateDraftDto
): WorkflowCanvasModel {
  const positions = layoutWorkflowNodes(
    template.currentVersion.nodes,
    template.currentVersion.edges
  )
  const nodesById = new Map(
    template.currentVersion.nodes.map((node) => [node.id, node])
  )
  return {
    nodes: template.currentVersion.nodes.map((node) => ({
      id: node.id,
      type: 'workflowNode',
      position: positions[node.id],
      data: { node }
    })),
    edges: template.currentVersion.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: 'smoothstep',
      ariaLabel: `${nodesById.get(edge.sourceNodeId)?.name ?? edge.sourceNodeId} → ${nodesById.get(edge.targetNodeId)?.name ?? edge.targetNodeId}`,
      markerEnd: { type: MarkerType.ArrowClosed }
    }))
  }
}

export function applyWorkflowCanvasIssues(
  model: WorkflowCanvasModel,
  issues: WorkflowTemplatePublicationIssueDto[],
  issueLabel = 'Publication issue'
): WorkflowCanvasModel {
  const nodeIssues = new Map<string, string[]>()
  const edgeIssues = new Set<string>()
  for (const issue of issues) {
    if (issue.nodeId) {
      nodeIssues.set(issue.nodeId, [
        ...(nodeIssues.get(issue.nodeId) ?? []),
        issue.message
      ])
    }
    if (issue.edgeId) edgeIssues.add(issue.edgeId)
  }

  return {
    nodes: model.nodes.map((node) => ({
      ...node,
      data: { ...node.data, issues: nodeIssues.get(node.id) }
    })),
    edges: model.edges.map((edge) =>
      edgeIssues.has(edge.id)
        ? {
            ...edge,
            className: 'workflow-canvas-edge-error',
            label: '!',
            ariaLabel: `${edge.ariaLabel ?? edge.id}，${issueLabel}`
          }
        : edge
    )
  }
}

export function layoutWorkflowNodes(
  nodes: WorkflowTemplateDraftDto['currentVersion']['nodes'],
  edges: WorkflowTemplateDraftDto['currentVersion']['edges']
): Record<string, WorkflowNodePosition> {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 64,
    ranksep: 96,
    marginx: 32,
    marginy: 32
  })

  const sortedNodes = [...nodes].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id)
  )
  for (const node of sortedNodes) {
    graph.setNode(node.id, {
      width: WORKFLOW_CANVAS_NODE_WIDTH,
      height: WORKFLOW_CANVAS_NODE_HEIGHT
    })
  }
  const nodeIds = new Set(sortedNodes.map(({ id }) => id))
  const sortedEdges = [...edges]
    .filter(
      ({ sourceNodeId, targetNodeId }) =>
        nodeIds.has(sourceNodeId) && nodeIds.has(targetNodeId)
    )
    .sort(
      (left, right) =>
        left.sourceNodeId.localeCompare(right.sourceNodeId) ||
        left.targetNodeId.localeCompare(right.targetNodeId) ||
        left.id.localeCompare(right.id)
    )
  for (const edge of sortedEdges) {
    graph.setEdge(edge.sourceNodeId, edge.targetNodeId)
  }
  dagre.layout(graph)

  const generated = Object.fromEntries(
    sortedNodes.map((node) => {
      const layout = graph.node(node.id) as { x: number; y: number }
      return [
        node.id,
        {
          x: Math.round(layout.x - WORKFLOW_CANVAS_NODE_WIDTH / 2),
          y: Math.round(layout.y - WORKFLOW_CANVAS_NODE_HEIGHT / 2)
        }
      ]
    })
  ) as Record<string, WorkflowNodePosition>

  const explicitPositions = nodes.flatMap((node) =>
    node.position ? [node.position] : []
  )
  const allExplicitPositionsOverlap =
    nodes.length > 1 &&
    explicitPositions.length === nodes.length &&
    new Set(explicitPositions.map(({ x, y }) => `${x}:${y}`)).size === 1

  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      node.position && !allExplicitPositionsOverlap
        ? { ...node.position }
        : generated[node.id]
    ])
  )
}
