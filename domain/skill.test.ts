import { describe, expect, it } from 'vitest'
import {
  compareSkillVersions,
  createSkillCatalogEntry,
  createSkillVersion,
  normalizeSkillManifest
} from './skill'

const manifestInput = {
  schemaVersion: 1 as const,
  id: 'com.example.planning',
  version: '1.2.0',
  name: ' Planning ',
  description: ' Generate an implementation plan. ',
  entry: { kind: 'prompt' as const, path: ' prompts/main.md ' },
  inputSchema: {
    type: 'object',
    properties: { requirement: { type: 'string' } }
  },
  outputSchema: {
    type: 'object',
    required: ['plan']
  },
  permissions: ['filesystem.read' as const],
  network: {
    required: true,
    services: [' issue-tracker ', 'documentation']
  },
  resources: {
    timeoutMs: 120_000,
    maxMemoryMb: 256,
    maxOutputBytes: 1_048_576
  }
}

describe('Skill manifest', () => {
  it('normalizes a complete versioned manifest', () => {
    expect(normalizeSkillManifest(manifestInput)).toEqual({
      ...manifestInput,
      name: 'Planning',
      description: 'Generate an implementation plan.',
      entry: { kind: 'prompt', path: 'prompts/main.md' },
      network: {
        required: true,
        services: ['issue-tracker', 'documentation']
      }
    })
  })

  it.each([
    { field: 'schema version', changes: { schemaVersion: 2 } },
    { field: 'identifier', changes: { id: '../planning' } },
    { field: 'semantic version', changes: { version: 'v1.2.0' } },
    { field: 'name', changes: { name: '   ' } },
    {
      field: 'entry kind',
      changes: { entry: { kind: 'shell', path: 'main.sh' } }
    },
    {
      field: 'entry path',
      changes: { entry: { kind: 'prompt', path: '../prompt.md' } }
    },
    { field: 'input schema', changes: { inputSchema: [] } },
    {
      field: 'permissions',
      changes: {
        permissions: ['filesystem.read', 'filesystem.read']
      }
    },
    {
      field: 'network services',
      changes: {
        network: { required: false, services: ['private service'] }
      }
    },
    {
      field: 'timeout',
      changes: {
        resources: {
          timeoutMs: 0,
          maxMemoryMb: 256,
          maxOutputBytes: 1_048_576
        }
      }
    },
    {
      field: 'memory',
      changes: {
        resources: {
          timeoutMs: 120_000,
          maxMemoryMb: 8,
          maxOutputBytes: 1_048_576
        }
      }
    },
    {
      field: 'output limit',
      changes: {
        resources: {
          timeoutMs: 120_000,
          maxMemoryMb: 256,
          maxOutputBytes: 16_777_217
        }
      }
    }
  ])('rejects an invalid $field', ({ changes }) => {
    expect(() =>
      normalizeSkillManifest({ ...manifestInput, ...changes })
    ).toThrow(/Skill/)
  })

  it('orders exact semantic versions numerically', () => {
    expect(compareSkillVersions('1.10.0', '1.2.0')).toBeGreaterThan(0)
    expect(compareSkillVersions('2.0.0', '10.0.0')).toBeLessThan(0)
    expect(compareSkillVersions('1.2.0', '1.2.0')).toBe(0)
    expect(() => compareSkillVersions('1.2', '1.2.0')).toThrow(
      'Skill version is invalid'
    )
  })
})

describe('Skill catalog versioning', () => {
  it('creates an immutable version snapshot and enabled catalog entry', () => {
    const manifest = normalizeSkillManifest(manifestInput)
    const version = createSkillVersion({
      id: 'skill-version-1',
      manifest,
      source: {
        type: 'local_directory',
        displayName: 'planning-skill'
      },
      managedRelativePath: 'skills/versions/skill-version-1',
      checksum: 'a'.repeat(64),
      byteSize: 4096,
      fileCount: 3,
      installedAt: 100
    })

    expect(version).toEqual({
      id: 'skill-version-1',
      skillId: 'com.example.planning',
      version: '1.2.0',
      name: 'Planning',
      description: 'Generate an implementation plan.',
      entry: { kind: 'prompt', path: 'prompts/main.md' },
      inputSchema: manifest.inputSchema,
      outputSchema: manifest.outputSchema,
      permissions: ['filesystem.read'],
      network: {
        required: true,
        services: ['issue-tracker', 'documentation']
      },
      resources: manifest.resources,
      source: {
        type: 'local_directory',
        displayName: 'planning-skill'
      },
      managedRelativePath: 'skills/versions/skill-version-1',
      checksum: 'a'.repeat(64),
      byteSize: 4096,
      fileCount: 3,
      installedAt: 100
    })

    expect(createSkillCatalogEntry(version)).toEqual({
      id: 'com.example.planning',
      enabled: true,
      currentVersionId: 'skill-version-1',
      revision: 1,
      createdAt: 100,
      updatedAt: 100
    })
  })

  it.each([
    { checksum: 'not-a-checksum' },
    { byteSize: -1 },
    { fileCount: 0 },
    { managedRelativePath: '../skill-version-1' }
  ])('rejects invalid installed version metadata %#', (changes) => {
    expect(() =>
      createSkillVersion({
        id: 'skill-version-1',
        manifest: normalizeSkillManifest(manifestInput),
        source: {
          type: 'local_directory',
          displayName: 'planning-skill'
        },
        managedRelativePath: 'skills/versions/skill-version-1',
        checksum: 'a'.repeat(64),
        byteSize: 4096,
        fileCount: 3,
        installedAt: 100,
        ...changes
      })
    ).toThrow(/Skill/)
  })
})
