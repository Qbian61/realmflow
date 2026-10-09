import {
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import type { BusinessApi } from '../../../shared/business'
import type { ProductAnalyticsResult } from '../../../shared/product-analytics'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import ProductAnalyticsPanel from './ProductAnalyticsPanel'

const result: ProductAnalyticsResult = {
  scope: {
    workspaces: [
      { id: 'workspace-a', label: 'Alpha' },
      { id: 'workspace-b', label: 'Beta' }
    ]
  },
  summary: {
    workspaces: 2,
    requirements: 3,
    workflows: 2,
    executions: 4,
    nodeRuns: 6
  },
  requirements: [
    { status: 'pending', count: 1 },
    { status: 'active', count: 1 },
    { status: 'completed', count: 1 }
  ],
  workflows: [
    { templateId: 'template-1', label: 'Delivery', count: 2 },
    { templateId: 'template-2', label: 'Research', count: 1 }
  ],
  executionStatuses: [
    { status: 'created', count: 1 },
    { status: 'running', count: 1 },
    { status: 'waiting_user', count: 0 },
    { status: 'paused', count: 0 },
    { status: 'completed', count: 1 },
    { status: 'failed', count: 1 },
    { status: 'cancelled', count: 0 },
    { status: 'interrupted', count: 0 }
  ],
  nodeRunStatuses: [
    { status: 'pending', count: 0 },
    { status: 'ready', count: 1 },
    { status: 'running', count: 1 },
    { status: 'waiting_user', count: 0 },
    { status: 'paused', count: 0 },
    { status: 'blocked', count: 1 },
    { status: 'completed', count: 1 },
    { status: 'failed', count: 1 },
    { status: 'skipped', count: 1 },
    { status: 'cancelled', count: 0 },
    { status: 'interrupted', count: 0 }
  ],
  recentActivity: [
    {
      id: 'audit-1',
      eventType: 'node_run_status_changed',
      triggerSource: 'recovery',
      fromState: 'interrupted',
      toState: 'running',
      occurredAt: new Date(2026, 8, 28, 10, 30).getTime(),
      workspaceId: 'workspace-a',
      workspaceLabel: 'Alpha',
      requirementId: 'requirement-a',
      requirementTitle: 'Analytics',
      executionId: 'execution-a',
      nodeRunId: 'run-a'
    }
  ]
}

function render(ui: JSX.Element) {
  return testingRender(
    <LocalizationProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </LocalizationProvider>
  )
}

function setup(
  queryProductAnalytics = vi.fn().mockResolvedValue(result)
): BusinessApi {
  return { queryProductAnalytics } as unknown as BusinessApi
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('ProductAnalyticsPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('queries all workspaces and renders traceable product activity', async () => {
    const business = setup()

    render(<ProductAnalyticsPanel business={business} />)

    const overview = await screen.findByRole('region', {
      name: '产品活动总览'
    })
    expect(business.queryProductAnalytics).toHaveBeenCalledWith({
      activityLimit: 12
    })
    expect(within(overview).getByText('空间').parentElement).toHaveTextContent(
      '2'
    )
    expect(within(overview).getByText('需求').parentElement).toHaveTextContent(
      '3'
    )
    expect(
      within(overview).getByText('节点运行').parentElement
    ).toHaveTextContent('6')
    expect(
      screen.getByRole('region', { name: '需求状态' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: '流程分布' })
    ).toHaveTextContent('Delivery')
    const activity = screen.getByRole('list', { name: '近期活动' })
    expect(activity).toHaveTextContent('节点运行状态变更')
    expect(activity).toHaveTextContent('中断 → 运行中')
    expect(
      within(activity).getByRole('link', { name: 'Analytics' })
    ).toHaveAttribute('href', '#/spaces/workspace-a/requirements/requirement-a')
  })

  it('changes the optional workspace scope and clears a missing selection', async () => {
    const scoped = {
      ...result,
      scope: {
        workspaceId: 'workspace-b',
        workspaces: result.scope.workspaces
      }
    }
    const queryProductAnalytics = vi
      .fn()
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce(scoped)
      .mockResolvedValueOnce(result)
    const onWorkspaceIdChange = vi.fn()

    render(
      <ProductAnalyticsPanel
        business={setup(queryProductAnalytics)}
        workspaceId="workspace-b"
        onWorkspaceIdChange={onWorkspaceIdChange}
      />
    )

    await screen.findByRole('region', { name: '产品活动总览' })
    expect(queryProductAnalytics).toHaveBeenCalledWith({
      workspaceId: 'workspace-b',
      activityLimit: 12
    })

    fireEvent.change(screen.getByLabelText('空间范围'), {
      target: { value: 'workspace-a' }
    })
    expect(onWorkspaceIdChange).toHaveBeenCalledWith('workspace-a')

    queryProductAnalytics.mockClear()
    testingRender(
      <LocalizationProvider>
        <MemoryRouter>
          <ProductAnalyticsPanel
            business={setup(queryProductAnalytics)}
            workspaceId="missing"
            onWorkspaceIdChange={onWorkspaceIdChange}
          />
        </MemoryRouter>
      </LocalizationProvider>
    )
    await screen.findAllByRole('region', { name: '产品活动总览' })
    expect(onWorkspaceIdChange).toHaveBeenCalledWith(undefined)
  })

  it('uses a fixed workspace without rendering a selector', async () => {
    const business = setup()

    render(
      <ProductAnalyticsPanel
        business={business}
        fixedWorkspaceId="workspace-a"
      />
    )

    await screen.findByRole('region', { name: '产品活动总览' })
    expect(business.queryProductAnalytics).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      activityLimit: 12
    })
    expect(screen.queryByLabelText('空间范围')).not.toBeInTheDocument()
  })

  it('clears a stale optional workspace rejected by Main', async () => {
    const onWorkspaceIdChange = vi.fn()
    const business = setup(
      vi.fn().mockRejectedValue(new Error('空间不存在或不可用'))
    )

    render(
      <ProductAnalyticsPanel
        business={business}
        workspaceId="deleted-workspace"
        onWorkspaceIdChange={onWorkspaceIdChange}
      />
    )

    await waitFor(() =>
      expect(onWorkspaceIdChange).toHaveBeenCalledWith(undefined)
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps only the latest workspace response', async () => {
    const first = deferred<ProductAnalyticsResult>()
    const second = deferred<ProductAnalyticsResult>()
    const queryProductAnalytics = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { rerender } = render(
      <ProductAnalyticsPanel
        business={setup(queryProductAnalytics)}
        workspaceId="workspace-a"
      />
    )

    rerender(
      <LocalizationProvider>
        <MemoryRouter>
          <ProductAnalyticsPanel
            business={setup(queryProductAnalytics)}
            workspaceId="workspace-b"
          />
        </MemoryRouter>
      </LocalizationProvider>
    )
    second.resolve({
      ...result,
      workflows: [{ templateId: 'latest', label: 'Latest', count: 1 }]
    })
    expect(await screen.findByText('Latest')).toBeInTheDocument()

    first.resolve({
      ...result,
      workflows: [{ templateId: 'stale', label: 'Stale', count: 1 }]
    })
    await Promise.resolve()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })

  it('shows a retryable failure and preserves the scope', async () => {
    const queryProductAnalytics = vi
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(result)
    const business = setup(queryProductAnalytics)

    render(
      <ProductAnalyticsPanel business={business} workspaceId="workspace-a" />
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '产品统计加载失败，请重试'
    )
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(
      await screen.findByRole('region', { name: '产品活动总览' })
    ).toBeInTheDocument()
    expect(queryProductAnalytics).toHaveBeenLastCalledWith({
      workspaceId: 'workspace-a',
      activityLimit: 12
    })
  })
})
