import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnitOfWork } from '../ports/business-repositories'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteToolEventStore } from '../../infrastructure/sqlite/tool-event-store'
import { SqliteToolProjectionStore } from '../../infrastructure/sqlite/tool-projection-store'
import { SqliteUnitOfWork } from '../../infrastructure/sqlite/repositories'
import { ExtensionCatalogImportService } from './extension-catalog-import-service'
import { ExtensionPackageService } from './extension-package-service'
import { ToolProjectionRunner } from './tool-projection-runner'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import type { ToolRisk } from '../../../../domain/tool-definition'

let directory: string
let sourcePath: string
let userDataPath: string
let database: RealmFlowDatabase
let events: SqliteToolEventStore
let projections: SqliteToolProjectionStore
let runner: ToolProjectionRunner
let packages: ExtensionPackageService

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-extension-import-'))
  sourcePath = join(directory, 'source')
  userDataPath = join(directory, 'user-data')
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  events = new SqliteToolEventStore(database)
  projections = new SqliteToolProjectionStore(database)
  runner = new ToolProjectionRunner(events, projections, () => 300)
  packages = new ExtensionPackageService({
    userDataPath,
    realmFlowVersion: '0.1.0',
    platform: 'darwin',
    architecture: 'arm64',
    createId: () => 'staging-operation'
  })
  await writeExtensionPackage(sourcePath)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ExtensionCatalogImportService', () => {
  it('installs a v2 Plugin disabled and registers its Skills for review in the same transaction', async () => {
    await rm(sourcePath, { recursive: true, force: true })
    await writePluginPackage(sourcePath)
    const synchronizePluginPackage = vi.fn()
    const service = createService(
      new SqliteUnitOfWork(database),
      { synchronizePluginPackage },
    )

    const result = await service.importFromPath({
      sourcePath,
      idempotencyKey: 'import-review-plugin',
    })

    expect(result.package).toMatchObject({
      packageId: 'com.example.review-plugin',
      enabledPreference: false,
      status: 'disabled',
      plugin: {
        permissions: { maximumRisk: 'low' },
        contributions: [
          {
            kind: 'skill',
            id: 'com.example.review-plugin.review',
          },
        ],
      },
    })
    expect(result.skills).toMatchObject([
      {
        id: 'com.example.review-plugin.review',
        status: 'disabled',
      },
    ])
    expect(synchronizePluginPackage).toHaveBeenCalledWith({
      packageId: 'com.example.review-plugin',
      packageDigest: result.package.packageDigest,
      displayName: 'Review Plugin',
      risk: 'low',
      skills: [
        {
          definition: expect.objectContaining({
            id: 'com.example.review-plugin.review',
          }),
          instructions: 'Review the requested changes.\n',
        },
      ],
    })
  })

  it('commits the managed package, events, outbox, and catalog projection', async () => {
    const service = createService(new SqliteUnitOfWork(database))

    const result = await service.importFromPath({
      sourcePath,
      idempotencyKey: 'import-planning'
    })

    expect(result).toMatchObject({
      package: {
        packageId: 'com.example.planning',
        origin: 'local_upload',
        status: 'enabled'
      },
      tools: [],
      skills: [
        {
          id: 'com.example.planning.create',
          status: 'enabled'
        }
      ]
    })
    await expect(
      stat(
        join(
          userDataPath,
          'extensions',
          'packages',
          result.package.packageDigest
        )
      )
    ).resolves.toBeDefined()
    await expect(
      events.loadStream('extension-com.example.planning-1.0.0')
    ).resolves.toMatchObject([
      { eventType: 'extension.package_imported' },
      { eventType: 'extension.package_verified' },
      { eventType: 'skill.definition_published' },
      { eventType: 'extension.activation_changed' }
    ])
    expect(
      database
        .prepare(
          `SELECT topic, status FROM tool_outbox
           WHERE topic = 'catalog.refresh'`
        )
        .get()
    ).toEqual({ topic: 'catalog.refresh', status: 'pending' })
  })

  it('is idempotent and does not publish duplicate definition events', async () => {
    const service = createService(new SqliteUnitOfWork(database))
    const command = {
      sourcePath,
      idempotencyKey: 'import-planning'
    }

    const first = await service.importFromPath(command)
    const replay = await service.importFromPath(command)

    expect(replay).toEqual(first)
    await expect(
      events.loadStream('extension-com.example.planning-1.0.0')
    ).resolves.toHaveLength(4)
  })

  it('removes the final directory and rolls back events when SQLite commit fails', async () => {
    const sqlite = new SqliteUnitOfWork(database)
    const failingUnitOfWork: UnitOfWork = {
      execute: (operation) =>
        sqlite.execute(async () => {
          await operation()
          throw new Error('database commit failed')
        })
    }
    const service = createService(failingUnitOfWork)

    await expect(
      service.importFromPath({
        sourcePath,
        idempotencyKey: 'import-planning'
      })
    ).rejects.toThrow('database commit failed')

    expect(await events.scan(0, 100)).toEqual([])
    expect(await projections.getCatalog()).toEqual({
      packages: [],
      tools: [],
      skills: []
    })
    const packageRoot = join(userDataPath, 'extensions', 'packages')
    await expect(stat(packageRoot)).resolves.toBeDefined()
    expect(await import('node:fs/promises').then(({ readdir }) =>
      readdir(packageRoot)
    )).toEqual([])
  })

  it('rejects an unavailable required Tool before committing files or events', async () => {
    await writeExtensionPackage(sourcePath, [
      {
        toolId: 'missing.tool',
        versionRange: '^1.0.0',
        required: true
      }
    ])
    const service = createService(new SqliteUnitOfWork(database))

    await expect(
      service.importFromPath({
        sourcePath,
        idempotencyKey: 'import-missing-dependency'
      })
    ).rejects.toThrow('Extension Skill dependency is unavailable')

    expect(await events.scan(0, 100)).toEqual([])
    expect((await projections.getCatalog()).skills).toEqual([])
  })
})

