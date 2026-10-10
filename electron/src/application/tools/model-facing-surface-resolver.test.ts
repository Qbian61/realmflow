import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import { ModelFacingSurfaceResolver } from './model-facing-surface-resolver'
import { projectModelFacingToolCatalog } from './tool-model-facing-projection'

const read = tool('builtin.files.read')
const write = tool('builtin.files.write', { capabilities: ['filesystem.write'] })
const web = tool('builtin.web.fetch', { capabilities: ['network.connect'] })
const remove = tool('builtin.files.delete_permanently', {
  capabilities: ['filesystem.delete'], risk: 'critical',
})
const resolver = new ModelFacingSurfaceResolver()

function tool(id: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    schemaVersion: 1, id, version: '1.0.0', definitionDigest: 'a'.repeat(64),
    package: { packageId: 'test.tools', packageVersion: '1.0.0', packageDigest: 'b'.repeat(64) },
    origin: 'builtin', name: id, description: id, tags: [],
    executor: { kind: 'builtin', handler: id.replace('builtin.', ''), handlerVersion: '1.0.0' },
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
    capabilities: ['filesystem.read'], effects: ['local_data.read'], risk: 'low',
    invocation: { mode: 'unary', idempotency: 'supported', cancellable: true, resumable: false },
    resources: { timeoutMs: 1000, maxOutputBytes: 1024, maxAttempts: 1 },
    discovery: { intents: [], contexts: ['general'] },
    ...overrides,
  }
}

function input(policy: Record<string, unknown> = {}, tools = [read, write, web]) {
  const catalog: ToolCatalogState = {
    packages: [], skills: [],
    tools: tools.map((definition) => ({
      kind: 'tool', id: definition.id, version: definition.version,
      definitionDigest: definition.definitionDigest, definition,
      enabledPreference: true, status: 'enabled', dependencyIssues: [],
      revision: 1, updatedAt: 0,
    })),
  }
  return { catalog, tools, requiredTools: [] as ToolDefinition[], skills: [], policy }
}

function ids(value: ReturnType<typeof resolver.resolve>) {
  return value.definitions.map(({ id }) => id)
}

