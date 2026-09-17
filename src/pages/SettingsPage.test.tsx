import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { BusinessApi } from '../../shared/business'
import SettingsPage from './SettingsPage'

const provider = {
  id: 'provider-1',
  type: 'openai_compatible' as const,
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  revision: 3
}

const profile = {
  id: 'profile-1',
  providerId: provider.id,
  modelId: 'gpt-4.1',
  displayName: 'GPT 4.1',
  enabled: true,
  capabilities: {
    text: true,
    vision: true,
    toolCalling: true,
    structuredOutput: true
  },
  contextWindow: 128_000,
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 8,
  revision: 2
}

function createBusiness(): BusinessApi {
  return {
    listModels: vi.fn().mockResolvedValue({
      providers: [provider],
      profiles: [profile]
    }),
    saveModelProvider: vi.fn().mockImplementation(async (value) => ({
      ...value,
      revision: value.expectedRevision + 1
    })),
    saveModelProfile: vi.fn().mockImplementation(async (value) => ({
      ...value,
      revision: value.expectedRevision + 1
    })),
    setModelCredential: vi.fn().mockResolvedValue(undefined)
  } as unknown as BusinessApi
}

describe('SettingsPage', () => {
  afterEach(() => {
    delete window.realmflow
  })

  it('creates a provider and stores its API key separately', async () => {
    const business = createBusiness()
    window.realmflow = { business } as unknown as typeof window.realmflow
    render(<SettingsPage />)

    await screen.findByText('OpenAI')
    fireEvent.click(screen.getByRole('button', { name: '添加供应商' }))
    fireEvent.change(screen.getByRole('textbox', { name: '供应商名称' }), {
      target: { value: 'Local gateway' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '基础地址' }), {
      target: { value: 'http://localhost:11434/v1' }
    })
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'secret-key' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存供应商' }))

    await waitFor(() =>
      expect(business.saveModelProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          type: 'openai_compatible',
          name: 'Local gateway',
          baseUrl: 'http://localhost:11434/v1',
          enabled: true,
          expectedRevision: 0
        })
      )
    )
    const savedProvider = vi.mocked(business.saveModelProvider).mock.calls[0][0]
    expect(business.setModelCredential).toHaveBeenCalledWith({
      providerId: savedProvider.id,
      value: 'secret-key'
    })
  })

  it('edits a provider without echoing or overwriting its saved credential', async () => {
    const business = createBusiness()
    window.realmflow = { business } as unknown as typeof window.realmflow
    render(<SettingsPage />)

    await screen.findByText('OpenAI')
    fireEvent.click(
      screen.getByRole('button', { name: '编辑供应商 OpenAI' })
    )

    const credential = screen.getByLabelText('API Key')
    expect(credential).toHaveAttribute('type', 'password')
    expect(credential).toHaveValue('')

    fireEvent.change(screen.getByRole('textbox', { name: '供应商名称' }), {
      target: { value: 'OpenAI production' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存供应商' }))

    await waitFor(() =>
      expect(business.saveModelProvider).toHaveBeenCalledWith({
        id: provider.id,
        type: provider.type,
        name: 'OpenAI production',
        baseUrl: provider.baseUrl,
        enabled: true,
        expectedRevision: provider.revision
      })
    )
    expect(business.setModelCredential).not.toHaveBeenCalled()
  })

  it('creates and edits model profiles', async () => {
    const business = createBusiness()
    window.realmflow = { business } as unknown as typeof window.realmflow
    render(<SettingsPage />)

    await screen.findByText('GPT 4.1')
    fireEvent.click(screen.getByRole('button', { name: '添加模型' }))
    fireEvent.change(screen.getByRole('textbox', { name: '显示名称' }), {
      target: { value: 'GPT 4.1 mini' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '模型 ID' }), {
      target: { value: 'gpt-4.1-mini' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }))

    await waitFor(() =>
      expect(business.saveModelProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          providerId: provider.id,
          modelId: 'gpt-4.1-mini',
          displayName: 'GPT 4.1 mini',
          expectedRevision: 0
        })
      )
    )

    fireEvent.click(
      screen.getByRole('button', { name: '编辑模型 GPT 4.1' })
    )
    fireEvent.change(screen.getByRole('textbox', { name: '显示名称' }), {
      target: { value: 'GPT 4.1 primary' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }))

    await waitFor(() =>
      expect(business.saveModelProfile).toHaveBeenLastCalledWith({
        id: profile.id,
        providerId: profile.providerId,
        modelId: profile.modelId,
        displayName: 'GPT 4.1 primary',
        enabled: true,
        capabilities: profile.capabilities,
        contextWindow: profile.contextWindow,
        inputCostPerMillionTokens: profile.inputCostPerMillionTokens,
        outputCostPerMillionTokens: profile.outputCostPerMillionTokens,
        expectedRevision: profile.revision
      })
    )
  })
})
