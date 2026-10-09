import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ModelCallMetric,
  ModelProfile,
  ModelProvider
} from '../../../../domain/model'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'
import { createSqliteRepositories } from './repositories'
import { SqliteModelStatisticsRepository } from './model-statistics-repository'

let directory: string
let database: RealmFlowDatabase

const day = (offset: number, hour = 12) =>
  new Date(2026, 0, 10 + offset, hour).getTime()

const providers: ModelProvider[] = [
  {
    id: 'provider-a',
    type: 'local',
    name: 'Provider A',
    baseUrl: 'http://127.0.0.1/a',
    enabled: true
  },
  {
    id: 'provider-b',
    type: 'local',
    name: 'Provider B',
    baseUrl: 'http://127.0.0.1/b',
    enabled: true
  }
]

const profiles: ModelProfile[] = providers.map((provider, index) => ({
  id: `model-${index + 1}`,
  providerId: provider.id,
  modelId: `model-${index + 1}`,
  displayName: `Model ${index + 1}`,
  enabled: true,
  capabilities: {
    text: true,
    vision: false,
    toolCalling: false,
    structuredOutput: false
  },
  contextWindow: 4_096,
  timeoutMs: 60_000,
  maxRetries: 2,
  maxConcurrency: 1,
  inputCostPerMillionTokens: 1,
  outputCostPerMillionTokens: 4
}))

const metrics: ModelCallMetric[] = [
  {
    id: 'metric-1',
    source: 'general_conversation',
    providerId: 'provider-a',
    modelProfileId: 'model-1',
    aiRunId: 'run-1',
    inputTokens: 100,
    outputTokens: 50,
    cachedTokens: 10,
    reasoningTokens: 5,
    startedAt: day(0),
    firstTokenLatencyMs: 100,
    durationMs: 500,
    throughputTokensPerSecond: 125,
    retryCount: 1,
    status: 'completed',
    estimatedInputCost: 0.01,
    estimatedOutputCost: 0.02,
    estimatedCost: 0.03
  },
  {
    id: 'metric-2',
    source: 'general_conversation',
    providerId: 'provider-a',
    modelProfileId: 'model-1',
    aiRunId: 'run-2',
    inputTokens: 20,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    startedAt: day(0, 18),
    durationMs: 100,
    throughputTokensPerSecond: 0,
    retryCount: 2,
    status: 'failed',
    errorCode: 'provider_unavailable',
    estimatedInputCost: 0.002,
    estimatedOutputCost: 0,
    estimatedCost: 0.002
  },
  {
    id: 'metric-3',
    source: 'general_conversation',
    providerId: 'provider-b',
    modelProfileId: 'model-2',
    aiRunId: 'run-3',
    inputTokens: 30,
    outputTokens: 20,
    cachedTokens: 2,
    reasoningTokens: 3,
    startedAt: day(2),
    firstTokenLatencyMs: 200,
    durationMs: 600,
    throughputTokensPerSecond: 50,
    retryCount: 0,
    status: 'completed',
    estimatedInputCost: 0.003,
    estimatedOutputCost: 0.008,
    estimatedCost: 0.011
  }
]

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-statistics-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  const repositories = createSqliteRepositories(database)
  for (const provider of providers) {
    await repositories.modelPool.saveProvider(provider, 0)
  }
  for (const profile of profiles) {
    await repositories.modelPool.saveProfile(profile, 0)
  }
  for (const metric of metrics) {
    await repositories.modelMetrics.append(metric)
  }
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteModelStatisticsRepository', () => {
  it('aggregates usage, quality, performance and estimated costs', async () => {
    const repository = new SqliteModelStatisticsRepository(database)

    const result = await repository.query({ groupBy: 'model' })

    expect(result.summary).toEqual({
      calls: 3,
      inputTokens: 150,
      outputTokens: 70,
      cachedTokens: 12,
      reasoningTokens: 8,
      totalTokens: 240,
      averageFirstTokenLatencyMs: 150,
      averageDurationMs: 400,
      averageThroughputTokensPerSecond: 87.5,
      successRate: expect.closeTo(200 / 3),
      retries: 3,
      estimatedInputCost: 0.015,
      estimatedOutputCost: 0.028,
      estimatedCost: 0.043
    })
    expect(result.groups.map(({ key, label, summary }) => ({
      key,
      label,
      calls: summary.calls
    }))).toEqual([
      { key: 'model-1', label: 'Model 1', calls: 2 },
      { key: 'model-2', label: 'Model 2', calls: 1 }
    ])
    expect(result.options.providers).toEqual([
      { id: 'provider-a', label: 'Provider A' },
      { id: 'provider-b', label: 'Provider B' }
    ])
  })

  it('applies inclusive-exclusive filters and fills missing local days', async () => {
    const repository = new SqliteModelStatisticsRepository(database)
    const from = new Date(2026, 0, 10).getTime()
    const to = new Date(2026, 0, 13).getTime()

    const result = await repository.query({
      from,
      to,
      providerId: 'provider-a',
      modelProfileId: 'model-1',
      groupBy: 'provider'
    })

    expect(result.summary.calls).toBe(2)
    expect(result.trend.map((point) => ({
      start: point.bucketStart,
      calls: point.summary.calls
    }))).toEqual([
      { start: from, calls: 2 },
      { start: new Date(2026, 0, 11).getTime(), calls: 0 },
      { start: new Date(2026, 0, 12).getTime(), calls: 0 }
    ])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({
      key: 'provider-a',
      label: 'Provider A'
    })
  })

  it.each(['workspace', 'requirement', 'node', 'conversation'] as const)(
    'groups missing %s attribution as unassigned',
    async (groupBy) => {
      const repository = new SqliteModelStatisticsRepository(database)

      const result = await repository.query({ groupBy })

      expect(result.groups).toHaveLength(1)
      expect(result.groups[0]).toMatchObject({
        key: '__unassigned__',
        label: '未关联',
        summary: { calls: 3 }
      })
    }
  )

  it.each([
    ['workspaceId', 'missing-workspace'],
    ['requirementId', 'missing-requirement'],
    ['nodeId', 'missing-node'],
    ['conversationId', 'missing-conversation']
  ] as const)('filters by %s', async (key, value) => {
    const repository = new SqliteModelStatisticsRepository(database)

    const result = await repository.query({
      groupBy: 'model',
      [key]: value
    })

    expect(result.summary.calls).toBe(0)
    expect(result.groups).toEqual([])
  })
})
