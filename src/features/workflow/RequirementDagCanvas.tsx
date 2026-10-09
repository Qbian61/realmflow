import {
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useUpdateNodeInternals,
  type Node,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  useEffect,
  useMemo,
  useState
} from 'react'
import type { RequirementExecutionViewDto } from '../../../shared/business'
import {
  REQUIREMENT_DAG_MIN_HEIGHT,
  REQUIREMENT_DAG_NODE_HEIGHT,
  REQUIREMENT_DAG_NODE_WIDTH,
  createRequirementDagModel,
  type RequirementDagEdge,
  type RequirementDagNode
} from './requirement-dag-model'
import {
  RequirementDagNodeView,
  type RequirementDagNodeViewData
} from './RequirementDagNode'
import { useLocalization } from '../../localization/LocalizationProvider'
import { useWorkspacePageActive } from '../navigation/WorkspaceRouteCache'

type RequirementDagCanvasProps = {
  view: RequirementExecutionViewDto
  selectedNodeId?: string
  respondingNodeId?: string
  onSelectNode: (nodeId: string) => void
  onOpenNodeMenu: (nodeId: string, anchor: HTMLButtonElement) => void
}

type RequirementDagCanvasNode = Omit<RequirementDagNode, 'data'> & {
  data: RequirementDagNodeViewData
}

const NODE_TYPES = {
  requirementDagNode: RequirementDagNodeView
} as NodeTypes

const DAG_CONTENT_MARGIN = 32
const DAG_MIN_HEIGHT = REQUIREMENT_DAG_MIN_HEIGHT

export function RequirementDagCanvas({
  view,
  selectedNodeId,
  respondingNodeId,
  onSelectNode,
  onOpenNodeMenu
}: RequirementDagCanvasProps): JSX.Element {
  const { t } = useLocalization()
  const pageActive = useWorkspacePageActive()
  const [canvasReady, setCanvasReady] = useState(pageActive)
  const [canvasGeneration, setCanvasGeneration] = useState(0)
  const [keyboardFocusNodeId, setKeyboardFocusNodeId] = useState<string>()
  const model = useMemo(
    () => createRequirementDagModel(view, selectedNodeId),
    [selectedNodeId, view]
  )
  const nodes = useMemo<RequirementDagCanvasNode[]>(
    () =>
      model.nodes.map((node) => ({
        ...node,
        draggable: false,
        selectable: true,
        deletable: false,
        ariaLabel: node.data.name,
        data: {
          ...node.data,
          responding: node.id === respondingNodeId,
          onOpenMenu: onOpenNodeMenu,
          onSelect: onSelectNode,
          onNavigate: (nodeId, key) => {
            const nextNode = findDirectionalNode(model.nodes, nodeId, key)
            if (nextNode) setKeyboardFocusNodeId(nextNode.id)
          }
        }
      })),
    [
      canvasGeneration,
      model.nodes,
      onOpenNodeMenu,
      onSelectNode,
      respondingNodeId
    ]
  )
  const edges = useMemo<RequirementDagEdge[]>(
    () =>
      model.edges.map((edge) => ({
        ...edge,
        type: 'smoothstep',
        className: [
          'requirement-dag-edge',
          edge.data?.completed ? 'is-completed' : ''
        ]
          .filter(Boolean)
          .join(' '),
        markerEnd: { type: MarkerType.ArrowClosed }
      })),
    [canvasGeneration, model.edges]
  )
  const nodeIds = useMemo(() => nodes.map(({ id }) => id), [nodes])
  const contentSize = useMemo(() => ({
    width:
      Math.max(...nodes.map(({ position }) => position.x)) +
      REQUIREMENT_DAG_NODE_WIDTH +
      DAG_CONTENT_MARGIN,
    height: Math.max(
      DAG_MIN_HEIGHT,
      Math.max(...nodes.map(({ position }) => position.y)) +
        REQUIREMENT_DAG_NODE_HEIGHT +
        DAG_CONTENT_MARGIN
    )
  }), [nodes])

  useEffect(() => {
    if (!pageActive) {
      setCanvasReady(false)
      return
    }
    if (canvasReady) return
    const timeout = window.setTimeout(() => {
      setCanvasGeneration((generation) => generation + 1)
      setCanvasReady(true)
    }, 32)
    return () => window.clearTimeout(timeout)
  }, [canvasReady, pageActive])

  useEffect(() => {
    if (!keyboardFocusNodeId) return
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `.requirement-dag-canvas .react-flow__node[data-id="${keyboardFocusNodeId}"]`
        )
        ?.focus()
    })
  }, [keyboardFocusNodeId])

  if (nodes.length === 0) {
    return (
      <div className="requirement-dag-empty" role="status">
        {t('workflowCanvas.emptyReadOnly')}
      </div>
    )
  }

  return (
    <div
      className="requirement-dag-canvas"
      style={{ height: contentSize.height }}
      aria-label={t('workflowCanvas.ariaLabel', {
        name: t('requirementDetail.title')
      })}
    >
      <div
        className="requirement-dag-scroll-content"
        data-testid="dag-scroll-content"
        style={{ width: contentSize.width, height: contentSize.height }}
      >
        {canvasReady ? (
          <ReactFlowProvider>
            <RequirementDagMeasurementSync nodeIds={nodeIds} />
            <ReactFlow<RequirementDagCanvasNode, RequirementDagEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              minZoom={1}
              maxZoom={1}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_event, node: Node) => onSelectNode(node.id)}
            />
          </ReactFlowProvider>
        ) : null}
      </div>
    </div>
  )
}

function RequirementDagMeasurementSync({
  nodeIds
}: {
  nodeIds: string[]
}): null {
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => {
    const timeout = window.setTimeout(
      () => updateNodeInternals(nodeIds),
      32
    )
    return () => window.clearTimeout(timeout)
  }, [nodeIds, updateNodeInternals])

  return null
}

type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

function findDirectionalNode<T extends Pick<Node, 'id' | 'position'>>(
  nodes: T[],
  nodeId: string,
  key: ArrowKey
): T | undefined {
  const current = nodes.find((node) => node.id === nodeId)
  if (!current) return undefined
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1

  return nodes
    .filter((node) => {
      if (node.id === current.id) return false
      const delta = horizontal
        ? node.position.x - current.position.x
        : node.position.y - current.position.y
      return Math.sign(delta) === sign
    })
    .sort((left, right) => {
      const score = (node: T): number => {
        const primary = horizontal
          ? Math.abs(node.position.x - current.position.x)
          : Math.abs(node.position.y - current.position.y)
        const secondary = horizontal
          ? Math.abs(node.position.y - current.position.y)
          : Math.abs(node.position.x - current.position.x)
        return primary * 1000 + secondary
      }
      return score(left) - score(right) || left.id.localeCompare(right.id)
    })[0]
}
