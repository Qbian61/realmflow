import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ComponentProps, type ReactNode, useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequirementExecutionViewDto } from '../../../shared/business'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { RequirementDagCanvas } from './RequirementDagCanvas'
import {
  REQUIREMENT_DAG_NODE_WIDTH
} from './requirement-dag-model'

const routeActivity = vi.hoisted(() => ({ active: true }))
const updateNodeInternals = vi.hoisted(() => vi.fn())
const flowLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))

vi.mock('../navigation/WorkspaceRouteCache', () => ({
  useWorkspacePageActive: () => routeActivity.active
}))

const scheduleFrame = vi
  .spyOn(window, 'requestAnimationFrame')
  .mockImplementation((callback) => {
    callback(0)
    return 1
  })
let latestFlowProps:
  | (ComponentProps<'div'> & {
      nodes: Array<{
        id: string
        draggable?: boolean
        width?: number
        height?: number
        position: { x: number; y: number }
        data: {
          onSelect?: (nodeId: string) => void
          onNavigate?: (
            nodeId: string,
            key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
          ) => void
        }
      }>
      edges: Array<{
        id: string
        source: string
        target: string
        className?: string
        markerEnd?: unknown
      }>
      onNodeClick?: (
        event: React.MouseEvent,
        node: { id: string }
      ) => void
      proOptions?: { hideAttribution?: boolean }
      children?: ReactNode
    })
  | undefined

vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="dag-background" />,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => <div data-testid="dag-controls" />,
  Handle: () => <span />,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right' },
  ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
  useUpdateNodeInternals: () => updateNodeInternals,
  ReactFlow: (props: NonNullable<typeof latestFlowProps>) => {
    useEffect(() => {
      flowLifecycle.mounts += 1
      return () => {
        flowLifecycle.unmounts += 1
      }
    }, [])
    latestFlowProps = props
    return (
      <div data-testid="react-flow">
        {props.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className="react-flow__node"
            data-id={node.id}
            onClick={(event) => props.onNodeClick?.(event, node)}
            onKeyDown={(event) => {
              if (
                event.key === 'ArrowLeft' ||
                event.key === 'ArrowRight' ||
                event.key === 'ArrowUp' ||
                event.key === 'ArrowDown'
              ) {
                node.data.onNavigate?.(node.id, event.key)
              } else if (event.key === 'Enter' || event.key === ' ') {
                node.data.onSelect?.(node.id)
              } else if (event.key === 'Escape') {
                event.currentTarget.blur()
              }
            }}
          >
            {node.id}
          </button>
        ))}
        {props.children}
      </div>
    )
  },
}))

