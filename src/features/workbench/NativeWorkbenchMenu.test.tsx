import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { NativeWorkbenchMenu } from './NativeWorkbenchMenu'

describe('NativeWorkbenchMenu', () => {
  it('filters actions and returns the selected action', () => {
    const onAction = vi.fn()
    render(
      <NativeWorkbenchMenu
        onAction={onAction}
        onClose={vi.fn()}
      />
    )

    fireEvent.change(
      screen.getByRole('searchbox', { name: '搜索工作区功能' }),
      { target: { value: '终端' } }
    )

    expect(screen.getByRole('menuitem', { name: '终端' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '文件' }))
      .not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '终端' }))
    expect(onAction).toHaveBeenCalledWith('terminal')
  })

  it('closes from Escape', () => {
    const onClose = vi.fn()
    render(
      <NativeWorkbenchMenu
        onAction={vi.fn()}
        onClose={onClose}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
