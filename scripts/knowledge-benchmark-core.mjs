import { createHash } from 'node:crypto'

export const BENCHMARK_SCHEMA_VERSION = 1
export const BENCHMARK_SIZES = Object.freeze([1_000, 10_000, 100_000])
export const BENCHMARK_SCENARIOS = Object.freeze([
  'scale-1k',
  'scale-10k',
  'scale-100k',
  'ranking-quality',
  'chunking-comparison',
  'onnx-int8',
  'qdrant-scalar-quantization',
  'hnsw-matrix',
  'refresh-noop',
  'generation-filter'
])

const DOCUMENT_KINDS = new Set(['requirement', 'code', 'artifact'])
const LANGUAGES = new Set(['zh-CN', 'en'])
const SCENARIO_STATUSES = new Set(['completed', 'skipped', 'failed'])

export function validateGoldenSet(value) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isPositiveInteger(value.seed) ||
    !Array.isArray(value.documents) ||
    value.documents.length === 0 ||
    !Array.isArray(value.queries) ||
    value.queries.length === 0 ||
    !Array.isArray(value.chunkingCases)
  ) {
    throw new Error('Golden set schema is invalid')
  }

  const documentIds = new Set()
  for (const document of value.documents) {
    if (
      !isRecord(document) ||
      !isNonEmptyString(document.id) ||
      documentIds.has(document.id) ||
      !DOCUMENT_KINDS.has(document.kind) ||
      !LANGUAGES.has(document.language) ||
      !isNonEmptyString(document.path) ||
      !isNonEmptyString(document.content) ||
      !isUniqueStringArray(document.relevanceMarkers)
    ) {
      throw new Error('Golden document is invalid')
    }
    documentIds.add(document.id)
  }

  const queryIds = new Set()
  for (const query of value.queries) {
    if (
      !isRecord(query) ||
      !isNonEmptyString(query.id) ||
      queryIds.has(query.id) ||
      !LANGUAGES.has(query.language) ||
      !isNonEmptyString(query.text) ||
      !isUniqueStringArray(query.relevantDocumentIds) ||
      query.relevantDocumentIds.length === 0
    ) {
      throw new Error('Golden query is invalid')
    }
    if (!query.relevantDocumentIds.every((id) => documentIds.has(id))) {
      throw new Error('Golden query relevance is invalid')
    }
    queryIds.add(query.id)
  }

  for (const testCase of value.chunkingCases) {
    if (
      !isRecord(testCase) ||
      !isNonEmptyString(testCase.id) ||
      !isNonEmptyString(testCase.documentId) ||
      !documentIds.has(testCase.documentId) ||
      !isNonEmptyString(testCase.query) ||
      !isNonEmptyString(testCase.relevanceMarker)
    ) {
      throw new Error('Golden chunking case is invalid')
    }
  }

  const coveredKinds = new Set(value.documents.map(({ kind }) => kind))
  const coveredLanguages = new Set(value.documents.map(({ language }) => language))
  if (
    [...DOCUMENT_KINDS].some((kind) => !coveredKinds.has(kind)) ||
    [...LANGUAGES].some((language) => !coveredLanguages.has(language))
  ) {
    throw new Error('Golden set coverage is incomplete')
  }
  return value
}

export function expandCorpus(goldenSet, size) {
  if (!isPositiveInteger(size) || size < goldenSet.documents.length) {
    throw new Error('Benchmark corpus size is invalid')
  }
  const documents = goldenSet.documents.map((document) => ({
    ...document,
    synthetic: false
  }))
  const random = mulberry32(goldenSet.seed)
  const topics = [
    'cache invalidation',
    'workflow approval',
    'terminal rendering',
    'backup retention',
    'connector authentication',
    'schedule recovery',
    'artifact preview',
    'template publication'
  ]
  const kinds = ['requirement', 'code', 'artifact']
  const languages = ['zh-CN', 'en']

  while (documents.length < size) {
    const ordinal = documents.length - goldenSet.documents.length
    const topic = topics[Math.floor(random() * topics.length)]
    const kind = kinds[Math.floor(random() * kinds.length)]
    const language = languages[Math.floor(random() * languages.length)]
    const template = Math.floor(random() * 512)
    const nonce = Math.floor(random() * 0x1_0000_0000)
      .toString(16)
      .padStart(8, '0')
    const id = `synthetic-${String(ordinal).padStart(6, '0')}-${nonce}`
    const content =
      language === 'zh-CN'
        ? `合成离线基准模板 ${template}，主题 ${topic}，用于稳定规模噪声。`
        : `Synthetic offline benchmark template ${template} about ${topic} for stable scale noise.`
    documents.push({
      id,
      kind,
      language,
      path: `synthetic/${kind}/${id}.txt`,
      content,
      relevanceMarkers: [],
      synthetic: true
    })
  }
  return documents
}

