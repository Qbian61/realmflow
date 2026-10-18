import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import { RuntimeFilteredToolProjectionStore } from './runtime-filtered-tool-projection-store'
import type { ToolProjectionStore } from './tool-projection-store'

describe('RuntimeFilteredToolProjectionStore', () => {
  it('marks unavailable Tools and hides Skills with required unavailable dependencies', async () => {
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
        getEligibilitySnapshot: async () =>
          new Map([
            [
              'builtin.office.import_legacy',
              {
                status: 'unavailable',
                reasonCode: 'local_dependency_unavailable',
                checkedAt: 1_000,
                expiresAt: 31_000,
                dependencyRevision: 'libreoffice:missing'
              }
            ]
          ])
      }
    })

    const result = await filtered.getCatalog()

    expect(result.tools.find(({ id }) => id === 'builtin.office.import_legacy'))
      .toMatchObject({
        status: 'unavailable',
        runtimeEligibility: {
          status: 'unavailable',
          reasonCode: 'local_dependency_unavailable',
          checkedAt: 1_000,
          expiresAt: 31_000,
          dependencyRevision: 'libreoffice:missing'
        }
      })
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

  it('audits runtime eligibility status changes without repeating unchanged snapshots', async () => {
    const catalog = await catalogFixture()
    const audited: Array<{
      toolId: string
      previousStatus: string
      status: string
      reasonCode: string
      dependencyRevision: string
      checkedAt: number
    }> = []
    let ready = false
    let checkedAt = 1_000
    const filtered = new RuntimeFilteredToolProjectionStore({
      source: projectionStore(catalog),
      availability: {
        getEligibilitySnapshot: async () =>
          new Map([
            [
              'builtin.office.import_legacy',
              ready
                ? {
                    status: 'ready',
                    reasonCode: 'runtime_ready',
                    checkedAt,
                    expiresAt: checkedAt + 30_000,
                    dependencyRevision: 'libreoffice:available'
                  }
                : {
                    status: 'unavailable',
                    reasonCode: 'local_dependency_unavailable',
                    checkedAt,
                    expiresAt: checkedAt + 30_000,
                    dependencyRevision: 'libreoffice:missing'
                  }
            ]
          ])
      },
      audit: {
        recordEligibilityChange: async (event) => {
          audited.push(event)
        }
      }
    })

    await filtered.getCatalog()
    checkedAt = 2_000
    await filtered.getCatalog()
    ready = true
    checkedAt = 3_000
    await filtered.getCatalog()

    expect(audited).toEqual([
      {
        toolId: 'builtin.office.import_legacy',
        previousStatus: 'ready',
        status: 'unavailable',
        reasonCode: 'local_dependency_unavailable',
        dependencyRevision: 'libreoffice:missing',
        checkedAt: 1_000
      },
      {
        toolId: 'builtin.office.import_legacy',
        previousStatus: 'unavailable',
        status: 'ready',
        reasonCode: 'runtime_ready',
        dependencyRevision: 'libreoffice:available',
        checkedAt: 3_000
      }
    ])
  })

  it('hides Skills whose required runtime Tool version is unavailable', async () => {
    const catalog = await catalogFixture()
    const skill = catalog.skills[0]!
    catalog.skills = [
      {
        ...skill,
        id: 'builtin.skill.requires_pdf_v2',
        definition: {
          ...skill.definition,
          id: 'builtin.skill.requires_pdf_v2',
          requiredTools: [
            {
              toolId: 'builtin.pdf.inspect',
              versionRange: '^2.0.0',
              required: true
            }
          ]
        }
      },
      {
        ...skill,
        id: 'builtin.skill.requires_pdf_v1',
        definition: {
          ...skill.definition,
          id: 'builtin.skill.requires_pdf_v1',
          requiredTools: [
            {
              toolId: 'builtin.pdf.inspect',
              versionRange: '^1.0.0',
              required: true
            }
          ]
        }
      }
    ]
    const filtered = new RuntimeFilteredToolProjectionStore({
      source: projectionStore(catalog),
      availability: { getEligibilitySnapshot: async () => new Map() }
    })

    const result = await filtered.getCatalog()

    expect(result.skills.map(({ id }) => id)).toEqual([
      'builtin.skill.requires_pdf_v1'
    ])
  })

  it('hides enabled Tools with invalid contracts and Skills that require them', async () => {
    const catalog = await catalogFixture()
    const tool = catalog.tools.find(({ id }) => id === 'builtin.files.read')!
    const skill = catalog.skills[0]!
    catalog.tools = [
      {
        ...tool,
        id: 'workspace.invalid_tool',
        definitionDigest: '1'.repeat(64),
        definition: {
          ...tool.definition,
          id: 'workspace.invalid_tool',
          definitionDigest: '1'.repeat(64),
          inputSchema: {
            type: 'object',
            additionalProperties: true,
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
            examples: [{ path: 'README.md' }],
          },
        },
      },
      {
        ...tool,
        id: 'workspace.valid_tool',
        definitionDigest: '2'.repeat(64),
        definition: {
          ...tool.definition,
          id: 'workspace.valid_tool',
          definitionDigest: '2'.repeat(64),
        },
      },
    ]
    catalog.skills = [
      {
        ...skill,
        id: 'workspace.requires_invalid',
        definition: {
          ...skill.definition,
          id: 'workspace.requires_invalid',
          requiredTools: [
            {
              toolId: 'workspace.invalid_tool',
              versionRange: '^1.0.0',
              required: true,
            },
          ],
        },
      },
      {
        ...skill,
        id: 'workspace.requires_valid',
        definition: {
          ...skill.definition,
          id: 'workspace.requires_valid',
          requiredTools: [
            {
              toolId: 'workspace.valid_tool',
              versionRange: '^1.0.0',
              required: true,
            },
          ],
        },
      },
    ]
    const filtered = new RuntimeFilteredToolProjectionStore({
      source: projectionStore(catalog),
      availability: { getEligibilitySnapshot: async () => new Map() }
    })

    const result = await filtered.getCatalog()

    expect(result.tools.map(({ id }) => id)).toEqual([
      'workspace.valid_tool'
    ])
    expect(result.skills.map(({ id }) => id)).toEqual([
      'workspace.requires_valid'
    ])
  })

  it('passes the current Catalog to runtime availability before annotating provider-backed Tools', async () => {
    const catalog = await catalogFixture()
    const source = projectionStore(catalog)
    const getEligibilitySnapshot = vi.fn(async (currentCatalog?: typeof catalog) =>
      currentCatalog?.tools.some(({ id }) => id === 'builtin.web.search')
        ? new Map([
            [
              'builtin.web.search',
              {
                status: 'unavailable' as const,
                reasonCode: 'web_search_disabled',
                checkedAt: 1_000,
                expiresAt: 31_000,
                dependencyRevision: 'web-provider:1'
              }
            ]
          ])
        : new Map()
    )
    const filtered = new RuntimeFilteredToolProjectionStore({
      source,
      availability: { getEligibilitySnapshot }
    })

    const result = await filtered.getCatalog()

    expect(getEligibilitySnapshot).toHaveBeenCalledWith(catalog)
    expect(result.tools.find(({ id }) => id === 'builtin.web.search'))
      .toMatchObject({
        status: 'unavailable',
        runtimeEligibility: {
          status: 'unavailable',
          reasonCode: 'web_search_disabled',
          dependencyRevision: 'web-provider:1'
        }
      })
    expect(result.tools.some(({ id }) => id === 'builtin.web.fetch'))
      .toBe(true)
  })

  it('delegates catalog projection writes unchanged', async () => {
    const source = projectionStore(await catalogFixture())
    const filtered = new RuntimeFilteredToolProjectionStore({
      source,
      availability: { getEligibilitySnapshot: async () => new Map() }
    })
    await filtered.commitCatalogProjection({
      state: await source.getCatalog(),
      globalPosition: 4,
      at: 5
    })

    expect(source.commitCatalogProjection).toHaveBeenCalledOnce()
  })
})

async function catalogFixture(): Promise<ToolCatalogState> {
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

function projectionStore(catalog: ToolCatalogState): ToolProjectionStore {
  return {
    getCatalog: vi.fn(async () => catalog),
    commitCatalogProjection: vi.fn(),
    replaceCatalogProjection: vi.fn()
  }
}
