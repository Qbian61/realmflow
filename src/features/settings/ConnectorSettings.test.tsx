import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { vi } from 'vitest'
import type { BusinessApi, ConnectorDto } from '../../../shared/business'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { ToastProvider } from '../toast/ToastProvider'
import { ConnectorSettings } from './ConnectorSettings'

const connector: ConnectorDto = {
  connector: {
    id: 'connector-docs',
    name: 'Docs',
    type: 'http',
    baseUrl: 'https://docs.example.com/api',
    authentication: { type: 'bearer' },
    enabled: true,
    timeoutMs: 5000,
    maxRetries: 1,
    revision: 1,
    createdAt: 10,
    updatedAt: 10
  },
  hasCredential: true
}

describe('ConnectorSettings', () => {
  it('localizes connector actions in Japanese', () => {
    renderSettings([], { locale: 'ja' })

    expect(
      screen.getByRole('heading', { name: 'HTTP コネクター' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'コネクターを追加' })
    ).toBeVisible()
  })

  it('renders connector status and validation details', () => {
    renderSettings([
      {
        ...connector,
        connector: {
          ...connector.connector,
          validation: {
            status: 'available',
            checkedAt: 20,
            message: 'Connector is available'
          }
        }
      }
    ])

    expect(screen.getByText('Docs')).toBeVisible()
    expect(
      screen.getByText(/Bearer · 凭据已保存 · 可用/)
    ).toBeVisible()
  })

  it('creates a connector with a credential and updates only after Main resolves', async () => {
    let resolveSave!: (value: ConnectorDto) => void
    const business = businessMock()
    vi.mocked(business.saveConnector).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      })
    )
    const onChange = vi.fn()
    renderSettings([], { business, onChange })

    fireEvent.click(screen.getByRole('button', { name: '添加连接器' }))
    const dialog = screen.getByRole('dialog', { name: '添加连接器' })
    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--default')
    expect(dialog.querySelector('.ui-dialog__body')).toBeInTheDocument()
    expect(dialog.querySelectorAll('.ui-field').length).toBeGreaterThanOrEqual(5)
    expect(screen.getByRole('button', { name: '保存连接器' })).toHaveClass(
      'ui-button',
      'ui-button--primary'
    )
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), {
      target: { value: 'Docs' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '基础地址' }), {
      target: { value: 'https://docs.example.com/api' }
    })
    fireEvent.change(screen.getByLabelText('认证方式'), {
      target: { value: 'bearer' }
    })
    fireEvent.change(screen.getByLabelText('凭据'), {
      target: { value: 'bearer-secret' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存连接器' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(business.saveConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Docs',
        type: 'http',
        baseUrl: 'https://docs.example.com/api',
        authentication: { type: 'bearer' },
        credential: 'bearer-secret',
        expectedRevision: 0,
        idempotencyKey: expect.any(String)
      })
    )

    resolveSave(connector)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([connector]))
  })

  it('edits a connector without echoing or overwriting its credential', async () => {
    const business = businessMock()
    const onChange = vi.fn()
    renderSettings([connector], { business, onChange })

    fireEvent.click(screen.getByRole('button', { name: '编辑连接器 Docs' }))
    expect(screen.getByLabelText('凭据')).toHaveValue('')
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), {
      target: { value: 'Docs API' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存连接器' }))

    await waitFor(() => expect(business.saveConnector).toHaveBeenCalled())
    expect(business.saveConnector).toHaveBeenCalledWith(
      expect.not.objectContaining({ credential: expect.anything() })
    )
  })

  it('keeps the current enabled state when Main rejects a toggle', async () => {
    const business = businessMock()
    vi.mocked(business.saveConnector).mockRejectedValue(
      new Error('token=private-connector-token')
    )
    const onChange = vi.fn()
    const onError = vi.fn()
    renderSettings([connector], { business, onChange, onError })

    fireEvent.click(screen.getByRole('switch', { name: '停用连接器 Docs' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '连接器状态更新失败'
    )
    expect(screen.queryByText(/private-connector-token/)).not.toBeInTheDocument()
    expect(onError).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(
      screen.getByRole('switch', { name: '停用连接器 Docs' })
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('publishes stable save, validation, and delete failures', async () => {
    const business = businessMock()
    vi.mocked(business.saveConnector).mockRejectedValue(
      new Error('raw save failure')
    )
    vi.mocked(business.validateConnector).mockRejectedValue(
      new Error('raw validation failure')
    )
    vi.mocked(business.deleteConnector).mockRejectedValue(
      new Error('raw delete failure')
    )
    const onError = vi.fn()
    const view = renderSettings([connector], { business, onError })

    fireEvent.click(screen.getByRole('button', { name: '编辑连接器 Docs' }))
    fireEvent.click(screen.getByRole('button', { name: '保存连接器' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '连接器保存失败'
    )
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '编辑连接器' })).getByRole(
        'button',
        { name: '关闭' }
      )
    )

    const validate = screen.getByRole('button', { name: '验证连接器 Docs' })
    await waitFor(() => expect(validate).toBeEnabled())
    fireEvent.click(validate)
    expect(await screen.findByText('连接器验证失败')).toBeVisible()
    await waitFor(() => expect(validate).toBeEnabled())

    const deleteButton = screen.getByRole('button', {
      name: '删除连接器 Docs'
    })
    fireEvent.click(deleteButton)
    expect(screen.getByRole('dialog', { name: '删除连接器' })).toHaveClass(
      'ui-dialog',
      'ui-dialog--compact'
    )
    fireEvent.click(screen.getByRole('button', { name: '确认删除连接器' }))
    expect(await screen.findByText('连接器删除失败')).toBeVisible()
    expect(
      screen.getByRole('dialog', { name: '删除连接器' })
    ).toBeVisible()

    expect(view.container.querySelector('.model-page-error')).toBeNull()
    expect(screen.queryByText(/raw .* failure/)).not.toBeInTheDocument()
    expect(onError).not.toHaveBeenCalled()
  })

  it('validates and deletes through Main-confirmed results', async () => {
    const business = businessMock()
    const validated: ConnectorDto = {
      ...connector,
      connector: {
        ...connector.connector,
        validation: {
          status: 'available',
          checkedAt: 20,
          message: 'Connector is available'
        }
      }
    }
    vi.mocked(business.validateConnector).mockResolvedValue(validated)
    vi.mocked(business.deleteConnector).mockResolvedValue({
      status: 'applied',
      id: connector.connector.id
    })
    const onChange = vi.fn()
    const view = renderSettings([connector], { business, onChange })

    fireEvent.click(screen.getByRole('button', { name: '验证连接器 Docs' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([validated]))

    view.rerender(
      <LocalizationProvider>
        <ToastProvider>
          <ConnectorSettings
            business={business}
            connectors={[validated]}
            loading={false}
            onChange={onChange}
            onError={vi.fn()}
          />
        </ToastProvider>
      </LocalizationProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: '删除连接器 Docs' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除连接器' }))

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([]))
  })

  it('keeps referenced connector details in persistent page feedback', async () => {
    const business = businessMock()
    vi.mocked(business.deleteConnector).mockResolvedValue({
      status: 'referenced',
      references: {
        workflowCount: 2,
        requirementCount: 1,
        runCount: 3
      }
    })
    const onError = vi.fn()
    renderSettings([connector], { business, onError })

    fireEvent.click(screen.getByRole('button', { name: '删除连接器 Docs' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除连接器' }))

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('2 个流程、1 个需求和 3 个运行')
      )
    )
    expect(document.querySelector('.toast-message')).toBeNull()
    expect(screen.getByText('Docs')).toBeVisible()
  })
})

function businessMock(): BusinessApi {
  return {
    saveConnector: vi.fn().mockImplementation(async (value) => ({
      connector: {
        ...value,
        credential: undefined,
        idempotencyKey: undefined,
        expectedRevision: undefined,
        revision: value.expectedRevision + 1,
        createdAt: 10,
        updatedAt: 10
      },
      hasCredential:
        value.authentication.type !== 'none' && Boolean(value.credential)
    })),
    deleteConnector: vi.fn(),
    validateConnector: vi.fn()
  } as unknown as BusinessApi
}

function renderSettings(
  connectors: ConnectorDto[],
  options: {
    business?: BusinessApi
    onChange?: (connectors: ConnectorDto[]) => void
    onError?: (message: string) => void
    locale?: 'zh-CN' | 'en' | 'ja'
  } = {}
) {
  const storage = {
    getItem: vi.fn(() =>
      JSON.stringify({ version: 1, locale: options.locale ?? 'zh-CN' })
    ),
    setItem: vi.fn()
  } as unknown as Storage
  return render(
    <LocalizationProvider storage={storage}>
      <ToastProvider>
        <ConnectorSettings
          business={options.business ?? businessMock()}
          connectors={connectors}
          loading={false}
          onChange={options.onChange ?? vi.fn()}
          onError={options.onError ?? vi.fn()}
        />
      </ToastProvider>
    </LocalizationProvider>
  )
}
