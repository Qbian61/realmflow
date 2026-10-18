import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PrivatePythonWorkerClient,
  createPrivatePythonWorkerRunner
} from './private-python-worker-client'

describe('PrivatePythonWorkerClient', () => {
  it('routes spreadsheet compute through a bounded worker operation', async () => {
    const runOperation = vi.fn(async () => ({
      documentBase64: 'c3ByZWFkc2hlZXQ=',
      result: { sheets: [] },
      modified: false,
      requiresRecalculation: false
    }))
    const client = new PrivatePythonWorkerClient({ runOperation })
    const signal = new AbortController().signal

    const result = await client.computeSpreadsheet(
      {
        format: 'xlsx',
        operation: 'extract_text',
        documentBase64: 'c3ByZWFkc2hlZXQ=',
        parameters: {}
      },
      signal
    )

    expect(runOperation).toHaveBeenCalledWith(
      'office.spreadsheet.compute',
      {
        format: 'xlsx',
        operation: 'extract_text',
        documentBase64: 'c3ByZWFkc2hlZXQ=',
        parameters: {}
      },
      signal,
      30_000
    )
    expect(result).toEqual({
      documentBase64: 'c3ByZWFkc2hlZXQ=',
      result: { sheets: [] },
      modified: false,
      requiresRecalculation: false
    })
  })

  it('does not expose a long-running service lifecycle', () => {
    const client = new PrivatePythonWorkerClient({
      runOperation: async () => ({ formats: {} })
    })

    expect('start' in client).toBe(false)
    expect('stop' in client).toBe(false)
    expect('getHealth' in client).toBe(false)
  })

  it('does not pass host or override credential environment into bounded workers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'realmflow-private-worker-env-'))
    const workerScript = join(root, 'worker.mjs')
    await writeFile(workerScript, envInspectingWorkerScript(root))
    const previousSecret = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-live-secret'
    const runner = createPrivatePythonWorkerRunner({
      pythonExecutable: process.execPath,
      workerScript,
      workerRoot: root,
      env: {
        ANTHROPIC_API_KEY: 'sk-override-secret'
      }
    })

    try {
      await expect(
        runner(
          'env.inspect',
          {},
          new AbortController().signal,
          1_000
        )
      ).resolves.toMatchObject({
        pythonUnbuffered: '1',
        pythonPathIncludesRoot: true
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

function envInspectingWorkerScript(root: string): string {
  return `
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: { message: 'secret env leaked' }
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    result: {
      pythonUnbuffered: process.env.PYTHONUNBUFFERED,
      pythonPathIncludesRoot: (process.env.PYTHONPATH || '').includes(${JSON.stringify(root)})
    }
  }) + '\\n')
})
`
}
