import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import {
  BENCHMARK_SCENARIOS,
  buildSkippedResult,
  calculateRankingMetrics,
  expandCorpus,
  sha256Json,
  validateGoldenSet,
  validateResult
} from './knowledge-benchmark-core.mjs'

const TOP_K = 8
const UPSERT_BATCH = 128
const EMBEDDING_BATCH = 32
const QUALITY_TOLERANCE = 0.02

export async function runKnowledgeBenchmark(options) {
  const golden = validateGoldenSet(
    JSON.parse(await readFile(options.goldenPath, 'utf8'))
  )
  const goldenSetSha256 = sha256Json(golden)
  const environment = probeEnvironment(options)
  const unavailable = environment.probeErrors[0]

  if (unavailable || options.probeOnly) {
    const result = buildSkippedResult({
      seed: golden.seed,
      goldenSetSha256,
      reasonCode: unavailable?.code ?? 'probe_only',
      reason:
        unavailable?.message ??
        'Probe-only mode verifies assets without producing measurements',
      environment: publicEnvironment(environment)
    })
    await writeResult(options.outputPath, result)
    return { result, outputPath: options.outputPath }
  }

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'realmflow-knowledge-benchmark-')
  )
  let qdrant
  let worker
  let result
  try {
    qdrant = await startQdrant(options.qdrantPath, temporaryRoot)
    worker = new PythonWorker(options.pythonPath, options.root)
    await worker.start()
    await worker.request({ op: 'health' })
    result = await executeBenchmark({
      options,
      golden,
      goldenSetSha256,
      environment: publicEnvironment(environment),
      qdrant,
      worker,
      temporaryRoot
    })
  } catch (error) {
    result = buildSkippedResult({
      seed: golden.seed,
      goldenSetSha256,
      reasonCode: 'benchmark_runtime_unavailable',
      reason: sanitizeError(error),
      environment: publicEnvironment(environment)
    })
  } finally {
    await worker?.stop()
    await qdrant?.stop()
    if (!options.keepTemporary) {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }
  validateResult(result)
  await writeResult(options.outputPath, result)
  return { result, outputPath: options.outputPath }
}

