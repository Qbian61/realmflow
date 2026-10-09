import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { NativeWorkbenchMenu } from './NativeWorkbenchMenu'

function renderMenu(
  onAction = vi.fn(),
  onClose = vi.fn()
): {
  onAction: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} {
  render(
    <LocalizationProvider>
      <NativeWorkbenchMenu onAction={onAction} onClose={onClose} />
    </LocalizationProvider>
  )
  return { onAction, onClose }
}

describe('NativeWorkbenchMenu', () => {
  it('filters actions and returns the selected action', () => {
    const onAction = vi.fn()
    renderMenu(onAction)

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

  it('uses shared menu behavior while keeping search focus', () => {
    renderMenu()

    const search = screen.getByRole('searchbox', {
      name: '搜索工作区功能',
    })
    expect(search).toHaveFocus()
    expect(screen.getByRole('menu', { name: '添加工作区内容' }))
      .toHaveClass('ui-menu')

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: '文件' })).toHaveFocus()
  })

  it('closes from Escape', () => {
    const onClose = vi.fn()
    renderMenu(vi.fn(), onClose)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('localizes actions and search affordances in Japanese', () => {
    window.localStorage.setItem(
      'realmflow:locale:v1',
      JSON.stringify({ version: 1, locale: 'ja' })
    )

    renderMenu()

    expect(
      screen.getByRole('searchbox', { name: 'ワークスペース機能を検索' })
    ).toHaveAttribute('placeholder', 'ファイル名を検索')
    expect(
      screen.getByRole('menuitem', { name: 'ターミナル' })
    ).toBeInTheDocument()
  })
})
