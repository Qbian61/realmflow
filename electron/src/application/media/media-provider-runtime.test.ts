import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { ToolCapability } from '../../../../domain/tool-definition'
import { PluginContributionRegistry } from '../plugins/plugin-contribution-registry'
import {
  MediaProviderRuntime,
  type MediaProviderAdapter,
} from './media-provider-runtime'

let root: string
let outputPath: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'realmflow-media-runtime-'))
  root = await realpath(root)
  outputPath = join(root, 'generated.png')
  await writeFile(outputPath, 'png')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('MediaProviderRuntime definitions', () => {
  it('publishes nothing without every provider gate', async () => {
    const enabled = catalog()
    expect(await runtime({ adapters: [] }).definitions(enabled)).toEqual([])
    expect(
      await runtime().definitions(catalog({ packageStatus: 'disabled' })),
    ).toEqual([])
    expect(
      await runtime({ resolveCredentialHandle: async () => undefined })
        .definitions(enabled),
    ).toEqual([])
    expect(
      await runtime().definitions(
        catalog({ capabilities: ['filesystem.write'] }),
      ),
    ).toEqual([])
  })

  it('selects conflicts deterministically and emits stable exact definitions', async () => {
    const state = catalog({ includeSecondProvider: true })
    const service = runtime({
      adapters: [
        adapter({ providerId: 'zeta.media', version: '2.0.0' }),
        adapter(),
      ],
    })

    const first = await service.definitions(state)
    const second = await service.definitions(structuredClone(state))

    expect(first).toHaveLength(2)
    expect(first.map(({ id }) => id)).toEqual(['image_generate', 'tts'])
    expect(first).toEqual(second)
    expect(first[0]).toMatchObject({
      id: 'image_generate',
      version: '1.0.0',
      package: { packageId: 'com.example.media' },
      executor: {
        kind: 'builtin',
        handler: 'media-provider-runtime',
      },
      tags: ['media'],
      capabilities: [
        'credential.use',
        'filesystem.write',
        'network.connect',
      ],
      risk: 'medium',
    })
    expect(first[0].definitionDigest).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('MediaProviderRuntime execution', () => {
  it('executes an exact definition with opaque handles and provenance', async () => {
    const execute = vi.fn().mockResolvedValue({
      path: outputPath,
      mediaType: 'image/png',
      usage: { units: 1, estimatedCostMicros: 25 },
    })
    const service = runtime({ adapters: [adapter({ execute })] })
    const state = catalog()
    const [definition] = await service.definitions(state)
    const signal = new AbortController().signal

    const result = await service.execute({
      catalog: state,
      definition: {
        kind: 'tool',
        id: definition.id,
        version: definition.version,
        digest: definition.definitionDigest,
      },
      input: { prompt: 'A local test image' },
      scopeRoots: [root],
      signal,
    })

    expect(execute).toHaveBeenCalledWith({
      operation: 'image_generate',
      input: { prompt: 'A local test image' },
      credentialHandles: { 'media-token': 'opaque:media-token' },
      outputRoot: root,
      signal,
    })
    expect(result).toMatchObject({
      output: {
        path: outputPath,
        mediaType: 'image/png',
        sizeBytes: 3,
      },
      artifact: {
        path: outputPath,
        name: 'generated.png',
        mediaType: 'image/png',
        sizeBytes: 3,
        kind: 'image',
      },
      provenance: {
        operation: 'image_generate',
        packageId: 'com.example.media',
        providerId: 'alpha.media',
        adapterVersion: '1.0.0',
        definitionDigest: definition.definitionDigest,
        usage: { units: 1, estimatedCostMicros: 25 },
      },
    })
  })

  it('fails closed for stale identity and unavailable credentials', async () => {
    const state = catalog()
    const service = runtime()
    const [definition] = await service.definitions(state)
    const command = {
      catalog: state,
      definition: {
        kind: 'tool' as const,
        id: definition.id,
        version: definition.version,
        digest: '0'.repeat(64),
      },
      input: {},
      scopeRoots: [root],
      signal: new AbortController().signal,
    }
    await expect(service.execute(command)).rejects.toThrow(
      'media_definition_stale',
    )

    const unavailable = runtime({
      resolveCredentialHandle: async () => undefined,
    })
    await expect(
      unavailable.execute({
        ...command,
        definition: {
          ...command.definition,
          digest: definition.definitionDigest,
        },
      }),
    ).rejects.toThrow('media_definition_stale')
  })

  it.each([
    {
      name: 'escaped path',
      result: () => ({
        path: join(root, '..', 'escaped.png'),
        mediaType: 'image/png',
      }),
      error: 'media_output_unauthorized',
    },
    {
      name: 'missing file',
      result: () => ({
        path: join(root, 'missing.png'),
        mediaType: 'image/png',
      }),
      error: 'media_output_invalid',
    },
    {
      name: 'wrong media type',
      result: () => ({
        path: outputPath,
        mediaType: 'audio/mpeg',
      }),
      error: 'media_type_mismatch',
    },
  ])('rejects $name', async ({ result, error }) => {
    const service = runtime({
      adapters: [adapter({ execute: async () => result() })],
    })
    const state = catalog()
    const [definition] = await service.definitions(state)

    await expect(
      service.execute({
        catalog: state,
        definition: {
          kind: 'tool',
          id: definition.id,
          version: definition.version,
          digest: definition.definitionDigest,
        },
        input: {},
        scopeRoots: [root],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(error)
  })

  it('forwards cancellation and bounds provider usage disclosure', async () => {
    const controller = new AbortController()
    controller.abort()
    const execute = vi.fn().mockResolvedValue({
      path: outputPath,
      mediaType: 'image/png',
      usage: {
        units: 2,
        estimatedCostMicros: 50,
        rawProviderResponse: 'must-not-leak',
      },
    })
    const service = runtime({ adapters: [adapter({ execute })] })
    const state = catalog()
    const [definition] = await service.definitions(state)

    await expect(
      service.execute({
        catalog: state,
        definition: {
          kind: 'tool',
          id: definition.id,
          version: definition.version,
          digest: definition.definitionDigest,
        },
        input: {},
        scopeRoots: [root],
        signal: controller.signal,
      }),
    ).rejects.toThrow('media_execution_cancelled')
    expect(execute).not.toHaveBeenCalled()
  })
})

function runtime(overrides: {
  adapters?: MediaProviderAdapter[]
  resolveCredentialHandle?: (reference: string) => Promise<string | undefined>
} = {}): MediaProviderRuntime {
  return new MediaProviderRuntime({
    registry: new PluginContributionRegistry(),
    adapters: overrides.adapters ?? [adapter()],
    resolveCredentialHandle:
      overrides.resolveCredentialHandle ??
      (async (reference) => `opaque:${reference}`),
  })
}

function adapter(overrides: Partial<MediaProviderAdapter> = {}): MediaProviderAdapter {
  return {
    providerId: 'alpha.media',
    version: '1.0.0',
    operations: {
      image_generate: {
        requiredCapabilities: [
          'filesystem.write',
          'network.connect',
          'credential.use',
        ],
        costDisclosure: 'usage_estimate',
      },
      tts: {
        requiredCapabilities: [
          'filesystem.write',
          'network.connect',
          'credential.use',
        ],
        costDisclosure: 'usage_estimate',
      },
    },
    execute: async () => ({ path: outputPath, mediaType: 'image/png' }),
    ...overrides,
  }
}

function catalog(overrides: {
  packageStatus?: 'enabled' | 'disabled'
  capabilities?: ToolCapability[]
  includeSecondProvider?: boolean
} = {}): ToolCatalogState {
  const capabilities = overrides.capabilities ?? [
    'filesystem.write',
    'network.connect',
    'credential.use',
  ]
  const contributions: NonNullable<
    ToolCatalogState['packages'][number]['plugin']
  >['contributions'] = [
    {
      kind: 'media_provider',
      id: 'alpha.media',
      definitionDigest: 'a'.repeat(64),
      credentialRefs: ['media-token'],
      mediaOperations: ['image_generate', 'tts'],
    },
  ]
  if (overrides.includeSecondProvider) {
    contributions.push({
      kind: 'media_provider',
      id: 'zeta.media',
      definitionDigest: 'z'.repeat(64).replaceAll('z', 'b'),
      credentialRefs: ['zeta-token'],
      mediaOperations: ['image_generate'],
    })
  }
  return {
    packages: [
      {
        packageId: 'com.example.media',
        version: '1.0.0',
        packageDigest: 'c'.repeat(64),
        origin: 'local_upload',
        name: 'Media',
        description: 'Media providers.',
        enabledPreference: overrides.packageStatus !== 'disabled',
        status: overrides.packageStatus ?? 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 100,
        plugin: {
          permissions: {
            capabilities,
            maximumRisk: 'medium',
            pathPrefixes: [root],
            networkTargets: ['https://media.example.com'],
          },
          sandboxes: [],
          dependencies: [],
          contributions,
        },
      },
    ],
    tools: [],
    skills: [],
  }
}
