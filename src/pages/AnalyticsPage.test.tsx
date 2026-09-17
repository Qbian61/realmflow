import { render, screen, within } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { BusinessApi } from '../../shared/business'
import AnalyticsPage from './AnalyticsPage'

describe('AnalyticsPage', () => {
  afterEach(() => {
    delete window.realmflow
  })

  it('aggregates calls, tokens, first-token latency, success rate and cost', async () => {
    const business = {
      listModels: vi.fn().mockResolvedValue({
        providers: [
          {
            id: 'provider-1',
            type: 'openai_compatible',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            enabled: true,
            revision: 1
          }
        ],
        profiles: [
          {
            id: 'profile-1',
            providerId: 'provider-1',
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
            revision: 1
          }
        ]
      }),
      listModelMetrics: vi.fn().mockResolvedValue([
        {
          id: 'metric-1',
          providerId: 'provider-1',
          modelProfileId: 'profile-1',
          inputTokens: 8_000,
          outputTokens: 2_000,
          startedAt: 1,
          firstTokenLatencyMs: 200,
          durationMs: 1_000,
          retryCount: 0,
          status: 'completed',
          estimatedCost: 0.032
        },
        {
          id: 'metric-2',
          providerId: 'provider-1',
          modelProfileId: 'profile-1',
          inputTokens: 4_000,
          outputTokens: 1_000,
          startedAt: 2,
          firstTokenLatencyMs: 400,
          durationMs: 1_500,
          retryCount: 1,
          status: 'completed',
          estimatedCost: 0.016
        },
        {
          id: 'metric-3',
          providerId: 'provider-1',
          modelProfileId: 'profile-1',
          inputTokens: 0,
          outputTokens: 0,
          startedAt: 3,
          durationMs: 300,
          retryCount: 0,
          status: 'failed',
          estimatedCost: 0
        }
      ])
    } as unknown as BusinessApi
    window.realmflow = { business } as unknown as typeof window.realmflow

    render(<AnalyticsPage />)

    const summary = await screen.findByRole('region', {
      name: '模型调用总览'
    })
    expect(within(summary).getByText('3')).toBeInTheDocument()
    expect(within(summary).getByText('15,000')).toBeInTheDocument()
    expect(within(summary).getByText('300 ms')).toBeInTheDocument()
    expect(within(summary).getByText('66.7%')).toBeInTheDocument()
    expect(within(summary).getByText('$0.0480')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /GPT 4.1/ })).toHaveTextContent(
      '15,000'
    )
    expect(business.listModelMetrics).toHaveBeenCalledWith()
  })

  it('shows a useful empty state when there are no model calls', async () => {
    const business = {
      listModels: vi.fn().mockResolvedValue({
        providers: [],
        profiles: []
      }),
      listModelMetrics: vi.fn().mockResolvedValue([])
    } as unknown as BusinessApi
    window.realmflow = { business } as unknown as typeof window.realmflow

    render(<AnalyticsPage />)

    expect(
      await screen.findByText('暂无模型调用记录')
    ).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
