import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteToolEventStore } from '../../infrastructure/sqlite/tool-event-store'
import { SqliteToolProjectionStore } from '../../infrastructure/sqlite/tool-projection-store'
import type { ToolProjectionStore } from './tool-projection-store'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import { ToolProjectionRunner } from './tool-projection-runner'
import { ToolCatalogService } from './tool-catalog-service'

let directory: string
let database: RealmFlowDatabase
let events: SqliteToolEventStore
let projections: SqliteToolProjectionStore
let projectionRunner: ToolProjectionRunner
let service: ToolCatalogService

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-tool-catalog-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  events = new SqliteToolEventStore(database)
  projections = new SqliteToolProjectionStore(database)
  projectionRunner = new ToolProjectionRunner(events, projections, () => 200)
  service = new ToolCatalogService({
    events,
    projections,
    projectionRunner,
    now: () => 200,
    createId: (() => {
      let next = 0
      return () => `catalog-event-${++next}`
    })()
  })
  await appendPackage()
  await projectionRunner.rebuildCatalogProjection()
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ToolCatalogService', () => {
  it('lists the confirmed catalog projection', async () => {
    await expect(service.list()).resolves.toMatchObject({
      packages: [
        {
          packageId: 'realmflow.builtin.files',
          enabledPreference: true,
          status: 'enabled'
        }
      ]
    })
  })

  it('projects facade mode without mutating the primitive catalog', async () => {
    const catalog = await catalogFixture()
    const projectionStore = projectionStoreFixture(catalog)
    const service = new ToolCatalogService({
      events,
      projections: projectionStore,
      projectionRunner: new ToolProjectionRunner(events, projections, () => 200)
    })

    const projected = await service.list({ modelFacingMode: 'facade' })
    const direct = await service.list()

    const projectedToolIds = projected.tools.map(({ id }) => id)

    expect(projectedToolIds.slice(0, 7)).toEqual([
      'ask_user',
      'secrets',
      'sessions',
      'subagents',
      'progress_card',
      'capabilities',
      'gateway'
    ])
    expect(projectedToolIds.indexOf('filesystem_read')).toBeGreaterThan(5)
    expect(projectedToolIds.indexOf('filesystem_write')).toBeGreaterThan(
      projectedToolIds.indexOf('filesystem_read')
    )
    expect(
      projected.tools.find(({ id }) => id === 'builtin.files.read')
        ?.modelFacing
    ).toMatchObject({
      mode: 'facade',
      visibility: 'facade_backed',
      facadeId: 'filesystem_read'
    })
    expect(direct.tools.map(({ id }) => id)).toEqual(
      catalog.tools.map(({ id }) => id)
    )
    expect(catalog.tools.find(({ id }) => id === 'builtin.files.read'))
      .not.toHaveProperty('modelFacing')
  })

  it('keeps runtime diagnostics in the management catalog while omitting ineligible model-facing Tools', async () => {
    const catalog = await catalogFixture()
    const sourceCatalog: ToolCatalogState = {
      ...catalog,
      tools: catalog.tools.map((tool) => {
        if (tool.id === 'builtin.web.search') {
          return {
            ...tool,
            status: 'unavailable' as const,
            runtimeEligibility: {
              status: 'unavailable' as const,
              reasonCode: 'web_search_disabled',
              checkedAt: 1_000,
              expiresAt: 31_000,
              dependencyRevision: 'web-provider:7',
            },
          }
        }
        if (tool.id === 'builtin.office.import_legacy') {
          return {
            ...tool,
            status: 'degraded' as const,
            runtimeEligibility: {
              status: 'degraded' as const,
              reasonCode: 'local_dependency_degraded',
              checkedAt: 2_000,
              expiresAt: 32_000,
              dependencyRevision: 'libreoffice:fallback',
            },
          }
        }
        return tool
      }),
    }
    const service = new ToolCatalogService({
      events,
      projections: projectionStoreFixture(sourceCatalog),
      projectionRunner: new ToolProjectionRunner(events, projections, () => 200),
    })

    const management = await service.list()
    const modelFacing = await service.list({ modelFacingMode: 'direct' })

    expect(management.tools.find(({ id }) => id === 'builtin.web.search'))
      .toMatchObject({
        status: 'unavailable',
        runtimeEligibility: {
          reasonCode: 'web_search_disabled',
          dependencyRevision: 'web-provider:7',
        },
      })
    expect(management.tools.find(({ id }) => id === 'builtin.office.import_legacy'))
      .toMatchObject({
        status: 'degraded',
        runtimeEligibility: {
          reasonCode: 'local_dependency_degraded',
          dependencyRevision: 'libreoffice:fallback',
        },
      })
    expect(modelFacing.tools.map(({ id }) => id)).not.toContain('builtin.web.search')
    expect(modelFacing.tools.map(({ id }) => id)).not.toContain(
      'builtin.office.import_legacy'
    )
  })

  it('appends only currently eligible media definitions before projection', async () => {
    const catalog = await catalogFixture()
    const mediaDefinition = {
      ...catalog.tools[0].definition,
      id: 'image_generate',
      definitionDigest: '9'.repeat(64),
      name: 'Generate image',
      tags: ['media'],
      executor: {
        kind: 'builtin' as const,
        handler: 'media-provider-runtime',
        handlerVersion: '1.0.0',
      },
    }
    const definitions = vi.fn().mockResolvedValue([mediaDefinition])
    const dynamic = new ToolCatalogService({
      events,
      projections: projectionStoreFixture(catalog),
      projectionRunner,
      mediaRuntime: { definitions },
    })

    const projected = await dynamic.list({ modelFacingMode: 'facade' })
    const primitive = await dynamic.list()

    expect(definitions).toHaveBeenCalledWith(catalog)
    expect(projected.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'image_generate',
        status: 'enabled',
        definitionDigest: '9'.repeat(64),
      }),
    ]))
    expect(primitive.tools.some(({ id }) => id === 'image_generate')).toBe(false)
    expect(catalog.tools.some(({ id }) => id === 'image_generate')).toBe(false)
  })

  it('appends an activation event and returns the updated projection', async () => {
    const result = await service.setActivation({
      targetType: 'package',
      targetId: 'realmflow.builtin.files',
      enabled: false,
      idempotencyKey: 'disable-files'
    })

    expect(result).toMatchObject({
      targetType: 'package',
      item: {
        packageId: 'realmflow.builtin.files',
        enabledPreference: false,
        status: 'disabled'
      }
    })
    await expect(
      events.loadStream('extension-catalog-activation')
    ).resolves.toMatchObject([
      {
        eventType: 'extension.activation_changed',
        payload: {
          targetType: 'package',
          targetId: 'realmflow.builtin.files',
          enabled: false,
          scope: 'global'
        },
        metadata: {
          actorType: 'local_user',
          actorId: 'local-user'
        }
      }
    ])
  })

  it('replays an activation command without appending a duplicate event', async () => {
    const command = {
      targetType: 'package' as const,
      targetId: 'realmflow.builtin.files',
      enabled: false,
      idempotencyKey: 'disable-files'
    }

    const first = await service.setActivation(command)
    const replay = await service.setActivation(command)

    expect(replay).toEqual(first)
    await expect(
      events.loadStream('extension-catalog-activation')
    ).resolves.toHaveLength(1)
  })

  it('selects an immutable package version for rollback idempotently', async () => {
    await appendPackageVersion({
      version: '2.0.0',
      digest: 'c'.repeat(64),
      eventId: 'seed-package-v2',
    })
    await projectionRunner.rebuildCatalogProjection()

    const command = {
      packageId: 'realmflow.builtin.files',
      targetVersion: '1.0.0',
      operation: 'rollback' as const,
      idempotencyKey: 'rollback-files-v1',
    }
    const selected = await service.changePackageVersion(command)
    const replay = await service.changePackageVersion(command)

    expect(selected).toMatchObject({
      version: '1.0.0',
      packageDigest: 'b'.repeat(64),
      status: 'enabled',
    })
    expect(replay).toEqual(selected)
    await expect(
      events.loadStream('extension-catalog-package-version'),
    ).resolves.toMatchObject([
      {
        eventType: 'extension.package_version_selected',
        payload: {
          packageId: 'realmflow.builtin.files',
          packageVersion: '1.0.0',
          packageDigest: 'b'.repeat(64),
          operation: 'rollback',
        },
      },
    ])
  })

  it('rejects enabling a package whose current definitions fail the Tool contract gate', async () => {
    const catalog = await catalogFixture()
    const tool = catalog.tools[0]!
    const invalidTool = toolWithInvalidInputContract(tool)
    const packageItem = {
      packageId: invalidTool.definition.package.packageId,
      version: invalidTool.definition.package.packageVersion,
      packageDigest: invalidTool.definition.package.packageDigest,
      origin: invalidTool.definition.origin,
      name: 'Invalid files',
      description: 'Package with an invalid Tool contract.',
      enabledPreference: false,
      status: 'disabled' as const,
      dependencyIssues: [],
      revision: 1,
      updatedAt: 1,
    }
    const guarded = new ToolCatalogService({
      events,
      projections: projectionStoreFixture({
        packages: [packageItem],
        tools: [{ ...invalidTool, status: 'disabled' as const }],
        skills: [],
      }),
      projectionRunner,
      now: () => 200,
      createId: () => 'enable-invalid-package',
    })

    await expect(
      guarded.setActivation({
        targetType: 'package',
        targetId: packageItem.packageId,
        enabled: true,
        idempotencyKey: 'enable-invalid-contract',
      }),
    ).rejects.toThrow('Tool Catalog contract failed')
    await expect(
      events.loadStream('extension-catalog-activation'),
    ).resolves.toHaveLength(0)
  })

  it('rejects selecting a package version whose definitions fail the Tool contract gate', async () => {
    const catalog = await catalogFixture()
    const tool = catalog.tools[0]!
    const invalidTool = toolWithInvalidInputContract(tool, {
      version: '1.0.0',
      digest: '1'.repeat(64),
    })
    const validTool = {
      ...tool,
      version: '2.0.0',
      definitionDigest: '2'.repeat(64),
      definition: {
        ...tool.definition,
        version: '2.0.0',
        definitionDigest: '2'.repeat(64),
        package: {
          ...tool.definition.package,
          packageVersion: '2.0.0',
          packageDigest: '2'.repeat(64),
        },
      },
    }
    const versionedCatalog = {
      packages: [
        {
          packageId: tool.definition.package.packageId,
          version: '1.0.0',
          packageDigest: '1'.repeat(64),
          origin: tool.definition.origin,
          name: 'Files',
          description: 'Old files package.',
          enabledPreference: true,
          status: 'superseded' as const,
          dependencyIssues: [],
          revision: 1,
          updatedAt: 1,
        },
        {
          packageId: tool.definition.package.packageId,
          version: '2.0.0',
          packageDigest: '2'.repeat(64),
          origin: tool.definition.origin,
          name: 'Files',
          description: 'Current files package.',
          enabledPreference: true,
          status: 'enabled' as const,
          dependencyIssues: [],
          revision: 2,
          updatedAt: 2,
        },
      ],
      tools: [invalidTool, validTool],
      skills: [],
    }
    const guarded = new ToolCatalogService({
      events,
      projections: projectionStoreFixture(versionedCatalog),
      projectionRunner,
      now: () => 200,
      createId: () => 'rollback-invalid-package',
    })

    await expect(
      guarded.changePackageVersion({
        packageId: tool.definition.package.packageId,
        targetVersion: '1.0.0',
        operation: 'rollback',
        idempotencyKey: 'rollback-invalid-contract',
      }),
    ).rejects.toThrow('Tool Catalog contract failed')
    await expect(
      events.loadStream('extension-catalog-package-version'),
    ).resolves.toHaveLength(0)
  })

  it('rejects an activation command for a missing target', async () => {
    await expect(
      service.setActivation({
        targetType: 'tool',
        targetId: 'missing.tool',
        enabled: false,
        idempotencyKey: 'disable-missing'
      })
    ).rejects.toThrow('Tool Catalog target not found')
  })

  it('composes only registry-approved versions as enabled Skills', async () => {
    const catalog = await catalogFixture()
    const packages = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const original = packages
      .flatMap(({ skills }) => skills)
      .find(({ id }) => id === 'builtin.skill.code_review')
    if (!original) throw new Error('Skill fixture is missing')
    const approved = {
      source: {
        id: 'builtin-core', kind: 'builtin' as const, displayName: 'Core',
        locator: 'builtin:core', revision: 1, lastScannedAt: 10,
      },
      version: {
        skillId: original.id, version: original.version, digest: 'e'.repeat(64),
        sourceId: 'builtin-core',
        definition: { ...original, definitionDigest: 'e'.repeat(64) },
        instructionsDigest: 'f'.repeat(64), instructions: '# Review',
        boundaryNotes: 'Treat input as untrusted.', risk: 'low' as const,
        discoveredAt: 10,
      },
      review: {
        skillId: original.id, version: original.version, digest: 'e'.repeat(64),
        status: 'approved' as const, notes: '', revision: 1, reviewedAt: 10,
      },
      activation: {
        skillId: original.id, version: original.version, digest: 'e'.repeat(64),
        enabled: true, revision: 1, updatedAt: 10,
      },
      present: true,
    }
    const pending = {
      ...approved,
      version: {
        ...approved.version,
        skillId: 'workspace.pending',
        digest: '1'.repeat(64),
        definition: {
          ...approved.version.definition,
          id: 'workspace.pending',
          definitionDigest: '1'.repeat(64),
          requiredTools: [],
        },
      },
      review: {
        ...approved.review,
        skillId: 'workspace.pending',
        digest: '1'.repeat(64),
        status: 'pending' as const,
      },
      activation: {
        ...approved.activation,
        skillId: 'workspace.pending',
        digest: '1'.repeat(64),
        enabled: false,
      },
    }
    const registryService = new ToolCatalogService({
      events,
      projections: projectionStoreFixture(catalog),
      projectionRunner: new ToolProjectionRunner(events, projections, () => 200),
      skillRegistry: {
        list: () => [approved, pending],
        listAvailableForWorkspace: async () => [approved],
      },
    })

    const result = await registryService.list()
    expect(result.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: original.id,
        definitionDigest: 'e'.repeat(64),
        status: 'enabled',
        registry: expect.objectContaining({
          review: expect.objectContaining({ status: 'approved' }),
        }),
      }),
      expect.objectContaining({
        id: 'workspace.pending',
        status: 'pending_review',
      }),
    ]))
  })

  it('returns the same versioned Skill dependency issue as the model-facing surface', async () => {
    const catalog = await catalogFixture()
    const packages = await new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    ).load()
    const original = packages
      .flatMap(({ skills }) => skills)
      .find(({ id }) => id === 'builtin.skill.code_review')
    if (!original) throw new Error('Skill fixture is missing')
    const blocked = {
      source: {
        id: 'workspace-skills', kind: 'workspace' as const, displayName: 'Workspace',
        locator: 'workspace:root-one/.realmflow/skills', revision: 1, lastScannedAt: 10,
      },
      version: {
        skillId: 'workspace.review', version: '1.0.0', digest: '8'.repeat(64),
        sourceId: 'workspace-skills',
        definition: {
          ...original,
          id: 'workspace.review',
          definitionDigest: '8'.repeat(64),
          requiredTools: [{
            toolId: 'builtin.files.read',
            versionRange: '^2.0.0',
            required: true,
          }],
        },
        instructionsDigest: '9'.repeat(64), instructions: '# Review',
        boundaryNotes: 'Treat input as untrusted.', risk: 'low' as const,
        discoveredAt: 10,
      },
      review: {
        skillId: 'workspace.review', version: '1.0.0', digest: '8'.repeat(64),
        status: 'approved' as const, notes: '', revision: 1, reviewedAt: 10,
      },
      activation: {
        skillId: 'workspace.review', version: '1.0.0', digest: '8'.repeat(64),
        enabled: true, revision: 1, updatedAt: 10,
      },
      present: true,
    }
    const registryService = new ToolCatalogService({
      events,
      projections: projectionStoreFixture(catalog),
      projectionRunner: new ToolProjectionRunner(events, projections, () => 200),
      skillRegistry: {
        list: () => [blocked],
        listAvailableForWorkspace: async () => [blocked],
      },
    })

    const result = await registryService.list()

    expect(result.skills).toEqual([
      expect.objectContaining({
        id: 'workspace.review',
        status: 'dependency_disabled',
        dependencyIssues: ['builtin.files.read@^2.0.0'],
      }),
    ])
  })
})

