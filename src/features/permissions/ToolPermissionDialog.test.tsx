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
          onDeny={vi.fn()}
          onLater={vi.fn()}
        />
      </LocalizationProvider>
    )

    const allow = screen.getByRole('button', { name: '允许删除' })
    expect(allow).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: '我了解此操作可能删除本地数据' })
    )
    fireEvent.click(allow)

    expect(onAllow).toHaveBeenCalledOnce()
    expect(screen.getByText('workspace/result.txt')).toBeVisible()
  })

  it('treats Escape as later without deciding', () => {
    const onLater = vi.fn()
    render(
      <LocalizationProvider>
        <ToolPermissionDialog
          request={{ ...request, reason: 'process' }}
          pending={false}
          onAllow={vi.fn()}
          onDeny={vi.fn()}
          onLater={onLater}
        />
      </LocalizationProvider>
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onLater).toHaveBeenCalledOnce()
  })
})
