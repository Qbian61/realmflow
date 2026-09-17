import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAiRun } from '../../../../domain/ai-run'
import type {
  ModelCallMetric,
  ModelProfile,
  ModelProvider
} from '../../../../domain/model'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  ArtifactMetadataRecord,
  ChatSessionRecord,
  NodeQuestionRecord,
  NodeRunRecord,
  NodeTodoRecord,
  RequirementRecord,
  SpaceResourceRecord,
  WorkRootRecord,
  WorkflowDispatchRecord,
  WorkspaceRecord
} from '../../application/ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { createSqliteRepositories } from './repositories'

let directory: string
let database: RealmFlowDatabase

const workspace: WorkspaceRecord = {
  id: 'workspace-1',
  path: '/spaces/one',
  label: 'One',
  description: 'Workspace one',
  rootPath: '/tmp/workspace-one',
  sortOrder: 0,
  createdAt: 10,
  updatedAt: 10
}

const requirement: RequirementRecord = {
  id: 'requirement-1',
  workspaceId: workspace.id,
  title: 'Requirement one',
  stage: 'analysis',
  status: 'active',
  bodyRelativePath: 'requirement.md',
  sortOrder: 0,
  createdAt: 20,
  updatedAt: 20
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-repositories-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SQLite business repositories', () => {
  it('keeps exactly one current work root without moving existing roots', async () => {
    const { workRoots } = createSqliteRepositories(database)
    const first: WorkRootRecord = {
      id: 'root-1',
      path: '/work/one',
      isCurrent: true,
      createdAt: 1,
      lastUsedAt: 1
    }
    const second: WorkRootRecord = {
      id: 'root-2',
      path: '/work/two',
      isCurrent: true,
      createdAt: 2,
      lastUsedAt: 2
    }

    await expect(workRoots.setCurrent(first, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: { ...first, revision: 1 }
    })
    await expect(workRoots.setCurrent(second, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: { ...second, revision: 1 }
    })

    await expect(workRoots.getCurrent()).resolves.toEqual({
      ...second,
      revision: 1
    })
    await expect(workRoots.list()).resolves.toEqual([
      { ...first, isCurrent: false, revision: 2 },
      { ...second, revision: 1 }
    ])
  })

  it('supports workspace CRUD and rejects stale revisions', async () => {
    const { workspaces } = createSqliteRepositories(database)

    const created = await workspaces.save(workspace, 0)
    expect(created).toEqual({
      status: 'saved',
      entity: { ...workspace, revision: 1 }
    })

    const updatedWorkspace = { ...workspace, label: 'Renamed', updatedAt: 11 }
    const updated = await workspaces.save(updatedWorkspace, 1)
    const stale = await workspaces.save(
      { ...workspace, label: 'Stale', updatedAt: 12 },
      1
    )

    expect(updated.status).toBe('saved')
    expect(stale).toEqual({
      status: 'conflict',
      entity: { ...updatedWorkspace, revision: 2 }
    })
    await expect(workspaces.getByPath(workspace.path)).resolves.toEqual({
      ...updatedWorkspace,
      revision: 2
    })
    await expect(workspaces.delete(workspace.id, 1)).resolves.toBe(false)
    await expect(workspaces.delete(workspace.id, 2)).resolves.toBe(true)
  })

  it('saves requirement workflow aggregates with entity-level CAS', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)
    const aggregate: RequirementWorkflow = {
      requirementId: requirement.id,
      templateVersionId: 'builtin-sdlc-v1',
      revision: 0,
      nodes: [
        {
          id: 'node-analysis',
          type: 'ai_generate',
          name: 'Analysis',
          description: '',
          order: 0,
          status: 'ready',
          allowSkip: false,
          completionGate: {
            requireApproval: true,
            customGateId: 'analysis-policy'
          },
          executor: {
            kind: 'ai_generate',
            prompt: 'Analyze the requirement.',
            artifact: {
              relativePath: 'artifacts/analysis.md',
              kind: 'markdown'
            },
            legacyStageId: 'analysis'
          }
        },
        {
          id: 'node-design',
          type: 'ai_generate',
          name: 'Design',
          description: '',
          order: 1,
          status: 'pending',
          allowSkip: false
        }
      ],
      edges: [
        {
          id: 'edge-analysis-design',
          sourceNodeId: 'node-analysis',
          targetNodeId: 'node-design'
        }
      ]
    }

    const created = await repositories.requirementWorkflows.save(aggregate, 0)
    expect(created).toMatchObject({
      status: 'saved',
      entity: { revision: 1 }
    })

    const updated = {
      ...aggregate,
      revision: 1,
      nodes: aggregate.nodes.map((node) =>
        node.id === 'node-analysis' ? { ...node, name: 'Discovery' } : node
      )
    }
    await expect(
      repositories.requirementWorkflows.save(updated, 1)
    ).resolves.toMatchObject({ status: 'saved', entity: { revision: 2 } })
    await expect(
      repositories.requirementWorkflows.save(aggregate, 1)
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { revision: 2 }
    })
    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      revision: 2,
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'node-analysis',
          name: 'Discovery',
          executor: aggregate.nodes[0].executor,
          completionGate: aggregate.nodes[0].completionGate
        })
      ])
    })
  })

  it('persists requirements, sessions, messages, resources and artifacts', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)

    const session: ChatSessionRecord = {
      id: 'session-1',
      kind: 'requirement_node',
      workspaceId: workspace.id,
      requirementId: requirement.id,
      title: 'Discussion',
      sortOrder: 0,
      createdAt: 30,
      updatedAt: 31,
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'Question',
          sortOrder: 0,
          createdAt: 30
        },
        {
          id: 'message-2',
          role: 'assistant',
          content: 'Answer',
          sortOrder: 1,
          createdAt: 31
        }
      ]
    }
    const resource: SpaceResourceRecord = {
      id: 'resource-1',
      workspaceId: workspace.id,
      name: 'Repository',
      type: 'repository',
      locator: 'https://example.com/repo.git',
      detail: 'Main source',
      sortOrder: 0,
      createdAt: 40,
      updatedAt: 40
    }
    const artifact: ArtifactMetadataRecord = {
      id: 'artifact-1',
      requirementId: requirement.id,
      stageId: 'analysis',
      nodeId: 'custom-analysis',
      relativePath: 'artifacts/analysis.md',
      kind: 'markdown',
      checksum: 'sha256:abc',
      version: 1,
      byteSize: 42,
      isPrimary: true,
      createdAt: 50,
      updatedAt: 50
    }

    await repositories.chatSessions.save(session, 0)
    await repositories.spaceResources.save(resource, 0)
    await repositories.artifacts.save(artifact, 0)

    await expect(
      repositories.requirements.listByWorkspace(workspace.id)
    ).resolves.toEqual([{ ...requirement, revision: 1 }])
    await expect(
      repositories.chatSessions.listByWorkspace(workspace.id)
    ).resolves.toEqual([{ ...session, revision: 1 }])
    await expect(
      repositories.spaceResources.listByWorkspace(workspace.id)
    ).resolves.toEqual([{ ...resource, revision: 1 }])
    await expect(
      repositories.artifacts.listByRequirement(requirement.id)
    ).resolves.toEqual([{ ...artifact, revision: 1 }])
  })

  it('persists folder-bound general chats and excludes node chats from recent', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)

    const general = {
      id: 'session-general',
      kind: 'general',
      folderPath: '/tmp/task-folder',
      title: 'General chat',
      sortOrder: 0,
      messages: [],
      createdAt: 60,
      updatedAt: 60
    } as unknown as ChatSessionRecord
    const node = {
      id: 'session-node',
      kind: 'requirement_node',
      workspaceId: workspace.id,
      requirementId: requirement.id,
      nodeRunId: 'node-run-1',
      title: 'Node chat',
      sortOrder: 1,
      messages: [
        {
          id: 'message-tool',
          role: 'tool',
          content: 'Tool output',
          sortOrder: 0,
          createdAt: 61
        }
      ],
      createdAt: 61,
      updatedAt: 61
    } as unknown as ChatSessionRecord

    await repositories.chatSessions.save(general, 0)
    await repositories.chatSessions.save(node, 0)

    const recentRepository = repositories.chatSessions as unknown as {
      listRecent: () => Promise<Array<ChatSessionRecord & { revision: number }>>
    }
    await expect(recentRepository.listRecent()).resolves.toEqual([
      { ...general, revision: 1 }
    ])
  })

  it('persists node runs and only scans interrupted work for recovery', async () => {
    const repositories = createSqliteRepositories(database) as ReturnType<
      typeof createSqliteRepositories
    > & {
      nodeRuns: {
        save: (
          entity: NodeRunRecord,
          expectedRevision: number
        ) => Promise<unknown>
        get: (id: string) => Promise<unknown>
        listInterrupted: () => Promise<unknown[]>
      }
    }
    await seedWorkflowExecution(repositories)
    const interrupted = nodeRun('node-run-interrupted', 'interrupted')
    const paused = nodeRun('node-run-paused', 'paused', 2)

    await repositories.nodeRuns.save(interrupted, 0)
    await repositories.nodeRuns.save(paused, 0)
    await expect(
      repositories.nodeRuns.save(
        { ...interrupted, status: 'running', updatedAt: 72 },
        0
      )
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { ...interrupted, revision: 1 }
    })
    await expect(repositories.nodeRuns.listInterrupted()).resolves.toEqual([
      { ...interrupted, revision: 1 }
    ])
  })

  it('enqueues workflow dispatches idempotently and claims retries with CAS', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-dispatch', 'ready')
    await repositories.nodeRuns.save(run, 0)
    const dispatch: WorkflowDispatchRecord = {
      id: 'execution-1:trigger-run:node-analysis',
      executionId: 'execution-1',
      requirementId: requirement.id,
      nodeId: 'node-analysis',
      nodeRunId: run.id,
      triggerNodeRunId: run.id,
      status: 'pending',
      attempts: 0,
      createdAt: 72,
      updatedAt: 72
    }

    await expect(repositories.workflowDispatches.enqueue(dispatch)).resolves.toEqual({
      ...dispatch,
      revision: 1
    })
    await expect(
      repositories.workflowDispatches.enqueue({
        ...dispatch,
        updatedAt: 99
      })
    ).resolves.toEqual({ ...dispatch, revision: 1 })

    const listed = await repositories.workflowDispatches.listDispatchable(10)
    expect(listed).toEqual([{ ...dispatch, revision: 1 }])
    await expect(
      repositories.workflowDispatches.claim(dispatch.id, 1, 73)
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        status: 'processing',
        attempts: 1,
        revision: 2,
        updatedAt: 73
      }
    })
    await expect(
      repositories.workflowDispatches.claim(dispatch.id, 1, 74)
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { revision: 2 }
    })

    const failed = {
      ...(await repositories.workflowDispatches.listDispatchable(10))[0],
      status: 'failed' as const,
      error: 'provider unavailable',
      updatedAt: 74
    }
    await repositories.workflowDispatches.save(failed, 2)
    await expect(
      repositories.workflowDispatches.listDispatchable(10)
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'failed',
        attempts: 1,
        error: 'provider unavailable',
        revision: 3
      })
    ])
  })

  it('persists node todos and answered questions with revisions', async () => {
    const repositories = createSqliteRepositories(database) as ReturnType<
      typeof createSqliteRepositories
    > & {
      nodeRuns: {
        save: (
          entity: NodeRunRecord,
          expectedRevision: number
        ) => Promise<unknown>
      }
      nodeTodos: {
        save: (
          entity: NodeTodoRecord,
          expectedRevision: number
        ) => Promise<unknown>
        listByNodeRun: (nodeRunId: string) => Promise<unknown[]>
      }
      nodeQuestions: {
        save: (
          entity: NodeQuestionRecord,
          expectedRevision: number
        ) => Promise<unknown>
        listByNodeRun: (nodeRunId: string) => Promise<unknown[]>
      }
    }
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-1', 'waiting_user')
    await repositories.nodeRuns.save(run, 0)
    const todo: NodeTodoRecord = {
      id: 'todo-1',
      nodeRunId: run.id,
      title: 'Confirm rollback plan',
      required: true,
      status: 'pending',
      createdAt: 73,
      updatedAt: 73
    }
    const question: NodeQuestionRecord = {
      id: 'question-1',
      nodeRunId: run.id,
      prompt: 'Approve the rollback window?',
      required: true,
      status: 'answered',
      answer: 'Approved for 02:00 UTC',
      createdAt: 74,
      updatedAt: 75,
      answeredAt: 75
    }

    await repositories.nodeTodos.save(todo, 0)
    await repositories.nodeQuestions.save(question, 0)

    await expect(repositories.nodeTodos.listByNodeRun(run.id)).resolves.toEqual(
      [{ ...todo, revision: 1 }]
    )
    await expect(
      repositories.nodeQuestions.listByNodeRun(run.id)
    ).resolves.toEqual([{ ...question, revision: 1 }])
  })

  it('rolls back repository writes through the UnitOfWork', async () => {
    const repositories = createSqliteRepositories(database)

    await expect(
      repositories.unitOfWork.execute(() => {
        database
          .prepare(
            `INSERT INTO workspaces (
              id, path, label, description, sort_order, revision, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run('workspace-1', '/spaces/one', 'One', '', 0, 1, 1, 1)
        throw new Error('abort')
      })
    ).rejects.toThrow('abort')

    await expect(repositories.workspaces.list()).resolves.toEqual([])
  })

  it('keeps concurrent repository writes outside a suspended transaction', async () => {
    const repositories = createSqliteRepositories(database)
    let releaseTransaction!: () => void
    const transactionSuspended = new Promise<void>((resolve) => {
      releaseTransaction = resolve
    })
    let transactionStarted!: () => void
    const started = new Promise<void>((resolve) => {
      transactionStarted = resolve
    })

    const transaction = repositories.unitOfWork.execute(async () => {
      await repositories.workspaces.save(workspace, 0)
      transactionStarted()
      await transactionSuspended
      throw new Error('rollback owner transaction')
    })
    await started
    const concurrentWorkspace: WorkspaceRecord = {
      ...workspace,
      id: 'workspace-2',
      path: '/spaces/two',
      label: 'Two',
      rootPath: '/tmp/workspace-two'
    }
    const concurrentWrite = repositories.workspaces.save(concurrentWorkspace, 0)
    releaseTransaction()

    await expect(transaction).rejects.toThrow('rollback owner transaction')
    await expect(concurrentWrite).resolves.toMatchObject({ status: 'saved' })
    await expect(repositories.workspaces.list()).resolves.toEqual([
      { ...concurrentWorkspace, revision: 1 }
    ])
  })

  it('persists AI runs, checkpoints and only durable events', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)
    const run = createAiRun('run-1', requirement.id, 'analysis')

    await repositories.aiRuns.save(run)
    await repositories.aiRuns.update(run.id, (current) => ({
      ...current,
      status: 'running',
      content: '# checkpoint',
      lastSequence: 2
    }))

    await expect(
      repositories.aiRuns.appendEvent({
        id: 'delta-1',
        runId: run.id,
        sequence: 1,
        type: 'content.delta',
        timestamp: new Date(100).toISOString(),
        data: { delta: 'partial' }
      })
    ).resolves.toBe(false)
    await expect(
      repositories.aiRuns.appendEvent({
        id: 'started-1',
        runId: run.id,
        sequence: 2,
        type: 'run.started',
        timestamp: new Date(200).toISOString(),
        data: {}
      })
    ).resolves.toBe(true)
    await expect(
      repositories.aiRuns.appendEvent({
        id: 'started-duplicate',
        runId: run.id,
        sequence: 2,
        type: 'run.started',
        timestamp: new Date(200).toISOString(),
        data: {}
      })
    ).resolves.toBe(false)

    await expect(repositories.aiRuns.get(run.id)).resolves.toMatchObject({
      id: run.id,
      status: 'running',
      content: '# checkpoint',
      lastSequence: 2
    })
    await expect(repositories.aiRuns.listUnfinished()).resolves.toHaveLength(1)
    await expect(repositories.aiRuns.listEvents(run.id)).resolves.toEqual([
      {
        id: 'started-1',
        runId: run.id,
        sequence: 2,
        type: 'run.started',
        timestamp: new Date(200).toISOString(),
        data: {}
      }
    ])
  })

  it('persists model pool entries with entity-level CAS', async () => {
    const { modelPool } = createSqliteRepositories(database)
    const provider: ModelProvider = {
      id: 'provider-1',
      type: 'openai_compatible',
      name: 'Example',
      baseUrl: 'https://api.example.com/v1',
      enabled: true
    }
    const profile: ModelProfile = {
      id: 'profile-1',
      providerId: provider.id,
      modelId: 'example-model',
      displayName: 'Example Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: true,
        structuredOutput: true
      },
      contextWindow: 128_000,
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 8
    }

    await expect(modelPool.saveProvider(provider, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: { revision: 1 }
    })
    await expect(modelPool.saveProfile(profile, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: { revision: 1 }
    })
    await expect(
      modelPool.saveProvider({ ...provider, name: 'Stale' }, 0)
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { name: 'Example', revision: 1 }
    })
    await expect(modelPool.listProviders()).resolves.toEqual([
      { ...provider, revision: 1 }
    ])
    await expect(modelPool.listProfiles()).resolves.toEqual([
      { ...profile, revision: 1 }
    ])
  })

  it('stores encrypted model credentials as binary values', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelPool.saveProvider(
      {
        id: 'provider-1',
        type: 'openai_compatible',
        name: 'Example',
        baseUrl: 'https://api.example.com/v1',
        enabled: true
      },
      0
    )

    await repositories.modelCredentials.save({
      id: 'credential-1',
      providerId: 'provider-1',
      encryptedValue: Uint8Array.from([1, 2, 3]),
      nonce: Uint8Array.from([4, 5]),
      authTag: Uint8Array.from([6, 7]),
      keyVersion: 1,
      createdAt: 100,
      updatedAt: 100
    })

    await expect(
      repositories.modelCredentials.getByProvider('provider-1')
    ).resolves.toEqual({
      id: 'credential-1',
      providerId: 'provider-1',
      encryptedValue: Uint8Array.from([1, 2, 3]),
      nonce: Uint8Array.from([4, 5]),
      authTag: Uint8Array.from([6, 7]),
      keyVersion: 1,
      createdAt: 100,
      updatedAt: 100
    })
  })

  it('records and filters model call metrics', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    const provider: ModelProvider = {
      id: 'provider-1',
      type: 'local',
      name: 'Local',
      baseUrl: 'http://127.0.0.1',
      enabled: true
    }
    const profile: ModelProfile = {
      id: 'profile-1',
      providerId: provider.id,
      modelId: 'fake',
      displayName: 'Fake',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      },
      contextWindow: 4_096,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0
    }
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    const metric: ModelCallMetric = {
      id: 'metric-1',
      providerId: provider.id,
      modelProfileId: profile.id,
      workspaceId: workspace.id,
      inputTokens: 120,
      outputTokens: 40,
      cachedTokens: 20,
      reasoningTokens: 10,
      startedAt: 1_000,
      firstTokenLatencyMs: 25,
      durationMs: 80,
      retryCount: 1,
      status: 'completed',
      estimatedCost: 0
    }

    await repositories.modelMetrics.append(metric)

    await expect(
      repositories.modelMetrics.list({ workspaceId: workspace.id })
    ).resolves.toEqual([metric])
    await expect(
      repositories.modelMetrics.list({ providerId: 'missing' })
    ).resolves.toEqual([])
  })
})

async function seedWorkflowExecution(
  repositories: ReturnType<typeof createSqliteRepositories>
): Promise<void> {
  await repositories.workspaces.save(workspace, 0)
  await repositories.requirements.save(requirement, 0)
  await repositories.requirementWorkflows.save(
    {
      requirementId: requirement.id,
      templateVersionId: 'builtin-sdlc-v1',
      revision: 0,
      nodes: [
        {
          id: 'node-analysis',
          type: 'ai_generate',
          name: 'Analysis',
          description: '',
          order: 0,
          status: 'ready',
          allowSkip: false
        },
        {
          id: 'node-design',
          type: 'ai_generate',
          name: 'Design',
          description: '',
          order: 1,
          status: 'pending',
          allowSkip: false
        }
      ],
      edges: []
    },
    0
  )
  database
    .prepare(
      `INSERT INTO workflow_executions (
        id, requirement_id, status, current_node_id, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run('execution-1', requirement.id, 'running', 'node-analysis', 1, 70, 70)
}

function nodeRun(
  id: string,
  status: NodeRunRecord['status'],
  attempt = 1
): NodeRunRecord {
  return {
    id,
    executionId: 'execution-1',
    nodeId: attempt === 1 ? 'node-analysis' : 'node-design',
    status,
    attempt,
    checkpoint: { cursor: 4 },
    createdAt: 71,
    updatedAt: 71
  }
}
