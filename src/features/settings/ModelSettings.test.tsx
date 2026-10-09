import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import type { ProfileRecord, ProviderRecord } from './ModelEditors'
import { ModelSettings, type ModelSettingsProps } from './ModelSettings'

const providers: ProviderRecord[] = [
  {
    id: 'provider-openai',
    type: 'openai_completions',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    revision: 3
  },
  {
    id: 'provider-deepseek',
    type: 'openai_completions',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    enabled: true,
    revision: 2
  }
]

const profiles: ProfileRecord[] = providers.map((provider, index) => ({
  id: `profile-${index + 1}`,
  providerId: provider.id,
  modelId: index === 0 ? 'gpt-4.1' : 'deepseek-chat',
  displayName: index === 0 ? 'GPT 4.1' : 'DeepSeek Chat',
  enabled: true,
  capabilities: {
    text: true,
    vision: false,
    toolCalling: true,
    structuredOutput: true
  },
  contextWindow: 128_000,
  timeoutMs: 120_000,
  maxRetries: 2,
  maxConcurrency: 2,
  inputCostPerMillionTokens: 1,
  outputCostPerMillionTokens: 2,
  revision: 1
}))

function createProps(
  overrides: Partial<ModelSettingsProps> = {}
): ModelSettingsProps {
  return {
    providers,
    profiles,
    loading: false,
    saving: false,
    validatingProfileIds: new Set(),
    staleProfileIds: new Set(),
    rotatingCredentialKey: false,
    credentialRotationSummary: '',
    selectedProviderId: undefined,
    onSelectProvider: vi.fn(),
    onAddProvider: vi.fn(),
    onEditProvider: vi.fn(),
    onDeleteProvider: vi.fn(),
    onToggleProvider: vi.fn(),
    onAddProfile: vi.fn(),
    onEditProfile: vi.fn(),
    onDeleteProfile: vi.fn(),
    onToggleProfile: vi.fn(),
    onValidateProfile: vi.fn(),
    onRotateCredentialKey: vi.fn(),
    ...overrides
  }
}

function renderModelSettings(
  overrides: Partial<ModelSettingsProps> = {}
): void {
  const props = createProps(overrides)

  function Harness(): JSX.Element {
    const [selectedProviderId, setSelectedProviderId] = useState<string>()
    return (
      <ModelSettings
        {...props}
        selectedProviderId={selectedProviderId}
        onSelectProvider={setSelectedProviderId}
      />
    )
  }

  render(
    <LocalizationProvider>
      <Harness />
    </LocalizationProvider>
  )
}

describe('ModelSettings', () => {
  it('selects the first provider and only shows its model profiles', () => {
    renderModelSettings()

    expect(
      screen.getByRole('button', { name: '选择供应商 OpenAI' })
    ).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('GPT 4.1')).toBeVisible()
    expect(screen.queryByText('DeepSeek Chat')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: '选择供应商 DeepSeek' })
    )

    expect(
      screen.getByRole('button', { name: '选择供应商 DeepSeek' })
    ).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('DeepSeek Chat')).toBeVisible()
    expect(screen.queryByText('GPT 4.1')).not.toBeInTheDocument()
  })

  it('starts directly with the configured provider list', () => {
    renderModelSettings()

    expect(
      screen.queryByRole('heading', { name: '供应商' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('searchbox', { name: '搜索供应商' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '选择供应商 OpenAI' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '选择供应商 DeepSeek' })
    ).toBeVisible()
  })

  it('shows each configured provider brand icon', () => {
    renderModelSettings()

    expect(
      screen
        .getByRole('button', { name: '选择供应商 OpenAI' })
        .querySelector('[data-provider-logo="provider-openai"]')
    ).toBeInTheDocument()
    expect(
      screen
        .getByRole('button', { name: '选择供应商 DeepSeek' })
        .querySelector('[data-provider-logo="provider-deepseek"]')
    ).toBeInTheDocument()
  })

  it('shows an actionable empty state when no providers exist', () => {
    const onAddProvider = vi.fn()
    renderModelSettings({
      providers: [],
      profiles: [],
      onAddProvider
    })

    expect(screen.getByText('添加供应商后即可配置模型档案')).toBeVisible()
    fireEvent.click(
      screen.getAllByRole('button', { name: '添加供应商' }).at(-1)!
    )
    expect(onAddProvider).toHaveBeenCalledOnce()
  })

  it('shows the configured API protocol for a provider', () => {
    renderModelSettings({
      providers: [
        {
          ...providers[0],
          type: 'anthropic_messages',
          name: 'Anthropic'
        }
      ],
      profiles: []
    })

    expect(screen.getAllByText('Anthropic Messages')).toHaveLength(2)
  })

  it('filters models by enabled state and exposes atomic bulk actions', () => {
    const disabledProfile: ProfileRecord = {
      ...profiles[0],
      id: 'profile-disabled',
      modelId: 'gpt-disabled',
      displayName: 'Disabled GPT',
      enabled: false
    }
    const onSetProfilesEnabled = vi.fn()
    renderModelSettings({
      profiles: [profiles[0], disabledProfile, profiles[1]],
      onSetProfilesEnabled
    })

    expect(screen.getByText('1/2')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: '模型批量操作' })
    )
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: '仅显示已禁用' })
    )

    expect(screen.getByText('Disabled GPT')).toBeVisible()
    expect(screen.queryByText('GPT 4.1')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: '模型批量操作' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: '全部启用' }))

    expect(onSetProfilesEnabled).toHaveBeenCalledWith(
      [profiles[0], disabledProfile],
      true
    )
  })

  it('shows a filtered empty state and returns focus when the bulk menu closes', () => {
    renderModelSettings()

    const bulkButton = screen.getByRole('button', {
      name: '模型批量操作'
    })
    fireEvent.click(bulkButton)
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: '仅显示已禁用' })
    )

    expect(screen.getByText('没有可显示的模型')).toBeVisible()

    fireEvent.click(bulkButton)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(bulkButton).toHaveFocus()
  })

  it('allows catalog models to be tested and toggled but not edited or deleted', () => {
    renderModelSettings({
      profiles: [
        {
          ...profiles[0],
          source: 'catalog',
          catalogProviderId: 'openai',
          catalogModelId: profiles[0].modelId,
          catalogVersion: 1,
          defaultEnabled: true,
          enabledOverride: null,
          lifecycleStatus: 'active'
        }
      ]
    })

    expect(
      screen.getByRole('button', { name: '验证模型 GPT 4.1' })
    ).toBeEnabled()
    expect(
      screen.getByRole('switch', { name: '停用模型 GPT 4.1' })
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: '编辑模型 GPT 4.1' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '删除模型 GPT 4.1' })
    ).not.toBeInTheDocument()
  })

  it('shows credential readiness and removes credentials explicitly', () => {
    const onRemoveCredential = vi.fn()
    renderModelSettings({
      providers: [
        {
          ...providers[0],
          credentialConfigured: true,
          customHeaderNames: ['X-Tenant', 'X-Trace-Mode']
        }
      ],
      profiles: [profiles[0]],
      onRemoveCredential
    } as Partial<ModelSettingsProps>)

    expect(screen.getByText('凭据已配置')).toBeVisible()
    expect(screen.getByText('X-Tenant, X-Trace-Mode')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '移除供应商凭据' }))
    expect(onRemoveCredential).toHaveBeenCalledWith(
      expect.objectContaining({ id: providers[0].id })
    )
  })
})
