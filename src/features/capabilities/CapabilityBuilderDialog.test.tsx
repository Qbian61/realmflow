import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CapabilityBuilderApi } from '../../../shared/capability-catalog'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { CapabilityBuilderDialog } from './CapabilityBuilderDialog'

describe('CapabilityBuilderDialog', () => {
  it('creates and previews a validated HTTP Connector draft', async () => {
    const api = createApi()
    renderDialog(api)

    const dialog = screen.getByRole('dialog', { name: '对话创建能力' })
    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--workspace')
    expect(dialog.parentElement).toHaveClass('ui-dialog-backdrop')
    expect(screen.getByLabelText('能力名称').closest('.ui-field')).not.toBeNull()
    expect(
      screen.getByRole('button', { name: '生成并验证' })
    ).toHaveClass('ui-button', 'ui-button--primary')
    fireEvent.change(screen.getByLabelText('能力名称'), {
      target: { value: '问题查询' }
    })
    fireEvent.change(screen.getByLabelText('能力 ID'), {
      target: { value: 'com.example.issue-lookup' }
    })
    fireEvent.change(screen.getByLabelText('需求描述'), {
      target: { value: '根据问题 ID 查询详情' }
    })
    fireEvent.change(screen.getByLabelText('服务地址'), {
      target: { value: 'https://api.example.com' }
    })
    fireEvent.change(screen.getByLabelText('请求路径'), {
      target: { value: '/issues/{issueId}' }
    })
    fireEvent.change(screen.getByLabelText('凭据槽位'), {
      target: { value: 'issue-api-key' }
    })
    fireEvent.change(screen.getByLabelText('安装作用域'), {
      target: { value: 'workspace' }
    })
    fireEvent.change(screen.getByLabelText('空间 ID'), {
      target: { value: 'workspace-1' }
    })
    fireEvent.click(screen.getByRole('button', { name: '生成并验证' }))

    await waitFor(() => expect(api.createDraft).toHaveBeenCalledOnce())
    expect(api.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        request: '根据问题 ID 查询详情',
        spec: expect.objectContaining({
          kind: 'connector',
          scope: { kind: 'workspace', workspaceId: 'workspace-1' },
          runtime: expect.objectContaining({
            connectorKind: 'http',
            credentialRefs: ['issue-api-key']
          })
        })
      })
    )
    expect(api.createDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: expect.anything(),
        requestedBy: expect.anything()
      })
    )
    expect(await screen.findByText('权限与验证')).toBeVisible()
    expect(screen.getByText('issue-api-key')).toBeVisible()
    expect(screen.getByText('2 个文件')).toBeVisible()
    expect(screen.getByText('1 项测试通过')).toBeVisible()
    expect(
      screen.getByRole('button', { name: '安装并启用' })
    ).toBeEnabled()
  })

  it('shows validation diagnostics and returns to editing', async () => {
    const api = createApi({
      createDraft: vi.fn().mockResolvedValue({
        ...sessionFixture(),
        status: 'draft',
        proposal: undefined,
        diagnostics: ['Capability package test failed: contract']
      })
    })
    renderDialog(api)

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: '生成并验证' }))

    expect(
      await screen.findByText('Capability package test failed: contract')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '仅安装' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回修改' }))
    expect(screen.getByLabelText('需求描述')).toBeVisible()
  })

  it('disables install-and-enable for an external write capability', async () => {
    const api = createApi({
      createDraft: vi.fn().mockResolvedValue(
        sessionFixture({ maximumRisk: 'high', externalWrite: true })
      )
    })
    renderDialog(api)

    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('请求方法'), {
      target: { value: 'POST' }
    })
    fireEvent.click(screen.getByRole('button', { name: '生成并验证' }))

    expect(
      await screen.findByRole('button', { name: '安装并启用' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: '仅安装' })).toBeEnabled()
  })

  it('confirms only the selected action and closes after Main succeeds', async () => {
    const onInstalled = vi.fn()
    const onClose = vi.fn()
    const api = createApi()
    renderDialog(api, { onInstalled, onClose })

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: '生成并验证' }))
    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    await waitFor(() =>
      expect(api.confirmInstall).toHaveBeenCalledWith({
        sessionId: 'generation-1',
        proposalId: 'proposal-1',
        revision: 3,
        packageDigest: 'c'.repeat(64),
        scope: { kind: 'global' },
        enable: false
      })
    )
    expect(onInstalled).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cancels the persisted draft before closing', async () => {
    const onClose = vi.fn()
    const api = createApi()
    renderDialog(api, { onClose })

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: '生成并验证' }))
    await screen.findByText('权限与验证')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    await waitFor(() =>
      expect(api.cancel).toHaveBeenCalledWith({
        sessionId: 'generation-1',
        expectedRevision: 3
      })
    )
    expect(onClose).toHaveBeenCalledOnce()
  })
})