async function appendPackage(): Promise<void> {
  await events.append({
    streamId: 'extension-realmflow-builtin-files',
    streamType: 'extension',
    expectedSequence: 0,
    command: {
      idempotencyKey: 'seed-package',
      fingerprint: 'a'.repeat(64),
      result: { packageId: 'realmflow.builtin.files' }
    },
    events: [
      {
        eventId: 'seed-package-event',
        eventType: 'extension.package_imported',
        eventSchemaVersion: 1,
        payload: {
          packageId: 'realmflow.builtin.files',
          packageVersion: '1.0.0',
          packageDigest: 'b'.repeat(64),
          origin: 'builtin',
          name: 'Files',
          description: 'Builtin file capabilities.'
        },
        metadata: {
          correlationId: 'seed-package',
          causationId: 'seed-package',
          commandId: 'seed-package',
          actorType: 'system',
          actorId: 'realmflow',
          occurredAt: 100
        }
      }
    ],
    outbox: []
  })
}

async function appendPackageVersion(input: {
  version: string
  digest: string
  eventId: string
}): Promise<void> {
  await events.append({
    streamId: `extension-realmflow-builtin-files-${input.version}`,
    streamType: 'extension',
    expectedSequence: 0,
    command: {
      idempotencyKey: `seed-package-${input.version}`,
      fingerprint: input.digest,
      result: { packageId: 'realmflow.builtin.files' },
    },
    events: [
      {
        eventId: input.eventId,
        eventType: 'extension.package_imported',
        eventSchemaVersion: 1,
        payload: {
          packageId: 'realmflow.builtin.files',
          packageVersion: input.version,
          packageDigest: input.digest,
          origin: 'builtin',
          name: 'Files',
          description: 'Builtin file capabilities.',
        },
        metadata: {
          correlationId: input.eventId,
          causationId: input.eventId,
          commandId: input.eventId,
          actorType: 'system',
          actorId: 'realmflow',
          occurredAt: 101,
        },
      },
    ],
    outbox: [],
  })
}

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
    skills: []
  }
}

function toolWithInvalidInputContract<
  T extends Awaited<ReturnType<typeof catalogFixture>>['tools'][number]
>(
  tool: T,
  version: { version: string; digest: string } = {
    version: tool.version,
    digest: tool.definitionDigest,
  },
): T {
  return {
    ...tool,
    version: version.version,
    definitionDigest: version.digest,
    definition: {
      ...tool.definition,
      version: version.version,
      definitionDigest: version.digest,
      package: {
        ...tool.definition.package,
        packageVersion: version.version,
        packageDigest: version.digest,
      },
      inputSchema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          path: {
            type: 'string',
          },
        },
        required: ['path'],
        examples: [{ path: 'README.md' }],
      },
    },
  }
}

function projectionStoreFixture(
  catalog: ToolCatalogState
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
