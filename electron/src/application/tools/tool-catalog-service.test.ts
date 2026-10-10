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
    skills: []
  }
}

function projectionStoreFixture(
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