export function calculateRankingMetrics(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('Ranking cases are invalid')
  }
  let recallTotal = 0
  let reciprocalRankTotal = 0
  for (const testCase of cases) {
    const relevant = new Set(testCase.relevantDocumentIds)
    if (relevant.size === 0) throw new Error('Ranking relevance is invalid')
    const ranked = [...new Set(testCase.rankedDocumentIds)].slice(0, 8)
    const recalled = ranked.filter((id) => relevant.has(id))
    recallTotal += recalled.length / relevant.size
    const firstRelevant = ranked.findIndex((id) => relevant.has(id))
    reciprocalRankTotal += firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1)
  }
  return {
    queryCount: cases.length,
    recallAt8: roundMetric(recallTotal / cases.length),
    mrrAt8: roundMetric(reciprocalRankTotal / cases.length)
  }
}

export function buildSkippedResult({
  seed,
  goldenSetSha256,
  reasonCode,
  reason,
  environment
}) {
  const skipped = BENCHMARK_SCENARIOS.map((id) => ({
    id,
    status: 'skipped',
    reasonCode,
    reason
  }))
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    benchmark: 'realmflow-knowledge-search',
    status: 'skipped',
    generatedAt: new Date().toISOString(),
    seed,
    goldenSetSha256,
    environment,
    configuration: defaultConfiguration(),
    scenarios: skipped,
    decisions: conservativeDecisions(reason)
  }
}

export function validateResult(value) {
  try {
    assertResult(value)
    return value
  } catch {
    throw new Error('Benchmark result schema is invalid')
  }
}

export function sha256Json(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function conservativeDecisions(reason) {
  return {
    embeddingPrecision: 'float32',
    embeddingPrecisionReason: reason,
    scalarQuantization: 'disabled',
    scalarQuantizationReason: reason,
    hnsw: {
      m: 16,
      efConstruct: 100,
      efSearch: 64,
      reason: `No complete benchmark evidence; retain Qdrant defaults. ${reason}`
    }
  }
}

function assertResult(value) {
  if (
    !isRecord(value) ||
    Object.hasOwn(value, 'measurements') ||
    value.schemaVersion !== BENCHMARK_SCHEMA_VERSION ||
    value.benchmark !== 'realmflow-knowledge-search' ||
    !['completed', 'partial', 'skipped', 'failed'].includes(value.status) ||
    !isIsoDate(value.generatedAt) ||
    !isPositiveInteger(value.seed) ||
    !/^[a-f0-9]{64}$/.test(value.goldenSetSha256) ||
    !isEnvironment(value.environment) ||
    !isRecord(value.configuration) ||
    !Array.isArray(value.scenarios) ||
    value.scenarios.length !== BENCHMARK_SCENARIOS.length ||
    !isRecord(value.decisions)
  ) {
    throw new Error('invalid')
  }
  const expected = new Set(BENCHMARK_SCENARIOS)
  for (const scenario of value.scenarios) {
    if (
      !isRecord(scenario) ||
      !expected.delete(scenario.id) ||
      !SCENARIO_STATUSES.has(scenario.status)
    ) {
      throw new Error('invalid')
    }
    if (scenario.status === 'skipped' || scenario.status === 'failed') {
      if (
        !isNonEmptyString(scenario.reasonCode) ||
        !isNonEmptyString(scenario.reason) ||
        Object.hasOwn(scenario, 'metrics')
      ) {
        throw new Error('invalid')
      }
    } else if (scenario.status === 'completed') {
      if (!isRecord(scenario.metrics)) throw new Error('invalid')
    }
  }
  if (
    value.decisions.embeddingPrecision !== 'float32' &&
    value.decisions.embeddingPrecision !== 'int8'
  ) {
    throw new Error('invalid')
  }
  if (
    value.decisions.scalarQuantization !== 'disabled' &&
    value.decisions.scalarQuantization !== 'enabled'
  ) {
    throw new Error('invalid')
  }
  if (
    !isNonEmptyString(value.decisions.embeddingPrecisionReason) ||
    !isNonEmptyString(value.decisions.scalarQuantizationReason) ||
    !isRecord(value.decisions.hnsw) ||
    !isPositiveInteger(value.decisions.hnsw.m) ||
    !isPositiveInteger(value.decisions.hnsw.efConstruct) ||
    !isPositiveInteger(value.decisions.hnsw.efSearch) ||
    !isNonEmptyString(value.decisions.hnsw.reason)
  ) {
    throw new Error('invalid')
  }
}

function defaultConfiguration() {
  return {
    sizes: [...BENCHMARK_SIZES],
    topK: 8,
    denseDimensions: 768,
    denseDistance: 'Cosine',
    sparseModel: 'qdrant/bm25',
    fusion: 'rrf',
    rrfK: 60,
    embeddingModel: 'Alibaba-NLP/gte-multilingual-base',
    embeddingRevision: '9bbca17d9273fd0d03d5725c7a4b0f6b45142062'
  }
}

function isEnvironment(value) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.platform) &&
    isNonEmptyString(value.arch) &&
    isNonEmptyString(value.nodeVersion) &&
    isNullableString(value.pythonVersion) &&
    isNullableString(value.qdrantVersion) &&
    isNullableString(value.embeddingRuntime)
  )
}

function isNullableString(value) {
  return value === null || isNonEmptyString(value)
}

function isIsoDate(value) {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function isUniqueStringArray(value) {
  return (
    Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  )
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}