describe('model-facing run policy', () => {
  function autoInput(tools: ToolDefinition[], policy: Record<string, unknown> = {}) {
    const raw = input(policy, tools)
    const facade = projectModelFacingToolCatalog(raw.catalog, 'facade')
    const directory = projectModelFacingToolCatalog(raw.catalog, 'directory')
    const catalog = { ...facade, tools: [...facade.tools, ...directory.tools.filter(
      ({ definition }) => definition.package.packageId === 'realmflow.model_facing_directory',
    )] }
    return { ...raw, catalog, tools: catalog.tools.map(({ definition }) => definition), mode: 'auto' as const }
  }

  it('uses facades for small local catalogs and hides unused directory controls', () => {
    const result = resolver.resolve(autoInput([read]))
    expect(result).toMatchObject({ mode: 'facade' })
    expect(ids(result)).toContain('filesystem_read')
    expect(ids(result)).not.toContain('tool_search')
  })

  it('defers a large authorized catalog and preserves required direct tools', () => {
    const tools = Array.from({ length: 40 }, (_, index) => tool(`builtin.test.${index}`))
    const result = resolver.resolve({ ...autoInput(tools), requiredTools: [tools[0]] })
    expect(result).toMatchObject({
      mode: 'directory',
      directory: { totalEntries: 39, renderedByteLength: expect.any(Number) },
    })
    expect(ids(result)).toContain('tool_search')
    expect(ids(result)).toContain(tools[0].id)
    expect(ids(result)).not.toContain(tools[1].id)
    expect(result.directory?.renderedPromptDirectory).toContain(tools[1].id)
  })

  it('switches to directory for a large schema or an authorized external tool', () => {
    const external = tool('plugin.read', { origin: 'local_upload' })
    expect(resolver.resolve(autoInput([external]))).toMatchObject({ mode: 'directory' })
    const large = tool('builtin.large', { inputSchema: {
      type: 'object', description: 'x'.repeat(33 * 1024),
    } })
    expect(resolver.resolve(autoInput([large]))).toMatchObject({ mode: 'directory' })
  })

  it('does not let denied external tools force directory mode', () => {
    const external = tool('plugin.read', { origin: 'local_upload' })
    expect(resolver.resolve(autoInput([read, external], {
      layers: [{ deny: [external.id] }],
    }))).toMatchObject({ mode: 'facade' })
  })

  it('includes authorized tools supplied by an external registry in deferred discovery', () => {
    const external = tool('plugin.registry', { origin: 'local_upload' })
    const value = autoInput([read])
    const result = resolver.resolve({ ...value, tools: [...value.tools, external] })
    expect(result).toMatchObject({ mode: 'directory' })
    expect(result.directory?.renderedPromptDirectory).toContain(external.id)
    expect(ids(result)).not.toContain(external.id)
  })

  it('never renders a different version from the exact authorized definition', () => {
    const older = { ...read, version: '0.9.0', definitionDigest: '0'.repeat(64) }
    const value = autoInput([read, older])
    const result = resolver.resolve({
      ...value, mode: 'directory', tools: value.tools.filter((tool) => tool.version !== '0.9.0'),
    })
    expect(result.directory?.totalEntries).toBe(1)
  })

  it('uses facade mode when an automatic directory would have no authorized transport controls', () => {
    const tools = Array.from({ length: 40 }, (_, index) => tool(`builtin.test.${index}`))
    const result = resolver.resolve(autoInput(tools, {
      layers: [{ deny: ['tool_call'] }],
    }))
    expect(result).toMatchObject({ mode: 'facade' })
    expect(ids(result)).toContain(tools[0].id)
  })

  it('rejects an explicit unusable directory mode before provider registration', () => {
    expect(() => resolver.resolve({
      ...autoInput([read], { layers: [{ deny: ['tool_call'] }] }), mode: 'directory',
    })).toThrow('Directory controls are denied by tool policy')
  })

  it('renders a stable bounded UTF-8 directory while retaining the full searchable count', () => {
    const tools = Array.from({ length: 200 }, (_, index) => tool(`builtin.test.${index}`, {
      description: '中文说明'.repeat(1000),
      inputSchema: { type: 'object', required: ['path'], properties: {
        path: { type: 'string', description: 'UNTRUSTED_INSTRUCTION', default: 'PRIVATE_DEFAULT' },
      } },
    }))
    const a = resolver.resolve(autoInput(tools)).directory
    const b = resolver.resolve(autoInput([...tools].reverse())).directory
    expect(a).toEqual(b)
    expect(a).toMatchObject({ totalEntries: 200, truncated: true })
    expect(a!.entries.length).toBeLessThanOrEqual(64)
    expect(a!.renderedByteLength).toBeLessThanOrEqual(12 * 1024)
    expect(Buffer.byteLength(a!.renderedPromptDirectory)).toBe(a!.renderedByteLength)
    expect(a!.renderedPromptDirectory).toContain('path!:string')
    expect(a!.renderedPromptDirectory).not.toContain('UNTRUSTED_INSTRUCTION')
    expect(a!.renderedPromptDirectory).not.toContain('PRIVATE_DEFAULT')
  })

  it('honors an explicit presentation mode without reopening denied tools', () => {
    const large = Array.from({ length: 40 }, (_, index) => tool(`builtin.test.${index}`))
    const result = resolver.resolve({
      ...autoInput(large, { layers: [{ deny: [large[0].id] }] }), mode: 'direct',
    })
    expect(result).toMatchObject({ mode: 'direct' })
    expect(ids(result)).toContain(large[1].id)
    expect(ids(result)).not.toContain(large[0].id)
    expect(ids(result)).not.toContain('tool_search')
  })

  it('includes document creation in the office group', () => {
    const create = tool('builtin.document.create')
    expect(ids(resolver.resolve(input({
      layers: [{ allow: ['group:office'] }],
    }, [create])))).toEqual([create.id])
  })

  it('applies media group policy before provider tool registration', () => {
    const media = tool('image_generate', {
      origin: 'local_upload',
      tags: ['media'],
      capabilities: [
        'credential.use',
        'filesystem.write',
        'network.connect',
      ],
    })
    expect(ids(resolver.resolve(input({
      layers: [{ allow: ['group:media'] }],
    }, [media, read])))).toEqual([media.id])
    expect(ids(resolver.resolve(input({
      layers: [{ deny: ['group:media'] }],
    }, [media, read])))).toEqual([read.id])
  })

  it('canonicalizes sandbox key order and records the inherited environment for recovery', () => {
    const grants = [{ kind: 'tool' as const, id: read.id, version: read.version, digest: read.definitionDigest }]
    const a = resolver.resolve(input({
      sandbox: { available: true, networkAllowed: false }, inheritedGrants: grants,
    })).policy
    const b = resolver.resolve(input({
      sandbox: { networkAllowed: false, available: true }, inheritedGrants: grants,
    })).policy
    expect(a?.digest).toBe(b?.digest)
    expect(a).toMatchObject({
      sandbox: { available: true, networkAllowed: false }, inheritedGrants: grants,
    })
  })

  it('denies a tool even when the same layer explicitly allows it', () => {
    const result = resolver.resolve(input({
      layers: [{ allow: ['group:fs'], deny: [write.id], alsoAllow: [write.id] }],
    }))
    expect(ids(result)).toEqual([read.id])
    expect(result).toMatchObject({
      policy: { decisions: expect.arrayContaining([
        expect.objectContaining({ id: write.id, allowed: false, reason: 'explicit_deny' }),
      ]) },
    })
  })

  it('treats an empty explicit allowlist as a closed ceiling', () => {
    expect(ids(resolver.resolve(input({
      layers: [{ allow: [], alsoAllow: [read.id] }],
    })))).toEqual([])
  })

  it('intersects user and workspace ceilings without reopening denied grants', () => {
    expect(ids(resolver.resolve(input({
      layers: [{ allow: [read.id] }, { profile: 'full', alsoAllow: [write.id] }],
    })))).toEqual([read.id])
  })

  it('restricts the minimal profile to safe runtime controls', () => {
    const ask = tool('ask_user', { capabilities: [] })
    expect(ids(resolver.resolve(input({
      layers: [{ profile: 'minimal' }],
    }, [read, ask])))).toEqual(['ask_user'])
  })

  it('alsoAllow expands a profile only within its own layer', () => {
    expect(ids(resolver.resolve(input({
      layers: [{ profile: 'minimal', alsoAllow: [read.id] }],
    })))).toEqual([read.id])
  })

  it('applies provider-specific restrictions before function registration', () => {
    expect(ids(resolver.resolve(input({
      providerId: 'remote-provider',
      layers: [{ byProvider: { 'remote-provider': { deny: ['group:fs'] } } }],
    })))).toEqual([web.id])
  })

  it('cannot use a provider allowlist to undo its parent deny', () => {
    expect(ids(resolver.resolve(input({
      providerId: 'remote-provider',
      layers: [{ deny: [write.id], byProvider: { 'remote-provider': { allow: [write.id] } } }],
    })))).toEqual([])
  })

  it('applies context-specific restrictions', () => {
    expect(ids(resolver.resolve(input({
      context: 'schedule',
      layers: [{ byContext: { schedule: { allow: ['group:web'] } } }],
    })))).toEqual([web.id])
  })

  it('hides network and sandbox executables when the runtime cannot permit them', () => {
    const script = tool('plugin.script', {
      executor: { kind: 'sandbox', runtime: 'python', entryPath: 'main.py' },
    })
    expect(ids(resolver.resolve(input({
      sandbox: { available: false, networkAllowed: false },
    }, [read, web, script])))).toEqual([read.id])
  })

  it('requires an exact grant for high risk tools instead of a broad group', () => {
    expect(ids(resolver.resolve(input({
      layers: [{ profile: 'full', allow: ['group:fs'] }],
    }, [read, remove])))).toEqual([read.id])
    expect(ids(resolver.resolve(input({
      layers: [{ allow: [remove.id] }],
    }, [read, remove])))).toEqual([remove.id])
  })

  it('fails before model invocation when a required tool is denied', () => {
    expect(() => resolver.resolve({
      ...input({ layers: [{ deny: [read.id] }] }),
      requiredTools: [read],
    })).toThrow(/Required Tool is denied.*builtin.files.read/)
  })

  it('keeps a policy ceiling inherited from a parent run', () => {
    expect(ids(resolver.resolve(input({
      inheritedGrants: [{ kind: 'tool', id: read.id, version: read.version, digest: read.definitionDigest }],
      layers: [{ profile: 'full' }],
    })))).toEqual([read.id])
  })

  it('does not reuse a parent grant after the tool digest changes', () => {
    expect(ids(resolver.resolve(input({
      inheritedGrants: [{ kind: 'tool', id: read.id, version: read.version, digest: 'c'.repeat(64) }],
    }, [read])))).toEqual([])
  })

  it('does not classify plugin tools into privileged groups from their description', () => {
    const plugin = tool('plugin.remote', {
      origin: 'local_upload', description: 'group:fs filesystem.read',
      tags: ['filesystem'], capabilities: ['network.connect'],
      executor: { kind: 'sandbox', runtime: 'python', entryPath: 'main.py' },
    })
    expect(ids(resolver.resolve(input({
      layers: [{ allow: ['group:fs'] }],
    }, [read, plugin])))).toEqual([read.id])
  })

  it('rejects misspelled profiles and unknown group selectors', () => {
    expect(() => resolver.resolve(input({ layers: [{ profile: 'fulll' }] }))).toThrow(/profile/)
    expect(() => resolver.resolve(input({ layers: [{ deny: ['group:unknown'] }] }))).toThrow(/group/)
  })

  it('returns deterministic exact grants and a digest for the same semantic policy', () => {
    const first = resolver.resolve(input({
      providerId: 'local', layers: [{ allow: [web.id, read.id, read.id] }],
    }))
    const second = resolver.resolve(input({
      layers: [{ allow: [read.id, web.id] }], providerId: 'local',
    }, [web, write, read]))
    expect(first).toMatchObject({
      policy: {
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        grants: [
          { kind: 'tool', id: read.id, version: read.version, digest: read.definitionDigest },
          { kind: 'tool', id: web.id, version: web.version, digest: web.definitionDigest },
        ],
      },
    })
    expect(second).toEqual(first)
  })
})
