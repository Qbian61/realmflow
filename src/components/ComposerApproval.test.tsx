import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Composer } from './Composer'
import { LocalizationProvider } from '../localization/LocalizationProvider'

it('shows the approval selector without workspace context and preserves the draft', () => {
  const onApprovalProfileChange = vi.fn()
  render(<LocalizationProvider><Composer
    value="保留草稿" placeholder="输入" fileInputId="attachment"
    labels={{ textarea: '内容', model: '模型', workspace: '空间', permission: '审批模式',
      submit: '发送', menu: '菜单', openMenu: '打开', closeMenu: '关闭' }}
    insertions={{ mode: '', skill: '', connector: '' }}
    showContext={false} approvalProfileId="protected"
    onApprovalProfileChange={onApprovalProfileChange} onChange={vi.fn()} onSubmit={vi.fn()}
  /></LocalizationProvider>)
  const selector = screen.getByRole('combobox', { name: '审批模式' })
  expect(screen.getByRole('toolbar', { name: '菜单' })).toContainElement(selector)
  expect(selector.closest('.composer-input')).not.toBeNull()
  expect(document.querySelector('.composer-context')).toBeNull()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.click(selector)
  expect(document.querySelector('.approval-profile-selector-popover')).toHaveClass(
    'model-selector-popover',
    'ui-menu',
  )
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
    '谨慎确认写入、执行等重要操作由你确认',
    '自动防护安全操作自动执行，必要时再询问你',
    '受信任执行在授权范围内自动执行，关键操作仍需确认',
  ])
  expect(screen.getByText('写入、执行等重要操作由你确认')).toBeInTheDocument()
  expect(screen.getByText('安全操作自动执行，必要时再询问你')).toBeInTheDocument()
  expect(
    screen.getByRole('option', { name: '受信任执行' }),
  ).toHaveClass('approval-profile-option--trusted')
  expect(screen.getByRole('option', { name: '自动防护' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const options = screen.getAllByRole('option')
  expect(options[0]).toHaveFocus()
  fireEvent.keyDown(options[0], { key: 'ArrowDown' })
  expect(options[1]).toHaveFocus()
  fireEvent.keyDown(options[1], { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(selector).toHaveFocus()
  fireEvent.click(selector)
  fireEvent.click(screen.getByRole('option', { name: '谨慎确认' }))
  expect(onApprovalProfileChange).toHaveBeenCalledWith('cautious')
  expect(screen.getByRole('textbox', { name: '内容' })).toHaveValue('保留草稿')
  expect(
    screen.getByRole('button', { name: '打开' }).querySelector('svg'),
  ).toHaveAttribute('width', '18')
  expect(
    screen.getByRole('button', { name: '发送' }).querySelector('svg'),
  ).toHaveAttribute('width', '17')
})

it('offers a one-turn context routing segmented control', () => {
  const onContextModeChange = vi.fn()
  render(<LocalizationProvider><Composer
    value="继续" placeholder="输入" fileInputId="attachment-context"
    labels={{ textarea: '内容', model: '模型', workspace: '空间', permission: '审批模式',
      submit: '发送', menu: '菜单', openMenu: '打开', closeMenu: '关闭' }}
    insertions={{ mode: '', skill: '', connector: '' }}
    showContext={false} contextMode="auto" showContextMode
    onContextModeChange={onContextModeChange}
    onChange={vi.fn()} onSubmit={vi.fn()}
  /></LocalizationProvider>)

  const modes = screen.getByRole('radiogroup', { name: '上下文范围' })
  expect(modes).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: '自动' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  fireEvent.click(screen.getByRole('radio', { name: '新任务' }))
  expect(onContextModeChange).toHaveBeenCalledWith('fresh')
  fireEvent.click(screen.getByRole('radio', { name: '继续任务' }))
  expect(onContextModeChange).toHaveBeenCalledWith('continuation')
})

it('uses the same downward threshold as model and approval selectors for workspace placement', () => {
  render(<LocalizationProvider><Composer
    value="" placeholder="输入" fileInputId="attachment-workspace"
    labels={{ textarea: '内容', model: '模型', workspace: '空间', permission: '审批模式',
      submit: '发送', menu: '菜单', openMenu: '打开', closeMenu: '关闭' }}
    insertions={{ mode: '', skill: '', connector: '' }}
    showContext
    workspaceOptions={[
      { value: 'none', label: '通用对话' },
      { value: 'local', label: '本地文件夹' },
    ]}
    onChange={vi.fn()} onSubmit={vi.fn()}
  /></LocalizationProvider>)

  const selector = screen.getByRole('combobox', { name: '空间' })
  vi.spyOn(selector.parentElement as HTMLElement, 'getBoundingClientRect')
    .mockReturnValue({
      top: 308,
      bottom: 528,
      left: 0,
      right: 180,
      width: 180,
      height: 36,
      x: 0,
      y: 308,
      toJSON: () => ({}),
    })
  vi.stubGlobal('innerHeight', 900)

  fireEvent.click(selector)

  expect(document.querySelector('.composer-workspace-selector-popover')).toHaveAttribute(
    'data-placement',
    'down',
  )
})
