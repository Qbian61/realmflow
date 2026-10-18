import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const profileRoot = resolve('resources/dsh/profile')
const packagePath = resolve(profileRoot, 'package.json')
const patchPath = resolve(profileRoot, 'cordis.patch.yml')
const dshJsTag = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value: string) => value
}

describe('RealmFlow DSH profile contract', () => {
  it('ships an immutable RealmFlow ACP profile package', () => {
    expect(existsSync(packagePath)).toBe(true)

    const packageJson = profilePackage()

    expect(packageJson).toMatchObject({
      name: '@realmflow/dsh-profile',
      private: true,
      type: 'module'
    })
    expect(packageJson.dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-acp-app'
    ])
    expect(packageJson.realmflow?.dshProfile).toEqual({
      immutable: true,
      stdout: 'acp',
      manifestRequired: true
    })
    expect(packageJson.scripts ?? {}).toEqual({})
  })

  it('does not mount RealmFlow control-plane plugins until they are packaged as resolvable DSH plugins', () => {
    const profileText = readFileSync(patchPath, 'utf8')

    expect(profileText).not.toMatch(/@realmflow\/dsh-(?!profile)/)
    expect(profileText).not.toContain('realmflow-model-gateway')
  })

  it('keeps core DSH execution runtimes enabled under manifest control', () => {
    const rows = profileRows()
    const requiredRuntimeRows = [
      'acp',
      'agent-loop',
      'session-persistence-jsonl',
      'goal',
      'goal-round-driver',
      'compaction-basic',
      'tools',
      'skill',
      'tool-skill',
      'subagent',
      'tool-subagent',
      'mcp-resources'
    ]

    for (const id of requiredRuntimeRows) {
      expect(rows.get(id)?.disabled, `${id} must stay enabled`).not.toBe(true)
    }
    expect(rows.get('acp')?.config).toMatchObject({
      provider: 'process.env.REALMFLOW_DSH_PROVIDER_ID',
      model: 'process.env.REALMFLOW_DSH_MODEL_ID'
    })
    expect(rows.get('agent-default-model')?.config).toMatchObject({
      provider: 'process.env.REALMFLOW_DSH_PROVIDER_ID',
      model: 'process.env.REALMFLOW_DSH_MODEL_ID'
    })
    expect(rows.get('llm-pi-ai')).toMatchObject({
      disabled: false,
      config: {
        providers:
          "JSON.parse(process.env.REALMFLOW_DSH_PI_AI_PROVIDERS ?? '{}')"
      }
    })
    expect(rows.get('subagent')?.config).toMatchObject({
      maxActiveSubagents: 4
    })
  })

  it('disables DSH-owned UI, mutation and telemetry surfaces while keeping local credentials available', () => {
    const rows = profileRows()
    const disabledRows = [
      'hmr',
      'plugin-manager',
      'tool-plugin-manager',
      'config-editor',
      'settings',
      'authorization',
      'deepseek-account',
      'llm-deepseek-account',
      'session-log-deepseek',
      'session-telemetry-otel',
      'otel'
    ]

    for (const id of disabledRows) {
      expect(rows.get(id), `${id} is missing`).toBeDefined()
      expect(rows.get(id)?.disabled, `${id} must be disabled`).toBe(true)
    }
    expect(rows.get('credentials')?.disabled, 'credentials must stay enabled').not.toBe(true)
    expect(rows.get('llm-deepseek')?.disabled, 'llm-deepseek must stay enabled').not.toBe(true)
    expect(rows.get('llm-pi-ai')?.disabled, 'llm-pi-ai must stay enabled').not.toBe(true)
  })

  it('does not expose network or workflow tools without manifest authorization', () => {
    const rows = profileRows()
    const disabledRows = [
      'web',
      'web-search-deepseek',
      'web-fetch-http',
      'tool-web',
      'workflow-ptc',
      'tool-workflow'
    ]

    for (const id of disabledRows) {
      expect(rows.get(id), `${id} is missing`).toBeDefined()
      expect(rows.get(id)?.disabled, `${id} must be disabled`).toBe(true)
    }
  })

  it('fails the contract when profile text grants direct RealmFlow private data access', () => {
    const profileText = readFileSync(patchPath, 'utf8')

    expect(profileText).not.toMatch(/sqlite|better-sqlite3|credential-vault|CredentialVault/i)
    expect(profileText).not.toMatch(/process\.env\.(?:DEEPSEEK|OPENAI|ANTHROPIC|.*(?:KEY|TOKEN|SECRET))/)
    expect(profileText).toContain('REALMFLOW_DSH_SESSION_ROOT')
  })
})

function profilePackage() {
  return JSON.parse(readFileSync(packagePath, 'utf8'))
}

function profileRows() {
  expect(existsSync(patchPath)).toBe(true)
  const patch = parse(readFileSync(patchPath, 'utf8'), {
    customTags: [dshJsTag]
  })
  const rows = new Map<string, Record<string, unknown>>()
  for (const item of patch) {
    if (Array.isArray(item?.insert)) {
      for (const row of item.insert) rows.set(row.id, row)
    } else if (typeof item?.id === 'string') {
      rows.set(item.id, item)
    }
  }
  return rows
}