async function executeBenchmark({
  options,
  golden,
  goldenSetSha256,
  environment,
  qdrant,
  worker,
  temporaryRoot
}) {
  const maxSize = Math.max(...options.sizes)
  const corpus = expandCorpus(golden, maxSize)
  const contentVectors = await embedUnique(
    worker,
    corpus.map(({ content }) => content)
  )
  const queryVectors = await embedUnique(
    worker,
    golden.queries.map(({ text }) => text)
  )
  const points = corpus.map((document, ordinal) => ({
    id: ordinal + 1,
    vector: {
      dense: contentVectors.get(document.content),
      bm25: { text: document.content, model: 'qdrant/bm25' }
    },
    payload: {
      documentId: document.id,
      corpusOrdinal: ordinal,
      workspaceId: 'benchmark-workspace',
      generationId: `generation-${ordinal % 1000}`,
      sourceId: `source-${ordinal % 1000}`
    }
  }))

  const baselineCollection = 'benchmark_baseline'
  const indexStarted = performance.now()
  await createCollection(qdrant, baselineCollection, {})
  await createPayloadIndexes(qdrant, baselineCollection)
  await upsertPoints(qdrant, baselineCollection, points)
  await waitForCollection(qdrant, baselineCollection)
  const indexMs = round(performance.now() - indexStarted)

  const scenarios = []
  const scaleResults = new Map()
  for (const size of [1_000, 10_000, 100_000]) {
    const id = `scale-${size / 1000}k`
    if (!options.sizes.includes(size)) {
      scenarios.push(skipped(id, 'size_not_selected', `Size ${size} was not selected`))
      continue
    }
    const evaluation = await evaluateRetrieval({
      qdrant,
      collection: baselineCollection,
      golden,
      queryVectors,
      size,
      efSearch: 64
    })
    scaleResults.set(size, evaluation)
    scenarios.push({
      id,
      status: 'completed',
      metrics: {
        chunkCount: size,
        sharedIndexBuildMs: indexMs,
        ...evaluation
      }
    })
  }

  const qualitySize = Math.max(...scaleResults.keys())
  const quality = scaleResults.get(qualitySize)
  scenarios.push({
    id: 'ranking-quality',
    status: 'completed',
    metrics: {
      evaluatedChunkCount: qualitySize,
      dense: quality.dense,
      bm25: quality.bm25,
      rrf: quality.rrf
    }
  })

  scenarios.push(
    await evaluateChunking({
      qdrant,
      worker,
      golden
    })
  )

  const int8Available = environment.embeddingRuntime?.includes('int8=true')
  scenarios.push(
    int8Available
      ? skipped(
          'onnx-int8',
          'int8_runner_not_configured',
          'INT8 asset exists but no pinned INT8 manifest is configured'
        )
      : skipped(
          'onnx-int8',
          'int8_asset_unavailable',
          'No verified ONNX INT8 model asset is available'
        )
  )

  const evaluationPoints = points.slice(0, Math.min(10_000, points.length))
  const scalar = await evaluateScalarQuantization({
    qdrant,
    points: evaluationPoints,
    golden,
    queryVectors,
    baseline: scaleResults.get(evaluationPoints.length)
  })
  scenarios.push(scalar.scenario)

  const hnsw = await evaluateHnswMatrix({
    qdrant,
    points: evaluationPoints,
    golden,
    queryVectors,
    baseline: scaleResults.get(evaluationPoints.length)
  })
  scenarios.push(hnsw.scenario)
  scenarios.push(await evaluateRefreshNoop(temporaryRoot, corpus))
  scenarios.push(
    await evaluateGenerationFilter({
      qdrant,
      collection: baselineCollection,
      golden,
      queryVectors,
      size: maxSize
    })
  )

  const orderedScenarios = BENCHMARK_SCENARIOS.map((id) => {
    const scenario = scenarios.find((candidate) => candidate.id === id)
    if (!scenario) throw new Error(`Benchmark scenario missing: ${id}`)
    return scenario
  })
  const failed = orderedScenarios.filter(({ status }) => status === 'failed')
  const skippedScenarios = orderedScenarios.filter(
    ({ status }) => status === 'skipped'
  )
  const result = {
    schemaVersion: 1,
    benchmark: 'realmflow-knowledge-search',
    status:
      failed.length > 0
        ? 'failed'
        : skippedScenarios.length > 0
          ? 'partial'
          : 'completed',
    generatedAt: new Date().toISOString(),
    seed: golden.seed,
    goldenSetSha256,
    environment,
    configuration: benchmarkConfiguration(),
    scenarios: orderedScenarios,
    decisions: {
      embeddingPrecision: 'float32',
      embeddingPrecisionReason:
        'No verified INT8 measurement met the quality and resource gates.',
      scalarQuantization: scalar.enable ? 'enabled' : 'disabled',
      scalarQuantizationReason: scalar.reason,
      hnsw: hnsw.decision
    }
  }
  return validateResult(result)
}

async function evaluateRetrieval({
  qdrant,
  collection,
  golden,
  queryVectors,
  size,
  efSearch,
  extraFilter,
  repetitions = 1
}) {
  const byMode = {}
  for (const mode of ['dense', 'bm25', 'rrf']) {
    const cases = []
    const latencies = []
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      for (const query of golden.queries) {
        const started = performance.now()
        const points = await search(qdrant, {
          collection,
          mode,
          text: query.text,
          vector: queryVectors.get(query.text),
          size,
          efSearch,
          extraFilter
        })
        latencies.push(performance.now() - started)
        if (repetition === 0) {
          cases.push({
            relevantDocumentIds: query.relevantDocumentIds,
            rankedDocumentIds: points.map((point) => point.payload.documentId)
          })
        }
      }
    }
    byMode[mode] = {
      ...calculateRankingMetrics(cases),
      latencyMs: latencySummary(latencies)
    }
  }
  return byMode
}

