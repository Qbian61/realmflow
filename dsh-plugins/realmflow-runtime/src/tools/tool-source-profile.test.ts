import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  REQUIRED_DSH_TOOL_RUNTIME_PACKAGES,
  classifyRealmFlowToolSource
} from './tool-runtime'

describe('DSH tool source profile', () => {
  it('enables the DSH packages selected by the capability source matrix', () => {
    const profile = parse(
      readFileSync(resolve('resources/dsh/profile/cordis.patch.yml'), 'utf8')
        .replaceAll('!!js ', '')
    )
    const rows = collectCordisRows(profile)
    const enabledPackages = new Set(
      rows
        .filter((row) => row.disabled !== true)
        .map((row) => row.name)
        .filter((name): name is string => typeof name === 'string')
    )

    for (const packageName of REQUIRED_DSH_TOOL_RUNTIME_PACKAGES) {
      expect(enabledPackages.has(packageName), packageName).toBe(true)
    }
  })

  it('classifies current RealmFlow tool IDs without shadowing DSH-native tools', () => {
    expect(classifyRealmFlowToolSource('builtin.files.read')).toEqual({
      source: 'dsh-native',
      packageName: '@deepseek-ai/dsh-tool-fs'
    })
    expect(classifyRealmFlowToolSource('builtin.web.fetch')).toEqual({
      source: 'dsh-native',
      packageName: '@deepseek-ai/dsh-tool-web'
    })
    expect(classifyRealmFlowToolSource('builtin.browser.click')).toEqual({
      source: 'dsh-experimental',
      packageName: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
    })
    expect(classifyRealmFlowToolSource('builtin.computer.click')).toEqual({
      source: 'dsh-experimental',
      packageName: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
    })
    expect(classifyRealmFlowToolSource('builtin.files.trash')).toEqual({
      source: 'rf-dsh-plugin',
      packageName: '@realmflow/dsh-platform-files'
    })
    expect(classifyRealmFlowToolSource('builtin.realmflow.requirements.get')).toEqual({
      source: 'rf-dsh-plugin',
      packageName: '@realmflow/dsh-product-tools'
    })
    expect(classifyRealmFlowToolSource('unknown.tool')).toBeUndefined()
  })
})

function collectCordisRows(value: unknown): Array<{
  name?: unknown
  disabled?: unknown
}> {
  if (!Array.isArray(value)) return []
  const rows: Array<{ name?: unknown; disabled?: unknown }> = []
  for (const item of value) {
    if (isRecord(item) && ('name' in item || 'disabled' in item)) {
      rows.push(item)
    }
    if (isRecord(item) && Array.isArray(item.insert)) {
      rows.push(...collectCordisRows(item.insert))
    }
  }
  return rows
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
