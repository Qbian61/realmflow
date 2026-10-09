import { describe, expect, it } from 'vitest'
import {
  calculateExtensionPackageDigest,
  normalizeExtensionPackageManifest
} from './extension-package'

const manifest = {
  schemaVersion: 1 as const,
  packageId: 'com.example.delivery',
  version: '1.2.0',
  name: ' Delivery tools ',
  description: ' Local delivery capabilities. ',
  publisher: {
    name: ' Example ',
    keyId: ' release-key '
  },
  compatibility: {
    realmflow: ' >=0.1.0 <1.0.0 ',
    platforms: ['linux', 'darwin', 'linux'],
    architectures: ['arm64', 'x64', 'arm64']
  },
  tools: [
    { path: ' tools/write.json ' },
    { path: 'tools/read.json' }
  ],
  skills: [{ path: 'skills/delivery.json' }],
  assets: ['prompts/main.md', 'schemas/result.json']
}

describe('ExtensionPackage manifest', () => {
  it('normalizes a complete package deterministically', () => {
    expect(normalizeExtensionPackageManifest(manifest)).toEqual({
      schemaVersion: 1,
      packageId: 'com.example.delivery',
      version: '1.2.0',
      name: 'Delivery tools',
      description: 'Local delivery capabilities.',
      publisher: {
        name: 'Example',
        keyId: 'release-key'
      },
      compatibility: {
        realmflow: '>=0.1.0 <1.0.0',
        platforms: ['darwin', 'linux'],
        architectures: ['arm64', 'x64']
      },
      tools: [
        { path: 'tools/read.json' },
        { path: 'tools/write.json' }
      ],
      skills: [{ path: 'skills/delivery.json' }],
      assets: ['prompts/main.md', 'schemas/result.json']
    })
  })

  it.each([
    { label: 'schema version', changes: { schemaVersion: 2 } },
    { label: 'package ID', changes: { packageId: '../delivery' } },
    { label: 'version', changes: { version: 'v1.2' } },
    { label: 'name', changes: { name: '   ' } },
    {
      label: 'unknown platform',
      changes: {
        compatibility: {
          ...manifest.compatibility,
          platforms: ['android']
        }
      }
    },
    {
      label: 'unsafe tool path',
      changes: { tools: [{ path: '../tool.json' }] }
    },
    {
      label: 'absolute asset path',
      changes: { assets: ['/tmp/secret'] }
    },
    {
      label: 'duplicate definition path',
      changes: {
        tools: [{ path: 'tools/read.json' }],
        skills: [{ path: 'tools/read.json' }]
      }
    },
    {
      label: 'unknown field',
      changes: { hiddenPrompt: 'ignore policy' }
    }
  ])('rejects an invalid $label', ({ changes }) => {
    expect(() =>
      normalizeExtensionPackageManifest({ ...manifest, ...changes })
    ).toThrow(/Extension package/)
  })
})

describe('ExtensionPackage digest', () => {
  it('is stable across file ordering and distinguishes paths', () => {
    const first = calculateExtensionPackageDigest([
      { path: 'extension.json', content: '{"schemaVersion":1}' },
      { path: 'prompts/main.md', content: 'Deliver safely.' }
    ])
    const reordered = calculateExtensionPackageDigest([
      { path: 'prompts/main.md', content: 'Deliver safely.' },
      { path: 'extension.json', content: '{"schemaVersion":1}' }
    ])
    const renamed = calculateExtensionPackageDigest([
      { path: 'extension.json', content: '{"schemaVersion":1}' },
      { path: 'prompts/other.md', content: 'Deliver safely.' }
    ])

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(reordered).toBe(first)
    expect(renamed).not.toBe(first)
  })

  it('rejects duplicate or unsafe package files', () => {
    expect(() =>
      calculateExtensionPackageDigest([
        { path: 'extension.json', content: '{}' },
        { path: 'extension.json', content: '{}' }
      ])
    ).toThrow('Extension package file path is duplicated')
    expect(() =>
      calculateExtensionPackageDigest([
        { path: '../extension.json', content: '{}' }
      ])
    ).toThrow('Extension package file path is invalid')
  })
})
