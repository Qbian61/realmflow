import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let fixtureDirectory

beforeEach(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'realmflow-model-audit-'))
  await writeFile(
    join(fixtureDirectory, 'catalog.json'),
    JSON.stringify([
      {
        id: 'huggingface',
        models: [
          {
            id: 'org/hf-model',
            contextWindow: 128000,
            maxOutputTokens: 32000,
            inputTypes: ['text', 'image']
          }
        ]
      },
      {
        id: 'openrouter',
        models: [
          {
            id: 'org/router-model',
            contextWindow: 256000,
            maxOutputTokens: 64000,
            inputTypes: ['text']
          }
        ]
      },
      {
        id: 'nvidia',
        models: [
          {
            id: 'org/nvidia-model',
            contextWindow: 128000,
            maxOutputTokens: 32000,
            inputTypes: ['text']
          }
        ]
      }
    ])
  )
  await writeFile(
    join(fixtureDirectory, 'huggingface.json'),
    JSON.stringify([
      {
        id: 'org/hf-model',
        architecture: { input_modalities: ['image', 'text'] },
        providers: [{ status: 'live', context_length: 128000 }]
      }
    ])
  )
  await writeFile(
    join(fixtureDirectory, 'openrouter.json'),
    JSON.stringify({
      data: [
        {
          id: 'org/router-model',
          context_length: 256000,
          architecture: { input_modalities: ['text'] },
          top_provider: { max_completion_tokens: 64000 }
        }
      ]
    })
  )
  await writeFile(
    join(fixtureDirectory, 'nvidia.json'),
    JSON.stringify({ data: [{ id: 'org/nvidia-model' }] })
  )
})

afterEach(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true })
})

function runAudit() {
  return spawnSync(
    process.execPath,
    [
      'scripts/audit-model-provider-catalog.mjs',
      '--catalog',
      join(fixtureDirectory, 'catalog.json'),
      '--official-dir',
      fixtureDirectory
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  )
}

describe('model provider catalog official API audit', () => {
  it('accepts IDs and capability metadata aligned with public APIs', () => {
    const result = runAudit()

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('3 models verified')
  })

  it('rejects missing models and metadata drift', async () => {
    await writeFile(
      join(fixtureDirectory, 'openrouter.json'),
      JSON.stringify({
        data: [
          {
            id: 'org/router-model',
            context_length: 128000,
            architecture: { input_modalities: ['text', 'image'] },
            top_provider: { max_completion_tokens: 16000 }
          }
        ]
      })
    )
    await writeFile(
      join(fixtureDirectory, 'nvidia.json'),
      JSON.stringify({ data: [] })
    )

    const result = runAudit()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'openrouter/org/router-model: contextWindow expected 128000, catalog has 256000'
    )
    expect(result.stderr).toContain(
      'openrouter/org/router-model: inputTypes expected image,text, catalog has text'
    )
    expect(result.stderr).toContain(
      'openrouter/org/router-model: maxOutputTokens expected 16000, catalog has 64000'
    )
    expect(result.stderr).toContain(
      'nvidia/org/nvidia-model: model is not exposed by the official API'
    )
  })
})
