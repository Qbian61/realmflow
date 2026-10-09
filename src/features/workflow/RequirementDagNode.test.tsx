import { fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import type { RequirementDagNode } from './requirement-dag-model'
import {
  RequirementDagNodeView,
  type RequirementDagNodeViewData
} from './RequirementDagNode'

describe('RequirementDagNodeView', () => {
  it('shows only the name, status icon, and duration in the compact node', () => {
    renderNode({
      status: 'running',
      attempt: 2,
      createdAt: 1_000,
      completedAt: 3_000,
      active: true,
      current: true,
      focused: false,
      selected: true,
      responding: true
    })

    const card = screen.getByRole('group', {
      name: '需求分析, 执行中, 2s, #2, 活动, 当前阶段'
    })
    expect(card).toHaveAttribute('data-status', 'running')
    expect(card).toHaveAttribute('data-active', 'true')
    expect(card).toHaveAttribute('data-current', 'true')
    expect(card).toHaveAttribute('data-selected', 'true')
    expect(card).toHaveAttribute('data-responding', 'true')
    expect(card).not.toHaveAttribute('title')
    expect(screen.getByText('2s')).toBeVisible()
    expect(screen.queryByText('执行中')).not.toBeInTheDocument()
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
    expect(screen.queryByText('活动')).not.toBeInTheDocument()
  })

  it('shows vertically arranged execution details while the node is hovered', () => {
    const executionRole = {
      executionRole: { kind: 'model' as const, label: 'DeepSeek V4 Pro' }
    }
    renderNode({
      status: 'running',
      createdAt: new Date(2026, 9, 1, 12, 12, 12).getTime(),
      completedAt: new Date(2026, 9, 1, 12, 12, 20).getTime(),
      ...executionRole
    })

    fireEvent.mouseEnter(screen.getByRole('group'))

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toBeVisible()
    expect(tooltip).toHaveTextContent('执行状态执行中')
    expect(tooltip).toHaveTextContent('开始时间2026/10/01 12:12:12')
    expect(tooltip).toHaveTextContent('结束时间2026/10/01 12:12:20')
    expect(tooltip).toHaveTextContent('执行角色DeepSeek V4 Pro')
    expect(
      Array.from(tooltip.querySelectorAll('.requirement-dag-node-tooltip-row'))
    ).toHaveLength(4)

    fireEvent.mouseLeave(screen.getByRole('group'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it.each(['pending', 'ready'] as const)(
    'shows no start time for a %s node even when its run has a creation timestamp',
    (status) => {
      renderNode({
        status,
        createdAt: new Date(2026, 9, 1, 12, 12, 12).getTime()
      })

      const card = screen.getByRole('group')
      fireEvent.focus(card)

      const tooltip = screen.getByRole('tooltip')
      expect(tooltip).toHaveTextContent('执行状态未开始')
      expect(tooltip).toHaveTextContent('开始时间--')
      expect(tooltip).toHaveTextContent('结束时间--')
      expect(tooltip).toHaveTextContent('执行角色--')

      fireEvent.blur(card)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    }
  )

  it.each([
    ['pending', '未开始'],
    ['running', '执行中'],
    ['skipped', '跳过'],
    ['completed', '成功']
  ] as const)('uses the requested tooltip label for %s', (status, label) => {
    renderNode({ status })

    fireEvent.mouseEnter(screen.getByRole('group'))

    expect(screen.getByRole('tooltip')).toHaveTextContent(`执行状态${label}`)
  })

  it('localizes a user execution role in the tooltip', () => {
    const executionRole = {
      executionRole: { kind: 'user' as const }
    }
    renderNode({ ...executionRole })

    fireEvent.mouseEnter(screen.getByRole('group'))

    expect(screen.getByRole('tooltip')).toHaveTextContent('执行角色用户')
  })

  it.each([
    'completed',
    'ready',
    'pending',
    'failed',
    'skipped',
    'cancelled'
  ] as const)('exposes the %s state for non-color styling', (status) => {
    renderNode({ status })

    expect(screen.getByRole('group')).toHaveAttribute('data-status', status)
  })

  it('isolates the menu button from node selection', () => {
    const onOpenMenu = vi.fn()
    const onParentClick = vi.fn()

    render(
      <div onClick={onParentClick}>
        <LocalizationProvider>
          <ReactFlowProvider>
            <RequirementDagNodeView
              {...nodeProps({ onOpenMenu })}
            />
          </ReactFlowProvider>
        </LocalizationProvider>
      </div>
    )

    const menuButton = screen.getByRole('button', {
      name: '需求分析操作'
    })
    fireEvent.click(menuButton)

    expect(onOpenMenu).toHaveBeenCalledWith('analysis', menuButton)
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('isolates menu keyboard activation from the node keyboard handler', () => {
    const onSelect = vi.fn()
    renderNode({ onSelect })

    const menuButton = screen.getByRole('button', {
      name: '需求分析操作'
    })
    fireEvent.keyDown(menuButton, { key: 'Enter' })
    fireEvent.keyDown(menuButton, { key: ' ' })

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not show node details while the pointer is over the menu region', () => {
    renderNode({ status: 'running' })

    fireEvent.mouseEnter(
      screen.getByRole('button', { name: '需求分析操作' })
    )

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('does not show node details when the menu button receives focus', () => {
    renderNode({ status: 'running' })

    fireEvent.focus(screen.getByRole('button', { name: '需求分析操作' }))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('uses the reference three-column layout for icon, copy, and actions', () => {
    const { container } = render(
      <LocalizationProvider>
        <ReactFlowProvider>
          <RequirementDagNodeView
            {...nodeProps({ status: 'completed', completedAt: 6_000 })}
          />
        </ReactFlowProvider>
      </LocalizationProvider>
    )

    const node = container.querySelector('.requirement-dag-node')
    expect(node?.children[0]).toHaveClass('requirement-dag-node-status')
    expect(node?.children[1]).toHaveClass('requirement-dag-node-copy')
    expect(node?.children[2]).toHaveClass('requirement-dag-node-menu-region')
    expect(node?.children[2].firstElementChild).toHaveClass(
      'requirement-dag-node-menu'
    )
    expect(
      container.querySelector('.requirement-dag-node-duration')
    ).toHaveTextContent('0s')
  })
})

function renderNode(
  overrides: Partial<RequirementDagNodeViewData> = {}
): void {
  render(
    <LocalizationProvider>
      <ReactFlowProvider>
        <RequirementDagNodeView {...nodeProps(overrides)} />
      </ReactFlowProvider>
    </LocalizationProvider>
  )
}

function nodeProps(
  overrides: Partial<RequirementDagNodeViewData> = {}
): NodeProps<RequirementDagNode & { data: RequirementDagNodeViewData }> {
  return {
    id: 'analysis',
    type: 'requirementDagNode',
    selected: false,
    dragging: false,
    draggable: false,
    selectable: true,
    deletable: false,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: {
      id: 'analysis',
      name: '需求分析',
      type: 'ai_generate',
      status: 'pending',
      current: false,
      active: false,
      focused: false,
      selected: false,
      ...overrides
    }
  }
}
