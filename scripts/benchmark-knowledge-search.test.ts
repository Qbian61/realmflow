import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateResult } from './knowledge-benchmark-core.mjs'

describe('knowledge benchmark CLI', () => {
  it('writes a valid conservative skipped report when runtime assets cannot run', () => {
    const directory = mkdtempSync(join(tmpdir(), 'realmflow-benchmark-test-'))
    const output = join(directory, 'result.json')

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), 'scripts', 'benchmark-knowledge-search.mjs'),
        '--output',
        output,
        '--python',
        join(directory, 'missing-python'),
        '--probe-only'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8'
      }
    )

    const result = validateResult(JSON.parse(readFileSync(output, 'utf8')))
    expect(result.status).toBe('skipped')
    expect(result.scenarios).toHaveLength(10)
    expect(result.scenarios.every(({ status }) => status === 'skipped')).toBe(
      true
    )
    expect(result.decisions).toMatchObject({
      embeddingPrecision: 'float32',
      scalarQuantization: 'disabled'
    })
    expect(JSON.stringify(result)).not.toContain('"recallAt8"')
    expect(JSON.stringify(result)).not.toContain('"mrrAt8"')
  })
})
