import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import { planBuiltinToolEffects } from './tool-effect-planner'
import { projectModelFacingToolCatalog, resolveModelFacingFacadeInvocation } from './tool-model-facing-projection'
import { ToolPolicyEngine } from './tool-policy-engine'
import { authorizeToolEffects } from '../../../../domain/tool-authorization'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'

async function catalog(): Promise<ToolCatalogState> {
  const packages = await new BuiltinCatalogLoader(join(process.cwd(), 'resources/extensions/builtin')).load()
  return {
    packages: [], skills: [],
    tools: packages.flatMap((p) => p.tools).map((definition) => ({
      kind: 'tool', id: definition.id, version: definition.version,
      definitionDigest: definition.definitionDigest, definition,
      enabledPreference: true, status: 'enabled', dependencyIssues: [], revision: 1, updatedAt: 1
    }))
  }
}

describe('browser tool contract', () => {
  it('publishes fourteen strict primitives, scoped artifacts and explicit risky operations', async () => {
    const tools = (await catalog()).tools.filter((t) => t.id.startsWith('builtin.browser.'))
    expect(tools).toHaveLength(14)
    const ajv = new Ajv({ strict: false })
    for (const tool of tools) {
      const validate = ajv.compile(tool.definition.inputSchema)
      expect(validate({ ownerKey: 'forged' })).toBe(false)
      expect(tool.definition.resources.maxAttempts).toBe(1)
      expect(tool.definition.invocation.idempotency).toBe('required')
    }
    const screenshot = tools.find((t) => t.id.endsWith('.screenshot'))!
    const valid = ajv.compile(screenshot.definition.inputSchema)
    expect(valid({ sessionId: 'browser-one', path: 'result.png', expectedAbsent: true })).toBe(true)
    expect(valid({ sessionId: 'browser-one', path: 'result.png' })).toBe(false)
    expect(screenshot.definition.capabilities).toEqual(expect.arrayContaining(['filesystem.write', 'computer.observe']))
    for (const action of ['attach', 'evaluate']) {
      expect(tools.find((t) => t.id.endsWith(`.${action}`))?.definition).toMatchObject({
        risk: 'high', discovery: { requiresExplicitSelection: true }
      })
    }
  })

  it('routes normal facade operations to primitives and leaves attach/evaluate independent', async () => {
    const source = await catalog()
    const projected = projectModelFacingToolCatalog(source, 'facade')
    const facade = projected.tools.find((t) => t.id === 'browser')
    expect(facade).toBeDefined()
    const reference = { kind: 'tool' as const, id: 'browser', version: facade!.version, digest: facade!.definitionDigest }
    expect(resolveModelFacingFacadeInvocation(source, reference, {
      action: 'navigate', arguments: { sessionId: 'browser-one', url: 'https://example.com' }
    })?.primitiveDefinition.id).toBe('builtin.browser.navigate')
    expect(() => resolveModelFacingFacadeInvocation(source, reference, { action: 'attach', arguments: {} })).toThrow()
    for (const action of ['attach', 'evaluate']) {
      expect(projected.tools.find((t) => t.id === `builtin.browser.${action}`)?.modelFacing?.visibility).toBe('direct')
    }
    const policy = new ToolPolicyEngine().resolve(source.tools.map((t) => t.definition), { layers: [{ allow: ['group:web'] }] })
    expect(policy.grants.some((g) => g.id === 'builtin.browser.navigate')).toBe(true)
    expect(policy.decisions.find((d) => d.id === 'builtin.browser.attach')?.reason).toBe('explicit_grant_required')
  })

  it('requests approval for the exact login profile and independent evaluation permission', async () => {
    const plan = await planBuiltinToolEffects({
      handlerName: 'browser.attach', capabilities: ['computer.control', 'credential.use'],
      arguments: { profileId: 'browser-owned' }, scopeRoots: []
    })
    expect(plan).toMatchObject({
      outcome: 'planned', effects: expect.arrayContaining([
        { kind: 'external', capability: 'credential.use', resourceKey: 'browser-profile:browser-owned' }
      ])
    })
    if (plan.outcome !== 'planned') throw new Error('missing effects')
    expect(authorizeToolEffects({
      effects: plan.effects, risk: 'high', context: { workspaceId: 'one' },
      appSessionId: 'app', boundScopes: [], explicitGrants: []
    })).toMatchObject({ outcome: 'ask', requests: expect.arrayContaining([
      expect.objectContaining({ capability: 'credential.use', resource: { kind: 'network', service: 'browser-profile:browser-owned' } })
    ]) })
    const evaluate = await planBuiltinToolEffects({
      handlerName: 'browser.evaluate', capabilities: ['computer.control'],
      arguments: { sessionId: 'browser-one', expression: 'snapshot.text' }, scopeRoots: []
    })
    expect(evaluate).toMatchObject({
      outcome: 'planned', effects: [
        { kind: 'computer.control', application: { bundleId: 'realmflow.browser.evaluate', displayName: 'Browser snapshot evaluation' } }
      ]
    })
  })

  it('plans artifact bytes and provenance writes, upload reads, and sanitized origins', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'browser-effects-'))
    try {
      const root = await realpath(directory)
      await writeFile(join(root, 'input.txt'), 'input')
      const download = await planBuiltinToolEffects({
        handlerName: 'browser.download', capabilities: ['filesystem.write', 'network.connect', 'computer.observe'],
        arguments: { sessionId: 'browser-one', path: 'result.txt', expectedAbsent: true, url: 'https://example.com/file?token=secret' },
        scopeRoots: [root]
      })
      expect(download).toMatchObject({ outcome: 'planned', effects: expect.arrayContaining([
        { kind: 'filesystem.write', path: join(root, 'result.txt') },
        { kind: 'filesystem.write', path: join(root, 'result.txt.realmflow-browser.json') },
        { kind: 'external', capability: 'network.connect', resourceKey: 'https://example.com' }
      ]) })
      const upload = await planBuiltinToolEffects({
        handlerName: 'browser.upload', capabilities: ['filesystem.read', 'computer.control'],
        arguments: { sessionId: 'browser-one', ref: 'n1', path: 'input.txt' }, scopeRoots: [root]
      })
      expect(upload).toMatchObject({ outcome: 'planned', effects: expect.arrayContaining([
        { kind: 'filesystem.read', path: join(root, 'input.txt') }
      ]) })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