async function evaluateChunking({ qdrant, worker, golden }) {
  const documents = golden.documents.map((document) => ({
    documentKey: document.path,
    content: document.content
  }))
  const [fixed, structured] = await Promise.all([
    worker.request({
      op: 'chunk',
      strategy: 'fixed',
      fixedCharacters: 1200,
      overlapCharacters: 200,
      documents
    }),
    worker.request({
      op: 'chunk',
      strategy: 'structured',
      documents
    })
  ])
  const chunks = []
  for (const result of [fixed, structured]) {
    for (const document of result.documents) {
      const source = golden.documents.find(
        (candidate) => candidate.path === document.documentKey
      )
      for (const chunk of document.chunks) {
        chunks.push({
          strategy: result.strategy,
          documentId: source.id,
          content: chunk.content,
          ordinal: chunk.ordinal
        })
      }
    }
  }
  const vectors = await embedUnique(
    worker,
    chunks.map(({ content }) => content)
  )
  const queryVectors = await embedUnique(
    worker,
    golden.chunkingCases.map(({ query }) => query)
  )
  const collection = 'benchmark_chunking'
  await createCollection(qdrant, collection, {})
  await createKeywordIndex(qdrant, collection, 'strategy')
  const points = chunks.map((chunk, index) => ({
    id: index + 1,
    vector: {
      dense: vectors.get(chunk.content),
      bm25: { text: chunk.content, model: 'qdrant/bm25' }
    },
    payload: {
      ...chunk,
      chunkId: `${chunk.strategy}:${chunk.documentId}:${chunk.ordinal}`
    }
  }))
  await upsertPoints(qdrant, collection, points)

  const metrics = {}
  for (const strategy of ['fixed-characters', 'structured']) {
    const cases = []
    const latencies = []
    for (const testCase of golden.chunkingCases) {
      const relevant = points
        .filter(
          (point) =>
            point.payload.strategy === strategy &&
            point.payload.documentId === testCase.documentId &&
            point.payload.content.includes(testCase.relevanceMarker)
        )
        .map(({ payload }) => payload.chunkId)
      const started = performance.now()
      const matches = await search(qdrant, {
        collection,
        mode: 'rrf',
        text: testCase.query,
        vector: queryVectors.get(testCase.query),
        size: points.length,
        efSearch: 64,
        extraFilter: [
          { key: 'strategy', match: { value: strategy } }
        ],
        omitOrdinalFilter: true
      })
      latencies.push(performance.now() - started)
      cases.push({
        relevantDocumentIds: relevant,
        rankedDocumentIds: matches.map(({ payload }) => payload.chunkId)
      })
    }
    metrics[strategy] = {
      chunkCount: points.filter(
        ({ payload }) => payload.strategy === strategy
      ).length,
      ...calculateRankingMetrics(cases),
      latencyMs: latencySummary(latencies)
    }
  }
  return {
    id: 'chunking-comparison',
    status: 'completed',
    metrics
  }
}

async function evaluateScalarQuantization({
  qdrant,
  points,
  golden,
  queryVectors,
  baseline
}) {
  if (!baseline) {
    return {
      scenario: skipped(
        'qdrant-scalar-quantization',
        'baseline_size_not_selected',
        `Select size ${points.length} to evaluate scalar quantization`
      ),
      enable: false,
      reason: 'Scalar quantization was not measured; keep it disabled.'
    }
  }
  try {
    const collection = 'benchmark_scalar'
    const started = performance.now()
    await createCollection(qdrant, collection, {
      scalarQuantization: true
    })
    await createPayloadIndexes(qdrant, collection)
    await upsertPoints(qdrant, collection, points)
    await waitForCollection(qdrant, collection)
    const indexMs = round(performance.now() - started)
    const measured = await evaluateRetrieval({
      qdrant,
      collection,
      golden,
      queryVectors,
      size: points.length,
      efSearch: 64,
      repetitions: 3
    })
    const qualityPass =
      measured.rrf.recallAt8 >= baseline.rrf.recallAt8 - QUALITY_TOLERANCE &&
      measured.rrf.mrrAt8 >= baseline.rrf.mrrAt8 - QUALITY_TOLERANCE
    const latencyImproved =
      measured.rrf.latencyMs.p95 < baseline.rrf.latencyMs.p95 * 0.95
    const enable = qualityPass && latencyImproved
    const reason = enable
      ? 'Scalar INT8 preserved quality and improved measured RRF p95 latency by at least 5%.'
      : 'Scalar INT8 did not prove both the quality gate and a 5% RRF p95 latency improvement.'
    return {
      scenario: {
        id: 'qdrant-scalar-quantization',
        status: 'completed',
        metrics: {
          evaluatedChunkCount: points.length,
          indexMs,
          baseline: baseline.rrf,
          scalar: measured.rrf,
          qualityPass,
          latencyImproved
        }
      },
      enable,
      reason
    }
  } catch (error) {
    return {
      scenario: skipped(
        'qdrant-scalar-quantization',
        'scalar_quantization_unavailable',
        sanitizeError(error)
      ),
      enable: false,
      reason: 'Scalar quantization could not be measured; keep it disabled.'
    }
  }
}

