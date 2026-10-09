import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import { WorkflowCanvasToolbar } from './WorkflowCanvasToolbar'

const reactFlow = vi.hoisted(() => ({
  fitView: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  screenToFlowPosition: vi.fn(() => ({ x: 420, y: 260 }))
}))

vi.mock('@xyflow/react', async (loadOriginal) => ({
  ...(await loadOriginal<typeof import('@xyflow/react')>()),
  useReactFlow: () => reactFlow
}))

describe('WorkflowCanvasToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests a node at the visible canvas center', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <LocalizationProvider>
        <div className="react-flow">
          <WorkflowCanvasToolbar
            readOnly={false}
            hasSelection={false}
            canUndo={false}
            canRedo={false}
            onAdd={onAdd}
            onCopy={vi.fn()}
            onDelete={vi.fn()}
            connectionTargets={[]}
            onConnect={vi.fn()}
            onAutoLayout={vi.fn()}
            onUndo={vi.fn()}
            onRedo={vi.fn()}
          />
        </div>
      </LocalizationProvider>
    )
    const surface = container.querySelector('.react-flow') as HTMLElement
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 40,
      left: 20,
      top: 40,
      right: 1020,
      bottom: 640,
      width: 1000,
      height: 600,
      toJSON: () => ({})
    })

    fireEvent.click(screen.getByRole('button', { name: '添加节点' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '工具' }))

    expect(reactFlow.screenToFlowPosition).toHaveBeenCalledWith({
      x: 520,
      y: 340
    })
    expect(onAdd).toHaveBeenCalledWith('tool', { x: 420, y: 260 })
  })

  it('renders system-style icons in node and connection menus', () => {
    render(
      <LocalizationProvider>
        <div className="react-flow">
          <WorkflowCanvasToolbar
            readOnly={false}
            hasSelection
            canUndo={false}
            canRedo={false}
            onAdd={vi.fn()}
            onCopy={vi.fn()}
            onDelete={vi.fn()}
            connectionTargets={[{ id: 'review', name: 'Review' }]}
            onConnect={vi.fn()}
            onAutoLayout={vi.fn()}
            onUndo={vi.fn()}
            onRedo={vi.fn()}
          />
        </div>
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '添加节点' }))
    const nodeItem = screen.getByRole('menuitem', { name: 'AI 生成' })
    expect(nodeItem.closest('.ui-menu')).not.toBeNull()
    expect(within(nodeItem).getByTestId('workflow-node-type-icon')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '添加连线' }))
    const edgeItem = screen.getByRole('menuitem', {
      name: '连接到 Review'
    })
    expect(edgeItem.closest('.ui-menu')).not.toBeNull()
    expect(within(edgeItem).getByTestId('workflow-connect-target-icon')).toBeVisible()
  })
})