describe('RequirementDagCanvas', () => {
  beforeEach(() => {
    scheduleFrame.mockClear()
    latestFlowProps = undefined
    routeActivity.active = true
    updateNodeInternals.mockReset()
    flowLifecycle.mounts = 0
    flowLifecycle.unmounts = 0
  })

  it('renders real branch and join edges with directional completion styling', () => {
    renderCanvas(
      <RequirementDagCanvas
        view={executionView()}
        selectedNodeId="branch-a"
        onSelectNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
      />
    )

    expect(
      latestFlowProps?.edges.map(
        ({ source, target, className, markerEnd }) => ({
          source,
          target,
          className,
          markerEnd
        })
      )
    ).toEqual([
      {
        source: 'start',
        target: 'branch-a',
        className: 'requirement-dag-edge is-completed',
        markerEnd: { type: 'arrowclosed' }
      },
      {
        source: 'start',
        target: 'branch-b',
        className: 'requirement-dag-edge is-completed',
        markerEnd: { type: 'arrowclosed' }
      },
      {
        source: 'branch-a',
        target: 'join',
        className: 'requirement-dag-edge',
        markerEnd: { type: 'arrowclosed' }
      },
      {
        source: 'branch-b',
        target: 'join',
        className: 'requirement-dag-edge',
        markerEnd: { type: 'arrowclosed' }
      }
    ])
  })

  it('selects nodes without enabling topology editing', () => {
    const onSelectNode = vi.fn()
    renderCanvas(
      <RequirementDagCanvas
        view={executionView()}
        selectedNodeId="start"
        onSelectNode={onSelectNode}
        onOpenNodeMenu={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'branch-a' }))

    expect(onSelectNode).toHaveBeenCalledWith('branch-a')
    expect(latestFlowProps).toEqual(
      expect.objectContaining({
        nodesDraggable: false,
        nodesConnectable: false,
        elementsSelectable: true,
        panOnDrag: false,
        zoomOnScroll: false,
        zoomOnPinch: false,
        zoomOnDoubleClick: false,
        preventScrolling: false,
        minZoom: 1,
        maxZoom: 1,
        defaultViewport: { x: 0, y: 0, zoom: 1 }
      })
    )
    expect(latestFlowProps).not.toHaveProperty('fitView')
    expect(latestFlowProps).not.toHaveProperty('fitViewOptions')
    expect(latestFlowProps?.proOptions).toEqual({ hideAttribution: true })
    expect(
      latestFlowProps?.nodes.every(({ draggable }) => draggable === false)
    ).toBe(true)
    expect(
      latestFlowProps?.nodes.every(
        (node) => node.width === undefined && node.height === undefined
      )
    ).toBe(true)
    expect(screen.queryByTestId('dag-controls')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dag-background')).not.toBeInTheDocument()
  })

  it('uses the full graph width so long DAGs scroll instead of shrinking', () => {
    renderCanvas(
      <RequirementDagCanvas
        view={executionView()}
        selectedNodeId="start"
        onSelectNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
      />
    )

    const rightmostNode = Math.max(
      ...(latestFlowProps?.nodes.map(({ position }) => position.x) ?? [])
    )
    expect(screen.getByTestId('dag-scroll-content')).toHaveStyle({
      width: `${rightmostNode + REQUIREMENT_DAG_NODE_WIDTH + 32}px`
    })
  })

  it('keeps a single-row DAG compact', () => {
    const view = executionView()
    view.workflow.nodes = view.workflow.nodes.filter(
      ({ id }) => id !== 'branch-b'
    )
    view.workflow.edges = [
      workflowEdge('start', 'branch-a'),
      workflowEdge('branch-a', 'join')
    ]
    view.nodes = view.nodes.filter(({ id }) => id !== 'branch-b')
    const { container } = renderCanvas(
      <RequirementDagCanvas
        view={view}
        selectedNodeId="start"
        onSelectNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
      />
    )

    expect(container.querySelector('.requirement-dag-canvas')).toHaveStyle({
      height: '180px'
    })
    expect(screen.getByTestId('dag-scroll-content')).toHaveStyle({
      height: '180px'
    })
  })

  it('centers two parallel nodes without growing the minimum DAG height', () => {
    const { container } = renderCanvas(
      <RequirementDagCanvas
        view={executionView()}
        selectedNodeId="start"
        onSelectNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
      />
    )

    expect(container.querySelector('.requirement-dag-canvas')).toHaveStyle({
      height: '180px'
    })
    expect(
      latestFlowProps?.nodes
        .filter(({ id }) => id.startsWith('branch-'))
        .map(({ position }) => position.y)
    ).toEqual([32, 102])
  })

  it('grows the DAG height for three parallel nodes', () => {
    const view = executionView()
    view.workflow.nodes.splice(
      3,
      0,
      workflowNode('branch-c', 3, 'pending')
    )
    view.workflow.nodes[4].order = 4
    view.workflow.edges = [
      workflowEdge('start', 'branch-a'),
      workflowEdge('start', 'branch-b'),
      workflowEdge('start', 'branch-c'),
      workflowEdge('branch-a', 'join'),
      workflowEdge('branch-b', 'join'),
      workflowEdge('branch-c', 'join')
    ]
    view.nodes.splice(3, 0, {
      id: 'branch-c',
      name: 'branch-c',
      type: 'ai_generate',
      status: 'pending',
      current: false,
      active: false,
      focused: false,
      attempt: 1
    })
    view.progress.totalNodes = 5
    const { container } = renderCanvas(
      <RequirementDagCanvas
        view={view}
        selectedNodeId="start"
        onSelectNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
      />
    )

    expect(container.querySelector('.requirement-dag-canvas')).toHaveStyle({
      height: '250px'
    })
  })

  it('moves through the graph with arrows, selects with Enter, and releases focus with Escape', () => {
    const onSelectNode = vi.fn()
    renderCanvas(
      <RequirementDagCanvas
        view={executionView()}
        selectedNodeId="start"
        onSelectNode={onSelectNode}
        onOpenNodeMenu={vi.fn()}
      />
    )

    const start = screen.getByRole('button', { name: 'start' })
    start.focus()
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: 'branch-a' })).toHaveFocus()

    fireEvent.keyDown(start, { key: 'Enter' })
    expect(onSelectNode).toHaveBeenCalledWith('start')

    fireEvent.keyDown(start, { key: 'Escape' })
    expect(start).not.toHaveFocus()
  })

  it('remeasures every node after a cached page becomes active again', async () => {
    const scheduleTimeout = vi.spyOn(window, 'setTimeout')
    routeActivity.active = false
    const result = renderCanvas(
      <RequirementDagCanvas
        view={executionView()}
        selectedNodeId="start"
        onSelectNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
      />
    )
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
    expect(flowLifecycle.mounts).toBe(0)
    expect(updateNodeInternals).not.toHaveBeenCalled()

    routeActivity.active = true
    result.rerender(
      localized(
        <RequirementDagCanvas
          view={executionView()}
          selectedNodeId="start"
          onSelectNode={vi.fn()}
          onOpenNodeMenu={vi.fn()}
        />
      )
    )

    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('react-flow')).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(updateNodeInternals).toHaveBeenCalledWith([
        'start',
        'branch-a',
        'branch-b',
        'join'
      ])
    )
    expect(flowLifecycle.mounts).toBe(1)
    expect(flowLifecycle.unmounts).toBe(0)
    expect(scheduleFrame).not.toHaveBeenCalled()
    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 32)
    scheduleTimeout.mockRestore()
  })

  it('remeasures nodes after a freshly mounted React Flow reaches layout', async () => {
    renderCanvas(
      <RequirementDagCanvas
        view={executionView()}
        selectedNodeId="start"
        onSelectNode={vi.fn()}
        onOpenNodeMenu={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(updateNodeInternals).toHaveBeenCalledWith([
        'start',
        'branch-a',
        'branch-b',
        'join'
      ])
    )
  })

  it('creates fresh controlled node objects after cached activation', async () => {
    const view = executionView()
    const onSelectNode = vi.fn()
    const onOpenNodeMenu = vi.fn()
    const result = renderCanvas(
      <RequirementDagCanvas
        view={view}
        selectedNodeId="start"
        onSelectNode={onSelectNode}
        onOpenNodeMenu={onOpenNodeMenu}
      />
    )
    const initialNodes = latestFlowProps?.nodes

    routeActivity.active = false
    result.rerender(
      localized(
        <RequirementDagCanvas
          view={view}
          selectedNodeId="start"
          onSelectNode={onSelectNode}
          onOpenNodeMenu={onOpenNodeMenu}
        />
      )
    )
    routeActivity.active = true
    result.rerender(
      localized(
        <RequirementDagCanvas
          view={view}
          selectedNodeId="start"
          onSelectNode={onSelectNode}
          onOpenNodeMenu={onOpenNodeMenu}
        />
      )
    )

    await waitFor(() => expect(screen.getByTestId('react-flow')).toBeVisible())
    expect(latestFlowProps?.nodes).not.toBe(initialNodes)
  })
})

