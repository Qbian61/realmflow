import { describe, expect, it } from 'vitest'
import {
  normalizePluginPackageManifest,
  type PluginPackageManifestSource
} from './plugin-package'

describe('PluginPackageManifest', () => {
  it('normalizes every supported contribution and sandbox contract', () => {
    const manifest = normalizePluginPackageManifest(validManifest())

    expect(manifest).toMatchObject({
      schemaVersion: 2,
      packageId: 'com.example.research',
      version: '1.0.0',
      permissions: {
        capabilities: ['filesystem.read', 'network.connect'],
        maximumRisk: 'medium',
        pathPrefixes: ['/workspace'],
        networkTargets: ['https://api.example.com']
      },
      sandboxes: [
        {
          id: 'worker',
          runtime: 'node',
          filesystem: 'package-read',
          networkTargets: ['https://api.example.com'],
          maximumDurationMs: 30_000,
          maximumMemoryMb: 128
        }
      ]
    })
    expect(Object.keys(manifest.contributions)).toEqual([
      'tools',
      'skills',
      'connectors',
      'modelProviders',
      'webProviders',
      'browserProviders',
      'mediaProviders',
      'hooks'
    ])
    expect(manifest.contributions.tools[0]).toEqual({
      id: 'research.search',
      path: 'tools/search.json',
      executable: true,
      sandbox: 'worker'
    })
    expect(manifest.contributions.mediaProviders[0]).toEqual({
      id: 'research.media',
      path: 'providers/media.json',
      credentialRefs: ['media-token'],
      operations: ['image_generate', 'tts']
    })
    expect(manifest.contributions.hooks[0]).toEqual({
      id: 'research.after-search',
      event: 'tool.completed',
      targetToolId: 'research.search',
      filterSchemaPath: 'hooks/after-search.schema.json'
    })
    expect(Object.isFrozen(manifest)).toBe(true)
  })

  it('rejects unknown fields and old schema versions', () => {
    expect(() =>
      normalizePluginPackageManifest({
        ...validManifest(),
        extra: true
      })
    ).toThrow('Plugin package manifest fields are invalid')
    expect(() =>
      normalizePluginPackageManifest({
        ...validManifest(),
        schemaVersion: 1
      })
    ).toThrow('Plugin package schema version is unsupported')
  })

  it('rejects duplicate contribution IDs across contribution types', () => {
    const source = validManifest()
    source.contributions.skills[0].id = source.contributions.tools[0].id

    expect(() => normalizePluginPackageManifest(source)).toThrow(
      'Plugin contribution ID is duplicated'
    )
  })

  it('requires an explicit sandbox for executable contributions', () => {
    const source = validManifest()
    delete source.contributions.tools[0].sandbox

    expect(() => normalizePluginPackageManifest(source)).toThrow(
      'Executable Plugin contribution requires a sandbox'
    )
  })

  it('rejects missing sandboxes and permission expansion', () => {
    const missing = validManifest()
    missing.contributions.tools[0].sandbox = 'missing'
    expect(() => normalizePluginPackageManifest(missing)).toThrow(
      'Plugin contribution sandbox is unavailable'
    )

    const networkExpansion = validManifest()
    networkExpansion.sandboxes[0].networkTargets = ['https://other.example.com']
    expect(() => normalizePluginPackageManifest(networkExpansion)).toThrow(
      'Plugin sandbox exceeds package permissions'
    )
  })

  it('rejects Hook targets outside package tools and declared dependencies', () => {
    const source = validManifest()
    source.contributions.hooks[0].targetToolId = 'builtin.files.read'

    expect(() => normalizePluginPackageManifest(source)).toThrow(
      'Plugin Hook target is undeclared'
    )

    source.dependencies = [
      {
        packageId: 'com.realmflow.files',
        versionRange: '>=1.0.0 <2.0.0',
        required: true,
        toolIds: ['builtin.files.read']
      }
    ]
    expect(
      normalizePluginPackageManifest(source).contributions.hooks[0]
        .targetToolId
    ).toBe('builtin.files.read')
  })

  it('rejects inline credentials without exposing their value', () => {
    const secret = 'plain-secret-value'
    const source = validManifest() as PluginPackageManifestSource & {
      credentials?: unknown
    }
    source.credentials = { apiKey: secret }

    let message = ''
    try {
      normalizePluginPackageManifest(source)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('Plugin package manifest fields are invalid')
    expect(message).not.toContain(secret)

    const provider = validManifest()
    ;(provider.contributions.webProviders[0] as unknown as Record<
      string,
      unknown
    >).apiKey = secret
    expect(() => normalizePluginPackageManifest(provider)).toThrow(
      'Plugin package Web Provider fields are invalid'
    )
  })

  it('rejects unsafe paths and duplicate paths', () => {
    const traversal = validManifest()
    traversal.contributions.skills[0].path = '../SKILL.md'
    expect(() => normalizePluginPackageManifest(traversal)).toThrow(
      'Plugin Skill path is invalid'
    )

    const duplicate = validManifest()
    duplicate.contributions.skills[0].path =
      duplicate.contributions.tools[0].path
    expect(() => normalizePluginPackageManifest(duplicate)).toThrow(
      'Plugin contribution path is duplicated'
    )
  })

  it('requires canonical media operations', () => {
    const empty = validManifest()
    setMediaOperations(empty, [])
    expect(() => normalizePluginPackageManifest(empty)).toThrow(
      'Plugin Media Provider operations are required'
    )

    const unknown = validManifest()
    setMediaOperations(unknown, ['image_generate', 'audio_generate'])
    expect(() => normalizePluginPackageManifest(unknown)).toThrow(
      'Plugin Media Provider operation is invalid'
    )
  })
})

function validManifest(): PluginPackageManifestSource {
  const manifest: PluginPackageManifestSource = {
    schemaVersion: 2,
    packageId: 'com.example.research',
    version: '1.0.0',
    name: 'Research',
    description: 'Research tools and providers.',
    publisher: { name: 'Example', keyId: 'example-key' },
    compatibility: {
      realmflowVersionRange: '>=0.1.0 <1.0.0',
      platforms: ['darwin']
    },
    permissions: {
      capabilities: ['network.connect', 'filesystem.read'],
      maximumRisk: 'medium',
      pathPrefixes: ['/workspace'],
      networkTargets: ['https://api.example.com']
    },
    sandboxes: [
      {
        id: 'worker',
        runtime: 'node',
        filesystem: 'package-read',
        networkTargets: ['https://api.example.com'],
        maximumDurationMs: 30_000,
        maximumMemoryMb: 128
      }
    ],
    dependencies: [],
    contributions: {
      tools: [
        {
          id: 'research.search',
          path: 'tools/search.json',
          executable: true,
          sandbox: 'worker'
        }
      ],
      skills: [
        {
          id: 'research.workflow',
          path: 'skills/research/SKILL.md'
        }
      ],
      connectors: [
        {
          id: 'research.connector',
          path: 'connectors/research.json',
          credentialRefs: ['research-token']
        }
      ],
      modelProviders: [
        {
          id: 'research.model',
          path: 'providers/model.json',
          credentialRefs: ['model-token']
        }
      ],
      webProviders: [
        {
          id: 'research.web',
          path: 'providers/web.json',
          credentialRefs: ['web-token']
        }
      ],
      browserProviders: [
        {
          id: 'research.browser',
          path: 'providers/browser.json',
          credentialRefs: []
        }
      ],
      mediaProviders: [
        {
          id: 'research.media',
          path: 'providers/media.json',
          credentialRefs: ['media-token']
        }
      ],
      hooks: [
        {
          id: 'research.after-search',
          event: 'tool.completed',
          targetToolId: 'research.search',
          filterSchemaPath: 'hooks/after-search.schema.json'
        }
      ]
    }
  }
  setMediaOperations(manifest, ['tts', 'image_generate', 'tts'])
  return manifest
}

function setMediaOperations(
  manifest: PluginPackageManifestSource,
  operations: string[]
): void {
  ;(manifest.contributions.mediaProviders[0] as unknown as Record<
    string,
    unknown
  >).operations = operations
}
