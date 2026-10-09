import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { vi } from 'vitest'
import type { RuntimeGovernanceApi } from '../../../shared/runtime-governance'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import RuntimeGovernancePanel from './RuntimeGovernancePanel'

const snapshot = {
  revision: 3,
  summary: {
    totalRuns: 24,
    completedRuns: 20,
    failedRuns: 3,
    recoveryRate: 50,
    permissionWaits: 4,
    averageDurationMs: 1_250
  },
  failedRuns: [
    {
      runId: 'run-failed',
      scenarioId: 'general' as const,
      stage: 'capability' as const,
      errorCode: 'permission_denied',
      profileId: 'builtin.general',
      pipelineVersion: 'builtin.general.v1',
      relatedCalls: 2,
      failedAt: 500
    }
  ],
  evaluations: [
    {
      id: 'evaluation-1',
      suiteVersion: 'builtin.runtime.v1',
      datasetDigest: 'a'.repeat(64),
      candidateDigest: 'b'.repeat(64),
      seed: 42,
      dimensions: {
        quality: { passed: 9, total: 10 },
        retrieval: { passed: 9, total: 10 },
        toolTrace: { passed: 9, total: 10 },
        safety: { passed: 10, total: 10 },
        recovery: { passed: 9, total: 10 }
      },
      scores: {
        quality: 90,
        retrieval: 90,
        toolTrace: 90,
        safety: 100,
        recovery: 90,
        overall: 91.5
      },
      reproducibilityDigest: 'c'.repeat(64),
      startedAt: 400,
      completedAt: 410
    }
  ],
  capabilities: [
    {
      capabilityId: 'generated.search',
      capabilityVersion: '1.0.0',
      kind: 'skill' as const,
      source: 'generated' as const,
      generationSessionId: 'generation-1',
      conversationId: 'conversation-1',
      confirmationDigest: 'd'.repeat(64),
      scopeLabel: 'global',
      enabled: true,
      revision: 2
    }
  ],
  observability: {
    retentionDays: 30,
    maximumEvents: 50_000,
    droppedEvents: 7,
    storedEvents: 123
  }
}

const detail = {
  ...snapshot.failedRuns[0],
  configuration: {
    scenarioId: 'general' as const,
    pipelineVersion: 'builtin.general.v1',
    profile: 'builtin.general@1.0.0',
    promptDigest: 'e'.repeat(64),
    policyDigest: 'f'.repeat(64),
    catalogDigest: '1'.repeat(64),
    bindingDigest: '2'.repeat(64),
    modelProfileId: 'model-1'
  },
  trace: [
    {
      eventId: 'event-1',
      sequence: 1,
      stage: 'capability' as const,
      type: 'tool.call.failed',
      timestamp: 500,
      summary: 'permission_denied'
    }
  ]
}

function renderPanel(api: RuntimeGovernanceApi): void {
  render(
    <LocalizationProvider>
      <RuntimeGovernancePanel api={api} />
    </LocalizationProvider>
  )
}

function setup(): RuntimeGovernanceApi {
  return {
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    getRunDetail: vi.fn().mockResolvedValue(detail),
    runEvaluation: vi.fn().mockResolvedValue(snapshot.evaluations[0]),
    release: vi.fn().mockResolvedValue({
      status: 'published',
      revision: 4,
      reasons: []
    }),
    exportDiagnostic: vi
      .fn()
      .mockResolvedValue({
        status: 'exported',
        fileName: 'realmflow-diagnostic.json'
      })
  }
}

describe('RuntimeGovernancePanel', () => {
  it('shows health, failed runs, evaluation gates and generated capability provenance', async () => {
    const api = setup()
    renderPanel(api)

    const overview = await screen.findByRole('region', {
      name: '运行治理总览'
    })
    expect(within(overview).getByText('24')).toBeInTheDocument()
    expect(within(overview).getByText('3')).toBeInTheDocument()
    expect(within(overview).getByText('50%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run-failed/ })).toBeVisible()
    expect(screen.getByRole('row', { name: /evaluation-1/ })).toHaveTextContent(
      '91.5'
    )
    expect(
      screen.getByRole('row', { name: /generated.search/ })
    ).toHaveTextContent('conversation-1')
    for (const table of screen.getAllByRole('table')) {
      expect(table).toHaveClass('ui-data-table', 'ui-data-table--compact')
      expect(table.parentElement).toHaveClass('ui-data-table-scroll')
    }
    expect(screen.getByText('123 / 50,000')).toBeInTheDocument()
    expect(screen.getByText('丢失 7 条')).toBeInTheDocument()
  })

  it('loads public Run detail and exports a redacted diagnostic package', async () => {
    const api = setup()
    renderPanel(api)
    fireEvent.click(
      await screen.findByRole('button', { name: /run-failed/ })
    )

    expect(
      await screen.findByRole('region', { name: '运行调试详情' })
    ).toHaveTextContent('permission_denied')
    expect(screen.getByText('builtin.general@1.0.0')).toBeInTheDocument()
    expect(screen.getByText('tool.call.failed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '导出脱敏诊断包' }))
    expect(api.exportDiagnostic).toHaveBeenCalledWith('run-failed')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'realmflow-diagnostic.json'
    )
  })

  it('runs the fixed suite and publishes only through the revisioned gate', async () => {
    const api = setup()
    renderPanel(api)
    await screen.findByRole('region', { name: '运行治理总览' })

    fireEvent.click(screen.getByRole('button', { name: '运行固定评测' }))
    expect(api.runEvaluation).toHaveBeenCalledWith()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '发布候选配置' })
      ).toBeEnabled()
    )

    fireEvent.click(screen.getByRole('button', { name: '发布候选配置' }))
    await waitFor(() =>
      expect(api.release).toHaveBeenCalledWith({
        evaluationId: 'evaluation-1',
        expectedRevision: 3
      })
    )
    expect(await screen.findByRole('status')).toHaveTextContent('版本 4')
  })

  it('shows retryable unavailable and load-failure states', async () => {
    const api = setup()
    vi.mocked(api.getSnapshot)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(snapshot)
    renderPanel(api)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '运行治理数据加载失败'
    )
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(
      await screen.findByRole('region', { name: '运行治理总览' })
    ).toBeVisible()
  })
})
