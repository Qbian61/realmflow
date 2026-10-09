import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import { WorkflowNodeQuickMenu } from './WorkflowNodeQuickMenu'

const fitView = vi.hoisted(() => vi.fn())

vi.mock('@xyflow/react', async (loadOriginal) => ({
  ...(await loadOriginal<typeof import('@xyflow/react')>()),
  useReactFlow: () => ({ fitView })
}))

describe('WorkflowNodeQuickMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('focuses one node or its complete upstream and downstream graph', () => {
    render(
      <LocalizationProvider>
        <WorkflowNodeQuickMenu
          nodeId="b"
          position={{ x: 24, y: 36 }}
          readOnly={false}
          edges={[
            { id: 'a-b', source: 'a', target: 'b' },
            { id: 'b-c', source: 'b', target: 'c' }
          ]}
          onCopy={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('menuitem', { name: '定位节点' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '查看全部上游' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '查看全部下游' }))

    expect(fitView).toHaveBeenNthCalledWith(1, {
      nodes: [{ id: 'b' }],
      padding: 0.35,
      duration: 220
    })
    expect(fitView).toHaveBeenNthCalledWith(2, {
      nodes: [{ id: 'a' }, { id: 'b' }],
      padding: 0.25,
      duration: 220
    })
    expect(fitView).toHaveBeenNthCalledWith(3, {
      nodes: [{ id: 'b' }, { id: 'c' }],
      padding: 0.25,
      duration: 220
    })
  })

  it('offers copy and delete mutations only in editable mode', () => {
    const onCopy = vi.fn()
    const onDelete = vi.fn()
    const { rerender } = render(
      <LocalizationProvider>
        <WorkflowNodeQuickMenu
          nodeId="b"
          position={{ x: 0, y: 0 }}
          readOnly={false}
          edges={[]}
          onCopy={onCopy}
          onDelete={onDelete}
          onClose={vi.fn()}
        />
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('menuitem', { name: '复制节点' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除节点' }))
    expect(onCopy).toHaveBeenCalledWith('b')
    expect(onDelete).toHaveBeenCalledWith('b')

    rerender(
      <LocalizationProvider>
        <WorkflowNodeQuickMenu
          nodeId="b"
          position={{ x: 0, y: 0 }}
          readOnly
          edges={[]}
          onCopy={onCopy}
          onDelete={onDelete}
          onClose={vi.fn()}
        />
      </LocalizationProvider>
    )
    expect(screen.queryByRole('menuitem', { name: '复制节点' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '删除节点' })).toBeNull()
  })
})
