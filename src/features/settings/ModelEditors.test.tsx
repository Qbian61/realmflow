import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import {
  ProfileEditor,
  ProviderEditor,
  type ProfileDraft,
  type ProviderDraft
} from './ModelEditors'

const draft: ProviderDraft = {
  id: 'provider-custom',
  type: 'openai_completions',
  name: 'Custom provider',
  baseUrl: 'https://api.example.com/v1',
  enabled: true,
  apiKey: '',
  expectedRevision: 0
}

describe('ProviderEditor', () => {
  it('offers every supported model API protocol', () => {
    render(
      <LocalizationProvider>
        <ProviderEditor
          draft={draft}
          saving={false}
          onChange={vi.fn()}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </LocalizationProvider>
    )

    const dialog = screen.getByRole('dialog', { name: '添加供应商' })
    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--wide')
    expect(dialog.parentElement).toHaveClass('ui-dialog-backdrop')
    expect(
      screen.getByRole('textbox', { name: '供应商名称' }).closest('.ui-field')
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: '保存供应商' })
    ).toHaveClass('ui-button', 'ui-button--primary')
    const values = screen
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
    expect(values).toEqual([
      'openai_completions',
      'openai_responses',
      'anthropic_messages',
      'local'
    ])
  })

  it('warns that Anthropic base URLs must not include the version path', () => {
    render(
      <LocalizationProvider>
        <ProviderEditor
          draft={{ ...draft, type: 'anthropic_messages' }}
          saving={false}
          onChange={vi.fn()}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </LocalizationProvider>
    )

    expect(
      screen.getByText('Anthropic 基础地址不要包含 /v1')
    ).toBeVisible()
  })

  it('locks the name and API protocol for builtin providers', () => {
    render(
      <LocalizationProvider>
        <ProviderEditor
          draft={{
            ...draft,
            source: 'builtin',
            catalogProviderId: 'openai',
            expectedRevision: 1
          }}
          saving={false}
          onChange={vi.fn()}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </LocalizationProvider>
    )

    expect(screen.getByRole('textbox', { name: '供应商名称' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '服务类型' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '基础地址' })).toBeEnabled()
  })

  it('edits custom headers without echoing saved values', () => {
    const onChange = vi.fn()
    render(
      <LocalizationProvider>
        <ProviderEditor
          draft={{
            ...draft,
            expectedRevision: 1,
            customHeaders: [
              { name: 'X-Tenant', value: '', configured: true }
            ]
          }}
          saving={false}
          onChange={onChange}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </LocalizationProvider>
    )

    expect(screen.getByLabelText('Header 名称 1')).toHaveValue('X-Tenant')
    expect(screen.getByLabelText('Header 值 1')).toHaveValue('')
    expect(screen.getByLabelText('Header 值 1')).toHaveAttribute(
      'placeholder',
      '留空以保留已保存值'
    )
    fireEvent.click(screen.getByRole('button', { name: '添加 Header' }))
    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      expectedRevision: 1,
      customHeaders: [
        { name: 'X-Tenant', value: '', configured: true },
        { name: '', value: '', configured: false }
      ]
    })
  })
})

describe('ProfileEditor', () => {
  it('edits complete custom model metadata while inheriting the provider protocol', () => {
    const onChange = vi.fn()
    const profile: ProfileDraft = {
      id: 'profile-custom',
      providerId: 'provider-custom',
      modelId: 'reasoning-model',
      displayName: 'Reasoning Model',
      source: 'custom',
      icon: 'brain',
      apiType: 'openai_responses',
      deepSeekThinking: true,
      enabled: true,
      capabilities: {
        text: true,
        vision: true,
        toolCalling: true,
        structuredOutput: true
      },
      inputTypes: ['text', 'image'],
      reasoning: true,
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 4,
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 8,
      expectedRevision: 1
    }

    render(
      <LocalizationProvider>
        <ProfileEditor
          draft={profile}
          providers={[
            {
              id: 'provider-custom',
              type: 'openai_responses',
              name: 'Custom',
              baseUrl: 'https://api.example.com/v1',
              enabled: true,
              revision: 1
            }
          ]}
          saving={false}
          onChange={onChange}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </LocalizationProvider>
    )

    expect(screen.getByLabelText('API 类型')).toHaveValue('openai_responses')
    expect(screen.getByLabelText('API 类型')).toBeDisabled()
    expect(screen.getByLabelText('推理模型')).toBeChecked()
    expect(screen.getByLabelText('DeepSeek Thinking')).toBeChecked()
    fireEvent.change(screen.getByLabelText('最大输出 Token'), {
      target: { value: '64000' }
    })
    expect(onChange).toHaveBeenCalledWith({
      ...profile,
      maxOutputTokens: 64_000
    })
  })
})
