import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCapabilityDefinition,
  createCapabilityInstallation
} from '../../../../domain/capability'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteCapabilityCatalogRepository } from './capability-catalog-repository'

const directories: string[] = []
const databases: RealmFlowDatabase[] = []

afterEach(async () => {
  for (const database of databases.splice(0)) database.close()
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('SqliteCapabilityCatalogRepository', () => {
  it('publishes immutable definitions and resolves scoped installations', async () => {
    const repository = await createRepository()
    const capability = definition()
    await repository.publish(capability)
    const global = installation(capability, {
      id: 'install-global',
      scope: { kind: 'global' }
    })
    await repository.install(global)
    const disabled = installation(capability, {
      id: 'install-workspace-1',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      enabled: false,
      status: 'installed_disabled',
      installedAt: 200,
      updatedAt: 200
    })
    await repository.install(disabled)

    await expect(
      repository.resolve([
        { kind: 'global' },
        { kind: 'workspace', workspaceId: 'workspace-1' }
      ])
    ).resolves.toEqual([])
    await expect(
      repository.resolve([
        { kind: 'global' },
        { kind: 'workspace', workspaceId: 'workspace-2' }
      ])
    ).resolves.toEqual([
      { definition: capability, installation: global }
    ])
    await expect(
      repository.publish(
        definition({ manifestDigest: 'b'.repeat(64) })
      )
    ).rejects.toThrow('Capability immutable version digest conflicts')
  })

  it('enforces installation revision and appends one audit fact per update', async () => {
    const { repository, database } = await createHarness()
    const capability = definition()
    await repository.publish(capability)
    const current = installation(capability, {
      id: 'install-global',
      scope: { kind: 'global' }
    })
    await repository.install(current)
    const updated = createCapabilityInstallation({
      ...current,
      enabled: false,
      status: 'installed_disabled',
      revision: 2,
      updatedAt: 200
    })

    await repository.install(updated, 1)
    await expect(repository.install({
      ...updated,
      revision: 3,
      updatedAt: 300
    }, 1)).rejects.toThrow('Capability installation revision conflict')
    expect(
      database
        .prepare(
          `SELECT event_type, revision
           FROM capability_catalog_audit
           ORDER BY sequence`
        )
        .all()
    ).toEqual([
      { event_type: 'definition.published', revision: 1 },
      { event_type: 'installation.saved', revision: 1 },
      { event_type: 'installation.saved', revision: 2 }
    ])
  })

  it('returns reference details and preserves a referenced version', async () => {
    const repository = await createRepository()
    const capability = definition()
    await repository.publish(capability)
    await repository.bindReference({
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      ownerKind: 'workflow',
      ownerId: 'workflow-1',
      createdAt: 200
    })
    await repository.bindReference({
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      ownerKind: 'run',
      ownerId: 'run-1',
      createdAt: 201
    })

    await expect(
      repository.deleteVersion(capability.id, capability.version)
    ).resolves.toEqual({
      status: 'referenced',
      references: [
        { ownerKind: 'run', ownerId: 'run-1' },
        { ownerKind: 'workflow', ownerId: 'workflow-1' }
      ]
    })
    await expect(repository.listDefinitions()).resolves.toEqual([capability])
  })

  it('publishes and installs atomically when audit persistence fails', async () => {
    const { repository, database } = await createHarness()
    const capability = definition()
    const value = installation(capability, {
      enabled: false,
      status: 'installed_disabled'
    })
    database.exec(`
      CREATE TRIGGER reject_capability_install_audit
      BEFORE INSERT ON capability_catalog_audit
      WHEN NEW.event_type = 'installation.saved'
      BEGIN
        SELECT RAISE(ABORT, 'injected audit failure');
      END;
    `)

    await expect(
      repository.publishAndInstall(capability, value)
    ).rejects.toThrow('injected audit failure')

    await expect(repository.listDefinitions()).resolves.toEqual([])
    await expect(repository.listInstallations()).resolves.toEqual([])
  })

  it('rolls back Catalog writes when the transaction callback fails', async () => {
    const repository = await createRepository()
    const capability = definition()
    const value = installation(capability, {
      enabled: false,
      status: 'installed_disabled'
    })
    const packageDigest = 'c'.repeat(64)

    await expect(
      repository.publishAndInstall(
        capability,
        value,
        packageDigest,
        () => {
          throw new Error('injected generation failure')
        }
      )
    ).rejects.toThrow('injected generation failure')

    await expect(repository.listDefinitions()).resolves.toEqual([])
    await expect(repository.listInstallations()).resolves.toEqual([])
    await expect(repository.listReferencedPackageDigests()).resolves.toEqual(
      new Set()
    )
  })

  it('binds a managed package digest in the publish transaction', async () => {
    const { repository, database } = await createHarness()
    const capability = definition()
    const value = installation(capability, {
      enabled: false,
      status: 'installed_disabled'
    })
    const packageDigest = 'c'.repeat(64)

    await repository.publishAndInstall(capability, value, packageDigest)

    await expect(repository.listReferencedPackageDigests()).resolves.toEqual(
      new Set([packageDigest])
    )
    expect(
      database
        .prepare(
          `SELECT capability_id, capability_version, package_digest
           FROM capability_package_bindings`
        )
        .all()
    ).toEqual([
      {
        capability_id: capability.id,
        capability_version: capability.version,
        package_digest: packageDigest
      }
    ])
  })

  it('synchronizes legacy projections idempotently and advances revisions', async () => {
    const repository = await createRepository()
    const version1 = definition({ source: 'builtin' })
    const current = installation(version1, {
      id: `legacy-installation.${version1.id}`
    })

    await repository.synchronizeLegacy([
      { definition: version1, installation: current }
    ])
    await repository.synchronizeLegacy([
      { definition: version1, installation: current }
    ])
    const version2 = definition({
      version: '2.0.0',
      source: 'builtin',
      manifestDigest: 'd'.repeat(64),
      publishedAt: 200
    })
    await repository.synchronizeLegacy([
      {
        definition: version2,
        installation: installation(version2, {
          id: current.id,
          enabled: false,
          status: 'installed_disabled',
          installedAt: 200,
          updatedAt: 200
        })
      }
    ])

    await expect(repository.listInstallations()).resolves.toEqual([
      expect.objectContaining({
        capabilityVersion: '2.0.0',
        enabled: false,
        revision: 2,
        installedAt: 100
      })
    ])
  })
})

async function createRepository(): Promise<SqliteCapabilityCatalogRepository> {
  return (await createHarness()).repository
}

async function createHarness(): Promise<{
  database: RealmFlowDatabase
  repository: SqliteCapabilityCatalogRepository
}> {
  const directory = await mkdtemp(join(tmpdir(), 'realmflow-capability-'))
  directories.push(directory)
  const database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  databases.push(database)
  return {
    database,
    repository: new SqliteCapabilityCatalogRepository(database)
  }
}

function definition(
  input: Partial<Parameters<typeof createCapabilityDefinition>[0]> = {}
) {
  return createCapabilityDefinition({
    id: 'com.example.files.read',
    kind: 'tool',
    version: '1.0.0',
    source: 'local_upload',
    manifestDigest: 'a'.repeat(64),
    name: 'Read files',
    description: 'Read files.',
    runtime: { kind: 'tool', definitionId: 'files.read' },
    permissions: {
      capabilities: ['filesystem.read'],
      maximumRisk: 'low',
      pathPrefixes: ['/workspace'],
      networkTargets: []
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0 <1.0.0',
      platforms: ['darwin']
    },
    testPlan: [{ id: 'read', command: 'fixture:read' }],
    publishedAt: 100,
    ...input
  })
}

function installation(
  capability: ReturnType<typeof definition>,
  input: Partial<
    Parameters<typeof createCapabilityInstallation>[0]
  > = {}
) {
  return createCapabilityInstallation({
    id: 'install-global',
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    capabilityDigest: capability.definitionDigest,
    scope: { kind: 'global' },
    enabled: true,
    permissionCeiling: capability.permissions,
    status: 'enabled',
    revision: 1,
    installedAt: 100,
    updatedAt: 100,
    ...input
  })
}
