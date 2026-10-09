import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import { RuntimeFilteredToolProjectionStore } from './runtime-filtered-tool-projection-store'
import type { ToolProjectionStore } from './tool-projection-store'

describe('RuntimeFilteredToolProjectionStore', () => {
  it('hides unavailable Tools and Skills with required hidden dependencies', async () => {
    const catalog = await catalogFixture()
    const skill = catalog.skills[0]!
    catalog.skills = [
      {
        ...skill,
        id: 'builtin.skill.legacy_import',
        definition: {
          ...skill.definition,
          id: 'builtin.skill.legacy_import',
          requiredTools: [
            {
              toolId: 'builtin.office.import_legacy',
              versionRange: '>=1.0.0 <2.0.0',
              required: true
            }
          ]
        }
      },
      {
        ...skill,
        id: 'builtin.skill.safe_copy',
        definition: {
          ...skill.definition,
          id: 'builtin.skill.safe_copy',
          requiredTools: [
            {
              toolId: 'builtin.office.create_safe_copy',
              versionRange: '>=1.0.0 <2.0.0',
              required: true
            }
          ]
        }
      }
    ]
    const source = projectionStore(catalog)
    const filtered = new RuntimeFilteredToolProjectionStore({
      source,
      availability: {
        getUnavailableToolIds: async () =>
          new Set(['builtin.office.import_legacy'])
      }
    })

    const result = await filtered.getCatalog()

    expect(result.tools.some(({ id }) => id === 'builtin.office.import_legacy'))
      .toBe(false)
    expect(result.tools.some(({ id }) => id === 'builtin.document.export_pdf'))
      .toBe(true)
    expect(result.tools.some(({ id }) => id === 'builtin.office.create_safe_copy'))
      .toBe(true)
    expect(result.skills.map(({ id }) => id)).toEqual([
      'builtin.skill.safe_copy'
    ])
    expect(catalog.tools.some(({ id }) => id === 'builtin.office.import_legacy'))
      .toBe(true)
  })

  it('delegates projection writes and execution reads unchanged', async () => {
    const source = projectionStore(await catalogFixture())
    const filtered = new RuntimeFilteredToolProjectionStore({
      source,
      availability: { getUnavailableToolIds: async () => new Set() }
    })
    const batch = { states: [], globalPosition: 2, at: 3 }

    await filtered.commitExecutionBatch(batch)
    await filtered.replaceExecutionProjection(batch)
    await filtered.commitCatalogProjection({
      state: await source.getCatalog(),
      globalPosition: 4,
      at: 5
    })

    expect(source.commitExecutionBatch).toHaveBeenCalledWith(batch)
    expect(source.replaceExecutionProjection).toHaveBeenCalledWith(batch)
    expect(source.commitCatalogProjection).toHaveBeenCalledOnce()
  })
})

async function catalogFixture() {
  const packages = await new BuiltinCatalogLoader(
    join(process.cwd(), 'resources', 'extensions', 'builtin')
  ).load()
  return {
    packages: [],
    tools: packages.flatMap(({ tools }) =>
      tools.map((definition) => ({
        kind: 'tool' as const,
        id: definition.id,
        version: definition.version,
        definitionDigest: definition.definitionDigest,
        definition,
        enabledPreference: true,
        status: 'enabled' as const,
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }))
    ),
    skills: packages.flatMap(({ skills }) =>
      skills.map((definition) => ({
        kind: 'skill' as const,
        id: definition.id,
        version: definition.version,
        definitionDigest: definition.definitionDigest,
        definition,
        enabledPreference: true,
        status: 'enabled' as const,
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }))
    )
  }
}

function projectionStore(
  catalog: Awaited<ReturnType<typeof catalogFixture>>
): ToolProjectionStore {
  return {
    getCatalog: vi.fn(async () => catalog),
    getExecution: vi.fn(),
    getPermission: vi.fn(),
    listPendingPermissions: vi.fn().mockResolvedValue([]),
    getCheckpoint: vi.fn(),
    commitExecutionBatch: vi.fn(),
    replaceExecutionProjection: vi.fn(),
    commitPermissionBatch: vi.fn(),
    replacePermissionProjection: vi.fn(),
    commitCatalogProjection: vi.fn(),
    replaceCatalogProjection: vi.fn()
  }
}