function localized(children: ReactNode): JSX.Element {
  return <LocalizationProvider>{children}</LocalizationProvider>
}

function renderCanvas(children: ReactNode) {
  return render(localized(children))
}

function executionView(): RequirementExecutionViewDto {
  const workflowNodes = [
    workflowNode('start', 0, 'completed'),
    workflowNode('branch-a', 1, 'pending'),
    workflowNode('branch-b', 2, 'pending'),
    workflowNode('join', 3, 'pending')
  ]
  const workflowEdges = [
    workflowEdge('start', 'branch-a'),
    workflowEdge('start', 'branch-b'),
    workflowEdge('branch-a', 'join'),
    workflowEdge('branch-b', 'join')
  ]
  return {
    workflow: {
      requirementId: 'requirement-1',
      templateVersionId: 'template-1',
      revision: 1,
      maxParallelism: 2,
      nodes: workflowNodes,
      edges: workflowEdges
    },
    maxParallelism: 2,
    activeNodeIds: [],
    progress: { completedNodes: 1, totalNodes: 4, percent: 25 },
    nodes: workflowNodes.map(({ id, name, type, status }) => ({
      id,
      name,
      type,
      status,
      current: false,
      active: false,
      focused: false,
      attempt: 1
    })),
    selectedNode: {
      id: 'start',
      contextSources: [],
      todos: [],
      questions: [],
      artifacts: []
    }
  }
}

function workflowNode(
  id: string,
  order: number,
  status: RequirementExecutionViewDto['nodes'][number]['status']
) {
  return {
    id,
    name: id,
    type: 'ai_generate' as const,
    description: '',
    order,
    status,
    allowSkip: false
  }
}

function workflowEdge(sourceNodeId: string, targetNodeId: string) {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId
  }
}
