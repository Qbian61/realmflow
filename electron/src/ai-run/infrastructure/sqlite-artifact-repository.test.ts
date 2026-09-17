import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAiRun } from '../../../../domain/ai-run'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { createSqliteRepositories } from '../../infrastructure/sqlite/repositories'
import { SqliteArtifactRepository } from './sqlite-artifact-repository'

let directory: string
let workspaceRoot: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-artifact-transaction-'))
  workspaceRoot = join(directory, 'workspace')
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  const repositories = createSqliteRepositories(database)
  await repositories.workspaces.save(
    {
      id: 'workspace-1',
      path: '/spaces/one',
      label: 'One',
      description: '',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1
    },
    0
  )
  await repositories.requirements.save(
    {
      id: 'requirement-1',
      workspaceId: 'workspace-1',
      title: 'Requirement',
      stage: 'analysis',
      status: 'active',
      workspaceRootPath: workspaceRoot,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1
    },
    0
  )
  await repositories.aiRuns.save({
    ...createAiRun('run-1', 'requirement-1', 'design'),
    status: 'running',
    lastSequence: 3,
    content: '# Design'
  })
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

const completionEvent = {
  id: 'event-4',
  runId: 'run-1',
  sequence: 4,
  type: 'run.completed' as const,
  timestamp: new Date(400).toISOString(),
  data: {}
}

describe('SqliteArtifactRepository', () => {
  it('commits file, metadata, requirement stage and run completion atomically', async () => {
    const repository = new SqliteArtifactRepository(database)

    await repository.commit({
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design',
      artifact: {
        path: 'artifacts/design.md',
        content: '# Design'
      },
      completionEvent
    })

    await expect(
      readFile(join(workspaceRoot, 'artifacts', 'design.md'), 'utf8')
    ).resolves.toBe('# Design')
    expect(
      database
        .prepare(
          `SELECT relative_path, checksum, version, is_primary
           FROM artifacts WHERE requirement_id = ?`
        )
        .get('requirement-1')
    ).toMatchObject({
      relative_path: 'artifacts/design.md',
      checksum: expect.stringMatching(/^sha256:/),
      version: 1,
      is_primary: 1
    })
    expect(
      database
        .prepare('SELECT stage FROM requirements WHERE id = ?')
        .get('requirement-1')
    ).toEqual({ stage: 'design' })
    expect(
      database.prepare('SELECT status FROM ai_runs WHERE id = ?').get('run-1')
    ).toEqual({ status: 'completed' })
    expect(
      database
        .prepare(
          'SELECT type FROM ai_run_events WHERE run_id = ? AND sequence = ?'
        )
        .get('run-1', 4)
    ).toEqual({ type: 'run.completed' })
  })

  it('lists and reads only committed formal artifacts for knowledge sync', async () => {
    const repository = new SqliteArtifactRepository(database) as SqliteArtifactRepository & {
      listByRequirement: (requirementId: string) => Promise<
        Array<{
          id: string
          relativePath: string
          formal: boolean
        }>
      >
      readContent: (artifact: {
        requirementId: string
        relativePath: string
      }) => Promise<string>
    }
    await repository.commit({
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design',
      artifact: {
        path: 'artifacts/design.md',
        content: '# Formal design'
      },
      completionEvent
    })

    const artifacts = await repository.listByRequirement('requirement-1')

    expect(artifacts).toEqual([
      expect.objectContaining({
        relativePath: 'artifacts/design.md',
        formal: true
      })
    ])
    await expect(repository.readContent(artifacts[0] as never)).resolves.toBe(
      '# Formal design'
    )
  })

  it('versions primary artifacts independently for custom workflow nodes', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-custom-a',
        'requirement-1',
        'analysis',
        'custom-a'
      ),
      status: 'running'
    })
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-custom-b',
        'requirement-1',
        'analysis',
        'custom-b'
      ),
      status: 'running'
    })
    const repository = new SqliteArtifactRepository(database)

    for (const [runId, nodeId] of [
      ['run-custom-a', 'custom-a'],
      ['run-custom-b', 'custom-b']
    ] as const) {
      await repository.commit({
        runId,
        requirementId: 'requirement-1',
        stageId: 'analysis',
        nodeId,
        artifact: {
          path: `artifacts/${nodeId}.md`,
          content: `# ${nodeId}`
        },
        completionEvent: {
          ...completionEvent,
          id: `${runId}:completed`,
          runId
        }
      })
    }

    expect(
      database
        .prepare(
          `SELECT node_id, version, is_primary
           FROM artifacts WHERE node_id IN ('custom-a', 'custom-b')
           ORDER BY node_id`
        )
        .all()
    ).toEqual([
      { node_id: 'custom-a', version: 1, is_primary: 1 },
      { node_id: 'custom-b', version: 1, is_primary: 1 }
    ])
    expect(
      database.prepare('SELECT stage FROM requirements WHERE id = ?').get(
        'requirement-1'
      )
    ).toEqual({ stage: 'analysis' })
  })

  it('rolls back SQL, preserves the old file and removes temporary files when rename fails', async () => {
    const targetPath = join(workspaceRoot, 'artifacts', 'design.md')
    await mkdir(join(workspaceRoot, 'artifacts'), { recursive: true })
    await writeFile(targetPath, '# Existing', 'utf8')
    const repository = new SqliteArtifactRepository(database, {
      renameSync: vi.fn(() => {
        throw new Error('rename failed')
      })
    })

    await expect(
      repository.commit({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'design',
        artifact: {
          path: 'artifacts/design.md',
          content: '# Replacement'
        },
        completionEvent
      })
    ).rejects.toThrow('rename failed')

    await expect(readFile(targetPath, 'utf8')).resolves.toBe('# Existing')
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(0)
    expect(
      database.prepare('SELECT status FROM ai_runs WHERE id = ?').get('run-1')
    ).toEqual({ status: 'running' })
    expect(
      (await readdir(join(workspaceRoot, 'artifacts'))).filter((name) =>
        name.includes('.realmflow-')
      )
    ).toEqual([])
  })

  it('rejects a missing run before replacing an existing file', async () => {
    const targetPath = join(workspaceRoot, 'design.md')
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(targetPath, '# Existing', 'utf8')
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'missing-run',
        requirementId: 'requirement-1',
        stageId: 'design',
        artifact: { path: 'design.md', content: '# Replacement' },
        completionEvent: { ...completionEvent, runId: 'missing-run' }
      })
    ).rejects.toThrow('AI run was not found')

    await expect(readFile(targetPath, 'utf8')).resolves.toBe('# Existing')
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(0)
  })
})