function createService(
  unitOfWork: UnitOfWork,
  skillRegistry?: {
    synchronizePluginPackage: (input: {
      packageId: string
      packageDigest: string
      displayName: string
      risk: ToolRisk
      skills: Array<{
        definition: SkillDefinition
        instructions: string
      }>
    }) => unknown
  },
) {
  let id = 0
  return new ExtensionCatalogImportService({
    packages,
    events,
    projections,
    projectionRunner: runner,
    unitOfWork,
    ...(skillRegistry ? { skillRegistry } : {}),
    now: () => 200,
    createId: () => `import-event-${++id}`
  })
}

async function writePluginPackage(path: string): Promise<void> {
  await mkdir(join(path, 'skills'), { recursive: true })
  await mkdir(join(path, 'instructions'), { recursive: true })
  await writeFile(
    join(path, 'extension.json'),
    JSON.stringify({
      schemaVersion: 2,
      packageId: 'com.example.review-plugin',
      version: '1.0.0',
      name: 'Review Plugin',
      description: 'Review changes.',
      publisher: { name: 'Example' },
      compatibility: {
        realmflowVersionRange: '>=0.1.0 <1.0.0',
        platforms: ['darwin'],
        architectures: ['arm64'],
      },
      permissions: {
        capabilities: [],
        maximumRisk: 'low',
        pathPrefixes: [],
        networkTargets: [],
      },
      sandboxes: [],
      dependencies: [],
      contributions: {
        tools: [],
        skills: [{
          id: 'com.example.review-plugin.review',
          path: 'skills/review.json',
        }],
        connectors: [],
        modelProviders: [],
        webProviders: [],
        browserProviders: [],
        mediaProviders: [],
        hooks: [],
      },
    }),
  )
  await writeFile(
    join(path, 'skills', 'review.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'com.example.review-plugin.review',
      version: '1.0.0',
      name: 'Review changes',
      description: 'Review the requested changes.',
      instructionsPath: 'instructions/review.md',
      runtime: { kind: 'instruction' },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      requiredTools: [],
      activation: {
        intents: ['review'],
        contexts: ['general'],
      },
      limits: {
        maxToolCalls: 4,
        timeoutMs: 120_000,
      },
    }),
  )
  await writeFile(
    join(path, 'instructions', 'review.md'),
    'Review the requested changes.\n',
  )
}

async function writeExtensionPackage(
  path: string,
  requiredTools: Array<{
    toolId: string
    versionRange: string
    required: boolean
  }> = []
): Promise<void> {
  await mkdir(join(path, 'skills'), { recursive: true })
  await mkdir(join(path, 'instructions'), { recursive: true })
  await writeFile(
    join(path, 'extension.json'),
    JSON.stringify({
      schemaVersion: 1,
      packageId: 'com.example.planning',
      version: '1.0.0',
      name: 'Planning',
      description: 'Planning capabilities.',
      publisher: { name: 'Example' },
      compatibility: {
        realmflow: '>=0.1.0 <1.0.0',
        platforms: ['darwin'],
        architectures: ['arm64']
      },
      tools: [],
      skills: [{ path: 'skills/planning.json' }],
      assets: ['instructions/plan.md']
    })
  )
  await writeFile(
    join(path, 'skills', 'planning.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'com.example.planning.create',
      version: '1.0.0',
      name: 'Create plan',
      description: 'Create an implementation plan.',
      instructionsPath: 'instructions/plan.md',
    runtime: { kind: 'instruction' },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      requiredTools,
      activation: {
        intents: ['create implementation plan'],
        contexts: ['general', 'requirement']
      },
      limits: {
        maxToolCalls: 4,
        timeoutMs: 120_000
      }
    })
  )
  await writeFile(
    join(path, 'instructions', 'plan.md'),
    'Create a grounded implementation plan.\n'
  )
}
