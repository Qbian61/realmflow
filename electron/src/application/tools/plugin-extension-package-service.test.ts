import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExtensionPackageService } from './extension-package-service'

let root: string
let sourcePath: string
let userDataPath: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'realmflow-plugin-package-'))
  sourcePath = join(root, 'source')
  userDataPath = join(root, 'user-data')
  await writePluginPackage(sourcePath)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('ExtensionPackageService Plugin SDK', () => {
  it('validates and stages every Plugin contribution without executing it', async () => {
    const prepared = await service().prepare(sourcePath)

    expect(prepared.manifest.schemaVersion).toBe(2)
    expect(prepared.tools).toMatchObject([
      {
        id: 'research.search',
        executor: {
          kind: 'sandbox',
          runtime: 'process',
          entryPath: 'runtime/search.js'
        }
      }
    ])
    expect(prepared.plugin).toMatchObject({
      permissions: {
        capabilities: ['filesystem.read', 'network.connect'],
        maximumRisk: 'medium'
      },
      sandboxes: [{ id: 'worker', runtime: 'node' }],
      contributions: [
        { kind: 'tool', id: 'research.search' },
        { kind: 'skill', id: 'research.workflow' },
        { kind: 'connector', id: 'research.connector' },
        { kind: 'model_provider', id: 'research.model' },
        { kind: 'web_provider', id: 'research.web' },
        { kind: 'browser_provider', id: 'research.browser' },
        {
          kind: 'media_provider',
          id: 'research.media',
          mediaOperations: ['image_generate', 'tts']
        },
        {
          kind: 'hook',
          id: 'research.after-search',
          targetToolId: 'research.search'
        }
      ]
    })
    expect(prepared.plugin?.contributions.every(
      (item) => item.definitionDigest.match(/^[a-f0-9]{64}$/)
    )).toBe(true)
    await prepared.pending.rollback()
  })

  it('rejects a Tool whose manifest identity or sandbox runtime differs', async () => {
    const path = join(sourcePath, 'tools', 'search.json')
    const tool = toolDefinition()
    await writeFile(path, JSON.stringify({ ...tool, id: 'research.other' }))
    await expect(service().prepare(sourcePath)).rejects.toThrow(
      'Plugin Tool definition identity does not match manifest'
    )

    await writeFile(path, JSON.stringify({
      ...tool,
      executor: {
        kind: 'sandbox',
        runtime: 'python',
        entryPath: 'runtime/search.js'
      }
    }))
    await expect(service().prepare(sourcePath)).rejects.toThrow(
      'Plugin Tool sandbox runtime does not match manifest'
    )
  })

  it('compiles untrusted provider and Hook schemas in Main', async () => {
    const path = join(sourcePath, 'providers', 'web.json')
    const descriptor = providerDescriptor('research.web')
    await writeFile(path, JSON.stringify({
      ...descriptor,
      configurationSchema: {
        type: 'object',
        properties: {
          query: { type: 'not-a-json-schema-type' }
        }
      }
    }))

    await expect(service().prepare(sourcePath)).rejects.toThrow(
      'Plugin Web Provider configuration schema is invalid'
    )

    await writeFile(path, JSON.stringify(descriptor))
    await writeFile(
      join(sourcePath, 'hooks', 'after-search.schema.json'),
      JSON.stringify({ type: 'invalid' })
    )
    await expect(service().prepare(sourcePath)).rejects.toThrow(
      'Plugin Hook filter schema is invalid'
    )
  })

  it('rejects undeclared credential handles and inline secret fields', async () => {
    const path = join(sourcePath, 'providers', 'web.json')
    await writeFile(path, JSON.stringify({
      ...providerDescriptor('research.web'),
      credentialRefs: ['other-token']
    }))
    await expect(service().prepare(sourcePath)).rejects.toThrow(
      'Plugin Web Provider credential references do not match manifest'
    )

    await writeFile(path, JSON.stringify({
      ...providerDescriptor('research.web'),
      apiKey: 'secret-value'
    }))
    let message = ''
    try {
      await service().prepare(sourcePath)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('Plugin Web Provider fields are invalid')
    expect(message).not.toContain('secret-value')
  })

  it('requires media descriptor operations to match the manifest', async () => {
    const path = join(sourcePath, 'providers', 'media.json')
    await writeFile(path, JSON.stringify({
      ...providerDescriptor('research.media', ['media-token']),
      operations: ['video_generate']
    }))

    await expect(service().prepare(sourcePath)).rejects.toThrow(
      'Plugin Media Provider operations do not match manifest'
    )
  })
})

function service(): ExtensionPackageService {
  return new ExtensionPackageService({
    userDataPath,
    realmFlowVersion: '0.1.0',
    platform: 'darwin',
    architecture: 'arm64',
    createId: () => 'plugin-staging'
  })
}

async function writePluginPackage(path: string): Promise<void> {
  await Promise.all([
    mkdir(join(path, 'tools'), { recursive: true }),
    mkdir(join(path, 'skills'), { recursive: true }),
    mkdir(join(path, 'instructions'), { recursive: true }),
    mkdir(join(path, 'runtime'), { recursive: true }),
    mkdir(join(path, 'connectors'), { recursive: true }),
    mkdir(join(path, 'providers'), { recursive: true }),
    mkdir(join(path, 'hooks'), { recursive: true })
  ])
  await writeFile(
    join(path, 'extension.json'),
    JSON.stringify(pluginManifest(), null, 2)
  )
  await writeFile(
    join(path, 'tools', 'search.json'),
    JSON.stringify(toolDefinition(), null, 2)
  )
  await writeFile(
    join(path, 'skills', 'research.json'),
    JSON.stringify(skillDefinition(), null, 2)
  )
  await writeFile(
    join(path, 'instructions', 'research.md'),
    'Use research.search and summarize grounded results.\n'
  )
  await writeFile(
    join(path, 'runtime', 'search.js'),
    'process.stdout.write(JSON.stringify({ ok: true }))\n'
  )
  await writeFile(
    join(path, 'connectors', 'research.json'),
    JSON.stringify(providerDescriptor('research.connector', ['research-token']))
  )
  for (const [file, id, refs] of [
    ['model.json', 'research.model', ['model-token']],
    ['web.json', 'research.web', ['web-token']],
    ['browser.json', 'research.browser', []],
    ['media.json', 'research.media', ['media-token']]
  ] as const) {
    const descriptor = providerDescriptor(id, [...refs])
    await writeFile(
      join(path, 'providers', file),
      JSON.stringify(
        id === 'research.media'
          ? {
              ...descriptor,
              operations: ['image_generate', 'tts']
            }
          : descriptor
      )
    )
  }
  await writeFile(
    join(path, 'hooks', 'after-search.schema.json'),
    JSON.stringify({
      type: 'object',
      additionalProperties: false,
      properties: { toolId: { type: 'string' } }
    })
  )
}

function pluginManifest() {
  return {
    schemaVersion: 2,
    packageId: 'com.example.research',
    version: '1.0.0',
    name: 'Research',
    description: 'Research plugin.',
    publisher: { name: 'Example' },
    compatibility: {
      realmflowVersionRange: '>=0.1.0 <1.0.0',
      platforms: ['darwin'],
      architectures: ['arm64']
    },
    permissions: {
      capabilities: ['filesystem.read', 'network.connect'],
      maximumRisk: 'medium',
      pathPrefixes: ['/workspace'],
      networkTargets: ['https://api.example.com']
    },
    sandboxes: [{
      id: 'worker',
      runtime: 'node',
      filesystem: 'package-read',
      networkTargets: ['https://api.example.com'],
      maximumDurationMs: 30_000,
      maximumMemoryMb: 128
    }],
    dependencies: [],
    contributions: {
      tools: [{
        id: 'research.search',
        path: 'tools/search.json',
        executable: true,
        sandbox: 'worker'
      }],
      skills: [{
        id: 'research.workflow',
        path: 'skills/research.json'
      }],
      connectors: [{
        id: 'research.connector',
        path: 'connectors/research.json',
        credentialRefs: ['research-token']
      }],
      modelProviders: [{
        id: 'research.model',
        path: 'providers/model.json',
        credentialRefs: ['model-token']
      }],
      webProviders: [{
        id: 'research.web',
        path: 'providers/web.json',
        credentialRefs: ['web-token']
      }],
      browserProviders: [{
        id: 'research.browser',
        path: 'providers/browser.json',
        credentialRefs: []
      }],
      mediaProviders: [{
        id: 'research.media',
        path: 'providers/media.json',
        credentialRefs: ['media-token'],
        operations: ['tts', 'image_generate']
      }],
      hooks: [{
        id: 'research.after-search',
        event: 'tool.completed',
        targetToolId: 'research.search',
        filterSchemaPath: 'hooks/after-search.schema.json'
      }]
    }
  }
}

function toolDefinition() {
  return {
    schemaVersion: 1,
    id: 'research.search',
    version: '1.0.0',
    name: 'Search',
    description: 'Search the configured provider.',
    tags: ['research'],
    executor: {
      kind: 'sandbox',
      runtime: 'process',
      entryPath: 'runtime/search.js'
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['filesystem.read', 'network.connect'],
    effects: ['external.read'],
    risk: 'medium',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 16_384,
      maxMemoryMb: 128,
      maxAttempts: 1
    },
    discovery: {
      intents: ['research'],
      contexts: ['general']
    }
  }
}

function skillDefinition() {
  return {
    schemaVersion: 1,
    id: 'research.workflow',
    version: '1.0.0',
    name: 'Research workflow',
    description: 'Run a grounded research workflow.',
    instructionsPath: 'instructions/research.md',
    runtime: { kind: 'instruction' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    requiredTools: [{
      toolId: 'research.search',
      versionRange: '1.0.0',
      required: true
    }],
    activation: {
      intents: ['research'],
      contexts: ['general']
    },
    limits: {
      maxToolCalls: 4,
      timeoutMs: 120_000
    }
  }
}

function providerDescriptor(id: string, credentialRefs: string[] = ['web-token']) {
  return {
    schemaVersion: 1,
    id,
    name: id,
    description: `${id} descriptor`,
    credentialRefs,
    configurationSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  }
}