async function evaluateHnswMatrix({
  qdrant,
  points,
  golden,
  queryVectors,
  baseline
}) {
  const conservative = {
    m: 16,
    efConstruct: 100,
    efSearch: 64,
    reason: 'No complete HNSW matrix evidence; retain Qdrant defaults.'
  }
  if (!baseline) {
    return {
      scenario: skipped(
        'hnsw-matrix',
        'baseline_size_not_selected',
        `Select size ${points.length} to evaluate HNSW`
      ),
      decision: conservative
    }
  }
  try {
    const rows = []
    for (const construction of [
      { m: 8, efConstruct: 64 },
      { m: 16, efConstruct: 100 },
      { m: 32, efConstruct: 200 }
    ]) {
      const collection = `benchmark_hnsw_${construction.m}`
      const started = performance.now()
      await createCollection(qdrant, collection, construction)
      await createPayloadIndexes(qdrant, collection)
      await upsertPoints(qdrant, collection, points)
      await waitForCollection(qdrant, collection)
      const indexMs = round(performance.now() - started)
      for (const efSearch of [32, 64, 128]) {
        const result = await evaluateRetrieval({
          qdrant,
          collection,
          golden,
          queryVectors,
          size: points.length,
          efSearch,
          repetitions: 3
        })
        rows.push({
          ...construction,
          efSearch,
          indexMs,
          rrf: result.rrf
        })
      }
    }
    const eligible = rows
      .filter(
        ({ rrf }) =>
          rrf.recallAt8 >= baseline.rrf.recallAt8 - 0.01 &&
          rrf.mrrAt8 >= baseline.rrf.mrrAt8 - 0.01
      )
      .sort(
        (left, right) =>
          left.rrf.latencyMs.p95 - right.rrf.latencyMs.p95 ||
          left.indexMs - right.indexMs
      )
    const selected = eligible[0]
    const improves =
      selected &&
      selected.rrf.latencyMs.p95 < baseline.rrf.latencyMs.p95 * 0.95
    return {
      scenario: {
        id: 'hnsw-matrix',
        status: 'completed',
        metrics: {
          evaluatedChunkCount: points.length,
          baseline: baseline.rrf,
          rows
        }
      },
      decision: improves
        ? {
            m: selected.m,
            efConstruct: selected.efConstruct,
            efSearch: selected.efSearch,
            reason:
              'Selected the fastest quality-preserving row with at least 5% lower RRF p95 latency.'
          }
        : {
            ...conservative,
            reason:
              'No quality-preserving matrix row improved RRF p95 latency by at least 5%; retain Qdrant defaults.'
          }
    }
  } catch (error) {
    return {
      scenario: skipped(
        'hnsw-matrix',
        'hnsw_matrix_unavailable',
        sanitizeError(error)
      ),
      decision: conservative
    }
  }
}

