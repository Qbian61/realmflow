import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION
} from '../../../../domain/vector-index-profile'
import {
  DshLocalEmbeddingWorker,
  chunkKnowledgeDocumentsWithTokenizer,
  clsPoolAndNormalize,
  createLocalDshEmbeddingProfile,
  verifyLocalEmbeddingModelAssets,
  type DshLocalEmbeddingBackend
} from './local-embedding-worker'

describe('DshLocalEmbeddingWorker', () => {
  it('validates the pinned offline model asset manifest before loading a backend', async () => {
    const assetRoot = await writeModelAssets()

    await expect(
      verifyLocalEmbeddingModelAssets(assetRoot)
    ).resolves.toMatchObject({
      model: GTE_EMBEDDING_MODEL,
      revision: GTE_EMBEDDING_REVISION,
      dimensions: GTE_EMBEDDING_DIMENSIONS,
      runtime: 'onnxruntime-cpu'
    })

    await writeFile(join(assetRoot, 'model.onnx'), 'tampered')

    await expect(
      verifyLocalEmbeddingModelAssets(assetRoot)
    ).rejects.toThrow(/model assets are invalid/i)
  })

  it('keeps one backend warm, reports health, enforces token limits, and returns L2-normalized vectors', async () => {
    const assetRoot = await writeModelAssets()
    const profile = createLocalDshEmbeddingProfile('6'.repeat(64))
    const backend = new FakeEmbeddingBackend()
    const load = vi.fn(async () => backend)
    const worker = new DshLocalEmbeddingWorker({
      assetRoot,
      profile,
      backendFactory: { load }
    })

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
        texts: ['checkout retry', 'release notes']
      })
    ).resolves.toMatchObject({
      profile,
      vectors: [
        expect.arrayContaining([1 / Math.sqrt(GTE_EMBEDDING_DIMENSIONS)]),
        expect.arrayContaining([2 / Math.sqrt(4 * GTE_EMBEDDING_DIMENSIONS)])
      ]
    })

    expect(load).toHaveBeenCalledTimes(1)
    expect(backend.inferCalls).toEqual([['checkout retry', 'release notes']])

    const oversized = Array.from(
      { length: 17 },
      (_value, index) => `oversized-${index}`
    )
    backend.tokenCounts = new Map(oversized.map((text) => [text, 512]))
    await expect(
      worker.embed({ profile, texts: oversized })
    ).rejects.toThrow(/request limit exceeded/i)
    expect(backend.inferCalls).toHaveLength(1)
  })

  it('uses tokenizer offsets for chunk limits, overlaps, UTF-16 offsets, and sensitive path rejection', async () => {
    const tokenizer = new FakeEmbeddingBackend()
    const content = 'A😀B\r\n' + tokens('body', 1_100)

    const result = await chunkKnowledgeDocumentsWithTokenizer(
      [{ documentKey: 'notes.md', content }],
      tokenizer
    )

    const chunks = result.documents[0]!.chunks
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks[0]).toMatchObject({
      ordinal: 0,
      startOffset: 0,
      startLine: 1
    })
    expect(chunks.at(-1)).toMatchObject({
      endOffset: content.length
    })
    expect(chunks.every((chunk) => chunk.tokenCount <= 512)).toBe(true)
    for (const [previous, current] of chunks
      .slice(0, -1)
      .map((chunk, index) => [chunk, chunks[index + 1]!] as const)) {
      const overlap = content.slice(
        current.startOffset,
        previous.endOffset
      )
      expect(tokenizer.countTokens(overlap)).toBeLessThanOrEqual(64)
    }

    await expect(
      chunkKnowledgeDocumentsWithTokenizer(
        [{ documentKey: '.env.production', content: 'secret=1' }],
        tokenizer
      )
    ).rejects.toThrow(/path is sensitive/i)
  })

  it('performs CLS pooling and L2 normalization over ONNX-shaped outputs', () => {
    const vectors = clsPoolAndNormalize(
      [
        [
          [1, 3, ...Array(GTE_EMBEDDING_DIMENSIONS - 2).fill(0)],
          Array(GTE_EMBEDDING_DIMENSIONS).fill(Number.NaN)
        ]
      ],
      [[1, 1]]
    )

    expect(vectors).toHaveLength(1)
    expect(vectors[0]).toHaveLength(GTE_EMBEDDING_DIMENSIONS)
    expect(vectors[0]![0]).toBeCloseTo(1 / Math.sqrt(10))
    expect(vectors[0]![1]).toBeCloseTo(3 / Math.sqrt(10))
    expect(
      Math.sqrt(vectors[0]!.reduce((sum, value) => sum + value * value, 0))
    ).toBeCloseTo(1)
    expect(() =>
      clsPoolAndNormalize(
        [[[Number.POSITIVE_INFINITY, ...Array(767).fill(0)]]],
        [[1]]
      )
    ).toThrow(/output is invalid/i)
  })
})

class FakeEmbeddingBackend implements DshLocalEmbeddingBackend {
  tokenCounts = new Map<string, number>()
  inferCalls: string[][] = []

  countTokens(text: string): number {
    return this.tokenCounts.get(text) ?? this.tokenOffsets(text).length + 2
  }

  tokenizeWithOffsets(text: string): {
    tokenCount: number
    offsets: Array<[number, number]>
  } {
    const offsets = this.tokenOffsets(text)
    return {
      tokenCount: offsets.length > 0 ? offsets.length + 2 : 0,
      offsets
    }
  }

  tokenOffsets(text: string): Array<[number, number]> {
    return [...text.matchAll(/\S+/g)].map((match) => [
      match.index,
      match.index + match[0].length
    ])
  }

  async infer(texts: string[]): Promise<{
    hiddenStates: number[][][]
    attentionMasks: number[][]
  }> {
    this.inferCalls.push([...texts])
    return {
      hiddenStates: texts.map((_text, index) => [
        Array(GTE_EMBEDDING_DIMENSIONS).fill(index + 1),
        Array(GTE_EMBEDDING_DIMENSIONS).fill(999)
      ]),
      attentionMasks: texts.map(() => [1, 1])
    }
  }
}

async function writeModelAssets(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'realmflow-gte-assets-'))
  const files = {
    'model.onnx': 'offline-onnx-model',
    'tokenizer.json': '{"version":"1.0"}',
    'tokenizer_config.json': '{"model_max_length":512}',
    'special_tokens_map.json': '{"cls_token":"<s>"}',
    'config.json': '{"hidden_size":768}',
    'pooling.json': '{"pooling_mode_cls_token":true}',
    'configuration.py': 'class NewConfig: pass\n',
    'modeling.py': 'class NewModel: pass\n',
    LICENSE: 'Apache License 2.0\n'
  }
  const manifestFiles = []
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(join(root, relativePath), content)
    manifestFiles.push({
      path: relativePath,
      size: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex')
    })
  }
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      model: GTE_EMBEDDING_MODEL,
      revision: GTE_EMBEDDING_REVISION,
      dimensions: GTE_EMBEDDING_DIMENSIONS,
      runtime: 'onnxruntime-cpu',
      files: manifestFiles
    })
  )
  return root
}

function tokens(prefix: string, count: number): string {
  return Array.from({ length: count }, (_value, index) => `${prefix}-${index}`)
    .join(' ')
}
