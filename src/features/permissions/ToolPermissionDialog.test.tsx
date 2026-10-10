import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import type { PendingToolPermissionView } from '../../../shared/tool-permissions'
import { ToolPermissionDialog } from './ToolPermissionDialog'

const request: PendingToolPermissionView = {
  schemaVersion: 2,
  id: 'permission-1',
  executionId: 'execution-1',
  runId: 'run-1',
  callId: 'call-1',
  toolId: 'builtin.files.delete',
  toolName: 'Delete file',
  status: 'requested',
  reason: 'delete',
  risk: 'high',
  effectsDigest: 'a'.repeat(64),
  argumentsDigest: 'b'.repeat(64),
  bindingRevision: 1,
  requestRevision: 1,
  requestedAt: 100,
  expiresAt: 10_000,
  resources: [{ kind: 'path', label: 'workspace/result.txt' }]
}

describe('ToolPermissionDialog', () => {
  it('requires explicit confirmation before allowing a destructive action', () => {
    const onAllow = vi.fn()
    render(
      <LocalizationProvider>
        <ToolPermissionDialog
          request={request}
          pending={false}
          onAllow={onAllow}
          onAllowSession={vi.fn()}
          onAllowAlways={vi.fn()}
          onDeny={vi.fn()}
        />
      </LocalizationProvider>
    )

    const allow = screen.getByRole('button', { name: /允许一次/ })
    expect(allow).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: '我了解此操作可能删除本地数据' })
    )
    fireEvent.click(allow)

    expect(onAllow).toHaveBeenCalledOnce()
    expect(screen.getByText('workspace/result.txt')).toBeVisible()
  })

  it('keeps approval undecided on Escape and renders only four buttons without numbers', () => {
    const onDeny = vi.fn()
    render(
      <LocalizationProvider>
        <ToolPermissionDialog
          request={{ ...request, reason: 'process' }}
          pending={false}
          onAllow={vi.fn()}
          onAllowSession={vi.fn()}
          onAllowAlways={vi.fn()}
          onDeny={onDeny}
        />
      </LocalizationProvider>
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onDeny).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByText('稍后处理')).not.toBeInTheDocument()
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '拒绝' })).toHaveClass('ui-button--neutral')
  })

  it('renders four effective button choices', () => {
    const onDeny = vi.fn()
    const onAllowSession = vi.fn()
    const onAllowAlways = vi.fn()
    render(
      <LocalizationProvider>
        <ToolPermissionDialog
          request={{ ...request, reason: 'process', resources: [
            { kind: 'path', label: 'workspace/result.txt' },
            { kind: 'process', label: 'python report.py' }
          ] }}
          pending={false}
          onAllow={vi.fn()}
          onAllowSession={onAllowSession}
          onAllowAlways={onAllowAlways}
          onDeny={onDeny}
        />
      </LocalizationProvider>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '是否允许运行这个命令？' })).toBeVisible()
    expect(screen.getByText('python report.py')).toBeVisible()
    expect(screen.getByRole('button', { name: /本次会话允许/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /始终允许/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /本次会话允许/ }))
    fireEvent.click(screen.getByRole('button', { name: /始终允许/ }))
    expect(onAllowSession).toHaveBeenCalledOnce()
    expect(onAllowAlways).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    expect(onDeny).toHaveBeenCalledOnce()
  })

  it('does not approve through keyboard while a decision is pending', () => {
    const onAllow = vi.fn()
    render(
      <LocalizationProvider>
        <ToolPermissionDialog request={{ ...request, reason: 'process' }}
          pending onAllow={onAllow} onAllowSession={vi.fn()} onAllowAlways={vi.fn()}
          onDeny={vi.fn()} />
      </LocalizationProvider>
    )
    fireEvent.keyDown(document, { key: '1' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onAllow).not.toHaveBeenCalled()
  })
})
