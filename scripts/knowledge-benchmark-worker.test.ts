import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const python = join(root, 'python-service', '.venv', 'bin', 'python')
const worker = join(root, 'scripts', 'knowledge-benchmark-worker.py')

describe('knowledge benchmark worker', () => {
  it('reports the pinned local embedding runtime without loading the model', () => {
    const output = execFileSync(python, [worker, '--probe'], {
      cwd: root,
      encoding: 'utf8'
    })
    const result = JSON.parse(output)

    expect(result).toMatchObject({
      status: 'ready',
      model: 'Alibaba-NLP/gte-multilingual-base',
      revision: '9bbca17d9273fd0d03d5725c7a4b0f6b45142062',
      dimensions: 768,
      precision: 'float32'
    })
    expect(result.pythonVersion).toMatch(/^3\./)
    expect(result.onnxRuntimeVersion).toMatch(/^\d+\./)
    expect(result.int8AssetAvailable).toBe(false)
  })

  it('returns deterministic overlapping fixed-character chunks over JSONL', () => {
    const child = spawnSync(python, [worker], {
      cwd: root,
      encoding: 'utf8',
      input: `${JSON.stringify({
        id: 'request-1',
        op: 'chunk',
        strategy: 'fixed',
        documents: [
          {
            documentKey: 'example.txt',
            content: 'abcdefghij'
          }
        ],
        fixedCharacters: 6,
        overlapCharacters: 2
      })}\n`
    })

    expect(child.status).toBe(0)
    expect(JSON.parse(child.stdout.trim())).toEqual({
      id: 'request-1',
      ok: true,
      result: {
        strategy: 'fixed-characters',
        documents: [
          {
            documentKey: 'example.txt',
            chunks: [
              {
                ordinal: 0,
                content: 'abcdef',
                startOffset: 0,
                endOffset: 6
              },
              {
                ordinal: 1,
                content: 'efghij',
                startOffset: 4,
                endOffset: 10
              }
            ]
          }
        ]
      }
    })
  })
})
