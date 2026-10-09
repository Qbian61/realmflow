import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { BuiltinProviderDialog } from './BuiltinProviderDialog'

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof BuiltinProviderDialog>> = {}
): {
  anchorElement: HTMLButtonElement
  onClose: ReturnType<typeof vi.fn>
  onConfigure: ReturnType<typeof vi.fn>
  onCustom: ReturnType<typeof vi.fn>
} {
  const anchorElement = document.createElement('button')
  anchorElement.dataset.providerMenuAnchor = 'true'
  anchorElement.getBoundingClientRect = () =>
    ({
      bottom: 700,
      height: 40,
      left: 24,
      right: 284,
      top: 660,
      width: 260,
      x: 24,
      y: 660,
      toJSON: () => ({})
    }) as DOMRect
  document.body.append(anchorElement)
  const onClose = vi.fn()
  const onConfigure = vi.fn()
  const onCustom = vi.fn()
  render(
    <LocalizationProvider>
      <BuiltinProviderDialog
        anchorElement={anchorElement}
        configuredProviderIds={new Set()}
        saving={false}
        onClose={onClose}
        onConfigure={onConfigure}
        onCustom={onCustom}
        {...overrides}
      />
    </LocalizationProvider>
  )
  return { anchorElement, onClose, onConfigure, onCustom }
}

