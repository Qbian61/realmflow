import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildSkippedResult,
  calculateRankingMetrics,
  expandCorpus,
  validateGoldenSet,
  validateResult
} from './knowledge-benchmark-core.mjs'

const GOLDEN_SET = {
  schemaVersion: 1,
  seed: 322032,
  documents: [
    {
      id: 'requirement-zh-refresh',
      kind: 'requirement',
      language: 'zh-CN',
      path: 'requirements/refresh.md',
      content: '知识源内容未变化时，刷新不得发起 Connector 请求。',
      relevanceMarkers: ['refresh-noop']
    },
    {
      id: 'code-en-filter',
      kind: 'code',
      language: 'en',
      path: 'src/generation-filter.ts',
      content: 'export const currentGeneration = "generation-current";',
      relevanceMarkers: ['generation-filter']
    },
    {
      id: 'artifact-en-runbook',
      kind: 'artifact',
      language: 'en',
      path: 'artifacts/recovery-runbook.md',
      content: 'Keep the current generation readable until staging is verified.',
      relevanceMarkers: ['generation-recovery']
    }
  ],
  queries: [
    {
      id: 'query-zh-refresh',
      language: 'zh-CN',
      text: '空跑刷新是否请求连接器',
      relevantDocumentIds: ['requirement-zh-refresh']
    },
    {
      id: 'query-en-filter',
      language: 'en',
      text: 'filter stale index generations',
      relevantDocumentIds: ['code-en-filter']
    }
  ],
  chunkingCases: []
}

describe('knowledge benchmark core', () => {
  it('validates the checked-in golden set and result JSON schema', () => {
    const golden = JSON.parse(
      readFileSync(join(process.cwd(), 'fixtures/knowledge-search-golden.json'), 'utf8')
    )
    const schema = JSON.parse(
      readFileSync(
        join(process.cwd(), 'fixtures/knowledge-search-result.schema.json'),
        'utf8'
      )
    )
    const ajv = new Ajv2020({ strict: true })
    ajv.addFormat('date-time', {
      type: 'string',
      validate: (value: string) =>
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString() === value
    })
    const result = buildSkippedResult({
      seed: golden.seed,
      goldenSetSha256: 'c'.repeat(64),
      reasonCode: 'environment_unavailable',
      reason: 'Acceptance assets are unavailable',
      environment: {
        platform: 'darwin',
        arch: 'arm64',
        nodeVersion: 'v20.20.2',
        pythonVersion: null,
        qdrantVersion: null,
        embeddingRuntime: null
      }
    })

    expect(validateGoldenSet(golden)).toEqual(golden)
    expect(ajv.compile(schema)(result)).toBe(true)
  })

  it('accepts a bilingual RealmFlow golden set with resolvable relevance', () => {
    expect(validateGoldenSet(GOLDEN_SET)).toEqual(GOLDEN_SET)
  })

  it('rejects golden queries whose relevant documents do not exist', () => {
    const invalid = structuredClone(GOLDEN_SET)
    invalid.queries[0].relevantDocumentIds = ['missing']

    expect(() => validateGoldenSet(invalid)).toThrow(
      'Golden query relevance is invalid'
    )
  })

  it('expands a corpus deterministically without changing golden documents', () => {
    const first = expandCorpus(validateGoldenSet(GOLDEN_SET), 1_000)
    const second = expandCorpus(validateGoldenSet(GOLDEN_SET), 1_000)

    expect(first).toEqual(second)
    expect(first).toHaveLength(1_000)
    expect(first.slice(0, 3).map(({ id }) => id)).toEqual([
      'requirement-zh-refresh',
      'code-en-filter',
      'artifact-en-runbook'
    ])
    expect(new Set(first.map(({ id }) => id)).size).toBe(1_000)
  })

  it('calculates Recall@8 and MRR@8 from ranked document ids', () => {
    const metrics = calculateRankingMetrics([
      {
        relevantDocumentIds: ['a'],
        rankedDocumentIds: ['x', 'a', 'z']
      },
      {
        relevantDocumentIds: ['b', 'c'],
        rankedDocumentIds: ['c', 'q']
      },
      {
        relevantDocumentIds: ['d'],
        rankedDocumentIds: ['x']
      }
    ])

    expect(metrics).toEqual({
      queryCount: 3,
      recallAt8: 0.5,
      mrrAt8: 0.5
    })
  })

  it('creates schema-valid skipped output with conservative quantization decisions', () => {
    const result = buildSkippedResult({
      seed: 322032,
      goldenSetSha256: 'a'.repeat(64),
      reasonCode: 'embedding_runtime_unavailable',
      reason: 'Python runtime cannot import onnxruntime',
      environment: {
        platform: 'darwin',
        arch: 'arm64',
        nodeVersion: 'v20.20.2',
        pythonVersion: null,
        qdrantVersion: '1.19.1',
        embeddingRuntime: null
      }
    })

    expect(validateResult(result)).toEqual(result)
    expect(result.status).toBe('skipped')
    expect(result.decisions).toMatchObject({
      embeddingPrecision: 'float32',
      scalarQuantization: 'disabled'
    })
    expect(result.scenarios.every(({ status }) => status === 'skipped')).toBe(
      true
    )
  })

  it('rejects skipped output that contains fabricated measurements', () => {
    const result = buildSkippedResult({
      seed: 322032,
      goldenSetSha256: 'b'.repeat(64),
      reasonCode: 'qdrant_unavailable',
      reason: 'Qdrant did not start',
      environment: {
        platform: 'darwin',
        arch: 'arm64',
        nodeVersion: 'v20.20.2',
        pythonVersion: '3.14.6',
        qdrantVersion: null,
        embeddingRuntime: 'onnxruntime 1.30.0'
      }
    })
    const invalid = structuredClone(result) as Record<string, unknown>
    invalid.measurements = { recallAt8: 1 }

    expect(() => validateResult(invalid)).toThrow(
      'Benchmark result schema is invalid'
    )
  })

  it('rejects failed scenarios without a stable reason', () => {
    const result = buildSkippedResult({
      seed: 322032,
      goldenSetSha256: 'd'.repeat(64),
      reasonCode: 'qdrant_unavailable',
      reason: 'Qdrant did not start',
      environment: {
        platform: 'darwin',
        arch: 'arm64',
        nodeVersion: 'v20.20.2',
        pythonVersion: '3.14.6',
        qdrantVersion: null,
        embeddingRuntime: 'onnxruntime 1.30.0'
      }
    })
    const invalid = structuredClone(result)
    invalid.scenarios[0] = {
      id: 'scale-1k',
      status: 'failed'
    } as (typeof invalid.scenarios)[number]

    expect(() => validateResult(invalid)).toThrow(
      'Benchmark result schema is invalid'
    )
  })
})
