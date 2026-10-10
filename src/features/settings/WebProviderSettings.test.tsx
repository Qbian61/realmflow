import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION as defaults, type WebProviderApi } from '../../../shared/web-provider'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { WebProviderSettings } from './WebProviderSettings'

function api(): WebProviderApi {
  return {
    get: vi.fn().mockResolvedValue(defaults),
    save: vi.fn(async (command) => ({
      ...defaults, revision: command.expectedRevision + 1,
      searchProvider: command.searchProvider, searxngBaseUrl: command.searxngBaseUrl,
      browserContinuation: command.browserContinuation,
      hasBraveCredential: Boolean(command.braveApiKey)
    }))
  }
}
function mount(value: WebProviderApi) {
  return render(<LocalizationProvider><WebProviderSettings api={value} /></LocalizationProvider>)
}

describe('WebProviderSettings', () => {
  it('starts disabled and saves the explicit self-hosted provider without optimistic success', async () => {
    const value = api()
    let done!: (value: typeof defaults) => void
    vi.mocked(value.save).mockImplementation(() => new Promise((resolve) => { done = resolve }))
    mount(value)
    expect(await screen.findByLabelText('搜索供应商')).toHaveValue('disabled')
    fireEvent.change(screen.getByLabelText('搜索供应商'), { target: { value: 'searxng' } })
    fireEvent.change(screen.getByLabelText(/SearXNG 地址/), { target: { value: 'http://localhost:8080' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(value.save).toHaveBeenCalledWith(expect.objectContaining({
      searchProvider: 'searxng', searxngBaseUrl: 'http://localhost:8080', expectedRevision: 0
    })))
    expect(screen.queryByText('设置已保存')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled()
    await act(async () => done({ ...defaults, revision: 1, searchProvider: 'searxng', searxngBaseUrl: 'http://localhost:8080' }))
    expect(await screen.findByText('设置已保存')).toBeVisible()
    expect(screen.getByText('当前已保存：SearXNG')).toBeVisible()
  })

  it('preserves stored credentials when the key field is left blank and clears typed keys after save', async () => {
    const value = api()
    vi.mocked(value.get).mockResolvedValue({
      ...defaults, revision: 3, searchProvider: 'brave', hasBraveCredential: true
    })
    mount(value)
    expect(await screen.findByText('密钥已保存')).toBeVisible()
    expect(screen.getByLabelText('Brave API Key')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(value.save).toHaveBeenCalled())
    expect(vi.mocked(value.save).mock.calls[0]![0]).not.toHaveProperty('braveApiKey')
    await screen.findByText('设置已保存')
    fireEvent.change(screen.getByLabelText('Brave API Key'), { target: { value: 'new-key' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(screen.getByLabelText('Brave API Key')).toHaveValue(''))
    expect(vi.mocked(value.save).mock.calls[1]![0].braveApiKey).toBe('new-key')
  })

  it('keeps saved state unchanged on conflict and reloads before retrying', async () => {
    const value = api()
    vi.mocked(value.save).mockRejectedValue(new Error('web_configuration_changed'))
    mount(value)
    await screen.findByLabelText('搜索供应商')
    fireEvent.change(screen.getByLabelText('搜索供应商'), { target: { value: 'searxng' } })
    fireEvent.change(screen.getByLabelText(/SearXNG 地址/), { target: { value: 'http://localhost:8080' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('设置已被其他操作修改，请重新加载后再保存')
    expect(screen.getByText('当前已保存：关闭')).toBeVisible()
    expect(screen.getByLabelText(/SearXNG 地址/)).toHaveValue('http://localhost:8080')
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    await waitFor(() => expect(screen.getByLabelText('搜索供应商')).toHaveValue('disabled'))
  })

  it('saves browser continuation separately and disables search when removing its credential', async () => {
    const value = api()
    vi.mocked(value.get).mockResolvedValue({
      ...defaults, revision: 1, searchProvider: 'brave', hasBraveCredential: true
    })
    mount(value)
    await screen.findByText('密钥已保存')
    fireEvent.click(screen.getByLabelText('静态网页不足时建议使用浏览器'))
    fireEvent.click(screen.getByRole('button', { name: '移除已保存密钥' }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(value.save).toHaveBeenCalledWith(expect.objectContaining({
      searchProvider: 'disabled', braveApiKey: null, browserContinuation: true
    })))
  })
})
