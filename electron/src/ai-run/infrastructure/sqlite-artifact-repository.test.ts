import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAiRun } from '../../../../domain/ai-run'
import {
  completeDocumentDelivery,
  createDocumentDelivery,
  startDocumentDelivery
} from '../../../../domain/document-delivery'
import type { RequirementNode } from '../../../../domain/workflow'
import { NodeCompletionGateEvaluator } from '../../application/workflow/node-completion-gate-evaluator'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { createSqliteRepositories } from '../../infrastructure/sqlite/repositories'
import { SqliteDocumentDeliveryRepository } from '../../infrastructure/sqlite/document-delivery-repository'
import { SqliteArtifactRepository } from './sqlite-artifact-repository'

let directory: string
let workspaceRoot: string
let databasePath: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-artifact-transaction-'))
  workspaceRoot = join(directory, 'workspace')
  databasePath = join(directory, 'realmflow.db')
  database = openRealmFlowDatabase(databasePath)
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
const expectedDesignArtifact = {
  relativePath: 'artifacts/design.md',
  kind: 'markdown'
}

describe('SqliteArtifactRepository', () => {
  it.each([String.raw`artifacts\..\outside.md`, 'artifacts/./design.md'])(
    'rejects invalid artifact paths before creating the workspace: %s',
    async (path) => {
      const repository = new SqliteArtifactRepository(database)

      await expect(
        repository.commit({
          runId: 'run-1',
          requirementId: 'requirement-1',
          stageId: 'design',
          expectedArtifact: { ...expectedDesignArtifact, relativePath: path },
          artifact: { path, content: '# Invalid' },
          completionEvent
        })
      ).rejects.toThrow('Path is outside the bound workspace')
      await expect(stat(workspaceRoot)).rejects.toThrow()
    }
  )

  it('rejects artifact writes through a symbolic link outside the workspace', async () => {
    const outsideDirectory = join(directory, 'outside')
    await mkdir(workspaceRoot)
    await mkdir(outsideDirectory)
    await symlink(outsideDirectory, join(workspaceRoot, 'artifacts'))
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'design',
        expectedArtifact: expectedDesignArtifact,
        artifact: {
          path: 'artifacts/design.md',
          content: '# Escaped'
        },
        completionEvent
      })
    ).rejects.toThrow('Path is outside the bound workspace')
    await expect(stat(join(outsideDirectory, 'design.md'))).rejects.toThrow()
  })

  it('commits file, metadata, requirement stage and run completion atomically', async () => {
    const repository = new SqliteArtifactRepository(database)

    const result = await repository.commit({
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design',
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Design'
      },
      completionEvent
    })

    expect(result).toEqual({
      artifactId: expect.any(String),
      requirementId: 'requirement-1',
      nodeId: 'requirement-1:design',
      relativePath: 'artifacts/design.md',
      kind: 'markdown',
      checksum: expect.stringMatching(/^sha256:/),
      version: 1,
      byteSize: Buffer.byteLength('# Design', 'utf8'),
      committedAt: Date.parse(completionEvent.timestamp),
      idempotent: false
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
      expectedArtifact: expectedDesignArtifact,
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

    database
      .prepare(
        `UPDATE artifacts
         SET is_valid = 0, revision = revision + 1
         WHERE id = ?`
      )
      .run(artifacts[0]?.id)

    await expect(
      repository.listByRequirement('requirement-1')
    ).resolves.toEqual([])
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(1)
  })

  it('binds a node artifact to its current node run attempt', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowNodeRun(repositories)
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-node',
        'requirement-1',
        'design',
        'node-design'
      ),
      status: 'running',
      lastSequence: 3
    })
    const repository = new SqliteArtifactRepository(database)

    await repository.commit({
      runId: 'run-node',
      requirementId: 'requirement-1',
      stageId: 'design',
      nodeId: 'node-design',
      nodeRunId: 'node-run-design',
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Attempt design'
      },
      completionEvent: {
        ...completionEvent,
        id: 'run-node:completed',
        runId: 'run-node'
      }
    })

    expect(
      database
        .prepare(
          `SELECT node_run_id, is_valid
           FROM artifacts WHERE requirement_id = ?`
        )
        .get('requirement-1')
    ).toEqual({
      node_run_id: 'node-run-design',
      is_valid: 1
    })
  })

  it('rejects an artifact from an older node run attempt after rollback', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowNodeRun(repositories)
    await repositories.nodeRuns.save(
      {
        id: 'node-run-design-rollback',
        executionId: 'execution-design',
        nodeId: 'node-design',
        status: 'running',
        attempt: 2,
        createdAt: 2,
        updatedAt: 2
      },
      0
    )
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-node',
        'requirement-1',
        'design',
        'node-design'
      ),
      status: 'running',
      lastSequence: 3
    })
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-node',
        requirementId: 'requirement-1',
        stageId: 'design',
        nodeId: 'node-design',
        nodeRunId: 'node-run-design',
        expectedArtifact: expectedDesignArtifact,
        artifact: {
          path: 'artifacts/design.md',
          content: '# Stale design'
        },
        completionEvent: {
          ...completionEvent,
          id: 'run-node:completed',
          runId: 'run-node'
        }
      })
    ).rejects.toThrow('Node run is no longer the latest attempt')
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(0)
  })

  it('rejects a node artifact when the node run is bound to another AI run', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowNodeRun(repositories, 'another-run')
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-node',
        'requirement-1',
        'design',
        'node-design'
      ),
      status: 'running',
      lastSequence: 3
    })
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-node',
        requirementId: 'requirement-1',
        stageId: 'design',
        nodeId: 'node-design',
        nodeRunId: 'node-run-design',
        expectedArtifact: expectedDesignArtifact,
        artifact: {
          path: 'artifacts/design.md',
          content: '# Wrong run'
        },
        completionEvent: {
          ...completionEvent,
          id: 'run-node:completed',
          runId: 'run-node'
        }
      })
    ).rejects.toThrow('Node run is not bound to the completing AI run')
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(0)
  })

  it('rejects a node artifact when the node run can no longer complete', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowNodeRun(repositories)
    await repositories.nodeRuns.transition({
      nodeRunId: 'node-run-design',
      expectedRevision: 1,
      status: 'cancelled',
      reason: 'workflow_rolled_back',
      triggerSource: 'user',
      transitionedAt: 2
    })
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-node',
        'requirement-1',
        'design',
        'node-design'
      ),
      status: 'running',
      lastSequence: 3
    })
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-node',
        requirementId: 'requirement-1',
        stageId: 'design',
        nodeId: 'node-design',
        nodeRunId: 'node-run-design',
        expectedArtifact: expectedDesignArtifact,
        artifact: {
          path: 'artifacts/design.md',
          content: '# Cancelled design'
        },
        completionEvent: {
          ...completionEvent,
          id: 'run-node:completed',
          runId: 'run-node'
        }
      })
    ).rejects.toThrow('Node run cannot commit an artifact from cancelled')
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(0)
  })

  it('returns the original formal version for an exact completed-event replay', async () => {
    const repository = new SqliteArtifactRepository(database)
    const command = {
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design' as const,
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Design'
      },
      completionEvent
    }

    const committed = await repository.commit(command)
    const replayed = await repository.commit(command)

    expect(replayed).toEqual({ ...committed, idempotent: true })
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(1)
    expect(
      database.prepare('SELECT COUNT(*) FROM ai_run_events').pluck().get()
    ).toBe(1)
  })

  it('rejects a conflicting replay without creating another version or event', async () => {
    const repository = new SqliteArtifactRepository(database)
    const command = {
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design' as const,
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Design'
      },
      completionEvent
    }
    await repository.commit(command)

    await expect(
      repository.commit({
        ...command,
        artifact: { ...command.artifact, content: '# Changed' }
      })
    ).rejects.toThrow('Formal artifact commit conflicts with completed run')
    expect(
      database.prepare('SELECT COUNT(*) FROM artifacts').pluck().get()
    ).toBe(1)
    expect(
      database.prepare('SELECT COUNT(*) FROM ai_run_events').pluck().get()
    ).toBe(1)
  })

  it('rejects a stale completion sequence before creating workspace state', async () => {
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'design',
        expectedArtifact: expectedDesignArtifact,
        artifact: {
          path: 'artifacts/design.md',
          content: '# Design'
        },
        completionEvent: { ...completionEvent, sequence: 5 }
      })
    ).rejects.toThrow('AI run completion sequence conflicted')
    await expect(stat(workspaceRoot)).rejects.toThrow()
  })

  it('defends the trusted artifact specification before writing files', async () => {
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'design',
        expectedArtifact: {
          relativePath: 'artifacts/approved.md',
          kind: 'markdown'
        },
        artifact: {
          path: 'artifacts/design.md',
          content: '# Design'
        },
        completionEvent
      })
    ).rejects.toThrow(
      'Candidate artifact path does not match node configuration'
    )
    await expect(stat(workspaceRoot)).rejects.toThrow()
  })

  it('rejects a custom-node run when the commit omits its node target', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-custom',
        'requirement-1',
        'analysis',
        'custom-node'
      ),
      status: 'running',
      lastSequence: 3
    })
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-custom',
        requirementId: 'requirement-1',
        stageId: 'analysis',
        expectedArtifact: {
          relativePath: 'artifacts/custom.md',
          kind: 'markdown'
        },
        artifact: {
          path: 'artifacts/custom.md',
          content: '# Custom'
        },
        completionEvent: {
          ...completionEvent,
          id: 'run-custom:completed',
          runId: 'run-custom'
        }
      })
    ).rejects.toThrow('AI run does not match the artifact target')
    await expect(stat(workspaceRoot)).rejects.toThrow()
  })

  it('replaces the primary artifact with a monotonic version for the same node', async () => {
    const repositories = createSqliteRepositories(database)
    const repository = new SqliteArtifactRepository(database)
    const firstCommand = {
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design' as const,
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Version 1'
      },
      completionEvent
    }
    const first = await repository.commit(firstCommand)
    await repositories.aiRuns.save({
      ...createAiRun('run-2', 'requirement-1', 'design'),
      status: 'running',
      lastSequence: 3
    })

    const result = await repository.commit({
      runId: 'run-2',
      requirementId: 'requirement-1',
      stageId: 'design',
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Version 2'
      },
      completionEvent: {
        ...completionEvent,
        id: 'run-2:completed',
        runId: 'run-2',
        timestamp: new Date(800).toISOString()
      }
    })

    expect(result.version).toBe(2)
    expect(
      database
        .prepare(
          `SELECT version, is_primary FROM artifacts
           WHERE requirement_id = ? ORDER BY version`
        )
        .all('requirement-1')
    ).toEqual([
      { version: 1, is_primary: 0 },
      { version: 2, is_primary: 1 }
    ])
    await expect(
      readFile(join(workspaceRoot, 'artifacts', 'design.md'), 'utf8')
    ).resolves.toBe('# Version 2')
    await expect(repository.commit(firstCommand)).resolves.toEqual({
      ...first,
      idempotent: true
    })
  })

  it('exposes only the committed primary artifact to the completion gate', async () => {
    const repository = new SqliteArtifactRepository(database)
    const repositories = createSqliteRepositories(database)
    const node: RequirementNode = {
      id: 'requirement-1:design',
      type: 'ai_generate',
      name: 'Design',
      description: '',
      order: 0,
      status: 'running',
      allowSkip: false,
      executor: {
        kind: 'ai_generate',
        prompt: 'Design the requirement.',
        artifact: expectedDesignArtifact,
        legacyStageId: 'design'
      }
    }
    const evaluator = new NodeCompletionGateEvaluator({
      artifacts: repositories.artifacts,
      todos: { listByNodeRun: vi.fn().mockResolvedValue([]) },
      questions: { listByNodeRun: vi.fn().mockResolvedValue([]) },
      approvals: { getByNodeRun: vi.fn().mockResolvedValue(undefined) }
    })
    const input = {
      requirementId: 'requirement-1',
      node,
      nodeRun: {
        id: 'node-run-1',
        executionId: 'execution-1',
        nodeId: node.id,
        status: 'running' as const,
        attempt: 1,
        createdAt: 1,
        updatedAt: 1,
        revision: 1
      },
      executionFinished: true
    }

    await expect(evaluator.evaluate(input)).resolves.toMatchObject({
      allowed: false,
      reasons: ['required_artifact_invalid']
    })
    await repository.commit({
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design',
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Design'
      },
      completionEvent
    })
    await expect(evaluator.evaluate(input)).resolves.toMatchObject({
      allowed: true,
      requiredArtifactsValid: true,
      reasons: []
    })
  })

  it('recovers the formal file, metadata, run and event after reopening SQLite', async () => {
    const repository = new SqliteArtifactRepository(database)
    const committed = await repository.commit({
      runId: 'run-1',
      requirementId: 'requirement-1',
      stageId: 'design',
      expectedArtifact: expectedDesignArtifact,
      artifact: {
        path: 'artifacts/design.md',
        content: '# Durable design'
      },
      completionEvent
    })
    database.close()
    database = openRealmFlowDatabase(databasePath)
    const reopened = new SqliteArtifactRepository(database)

    await expect(
      readFile(join(workspaceRoot, 'artifacts', 'design.md'), 'utf8')
    ).resolves.toBe('# Durable design')
    await expect(reopened.listByRequirement('requirement-1')).resolves.toEqual([
      expect.objectContaining({
        id: committed.artifactId,
        checksum: committed.checksum,
        version: 1,
        formal: true
      })
    ])
    expect(
      database
        .prepare(
          `SELECT status, last_sequence, artifact_id
           FROM ai_runs WHERE id = ?`
        )
        .get('run-1')
    ).toEqual({
      status: 'completed',
      last_sequence: 4,
      artifact_id: committed.artifactId
    })
    expect(
      database
        .prepare(
          `SELECT id, type FROM ai_run_events
           WHERE run_id = ? AND sequence = ?`
        )
        .get('run-1', 4)
    ).toEqual({ id: 'event-4', type: 'run.completed' })
  })

  it('registers verified binary metadata and blocks completion after checksum tampering', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowNodeRun(repositories)
    const relativePath = 'artifacts/report.pdf'
    const targetPath = join(workspaceRoot, relativePath)
    const bytes = Buffer.from('%PDF-1.7 verified')
    await mkdir(join(workspaceRoot, 'artifacts'), { recursive: true })
    await writeFile(targetPath, bytes)
    const artifactChecksum = `sha256:${createHash('sha256')
      .update(bytes)
      .digest('hex')}`
    const requested = createDocumentDelivery({
      requestId: 'verify-report',
      input: {
        kind: 'verify',
        path: relativePath,
        format: 'pdf',
        expectedChecksum: artifactChecksum
      },
      requestedAt: 10
    })
    const journal = new SqliteDocumentDeliveryRepository(database)
    await journal.request({
      delivery: requested,
      scopeRoot: workspaceRoot,
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-design'
    })
    const running = startDocumentDelivery(requested, 11)
    await journal.markRunning(requested.requestId, 11)
    const receipt = await journal.complete(
      completeDocumentDelivery(running, {
        completedAt: 12,
        artifact: {
          path: relativePath,
          format: 'pdf',
          checksum: artifactChecksum,
          byteSize: bytes.byteLength,
          pageCount: 1,
          verified: true
        }
      })
    )
    await expect(journal.listUnregisteredVerified()).resolves.toEqual([
      expect.objectContaining({
        receiptId: receipt.id,
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-design'
      })
    ])

    const artifact = await repositories.artifacts.registerVerifiedBinary({
      receiptId: receipt.id,
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-design',
      relativePath,
      format: 'pdf',
      checksum: artifactChecksum,
      byteSize: bytes.byteLength,
      registeredAt: 12
    })
    await expect(journal.listUnregisteredVerified()).resolves.toEqual([])

    expect(artifact).toMatchObject({
      nodeId: 'node-design',
      nodeRunId: 'node-run-design',
      relativePath,
      kind: 'pdf',
      mediaType: 'application/pdf',
      verificationReceiptId: receipt.id,
      checksum: artifactChecksum,
      byteSize: bytes.byteLength,
      isPrimary: true
    })
    expect(
      database.prepare("PRAGMA table_info('artifacts')").all()
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'content' })
      ])
    )
    const evaluator = new NodeCompletionGateEvaluator({
      artifacts: repositories.artifacts,
      todos: { listByNodeRun: vi.fn().mockResolvedValue([]) },
      questions: { listByNodeRun: vi.fn().mockResolvedValue([]) },
      approvals: { getByNodeRun: vi.fn().mockResolvedValue(undefined) }
    })
    const node: RequirementNode = {
      id: 'node-design',
      type: 'ai_generate',
      name: 'Document delivery',
      description: '',
      order: 0,
      status: 'running',
      allowSkip: false,
      executor: {
        kind: 'ai_generate',
        prompt: 'Deliver the report.',
        artifact: { relativePath, kind: 'pdf' }
      }
    }
    const gateInput = {
      requirementId: 'requirement-1',
      node,
      nodeRun: {
        id: 'node-run-design',
        executionId: 'execution-design',
        nodeId: node.id,
        status: 'running' as const,
        attempt: 1,
        createdAt: 1,
        updatedAt: 1,
        revision: 1
      },
      executionFinished: true
    }

    await expect(evaluator.evaluate(gateInput)).resolves.toMatchObject({
      allowed: true,
      reasons: []
    })
    await writeFile(targetPath, '%PDF-1.7 tampered')
    await expect(evaluator.evaluate(gateInput)).resolves.toMatchObject({
      allowed: false,
      reasons: ['required_artifact_invalid']
    })
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
      status: 'running',
      lastSequence: 3
    })
    await repositories.aiRuns.save({
      ...createAiRun(
        'run-custom-b',
        'requirement-1',
        'analysis',
        'custom-b'
      ),
      status: 'running',
      lastSequence: 3
    })
    await seedCustomWorkflowNodeRuns(repositories)
    const repository = new SqliteArtifactRepository(database)

    for (const [runId, nodeId, nodeRunId] of [
      ['run-custom-a', 'custom-a', 'node-run-custom-a'],
      ['run-custom-b', 'custom-b', 'node-run-custom-b']
    ] as const) {
      await repository.commit({
        runId,
        requirementId: 'requirement-1',
        stageId: 'analysis',
        nodeId,
        nodeRunId,
        expectedArtifact: {
          relativePath: `artifacts/${nodeId}.md`,
          kind: 'markdown'
        },
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
        expectedArtifact: expectedDesignArtifact,
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

  it('rolls back metadata and cleans temporary files when audit insertion fails', async () => {
    const targetPath = join(workspaceRoot, 'artifacts', 'design.md')
    await mkdir(join(workspaceRoot, 'artifacts'), { recursive: true })
    await writeFile(targetPath, '# Existing', 'utf8')
    database.exec(`
      CREATE TRIGGER reject_completion_event
      BEFORE INSERT ON ai_run_events
      BEGIN
        SELECT RAISE(ABORT, 'audit insert failed');
      END
    `)
    const repository = new SqliteArtifactRepository(database)

    await expect(
      repository.commit({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'design',
        expectedArtifact: expectedDesignArtifact,
        artifact: {
          path: 'artifacts/design.md',
          content: '# Replacement'
        },
        completionEvent
      })
    ).rejects.toThrow('audit insert failed')

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
        expectedArtifact: {
          relativePath: 'design.md',
          kind: 'markdown'
        },
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

async function seedWorkflowNodeRun(
  repositories: ReturnType<typeof createSqliteRepositories>,
  aiRunId = 'run-node'
): Promise<void> {
  await repositories.aiRuns.save({
    ...createAiRun(
      aiRunId,
      'requirement-1',
      'design',
      'node-design'
    ),
    status: 'running',
    lastSequence: 3
  })
  await repositories.requirementWorkflows.save(
    {
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 0,
      maxParallelism: 1,
      nodes: [
        {
          id: 'node-design',
          type: 'ai_generate',
          name: 'Design',
          description: '',
          order: 0,
          status: 'running',
          allowSkip: false
        }
      ],
      edges: []
    },
    0,
    { reason: 'workflow_created', triggerSource: 'system' }
  )
  database
    .prepare(
      `INSERT INTO workflow_executions (
        id, requirement_id, status, current_node_id, revision, created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'execution-design',
      'requirement-1',
      'running',
      'node-design',
      1,
      1,
      1
    )
  await repositories.nodeRuns.save(
    {
      id: 'node-run-design',
      executionId: 'execution-design',
      nodeId: 'node-design',
      aiRunId,
      status: 'running',
      attempt: 1,
      createdAt: 1,
      updatedAt: 1
    },
    0
  )
}

async function seedCustomWorkflowNodeRuns(
  repositories: ReturnType<typeof createSqliteRepositories>
): Promise<void> {
  await repositories.requirementWorkflows.save(
    {
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 0,
      maxParallelism: 2,
      nodes: [
        {
          id: 'custom-a',
          type: 'ai_generate',
          name: 'Custom A',
          description: '',
          order: 0,
          status: 'running',
          allowSkip: false
        },
        {
          id: 'custom-b',
          type: 'ai_generate',
          name: 'Custom B',
          description: '',
          order: 1,
          status: 'running',
          allowSkip: false
        }
      ],
      edges: []
    },
    0,
    { reason: 'workflow_created', triggerSource: 'system' }
  )
  database
    .prepare(
      `INSERT INTO workflow_executions (
        id, requirement_id, status, current_node_id, revision, created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'execution-custom',
      'requirement-1',
      'running',
      'custom-a',
      1,
      1,
      1
    )
  for (const [id, nodeId, aiRunId] of [
    ['node-run-custom-a', 'custom-a', 'run-custom-a'],
    ['node-run-custom-b', 'custom-b', 'run-custom-b']
  ] as const) {
    await repositories.nodeRuns.save(
      {
        id,
        executionId: 'execution-custom',
        nodeId,
        aiRunId,
        status: 'running',
        attempt: 1,
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
  }
}
