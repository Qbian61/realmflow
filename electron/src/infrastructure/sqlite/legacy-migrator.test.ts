import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import {
  LegacyDataMigrator,
  LegacyMigrationError
} from './legacy-migrator'

let directory: string
let database: RealmFlowDatabase
let rendererStatePath: string
let bindingsPath: string
let workspaceRoot: string
let backupDirectory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-legacy-'))
  rendererStatePath = join(directory, 'renderer-state.json')
  bindingsPath = join(directory, 'workspace-bindings.json')
  workspaceRoot = join(directory, 'requirement-workspace')
  backupDirectory = join(directory, 'backups')
  await mkdir(join(workspaceRoot, '.realmflow'), { recursive: true })
  await mkdir(join(workspaceRoot, 'artifacts'), { recursive: true })
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

async function writeValidLegacyData(): Promise<void> {
  await writeFile(
    rendererStatePath,
    JSON.stringify({
      workspaceNavigation: {
        revision: 4,
        value: {
          version: 1,
          spaces: [
            {
              path: '/spaces/one',
              label: 'One',
              description: 'Legacy workspace'
            }
          ],
          requirementsBySpace: {
            '/spaces/one': [
              {
                id: 'requirement-1',
                title: 'Legacy requirement',
                stage: 'analysis',
                status: 'active',
                updatedAt: 100
              }
            ]
          }
        }
      },
      chatSessions: {
        revision: 3,
        value: {
          version: 4,
          sessions: [
            {
              id: 'session-1',
              title: 'Legacy chat',
              spacePath: '/spaces/one',
              createdAt: 90,
              updatedAt: 110,
              messages: [
                {
                  id: 'message-1',
                  role: 'user',
                  content: 'Hello',
                  createdAt: 90
                }
              ]
            }
          ]
        }
      },
      spaceResources: {
        revision: 2,
        value: {
          version: 1,
          resourcesBySpace: {
            '/spaces/one': [
              {
                id: 'resource-1',
                name: 'Source',
                type: 'repository',
                locator: 'https://example.com/repo.git',
                detail: 'Legacy source',
                updatedAt: 120
              }
            ]
          }
        }
      }
    }),
    'utf8'
  )
  await writeFile(
    bindingsPath,
    JSON.stringify({ 'requirement-1': workspaceRoot }),
    'utf8'
  )
  await writeFile(
    join(workspaceRoot, '.realmflow', 'requirement.json'),
    JSON.stringify({
      version: 1,
      requirementId: 'requirement-1',
      stages: {
        analysis: {
          artifacts: [{ path: 'artifacts/analysis.md', primary: true }]
        }
      }
    }),
    'utf8'
  )
  await writeFile(
    join(workspaceRoot, 'artifacts', 'analysis.md'),
    '# Legacy analysis',
    'utf8'
  )
}

function createMigrator(): LegacyDataMigrator {
  return new LegacyDataMigrator(database, {
    rendererStatePath,
    bindingsPath,
    backupDirectory,
    now: () => 1_700_000_000_000
  })
}

