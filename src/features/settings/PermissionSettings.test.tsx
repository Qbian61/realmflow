import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import type { ToolPermissionApi } from '../../../shared/tool-permissions'
import { PermissionSettings } from './PermissionSettings'

function fixture(): ToolPermissionApi {
  return {
    listPending: vi.fn().mockResolvedValue([]), resolve: vi.fn(),
    onChanged: vi.fn().mockReturnValue(() => {}),
    listGrants: vi.fn().mockResolvedValue([{
      id: 'grant-1', mode: 'allow_space', toolId: 'files.write', toolName: 'Write result',
      effectiveRisk: 'L2', approvalProfileId: 'protected', grantedAt: 100,
      sessionId: 'chat-1', workspaceId: 'space-1',
      resources: [{ kind: 'path', label: 'result.txt' }],
    }]),
    revokeGrant: vi.fn().mockResolvedValue(undefined),
  }
}

describe('PermissionSettings', () => {
  it('saves a default only after Main confirms and filters history by risk', async () => {
    const api = fixture()
    api.getDefault = vi.fn().mockResolvedValue({ approvalProfileId: 'protected', revision: 4 })
    api.setDefault = vi.fn().mockResolvedValue({ approvalProfileId: 'cautious', revision: 5 })
    api.history = vi.fn().mockResolvedValue({ records: [{
      executionId: 'execution-1', toolId: 'browser.submit', approvalProfileId: 'protected',
      effectiveRisk: 'L4', outcome: 'approved', asked: true, occurredAt: 100, waitMs: 2000
    }], metrics: [{ approvalProfileId: 'protected', automatic: 3, reused: 1, asked: 2, denied: 1, waitMs: 2000 }] })
    render(<LocalizationProvider><PermissionSettings api={api} /></LocalizationProvider>)
    const select = await screen.findByRole('combobox', { name: '新会话默认审批模式' })
    fireEvent.change(select, { target: { value: 'cautious' } })
    await waitFor(() => expect(api.setDefault).toHaveBeenCalledWith({ approvalProfileId: 'cautious', revision: 4 }))
    fireEvent.change(screen.getByRole('combobox', { name: '风险等级' }), { target: { value: 'L4' } })
    await waitFor(() => expect(api.history).toHaveBeenCalledWith({ risk: 'L4', limit: 100 }))
    expect(await screen.findByText('browser.submit')).toBeVisible()
    expect(screen.getByText(/建议使用自动防护/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '查看撤销影响' }))
    expect(await screen.findByText(/仅影响完全匹配/)).toBeVisible()
    expect(api.revokeGrant).not.toHaveBeenCalled()
  })

  it('shows precise grants and removes a grant only after Main confirms revocation', async () => {
    const api = fixture()
    let confirm!: () => void
    vi.mocked(api.revokeGrant).mockImplementation(() => new Promise(resolve => { confirm = resolve }))
    render(<LocalizationProvider><PermissionSettings api={api} /></LocalizationProvider>)
    expect(await screen.findByText('Write result')).toBeVisible()
    expect(screen.getByText('本空间允许')).toBeVisible()
    expect(screen.getByText('result.txt')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '撤销授权' }))
    await waitFor(() => expect(api.revokeGrant).toHaveBeenCalledWith('grant-1'))
    expect(screen.getByText('Write result')).toBeVisible()
    vi.mocked(api.listGrants).mockResolvedValue([])
    confirm()
    expect(await screen.findByText('暂无可复用授权')).toBeVisible()
  })

  it('retains the grant and displays a failure when revocation fails', async () => {
    const api = fixture()
    vi.mocked(api.revokeGrant).mockRejectedValue(new Error('failed'))
    render(<LocalizationProvider><PermissionSettings api={api} /></LocalizationProvider>)
    await screen.findByText('Write result')
    fireEvent.click(screen.getByRole('button', { name: '撤销授权' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法撤销授权')
    expect(screen.getByText('Write result')).toBeVisible()
  })
})