describe('BuiltinProviderDialog', () => {
  afterEach(() => {
    delete window.realmflow
    document
      .querySelectorAll('[data-provider-menu-anchor]')
      .forEach((element) => element.remove())
    vi.restoreAllMocks()
  })

  it('renders an anchored provider menu with a fixed catalog search', () => {
    renderDialog()

    const menu = screen.getByRole('dialog', { name: '添加模型供应商' })
    expect(menu.parentElement).toBe(document.body)
    expect(menu).toHaveClass('ui-menu', 'builtin-provider-dialog')
    expect(menu).toHaveStyle({ position: 'fixed' })
    expect(document.querySelector('.model-editor-backdrop')).toBeNull()
    expect(
      screen.queryByRole('heading', { name: '添加模型供应商' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: '搜索供应商' })
    ).toBeVisible()
    expect(
      screen.getByRole('searchbox', { name: '搜索供应商' }).closest('.ui-field')
    ).not.toBeNull()
    expect(menu).toHaveStyle({ maxHeight: '360px' })
  })

  it('sets an explicit menu height so the provider list scrolls inside the popover', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.classList.contains('builtin-provider-dialog') ? 680 : 0
      }
    )

    renderDialog()

    const menu = screen.getByRole('dialog', { name: '添加模型供应商' })
    const list = document.querySelector('.builtin-provider-list')
    expect(menu).toHaveStyle({ maxHeight: '360px', height: '360px' })
    expect(list).not.toBeNull()
  })

  it('keeps the menu height stable when the provider list scrolls internally', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.classList.contains('builtin-provider-dialog') ? 680 : 0
      }
    )
    let rectCallCount = 0
    const anchorElement = document.createElement('button')
    anchorElement.dataset.providerMenuAnchor = 'true'
    anchorElement.getBoundingClientRect = () => {
      rectCallCount += 1
      return (
        rectCallCount === 1
          ? {
              bottom: 700,
              height: 40,
              left: 24,
              right: 284,
              top: 660,
              width: 260,
              x: 24,
              y: 660,
              toJSON: () => ({})
            }
          : {
              bottom: 700,
              height: 560,
              left: 24,
              right: 284,
              top: 140,
              width: 260,
              x: 24,
              y: 140,
              toJSON: () => ({})
            }
      ) as DOMRect
    }
    document.body.append(anchorElement)

    render(
      <LocalizationProvider>
        <BuiltinProviderDialog
          anchorElement={anchorElement}
          configuredProviderIds={new Set()}
          saving={false}
          onClose={vi.fn()}
          onConfigure={vi.fn()}
          onCustom={vi.fn()}
        />
      </LocalizationProvider>
    )

    const menu = screen.getByRole('dialog', { name: '添加模型供应商' })
    const list = document.querySelector('.builtin-provider-list')
    expect(menu).toHaveStyle({ height: '360px' })

    fireEvent.scroll(list as Element)

    expect(menu).toHaveStyle({ height: '360px' })
  })

  it('lists supported providers with visible catalog groups and brand logos', () => {
    renderDialog()

    for (const name of [
      'Amazon Bedrock',
      'Ant Ling',
      'Anthropic',
      'VolcEngine Ark',
      'VolcEngine Ark - Agent Plan',
      'VolcEngine Ark - Coding Plan',
      'Azure OpenAI Responses',
      'DeepSeek',
      'Google',
      'Groq',
      'Hugging Face',
      'MiniMax',
      'MiniMax CN',
      'Moonshot AI',
      'Moonshot AI CN',
      'NVIDIA',
      'OpenAI',
      'OpenAI Codex',
      'OpenRouter',
      'Vercel AI Gateway',
      'xAI',
      'Xiaomi',
      'Z.AI',
      'Z.AI Coding CN'
    ]) {
      expect(
        screen.getByRole('button', { name: `选择供应商 ${name}` })
      ).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: '自定义' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '内置' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '已发现' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '推荐' })).toBeNull()
    const builtinGroup = screen.getByRole('region', { name: '内置' })
    expect(
      within(builtinGroup).getByRole('button', { name: '选择供应商 OpenAI' })
    ).toBeVisible()
    expect(
      within(builtinGroup).getByRole('button', {
        name: '选择供应商 Amazon Bedrock'
      })
    ).toBeVisible()
    expect(screen.queryByText('Claude Fable 5')).toBeNull()
    expect(screen.queryByText('Gemini 2.0 Flash')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: '选择供应商 Anthropic' })
        .querySelector('[data-provider-logo="anthropic"]')
    ).toBeInTheDocument()
  })

  it('filters providers case-insensitively by name and catalog id', () => {
    renderDialog()
    const search = screen.getByRole('searchbox', { name: '搜索供应商' })

    fireEvent.change(search, { target: { value: 'DEEPSEEK' } })

    expect(
      screen.getByRole('button', { name: '选择供应商 DeepSeek' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '选择供应商 OpenAI' })
    ).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'openai-codex' } })

    expect(
      screen.getByRole('button', { name: '选择供应商 OpenAI Codex' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '选择供应商 DeepSeek' })
    ).not.toBeInTheDocument()
  })

  it('shows the localized empty state when no providers match', () => {
    renderDialog()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索供应商' }), {
      target: { value: 'provider-that-does-not-exist' }
    })

    expect(screen.getByText('没有匹配的供应商')).toBeVisible()
    expect(screen.queryByRole('heading', { name: '内置' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '推荐' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '已发现' })).toBeNull()
  })

  it('opens a provider website without selecting the provider', () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    window.realmflow = {
      webWorkbench: { openExternal }
    } as unknown as typeof window.realmflow
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '打开 OpenAI 官网' }))

    expect(openExternal).toHaveBeenCalledWith('https://openai.com')
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '选择供应商 OpenAI' })
    ).toBeVisible()
  })

  it('closes on Escape and returns focus to the add button', () => {
    const { anchorElement, onClose } = renderDialog()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(anchorElement).toHaveFocus()
  })

  it('closes when clicking outside the menu', () => {
    const { onClose } = renderDialog()

    fireEvent.mouseDown(document.body)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('omits configured providers from the add list', () => {
    renderDialog({
      configuredProviderIds: new Set(['builtin-deepseek'])
    })

    expect(
      screen.queryByRole('button', { name: '选择供应商 DeepSeek' })
    ).not.toBeInTheDocument()
  })

  it('requires an API key for detected builtin providers', () => {
    renderDialog()

    expect(screen.queryByRole('heading', { name: '已发现' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '推荐' })).toBeNull()
    const builtinGroup = screen.getByRole('region', { name: '内置' })
    expect(
      within(builtinGroup).getByRole('button', { name: '选择供应商 OpenAI' })
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: '选择供应商 OpenAI' })
    )

    expect(screen.getByLabelText('API Key')).toBeInTheDocument()
    expect(screen.getByText('OpenAI', { selector: 'strong' })).toBeVisible()
  })

  it('uses the shared credential field and preserves input focus while toggling visibility', () => {
    renderDialog()

    fireEvent.click(
      screen.getByRole('button', { name: '选择供应商 DeepSeek' })
    )

    expect(screen.getByText('DeepSeek', { selector: 'strong' })).toBeVisible()
    const key = screen.getByLabelText('API Key') as HTMLInputElement
    expect(key).toHaveAttribute('type', 'password')
    expect(key).toHaveAttribute('name', 'builtin-provider-api-key')
    expect(key).toHaveAttribute('autocomplete', 'new-password')
    expect(key).toHaveAttribute('spellcheck', 'false')
    expect(key.closest('.ui-field')).not.toBeNull()
    expect(key.closest('.ui-field__control-group')).not.toBeNull()
    expect(screen.queryByLabelText('供应商名称')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('服务类型')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('基础地址')).not.toBeInTheDocument()
    expect(
      screen.queryByText('填写 API Key 后将启用供应商目录中的全部模型。')
    ).not.toBeInTheDocument()

    fireEvent.change(key, { target: { value: 'sk-secret' } })
    key.focus()
    key.setSelectionRange(2, 6)
    const toggle = screen.getByRole('button', { name: '显示 API Key' })
    fireEvent.mouseDown(toggle)
    fireEvent.click(toggle)

    expect(key).toHaveAttribute('type', 'text')
    expect(key).toHaveValue('sk-secret')
    expect(key).toHaveFocus()
    expect(key).toHaveProperty('selectionStart', 2)
    expect(key).toHaveProperty('selectionEnd', 6)
  })

  it('configures the fixed VolcEngine Ark catalog with only an API key', () => {
    const { onConfigure } = renderDialog()

    fireEvent.click(
      screen.getByRole('button', { name: '选择供应商 VolcEngine Ark' })
    )
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'ark-secret' }
    })

    expect(
      screen.queryByLabelText('模型 ID / 推理接入点 ID')
    ).not.toBeInTheDocument()
    fireEvent.submit(
      screen.getByRole('button', { name: '保存并启用' }).closest('form')!
    )

    expect(onConfigure).toHaveBeenCalledWith('ark', 'ark-secret')
  })

  it('submits the catalog id and key or opens custom configuration', () => {
    const { onConfigure, onCustom } = renderDialog()

    fireEvent.click(
      screen.getByRole('button', { name: '选择供应商 DeepSeek' })
    )
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-deepseek' }
    })
    fireEvent.submit(
      screen.getByRole('button', { name: '保存并启用' }).closest('form')!
    )

    expect(onConfigure).toHaveBeenCalledWith('deepseek', 'sk-deepseek')

    fireEvent.click(screen.getByRole('button', { name: '返回供应商列表' }))
    fireEvent.click(screen.getByRole('button', { name: '自定义供应商' }))
    expect(onCustom).toHaveBeenCalledOnce()
  })
})
