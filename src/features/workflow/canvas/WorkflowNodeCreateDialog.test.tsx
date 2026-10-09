import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../../localization/LocalizationProvider'
import { WorkflowNodeCreateDialog } from './WorkflowNodeCreateDialog'

describe('WorkflowNodeCreateDialog', () => {
  it('uses the shared dialog, field, and action primitives', () => {
    render(
      <LocalizationProvider>
        <WorkflowNodeCreateDialog
          type="ai_generate"
          initialName="AI 生成"
          initialStableKey="node"
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
        />
      </LocalizationProvider>
    )

    const dialog = screen.getByRole('dialog', { name: '创建节点' })
    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--compact')
    expect(dialog.parentElement).toHaveClass('ui-dialog-backdrop')
    expect(screen.getByLabelText('节点名称').closest('.ui-field')).not.toBeNull()
    expect(
      screen.getByRole('button', { name: '创建节点' })
    ).toHaveClass('ui-button', 'ui-button--primary')
  })

  it('submits an editable name and stable key for the selected node type', () => {
    const onSubmit = vi.fn()

    render(
      <LocalizationProvider>
        <WorkflowNodeCreateDialog
          type="tool"
          initialName="工具"
          initialStableKey="node"
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      </LocalizationProvider>
    )

    fireEvent.change(screen.getByLabelText('节点名称'), {
      target: { value: '执行检查' }
    })
    fireEvent.change(screen.getByLabelText('稳定键'), {
      target: { value: 'run-check' }
    })
    fireEvent.click(screen.getByRole('button', { name: '创建节点' }))

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'tool',
      name: '执行检查',
      stableKey: 'run-check'
    })
  })

  it('keeps the dialog open when required values are blank', () => {
    const onSubmit = vi.fn()

    render(
      <LocalizationProvider>
        <WorkflowNodeCreateDialog
          type="ai_generate"
          initialName=""
          initialStableKey=""
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '创建节点' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('请输入节点名称')).toBeVisible()
    expect(screen.getByText('请输入稳定键')).toBeVisible()
  })
})
