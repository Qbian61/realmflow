import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ToolPermissionApi } from '../../../shared/tool-permissions'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { PermissionPromptHost } from './PermissionPromptHost'
import { Composer } from '../../components/Composer'

describe('PermissionPromptHost', () => {
  it.each([
    ['拒绝', 'deny'], ['允许一次', 'allow_once'],
    ['本次会话允许', 'allow_session'], ['始终允许', 'allow_always']
  ] as const)('submits %s as a typed Main decision', async (name, decision) => {
    const api = permissionApi([permission('permission-1', 100, 'First tool')])
    render(<LocalizationProvider><PermissionPromptHost api={api} /></LocalizationProvider>)
    await screen.findByText('First tool')
    fireEvent.click(screen.getByRole('button', { name }))
    await waitFor(() => expect(api.resolve).toHaveBeenCalledWith({
      requestId: 'permission-1', expectedRevision: 1, decision
    }))
  })

  it('orders requests deterministically without a defer option', async () => {
    const api = permissionApi([
      permission('permission-2', 200, 'Second tool'),
      permission('permission-1', 100, 'First tool')
    ])
    render(
      <LocalizationProvider>
        <PermissionPromptHost api={api} />
      </LocalizationProvider>
    )

    expect(await screen.findByText('First tool')).toBeVisible()
    expect(screen.queryByRole('button', { name: '稍后处理' })).not.toBeInTheDocument()
    expect(screen.queryByText('Second tool')).not.toBeInTheDocument()
    expect(api.resolve).not.toHaveBeenCalled()
  })

  it('refreshes authoritative state after a revision conflict', async () => {
    const api = permissionApi([permission('permission-1', 100, 'First tool')])
    vi.mocked(api.resolve).mockRejectedValueOnce(
      new Error('permission_revision_conflict')
    )
    render(
      <LocalizationProvider>
        <PermissionPromptHost api={api} />
      </LocalizationProvider>
    )

    await screen.findByText('First tool')
    fireEvent.click(screen.getByRole('button', { name: /允许一次/ }))

    await waitFor(() => expect(api.listPending).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '权限请求已更新，请重新确认'
    )
  })

  it('does not hide the blocking request on Escape', async () => {
    const api = permissionApi([
      permission('permission-1', 100, 'Blocking tool')
    ])
    render(
      <LocalizationProvider>
        <PermissionPromptHost api={api} />
      </LocalizationProvider>
    )

    expect(await screen.findByText('Blocking tool')).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.getByText('Blocking tool')).toBeVisible()
    expect(api.resolve).not.toHaveBeenCalled()
  })

  it('advances to the next request after a decision', async () => {
    const first = permission('permission-1', 100, 'First tool')
    const second = permission('permission-2', 200, 'Second tool')
    const api = permissionApi([first, second])
    vi.mocked(api.listPending)
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second])
    render(
      <LocalizationProvider>
        <PermissionPromptHost api={api} />
      </LocalizationProvider>
    )

    expect(await screen.findByText('First tool')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /拒绝/ }))

    expect(await screen.findByText('Second tool')).toBeVisible()
  })

  it('replaces the matching Composer and restores its draft after approval', async () => {
    const api = permissionApi([permission('permission-1', 100, 'First tool')])
    vi.mocked(api.listPending).mockResolvedValueOnce([
      permission('permission-1', 100, 'First tool')
    ]).mockResolvedValueOnce([])
    const onSubmit = vi.fn()
    render(<LocalizationProvider>
      <Composer value="保留草稿" onChange={vi.fn()} onSubmit={onSubmit}
        placeholder="输入" fileInputId="overlay-test-file"
        labels={{ textarea: '主对话输入框', model: '模型', workspace: '空间',
          permission: '权限', submit: '发送', menu: '菜单', openMenu: '打开', closeMenu: '关闭' }}
        insertions={{ mode: '', skill: '', connector: '' }}
        permissionRunIds={['run-1']} />
      <PermissionPromptHost api={api} />
    </LocalizationProvider>)
    await screen.findByText('First tool')
    const textarea = screen.getByDisplayValue('保留草稿')
    const form = textarea.closest('form')!
    await waitFor(() => expect(form).toHaveAttribute('hidden'))
    expect(form).toHaveAttribute('inert')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    const slot = screen.getByRole('region').parentElement!
    expect(slot.parentElement).toHaveClass('composer-surface')
    fireEvent.click(screen.getByRole('button', { name: '允许一次' }))
    await waitFor(() => expect(form).not.toHaveAttribute('hidden'))
    expect(form).not.toHaveAttribute('inert')
    expect(screen.getByRole('textbox')).toHaveValue('保留草稿')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

function permissionApi(
  requests: ReturnType<typeof permission>[]
): ToolPermissionApi {
  return {
    listPending: vi.fn().mockResolvedValue(requests),
    resolve: vi.fn().mockResolvedValue({
      ...requests[0],
      status: 'approved',
      decision: 'allow_once'
    }),
    onChanged: vi.fn().mockReturnValue(() => undefined)
  }
}

function permission(id: string, requestedAt: number, toolName: string) {
  return {
    schemaVersion: 2 as const,
    id,
    executionId: `execution-${id}`,
    runId: 'run-1',
    callId: `call-${id}`,
    toolId: 'builtin.process.run',
    toolName,
    status: 'requested' as const,
    reason: 'process' as const,
    risk: 'high' as const,
    effectsDigest: 'a'.repeat(64),
    argumentsDigest: 'b'.repeat(64),
    bindingRevision: 1,
    requestRevision: 1,
    requestedAt,
    expiresAt: Date.now() + 60_000,
    resources: [{ kind: 'process' as const, label: 'python report.py' }]
  }
}