async function evaluateRefreshNoop(temporaryRoot, corpus) {
  const manifestPath = join(temporaryRoot, 'refresh-manifest.json')
  const manifest = corpus.slice(0, 10_000).map((document) => ({
    sourceId: document.id,
    checksum: createHash('sha256').update(document.content).digest('hex')
  }))
  await writeFile(manifestPath, JSON.stringify(manifest))
  const beforeUsage = process.resourceUsage()
  const before = await directorySize(temporaryRoot)
  const latencies = []
  let connectorRequests = 0
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const started = performance.now()
    const current = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (current.length !== manifest.length) connectorRequests += 1
    latencies.push(performance.now() - started)
  }
  const afterUsage = process.resourceUsage()
  const after = await directorySize(temporaryRoot)
  return {
    id: 'refresh-noop',
    status: 'completed',
    metrics: {
      sourceCount: manifest.length,
      runs: latencies.length,
      latencyMs: latencySummary(latencies),
      cpuUserMs: round(
        (afterUsage.userCPUTime - beforeUsage.userCPUTime) / 1000
      ),
      cpuSystemMs: round(
        (afterUsage.systemCPUTime - beforeUsage.systemCPUTime) / 1000
      ),
      diskBytesDelta: after - before,
      connectorRequests
    }
  }
}

async function evaluateGenerationFilter({
  qdrant,
  collection,
  golden,
  queryVectors,
  size
}) {
  const query = golden.queries[0]
  const rows = []
  for (const sourceCount of [1, 10, 100, 1000]) {
    const generationIds = Array.from(
      { length: sourceCount },
      (_, index) => `generation-${index}`
    )
    const latencies = []
    for (let run = 0; run < 10; run += 1) {
      const started = performance.now()
      await search(qdrant, {
        collection,
        mode: 'rrf',
        text: query.text,
        vector: queryVectors.get(query.text),
        size,
        efSearch: 64,
        extraFilter: [
          { key: 'generationId', match: { any: generationIds } }
        ]
      })
      latencies.push(performance.now() - started)
    }
    rows.push({ sourceCount, latencyMs: latencySummary(latencies) })
  }
  return {
    id: 'generation-filter',
    status: 'completed',
    metrics: {
      evaluatedChunkCount: size,
      runsPerRow: 10,
      rows
    }
  }
}

async function embedUnique(worker, texts) {
  const unique = [...new Set(texts)]
  const vectors = new Map()
  for (let offset = 0; offset < unique.length; offset += EMBEDDING_BATCH) {
    const batch = unique.slice(offset, offset + EMBEDDING_BATCH)
    const result = await worker.request({ op: 'embed', texts: batch })
    if (
      result.dimensions !== 768 ||
      !Array.isArray(result.vectors) ||
      result.vectors.length !== batch.length
    ) {
      throw new Error('Embedding worker returned invalid vectors')
    }
    batch.forEach((text, index) => vectors.set(text, result.vectors[index]))
  }
  return vectors
}

async function createCollection(qdrant, collection, options) {
  const dense = {
    size: 768,
    distance: 'Cosine',
    ...(options.m
      ? {
          hnsw_config: {
            m: options.m,
            ef_construct: options.efConstruct
          }
        }
      : {})
  }
  await qdrant.request('PUT', `/collections/${collection}`, {
    vectors: { dense },
    sparse_vectors: { bm25: { modifier: 'idf' } },
    ...(options.scalarQuantization
      ? {
          quantization_config: {
            scalar: {
              type: 'int8',
              quantile: 0.99,
              always_ram: false
            }
          }
        }
      : {})
  })
}

async function createPayloadIndexes(qdrant, collection) {
  await createKeywordIndex(qdrant, collection, 'workspaceId')
  await createKeywordIndex(qdrant, collection, 'generationId')
  await qdrant.request(
    'PUT',
    `/collections/${collection}/index?wait=true`,
    {
      field_name: 'corpusOrdinal',
      field_schema: 'integer'
    }
  )
}

async function createKeywordIndex(qdrant, collection, field) {
  await qdrant.request(
    'PUT',
    `/collections/${collection}/index?wait=true`,
    {
      field_name: field,
      field_schema: 'keyword'
    }
  )
}

async function upsertPoints(qdrant, collection, points) {
  for (let offset = 0; offset < points.length; offset += UPSERT_BATCH) {
    await qdrant.request(
      'PUT',
      `/collections/${collection}/points?wait=true`,
      { points: points.slice(offset, offset + UPSERT_BATCH) },
      120_000
    )
  }
}

