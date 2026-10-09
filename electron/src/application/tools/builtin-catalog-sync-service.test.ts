import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteToolEventStore } from '../../infrastructure/sqlite/tool-event-store'
import { SqliteToolProjectionStore } from '../../infrastructure/sqlite/tool-projection-store'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'
import { BuiltinCatalogSyncService } from './builtin-catalog-sync-service'
import { ToolCatalogService } from './tool-catalog-service'
import { ToolProjectionRunner } from './tool-projection-runner'

let directory: string
let database: RealmFlowDatabase
let events: SqliteToolEventStore
let projections: SqliteToolProjectionStore
let runner: ToolProjectionRunner
let loader: BuiltinCatalogLoader
let nextId: number

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-builtin-sync-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  events = new SqliteToolEventStore(database)
  projections = new SqliteToolProjectionStore(database)
  runner = new ToolProjectionRunner(events, projections, () => 300)
  loader = new BuiltinCatalogLoader(
    join(process.cwd(), 'resources', 'extensions', 'builtin')
  )
  nextId = 0
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('BuiltinCatalogSyncService', () => {
  it('publishes every missing builtin package and is idempotent', async () => {
    const service = createService(loader)

    await expect(service.synchronize()).resolves.toEqual({
      publishedPackages: 16,
      publishedTools: 118,
      publishedSkills: 10
    })
    await expect(service.synchronize()).resolves.toEqual({
      publishedPackages: 0,
      publishedTools: 0,
      publishedSkills: 0
    })

    const catalog = await projections.getCatalog()
    expect(catalog.packages).toHaveLength(16)
    expect(catalog.tools).toHaveLength(118)
    expect(catalog.skills).toHaveLength(10)
    expect(catalog.packages.every(({ status }) => status === 'enabled')).toBe(
      true
    )
  })

  it('keeps a disabled preference when a new builtin version is published', async () => {
    await createService(loader).synchronize()
    const catalogService = new ToolCatalogService({
      events,
      projections,
      projectionRunner: runner,
      now: () => 400,
      createId: () => `activation-${++nextId}`
    })
    await catalogService.setActivation({
      targetType: 'tool',
      targetId: 'builtin.files.read',
      enabled: false,
      idempotencyKey: 'disable-builtin-file-read'
    })
    const filesPackage = (await loader.load()).find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.files'
    )!
    const upgraded = {
      ...filesPackage,
      manifest: { ...filesPackage.manifest, version: '2.0.0' },
      packageDigest: 'f'.repeat(64),
      tools: filesPackage.tools.map((definition, index) => ({
        ...definition,
        version: '2.0.0',
        definitionDigest: index.toString(16).padStart(64, '0'),
        package: {
          ...definition.package,
          packageVersion: '2.0.0',
          packageDigest: 'f'.repeat(64)
        }
      }))
    }

    await createService({ load: async () => [upgraded] }).synchronize()

    const versions = (await projections.getCatalog()).tools.filter(
      ({ id }) => id === 'builtin.files.read'
    )
    expect(versions).toMatchObject([
      {
        version: '1.3.1',
        enabledPreference: false,
        status: 'disabled'
      },
      {
        version: '2.0.0',
        enabledPreference: false,
        status: 'disabled'
      }
    ])
  })

  it('publishes changed RealmFlow domain content under a new immutable version', async () => {
    const domainPackage = (await loader.load()).find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.domain'
    )!
    const previousPackage = {
      ...domainPackage,
      manifest: { ...domainPackage.manifest, version: '1.0.0' },
      packageDigest: 'a'.repeat(64),
      tools: [],
      skills: []
    }

    await createService({
      load: async () => [previousPackage]
    }).synchronize()

    await expect(
      createService({
        load: async () => [domainPackage]
      }).synchronize()
    ).resolves.toEqual({
      publishedPackages: 1,
      publishedTools: domainPackage.tools.length,
      publishedSkills: 0
    })

    expect(
      (await projections.getCatalog()).packages
        .filter(({ packageId }) => packageId === 'realmflow.builtin.domain')
        .map(({ version }) => version)
    ).toEqual(['1.0.0', '1.0.2'])
  })
})

function createService(loaderPort: {
  load: BuiltinCatalogLoader['load']
}) {
  return new BuiltinCatalogSyncService({
    loader: loaderPort,
    events,
    projections,
    projectionRunner: runner,
    now: () => 200,
    createId: () => `builtin-sync-${++nextId}`
  })
}
