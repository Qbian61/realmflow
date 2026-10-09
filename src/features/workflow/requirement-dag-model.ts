import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type {
  RequirementNode,
  WorkflowNodePosition
} from '../../../domain/workflow'
import type { RequirementExecutionViewDto } from '../../../shared/business'

export const REQUIREMENT_DAG_NODE_WIDTH = 168
export const REQUIREMENT_DAG_NODE_HEIGHT = 46
export const REQUIREMENT_DAG_MIN_HEIGHT = 180

const NODE_GAP = 24
const RANK_GAP = 40
const CANVAS_PADDING = 32

type ExecutionViewNode = RequirementExecutionViewDto['nodes'][number]

export type RequirementDagNodeData = ExecutionViewNode & {
  selected: boolean
}

export type RequirementDagNode = Node<
  RequirementDagNodeData,
  'requirementDagNode'
>

export type RequirementDagEdge = Edge<{ completed: boolean }>

export type RequirementDagModel = {
  nodes: RequirementDagNode[]
  edges: RequirementDagEdge[]
}

export function createRequirementDagModel(
  view: RequirementExecutionViewDto,
  selectedNodeId?: string
): RequirementDagModel {
  const sortedNodes = [...view.workflow.nodes].sort(compareNodes)
  const nodeIds = new Set(sortedNodes.map(({ id }) => id))
  const nodesById = new Map(sortedNodes.map((node) => [node.id, node]))
  const summariesById = new Map(view.nodes.map((node) => [node.id, node]))
  const sortedEdges = [...view.workflow.edges]
    .filter(
      ({ sourceNodeId, targetNodeId }) =>
        nodeIds.has(sourceNodeId) && nodeIds.has(targetNodeId)
    )
    .sort((left, right) => {
      const sourceOrder = compareNodes(
        nodesById.get(left.sourceNodeId)!,
        nodesById.get(right.sourceNodeId)!
      )
      if (sourceOrder !== 0) return sourceOrder
      const targetOrder = compareNodes(
        nodesById.get(left.targetNodeId)!,
        nodesById.get(right.targetNodeId)!
      )
      return targetOrder || left.id.localeCompare(right.id)
    })
  const positions = layoutRequirementDagNodes(sortedNodes, sortedEdges)

  return {
    nodes: sortedNodes.flatMap((node) => {
      const summary = summariesById.get(node.id)
      if (!summary) return []
      return [
        {
          id: node.id,
          type: 'requirementDagNode',
          position: positions[node.id],
          data: {
            ...summary,
            selected: node.id === selectedNodeId
          }
        }
      ]
    }),
    edges: sortedEdges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      data: {
        completed: isCompletedStatus(
          summariesById.get(edge.sourceNodeId)?.status
        )
      }
    }))
  }
}

function layoutRequirementDagNodes(
  nodes: RequirementNode[],
  edges: RequirementExecutionViewDto['workflow']['edges']
): Record<string, WorkflowNodePosition> {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    nodesep: NODE_GAP,
    ranksep: RANK_GAP,
    marginx: CANVAS_PADDING,
    marginy: CANVAS_PADDING
  })

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: REQUIREMENT_DAG_NODE_WIDTH,
      height: REQUIREMENT_DAG_NODE_HEIGHT
    })
  }
  for (const edge of edges) {
    graph.setEdge(edge.sourceNodeId, edge.targetNodeId)
  }
  dagre.layout(graph)

  const ranks = new Map<number, RequirementNode[]>()
  for (const node of nodes) {
    const x = Math.round(
      (graph.node(node.id) as { x: number }).x -
        REQUIREMENT_DAG_NODE_WIDTH / 2
    )
    ranks.set(x, [...(ranks.get(x) ?? []), node])
  }

  const maxRankSize = Math.max(
    1,
    ...Array.from(ranks.values(), (rankNodes) => rankNodes.length)
  )
  const graphHeight =
    maxRankSize * REQUIREMENT_DAG_NODE_HEIGHT +
    (maxRankSize - 1) * NODE_GAP
  const contentHeight = Math.max(
    REQUIREMENT_DAG_MIN_HEIGHT,
    graphHeight + CANVAS_PADDING * 2
  )
  const verticalOrigin = Math.round((contentHeight - graphHeight) / 2)
  const positions: Record<string, WorkflowNodePosition> = {}
  for (const [x, rankNodes] of ranks) {
    rankNodes.sort(compareNodes)
    rankNodes.forEach((node, index) => {
      positions[node.id] = {
        x,
        y: verticalOrigin + index * (REQUIREMENT_DAG_NODE_HEIGHT + NODE_GAP)
      }
    })
  }
  return positions
}

function compareNodes(
  left: Pick<RequirementNode, 'id' | 'order'>,
  right: Pick<RequirementNode, 'id' | 'order'>
): number {
  return left.order - right.order || left.id.localeCompare(right.id)
}

function isCompletedStatus(
  status: RequirementNode['status'] | undefined
): boolean {
  return status === 'completed' || status === 'skipped'
}