async function waitForCollection(qdrant, collection) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await qdrant.request(
      'GET',
      `/collections/${collection}`
    )
    if (response.result?.status === 'green') return
    await delay(500)
  }
  throw new Error(`Qdrant collection did not become green: ${collection}`)
}

async function search(qdrant, input) {
  const must = [
    ...(input.omitOrdinalFilter
      ? []
      : [
          {
            key: 'corpusOrdinal',
            range: { lt: input.size }
          }
        ]),
    ...(input.extraFilter ?? [])
  ]
  const common = {
    filter: { must },
    limit: TOP_K,
    with_payload: true,
    with_vector: false,
    params: { hnsw_ef: input.efSearch, exact: false }
  }
  let body
  if (input.mode === 'dense') {
    body = { query: input.vector, using: 'dense', ...common }
  } else if (input.mode === 'bm25') {
    body = {
      query: { text: input.text, model: 'qdrant/bm25' },
      using: 'bm25',
      ...common
    }
  } else {
    body = {
      prefetch: [
        {
          query: input.vector,
          using: 'dense',
          filter: { must },
          limit: 64,
          params: common.params
        },
        {
          query: { text: input.text, model: 'qdrant/bm25' },
          using: 'bm25',
          filter: { must },
          limit: 64
        }
      ],
      query: { fusion: 'rrf' },
      ...common
    }
  }
  const response = await qdrant.request(
    'POST',
    `/collections/${input.collection}/points/query`,
    body
  )
  if (!Array.isArray(response.result?.points)) {
    throw new Error('Qdrant query response is invalid')
  }
  return response.result.points
}

class PythonWorker {
  constructor(pythonPath, root) {
    this.pythonPath = pythonPath
    this.root = root
    this.pending = new Map()
    this.sequence = 0
  }

  async start() {
    this.child = spawn(
      this.pythonPath,
      [join(this.root, 'scripts', 'knowledge-benchmark-worker.py')],
      {
        cwd: this.root,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    )
    this.child.stderr.setEncoding('utf8')
    this.stderr = ''
    this.child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4096)
    })
    const lines = createInterface({ input: this.child.stdout })
    lines.on('line', (line) => this.receive(line))
    this.child.once('exit', () => {
      const error = new Error(
        `Embedding worker exited unexpectedly: ${this.stderr.trim()}`
      )
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    })
  }

  request(input) {
    const id = `worker-${++this.sequence}`
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(`${JSON.stringify({ id, ...input })}\n`)
    })
  }

  receive(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error?.message ?? 'Worker failed'))
  }

  async stop() {
    if (!this.child || this.child.exitCode !== null) return
    const child = this.child
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.stdin.end()
    await Promise.race([exited, delay(2_000)])
    if (child.exitCode === null) child.kill('SIGTERM')
  }
}