function renderDialog(
  api: CapabilityBuilderApi,
  props: {
    onClose?: () => void
    onInstalled?: () => void
  } = {}
) {
  return render(
    <LocalizationProvider>
      <CapabilityBuilderDialog
        api={api}
        platform="darwin"
        onClose={props.onClose ?? vi.fn()}
        onInstalled={props.onInstalled ?? vi.fn()}
      />
    </LocalizationProvider>
  )
}

function fillRequiredFields(): void {
  fireEvent.change(screen.getByLabelText('能力名称'), {
    target: { value: '问题查询' }
  })
  fireEvent.change(screen.getByLabelText('能力 ID'), {
    target: { value: 'com.example.issue-lookup' }
  })
  fireEvent.change(screen.getByLabelText('需求描述'), {
    target: { value: '根据问题 ID 查询详情' }
  })
  fireEvent.change(screen.getByLabelText('服务地址'), {
    target: { value: 'https://api.example.com' }
  })
  fireEvent.change(screen.getByLabelText('请求路径'), {
    target: { value: '/issues/{issueId}' }
  })
}

function createApi(
  overrides: Partial<CapabilityBuilderApi> = {}
): CapabilityBuilderApi {
  return {
    createDraft: vi.fn().mockResolvedValue(sessionFixture()),
    getSession: vi.fn(),
    reviseDraft: vi.fn().mockResolvedValue(sessionFixture()),
    confirmInstall: vi.fn().mockResolvedValue({
      definition: sessionFixture().proposal!.definition,
      installation: {
        id: 'installation-1',
        status: 'installed_disabled'
      }
    }),
    cancel: vi.fn().mockResolvedValue({
      ...sessionFixture(),
      status: 'cancelled',
      proposal: undefined,
      revision: 4
    }),
    ...overrides
  } as unknown as CapabilityBuilderApi
}

function sessionFixture(options: {
  maximumRisk?: 'low' | 'medium' | 'high' | 'critical'
  externalWrite?: boolean
} = {}) {
  const maximumRisk = options.maximumRisk ?? 'medium'
  return {
    id: 'generation-1',
    conversationId: 'capability-studio',
    requestedBy: 'local-user',
    request: '根据问题 ID 查询详情',
    status: 'awaiting_approval',
    revision: 3,
    spec: {
      schemaVersion: 1,
      specDigest: 'a'.repeat(64),
      id: 'com.example.issue-lookup',
      kind: 'connector',
      version: '1.0.0',
      name: '问题查询',
      description: '根据问题 ID 查询详情',
      scope: { kind: 'global' },
      runtime: {
        kind: 'connector',
        connectorKind: 'http',
        baseUrl: 'https://api.example.com',
        method: options.externalWrite ? 'POST' : 'GET',
        path: '/issues/{issueId}',
        credentialRefs: ['issue-api-key'],
        externalWrite: options.externalWrite ?? false
      },
      permissions: {
        capabilities: ['network.connect', 'credential.use'],
        maximumRisk,
        pathPrefixes: [],
        networkTargets: ['api.example.com']
      },
      dependencies: [],
      compatibility: {
        realmflowVersionRange: '>=0.1.0',
        platforms: ['darwin']
      }
    },
    proposal: {
      id: 'proposal-1',
      packageDigest: 'c'.repeat(64),
      definitionDigest: 'b'.repeat(64),
      scope: { kind: 'global' },
      draftRevision: 1,
      definition: {
        id: 'com.example.issue-lookup',
        kind: 'connector',
        version: '1.0.0',
        definitionDigest: 'b'.repeat(64),
        permissions: {
          capabilities: ['network.connect', 'credential.use'],
          maximumRisk,
          pathPrefixes: [],
          networkTargets: ['api.example.com']
        },
        runtime: {
          kind: 'connector',
          credentialRefs: ['issue-api-key']
        }
      },
      validationReport: {
        compatible: true,
        dependencyStatus: 'resolved',
        tests: [{ id: 'contract', status: 'passed' }]
      },
      fileNames: ['README.md', 'capability.yaml'],
      byteSize: 128,
      fileCount: 2,
      validatedAt: 120
    },
    createdAt: 100,
    updatedAt: 120
  } as const
}