describe('LegacyDataMigrator', () => {
  it('imports validated legacy data in one transaction and preserves a backup', async () => {
    await writeValidLegacyData()

    const report = await createMigrator().migrate()

    expect(report.status).toBe('imported')
    expect(report.counts).toEqual({
      workspaces: 1,
      requirements: 1,
      chatSessions: 1,
      chatMessages: 1,
      spaceResources: 1,
      artifacts: 1
    })
    expect(
      database.prepare('SELECT revision FROM dataset_revisions').all()
    ).toEqual(
      expect.arrayContaining([
        { revision: 4 },
        { revision: 3 },
        { revision: 2 }
      ])
    )
    expect(
      database
        .prepare(
          `SELECT workspace_root_path FROM requirements WHERE id = ?`
        )
        .get('requirement-1')
    ).toEqual({ workspace_root_path: workspaceRoot })
    expect(
      database
        .prepare(
          `SELECT relative_path, checksum, byte_size FROM artifacts
           WHERE requirement_id = ?`
        )
        .get('requirement-1')
    ).toMatchObject({
      relative_path: 'artifacts/analysis.md',
      checksum: expect.stringMatching(/^sha256:/),
      byte_size: 17
    })
    expect(report.backupPath).toBeTruthy()
    await expect(
      readFile(join(report.backupPath!, 'renderer-state.json'), 'utf8')
    ).resolves.toContain('Legacy requirement')
    expect(
      database.prepare('SELECT COUNT(*) FROM legacy_imports').pluck().get()
    ).toBe(1)
  })

  it('is idempotent after a successful import', async () => {
    await writeValidLegacyData()
    const migrator = createMigrator()

    await expect(migrator.migrate()).resolves.toMatchObject({
      status: 'imported'
    })
    await writeFile(rendererStatePath, '{broken', 'utf8')
    await expect(migrator.migrate()).resolves.toMatchObject({
      status: 'already-imported'
    })
    expect(
      database.prepare('SELECT COUNT(*) FROM workspaces').pluck().get()
    ).toBe(1)
  })

  it('reports invalid records and rolls back without changing source files', async () => {
    await writeValidLegacyData()
    const original = await readFile(rendererStatePath, 'utf8')
    const parsed = JSON.parse(original) as {
      workspaceNavigation: {
        value: { spaces: Array<{ label: unknown }> }
      }
    }
    parsed.workspaceNavigation.value.spaces[0].label = 42
    await writeFile(rendererStatePath, JSON.stringify(parsed), 'utf8')
    const corrupted = await readFile(rendererStatePath, 'utf8')

    const error = await createMigrator()
      .migrate()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(LegacyMigrationError)
    expect((error as LegacyMigrationError).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'renderer-state.json',
          path: 'workspaceNavigation.value.spaces[0]'
        })
      ])
    )
    expect(
      database.prepare('SELECT COUNT(*) FROM workspaces').pluck().get()
    ).toBe(0)
    expect(
      database.prepare('SELECT COUNT(*) FROM legacy_imports').pluck().get()
    ).toBe(0)
    await expect(readFile(rendererStatePath, 'utf8')).resolves.toBe(corrupted)
  })

  it('rolls back all imported rows when a related manifest is invalid', async () => {
    await writeValidLegacyData()
    const manifestPath = join(
      workspaceRoot,
      '.realmflow',
      'requirement.json'
    )
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        requirementId: 'another-requirement',
        stages: {}
      }),
      'utf8'
    )

    await expect(createMigrator().migrate()).rejects.toBeInstanceOf(
      LegacyMigrationError
    )
    expect(
      database.prepare('SELECT COUNT(*) FROM requirements').pluck().get()
    ).toBe(0)
    await expect(readFile(manifestPath, 'utf8')).resolves.toContain(
      'another-requirement'
    )
  })

  it('wraps transaction failures with diagnostics and preserves source data', async () => {
    await writeValidLegacyData()
    const original = await readFile(rendererStatePath, 'utf8')
    const parsed = JSON.parse(original) as {
      workspaceNavigation: {
        value: {
          requirementsBySpace: Record<string, Array<Record<string, unknown>>>
        }
      }
    }
    const requirements =
      parsed.workspaceNavigation.value.requirementsBySpace['/spaces/one']
    requirements.push({ ...requirements[0] })
    await writeFile(rendererStatePath, JSON.stringify(parsed), 'utf8')
    const duplicated = await readFile(rendererStatePath, 'utf8')

    const error = await createMigrator()
      .migrate()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(LegacyMigrationError)
    expect((error as LegacyMigrationError).diagnostics).toEqual([
      expect.objectContaining({
        source: 'realmflow.db',
        path: 'transaction',
        message: expect.stringContaining('UNIQUE constraint failed')
      })
    ])
    expect(
      database.prepare('SELECT COUNT(*) FROM workspaces').pluck().get()
    ).toBe(0)
    expect(
      database.prepare('SELECT COUNT(*) FROM legacy_imports').pluck().get()
    ).toBe(0)
    await expect(readFile(rendererStatePath, 'utf8')).resolves.toBe(duplicated)
  })
})