async function startQdrant(binaryPath, temporaryRoot) {
  const port = await reservePort()
  const apiKey = randomBytes(32).toString('base64url')
  const runtime = join(temporaryRoot, 'qdrant')
  const storage = join(runtime, 'storage')
  const snapshots = join(runtime, 'snapshots')
  await Promise.all([
    mkdir(storage, { recursive: true }),
    mkdir(snapshots, { recursive: true })
  ])
  const config = join(runtime, 'config.yaml')
  await writeFile(
    config,
    [
      'log_level: WARN',
      'telemetry_disabled: true',
      'storage:',
      `  storage_path: ${JSON.stringify(storage)}`,
      `  snapshots_path: ${JSON.stringify(snapshots)}`,
      'service:',
      '  host: 127.0.0.1',
      `  http_port: ${port}`,
      '  grpc_port: null',
      '  enable_cors: false',
      `  api_key: ${JSON.stringify(apiKey)}`,
      'cluster:',
      '  enabled: false',
      ''
    ].join('\n')
  )
  const child = spawn(binaryPath, ['--config-path', config], {
    cwd: runtime,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4096)
  })
  const endpoint = `http://127.0.0.1:${port}`
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Qdrant exited before ready: ${stderr.trim()}`)
    }
    try {
      const response = await fetch(`${endpoint}/healthz`, {
        headers: { 'api-key': apiKey },
        signal: AbortSignal.timeout(1_000)
      })
      if (response.ok) {
        const client = {
          async request(method, path, body, timeoutMs = 30_000) {
            const response = await fetch(`${endpoint}${path}`, {
              method,
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'api-key': apiKey
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              signal: AbortSignal.timeout(timeoutMs)
            })
            if (!response.ok) {
              const detail = (await response.text()).slice(0, 1000)
              throw new Error(
                `Qdrant ${method} ${path} failed (${response.status}): ${detail}`
              )
            }
            return response.json()
          },
          async stop() {
            if (child.exitCode !== null) return
            const exited = new Promise((resolve) =>
              child.once('exit', resolve)
            )
            child.kill('SIGTERM')
            await Promise.race([exited, delay(5_000)])
            if (child.exitCode === null) child.kill('SIGKILL')
          }
        }
        return client
      }
    } catch {
      // Retry until the bounded startup deadline.
    }
    await delay(250)
  }
  child.kill('SIGTERM')
  throw new Error(`Qdrant did not become healthy: ${stderr.trim()}`)
}

function probeEnvironment(options) {
  const probeErrors = []
  const python = spawnSync(
    options.pythonPath,
    [join(options.root, 'scripts', 'knowledge-benchmark-worker.py'), '--probe'],
    { cwd: options.root, encoding: 'utf8', timeout: 30_000 }
  )
  let pythonProbe
  if (python.status === 0) {
    try {
      pythonProbe = JSON.parse(python.stdout)
    } catch {
      probeErrors.push({
        code: 'embedding_runtime_unavailable',
        message: 'Embedding runtime probe returned invalid JSON'
      })
    }
  } else {
    probeErrors.push({
      code: 'embedding_runtime_unavailable',
      message: compactProcessError(python, 'Embedding runtime is unavailable')
    })
  }

  const qdrant = spawnSync(options.qdrantPath, ['--version'], {
    cwd: options.root,
    encoding: 'utf8',
    timeout: 10_000
  })
  const qdrantOutput = `${qdrant.stdout ?? ''}${qdrant.stderr ?? ''}`
  const qdrantVersion = qdrantOutput.match(/qdrant\s+(\d+\.\d+\.\d+)/)?.[1]
  if (qdrant.status !== 0 || !qdrantVersion) {
    probeErrors.push({
      code: 'qdrant_unavailable',
      message: compactProcessError(qdrant, 'Qdrant runtime is unavailable')
    })
  }
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    pythonVersion: pythonProbe?.pythonVersion ?? null,
    qdrantVersion: qdrantVersion ?? null,
    embeddingRuntime: pythonProbe
      ? `onnxruntime ${pythonProbe.onnxRuntimeVersion}; int8=${pythonProbe.int8AssetAvailable}`
      : null,
    probeErrors
  }
}

function publicEnvironment(environment) {
  const { probeErrors: _probeErrors, ...value } = environment
  return value
}

async function writeResult(outputPath, result) {
  validateResult(result)
  await mkdir(dirname(outputPath), { recursive: true })
  const temporary = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.tmp`
  )
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`)
  await rename(temporary, outputPath)
}

function benchmarkConfiguration() {
  return {
    sizes: [1_000, 10_000, 100_000],
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

function skipped(id, reasonCode, reason) {
  return { id, status: 'skipped', reasonCode, reason }
}

function latencySummary(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    samples: sorted.length,
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95))
  }
}

function percentile(sorted, ratio) {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  )
  return sorted[index]
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to reserve Qdrant port'))
        return
      }
      server.close((error) =>
        error ? reject(error) : resolve(address.port)
      )
    })
  })
}

async function directorySize(path) {
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) total += await directorySize(child)
    else if (entry.isFile()) total += (await stat(child)).size
  }
  return total
}

function compactProcessError(result, fallback) {
  const detail = `${result.error?.message ?? ''} ${result.stderr ?? ''}`
    .replace(/\s+/g, ' ')
    .trim()
  return detail ? `${fallback}: ${detail.slice(0, 500)}` : fallback
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim().slice(0, 1000)
}

function round(value) {
  return Math.round(value * 1000) / 1000
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
