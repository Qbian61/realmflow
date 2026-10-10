import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ToolPolicyApi, ToolPolicyConfiguration } from '../../../shared/tool-policy'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { ToolPolicyPanel } from './ToolPolicyPanel'

function api(): ToolPolicyApi {
  return {
    get: vi.fn().mockResolvedValue({ revision: null, layers: [], modelFacingMode: 'auto' }),
    save: vi.fn().mockResolvedValue({ revision: 'revision-1', layers: [{ profile: 'minimal' }], modelFacingMode: 'auto' }),
    preview: vi.fn().mockResolvedValue({
      digest: 'digest-1', providerId: '', context: 'general', mode: 'facade', directoryByteLength: 0,
      entries: [{ id: 'builtin.files.write', name: 'Write file', visibility: 'denied', reason: 'explicit_deny' }],
    }),
  }
}

function mount(value: ToolPolicyApi) {
  return render(<LocalizationProvider><ToolPolicyPanel api={value} /></LocalizationProvider>)
}

describe('ToolPolicyPanel', () => {
  it('saves presentation mode and reads back the effective mode from Main', async () => {
    const value = api()
    vi.mocked(value.get).mockResolvedValue({ revision: null, layers: [], modelFacingMode: 'auto' })
    vi.mocked(value.save).mockResolvedValue({ revision: 'saved', layers: [], modelFacingMode: 'directory' })
    vi.mocked(value.preview).mockResolvedValue({
      digest: 'digest', providerId: '', context: 'general', mode: 'directory',
      directoryByteLength: 1024, entries: [],
    })
    mount(value)
    expect(await screen.findByLabelText('工具呈现模式')).toHaveValue('auto')
    fireEvent.change(screen.getByLabelText('工具呈现模式'), { target: { value: 'directory' } })
    fireEvent.click(screen.getByRole('button', { name: '保存权限' }))
    await waitFor(() => expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ modelFacingMode: 'directory' })))
    expect(await screen.findByText('生效模式：按需目录')).toBeVisible()
    expect(screen.getByText('目录大小：1024 字节')).toBeVisible()
    expect(screen.getByLabelText('工具呈现模式')).toHaveValue('directory')
  })

  it('loads Main decisions and saves an explicit empty allowlist without optimistic success', async () => {
    const value = api()
    let resolve!: (configuration: ToolPolicyConfiguration) => void
    vi.mocked(value.save).mockImplementation(() => new Promise((done) => { resolve = done }))
    mount(value)
    expect(await screen.findByText('显式禁止')).toBeVisible()
    fireEvent.change(screen.getByLabelText('权限预设'), { target: { value: 'minimal' } })
    fireEvent.click(screen.getByLabelText('限制允许列表'))
    fireEvent.click(screen.getByRole('button', { name: '保存权限' }))
    await waitFor(() => expect(value.save).toHaveBeenCalledWith(expect.objectContaining({
      source: 'user', scenarioId: 'general', expectedRevision: null,
      layers: [{ profile: 'minimal', allow: [] }],
    })))
    expect(screen.getByRole('button', { name: '保存权限' })).toBeDisabled()
    expect(screen.queryByText('权限已保存')).not.toBeInTheDocument()
    await act(async () => resolve({ revision: 'revision-1', layers: [{ profile: 'minimal', allow: [] }], modelFacingMode: 'auto' }))
    expect(await screen.findByText('权限已保存')).toBeVisible()
  })

  it('keeps the draft after save failure and requires reload for conflicts', async () => {
    const value = api()
    vi.mocked(value.save).mockRejectedValue(new Error('Agent Profile revision conflict'))
    mount(value)
    await screen.findByText('显式禁止')
    fireEvent.change(screen.getByLabelText('禁止工具或分组'), { target: { value: 'group:fs' } })
    fireEvent.click(screen.getByRole('button', { name: '保存权限' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('权限未保存')
    expect(screen.getByLabelText('禁止工具或分组')).toHaveValue('group:fs')
    expect(screen.queryByText('权限已保存')).not.toBeInTheDocument()
  })

  it('ignores an old request after switching scenario', async () => {
    const value = api()
    let stale!: (configuration: ToolPolicyConfiguration) => void
    vi.mocked(value.get).mockImplementation((query) => query.scenarioId === 'general'
      ? new Promise((resolve) => { stale = resolve })
      : Promise.resolve({ revision: 'new', layers: [{ profile: 'coding' }], modelFacingMode: 'auto' }))
    mount(value)
    fireEvent.change(screen.getByLabelText('运行场景'), { target: { value: 'space' } })
    await waitFor(() => expect(screen.getByLabelText('权限预设')).toHaveValue('coding'))
    await act(async () => stale({ revision: 'old', layers: [{ profile: 'minimal' }], modelFacingMode: 'auto' }))
    expect(screen.getByLabelText('权限预设')).toHaveValue('coding')
  })
})
