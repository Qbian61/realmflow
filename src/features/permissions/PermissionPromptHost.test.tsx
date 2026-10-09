import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ToolPermissionApi } from '../../../shared/tool-permissions'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { PermissionPromptHost } from './PermissionPromptHost'

describe('PermissionPromptHost', () => {
  it('orders requests deterministically and keeps Later undecided', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: '稍后处理' }))
    expect(await screen.findByText('Second tool')).toBeVisible()
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
    fireEvent.click(screen.getByRole('button', { name: '允许一次' }))

    await waitFor(() => expect(api.listPending).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '权限请求已更新，请重新确认'
    )
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
