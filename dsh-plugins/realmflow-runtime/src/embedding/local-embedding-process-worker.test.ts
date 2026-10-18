import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION
} from '../../../../domain/vector-index-profile'
import { createLocalDshEmbeddingProfile } from './local-embedding-worker'
import { DshLocalEmbeddingProcessWorker } from './local-embedding-process-worker'

describe('DshLocalEmbeddingProcessWorker', () => {
  const workers: DshLocalEmbeddingProcessWorker[] = []

  afterEach(() => {
    for (const worker of workers.splice(0)) worker.dispose()
  })

  it('keeps one stdio worker process behind the DSH embedding contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'realmflow-embedding-worker-'))
    const script = join(root, 'fake-worker.mjs')
    await writeFile(script, fakeWorkerScript())
    const profile = createLocalDshEmbeddingProfile('6'.repeat(64))
    const worker = new DshLocalEmbeddingProcessWorker({
      profile,
      pythonExecutable: process.execPath,
      serviceRoot: root,
      assetRoot: root,
      workerScript: script
    })
    workers.push(worker)

    await expect(worker.health()).resolves.toEqual({
      status: 'ready',
      model: GTE_EMBEDDING_MODEL,
      revision: GTE_EMBEDDING_REVISION,
      dimensions: GTE_EMBEDDING_DIMENSIONS,
      normalize: 'L2',
      runtime: 'onnxruntime-cpu'
    })
    await expect(
      worker.embed({
        profile,
        texts: ['alpha']
      })
    ).resolves.toEqual({
      profile,
      vectors: [[1, ...Array(GTE_EMBEDDING_DIMENSIONS - 1).fill(0)]]
    })
    await expect(
      worker.chunkKnowledgeDocuments({
        documents: [{ documentKey: 'doc.md', content: 'alpha' }]
      })
    ).resolves.toMatchObject({
      chunkerVersion: 'realmflow-token-aware-v1',
      documents: [{ documentKey: 'doc.md' }]
    })
    await rm(root, { recursive: true, force: true })
  })

  it('does not pass host or override credential environment into the worker process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'realmflow-embedding-worker-env-'))
    const script = join(root, 'fake-worker.mjs')
    await writeFile(script, fakeWorkerScript())
    const profile = createLocalDshEmbeddingProfile('6'.repeat(64))
    const previousSecret = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-live-secret'
    const worker = new DshLocalEmbeddingProcessWorker({
      profile,
      pythonExecutable: process.execPath,
      serviceRoot: root,
      assetRoot: root,
      workerScript: script,
      env: {
        ANTHROPIC_API_KEY: 'sk-override-secret'
      }
    })
    workers.push(worker)

    try {
      await expect(worker.health()).resolves.toEqual({
        status: 'ready',
        model: GTE_EMBEDDING_MODEL,
        revision: GTE_EMBEDDING_REVISION,
        dimensions: GTE_EMBEDDING_DIMENSIONS,
        normalize: 'L2',
        runtime: 'onnxruntime-cpu'
      })
    } finally {
      if (previousSecret === undefined) {
        delete process.env.OPENAI_API_KEY
      } else {
        process.env.OPENAI_API_KEY = previousSecret
      }
      await rm(root, { recursive: true, force: true })
    }
  })
})

function fakeWorkerScript(): string {
  return `
import readline from 'node:readline'

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const request = JSON.parse(line)
  const id = request.id
  if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
    process.stdout.write(JSON.stringify({
      id,
      ok: false,
      error: { code: 'secret_env_leak' }
    }) + '\\n')
    return
  }
  if (request.method === 'health') {
    respond(id, {
      status: 'ready',
      model: '${GTE_EMBEDDING_MODEL}',
      revision: '${GTE_EMBEDDING_REVISION}',
      dimensions: ${GTE_EMBEDDING_DIMENSIONS},
      normalize: 'L2',
      runtime: 'onnxruntime-cpu'
    })
    return
  }
  if (request.method === 'embed') {
    respond(id, {
      embeddingModel: '${GTE_EMBEDDING_MODEL}',
      embeddingRevision: '${GTE_EMBEDDING_REVISION}',
      dimensions: ${GTE_EMBEDDING_DIMENSIONS},
      embeddings: [[1, ...Array(${GTE_EMBEDDING_DIMENSIONS - 1}).fill(0)]]
    })
    return
  }
  if (request.method === 'chunk') {
    respond(id, {
      chunkerVersion: 'realmflow-token-aware-v1',
      embeddingModel: '${GTE_EMBEDDING_MODEL}',
      embeddingRevision: '${GTE_EMBEDDING_REVISION}',
      documents: [{ documentKey: 'doc.md', chunks: [] }]
    })
    return
  }
  process.stdout.write(JSON.stringify({
    id,
    ok: false,
    error: { code: 'unknown' }
  }) + '\\n')
})

function respond(id, result) {
  process.stdout.write(JSON.stringify({ id, ok: true, result }) + '\\n')
}
`
}
