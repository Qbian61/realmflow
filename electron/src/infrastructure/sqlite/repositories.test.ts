import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAiRun } from '../../../../domain/ai-run'
import {
  createAssistantTurnProjection,
  projectAssistantTurn,
  type AssistantRunEvent
} from '../../../../domain/assistant-turn'
import {
  ConversationProcessorPipeline,
  createBuiltinConversationProcessors
} from '../../../../domain/conversation-processor'
import type {
  ModelAvailabilityCheck,
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
  WorkRootRecord,
  WorkflowDispatchRecord,
  WorkflowTemplateRecord,
  WorkspaceRecord
} from '../../application/ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteAssistantRunEventStore } from './assistant-run-event-store'
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
  it('exposes template migration records through the repository composition', () => {
    const repositories = createSqliteRepositories(database)

    expect(repositories.templateMigrations).toBeDefined()
  })

  it('renames and permanently deletes a conversation transactionally', async () => {
    const { chatSessions } = createSqliteRepositories(database)
    const original: ChatSessionRecord = {
      id: 'conversation-manage',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Original title',
      sortOrder: 0,
      messages: [
        {
          id: 'conversation-manage-user',
          role: 'user',
          status: 'completed',
          content: 'Hello',
          sortOrder: 0,
          createdAt: 10
        },
        {
          id: 'conversation-manage-assistant',
          role: 'assistant',
          status: 'completed',
          content: 'Hello back',
          runId: 'conversation-manage-run',
          sortOrder: 1,
          createdAt: 11,
          completedAt: 12
        }
      ],
      createdAt: 10,
      updatedAt: 10
    }
    const saved = await chatSessions.save(original, 0)
    expect(saved.status).toBe('saved')
    const completedEvent: AssistantRunEvent = {
      id: 'conversation-manage-completed',
      runId: 'conversation-manage-run',
      sequence: 1,
      type: 'run.completed',
      timestamp: 12,
      data: {}
    }
    await new SqliteAssistantRunEventStore(database).appendAndProject(
      completedEvent,
      projectAssistantTurn(
        createAssistantTurnProjection({
          runId: completedEvent.runId,
          assistantMessageId: 'conversation-manage-assistant',
          startedAt: 11
        }),
        completedEvent
      )
    )

    const renamed = await chatSessions.renameConversation({
      id: original.id,
      expectedRevision: 1,
      title: 'Renamed title',
      updatedAt: 20
    })
    expect(renamed).toMatchObject({
      status: 'saved',
      entity: {
        title: 'Renamed title',
        revision: 2,
        updatedAt: 20
      }
    })

    await expect(
      chatSessions.deleteConversation(original.id, 1)
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { revision: 2 }
    })
    await expect(chatSessions.deleteConversation(original.id, 2)).resolves.toEqual({
      status: 'deleted',
      id: original.id
    })
    await expect(chatSessions.get(original.id)).resolves.toBeUndefined()
    expect(
      database
        .prepare('SELECT COUNT(*) FROM chat_messages WHERE session_id = ?')
        .pluck()
        .get(original.id)
    ).toBe(0)
    expect(
      database
        .prepare('SELECT COUNT(*) FROM assistant_run_events WHERE run_id = ?')
        .pluck()
        .get(completedEvent.runId)
    ).toBe(0)
    await expect(chatSessions.deleteConversation(original.id, 2)).resolves.toEqual({
      status: 'not_found',
      id: original.id
    })
  })

  it('persists workflow template drafts and lifecycle transitions atomically', async () => {
    const { workflowTemplates } = createSqliteRepositories(database)
    const draft: WorkflowTemplateRecord = {
      id: 'custom-template',
      name: 'Custom delivery',
      description: 'A copied workflow',
      status: 'draft',
      createdAt: 100,
      updatedAt: 100,
      currentVersion: {
        id: 'custom-template-v1',
        templateId: 'custom-template',
        version: 1,
        status: 'draft',
        checksum: 'draft-checksum',
        createdAt: 100,
        nodes: [
          {
            id: 'custom-template-v1-node-analysis',
            stableKey: 'analysis',
            type: 'ai_generate',
            name: 'Analysis',
            description: '',
            order: 0,
            allowSkip: false,
            position: { x: 160, y: 240 },
            configuration: {
              input: {
                includeRequirementBody: true,
                predecessorArtifacts: 'direct',
                includeSpaceKnowledge: false,
                attachments: ['attachments/brief.md']
              },
              prompt: 'Analyze this requirement.',
              model: { strategy: 'inherit' },
              connectorIds: [],
              permissions: [
                { capability: 'filesystem.read', scope: 'requirement' }
              ],
              artifact: {
                required: true,
                relativePath: 'artifacts/analysis.md',
                kind: 'markdown'
              },
              todos: [{ title: 'Confirm scope', required: true }],
              completionGate: { requireApproval: false },
              retry: { maxAttempts: 2, backoffMs: 1000 },
              skip: { allowed: false, requireReason: false }
            },
            executor: {
              kind: 'ai_generate',
              prompt: 'Analyze this requirement.',
              artifact: {
                relativePath: 'artifacts/analysis.md',
                kind: 'markdown'
              }
            }
          }
        ],
        edges: []
      }
    }

    await expect(workflowTemplates.saveDraft(draft, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: {
        id: 'custom-template',
        revision: 1,
        currentVersion: {
          nodes: [
            expect.objectContaining({
              stableKey: 'analysis',
              position: { x: 160, y: 240 },
              configuration: draft.currentVersion.nodes[0].configuration,
              executor: draft.currentVersion.nodes[0].executor
            })
          ]
        }
      }
    })
    await expect(
      workflowTemplates.saveDraft({ ...draft, name: 'Stale' }, 0)
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { name: 'Custom delivery', revision: 1 }
    })

    const published = await workflowTemplates.setStatus(
      draft.id,
      1,
      'published',
      200,
      'published-checksum'
    )
    expect(published).toMatchObject({
      status: 'saved',
      entity: {
        status: 'published',
        revision: 2,
        currentVersion: {
          status: 'published',
          checksum: 'published-checksum',
          publishedAt: 200
        }
      }
    })
    await expect(workflowTemplates.listPublishedVersions()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'custom-template-v1' })
      ])
    )

    await workflowTemplates.setStatus(
      draft.id,
      2,
      'archived',
      300,
      'published-checksum'
    )
    await expect(
      workflowTemplates.getTemplate(draft.id)
    ).resolves.toMatchObject({
      status: 'archived',
      revision: 3,
      currentVersion: { status: 'archived', publishedAt: 200 }
    })
    await expect(
      workflowTemplates.listPublishedVersions()
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'custom-template-v1' })
      ])
    )
  })

  it('updates workflow template node positions atomically without rewriting definitions', async () => {
    const { workflowTemplates } = createSqliteRepositories(database)
    const draft: WorkflowTemplateRecord = {
      id: 'layout-template',
      name: 'Layout',
      description: '',
      status: 'draft',
      createdAt: 100,
      updatedAt: 100,
      currentVersion: {
        id: 'layout-template-v1',
        templateId: 'layout-template',
        version: 1,
        status: 'draft',
        checksum: 'semantic-checksum',
        createdAt: 100,
        nodes: [
          {
            id: 'layout-template-v1-node-first',
            stableKey: 'first',
            type: 'human_input',
            name: 'First',
            description: '',
            order: 0,
            allowSkip: false,
            position: { x: 0, y: 0 }
          },
          {
            id: 'layout-template-v1-node-second',
            stableKey: 'second',
            type: 'approval',
            name: 'Second',
            description: '',
            order: 1,
            allowSkip: false,
            position: { x: 280, y: 0 }
          }
        ],
        edges: [
          {
            id: 'layout-template-v1-edge-1',
            sourceNodeId: 'layout-template-v1-node-first',
            targetNodeId: 'layout-template-v1-node-second'
          }
        ]
      }
    }
    await workflowTemplates.saveDraft(draft, 0)

    const moved = await workflowTemplates.updateNodePositions(
      draft.id,
      1,
      [
        {
          nodeId: 'layout-template-v1-node-second',
          position: { x: 460, y: 180 }
        }
      ],
      200
    )
    const repeated = await workflowTemplates.updateNodePositions(
      draft.id,
      1,
      [
        {
          nodeId: 'layout-template-v1-node-second',
          position: { x: 460, y: 180 }
        }
      ],
      300
    )

    expect(moved).toMatchObject({
      status: 'saved',
      entity: {
        revision: 2,
        updatedAt: 200,
        currentVersion: {
          checksum: 'semantic-checksum',
          nodes: [
            { id: 'layout-template-v1-node-first', order: 0 },
            {
              id: 'layout-template-v1-node-second',
              order: 1,
              position: { x: 460, y: 180 }
            }
          ]
        }
      }
    })
    expect(repeated).toEqual(moved)
    expect(
      database
        .prepare(
          `SELECT event_type, reason, aggregate_revision
           FROM audit_events
           WHERE scope = 'workflow_template' AND scope_id = ?
           ORDER BY aggregate_revision`
        )
        .all(draft.id)
    ).toEqual([
      {
        event_type: 'template_created',
        reason: 'workflow_template_created',
        aggregate_revision: 1
      },
      {
        event_type: 'template_revised',
        reason: 'workflow_template_layout_updated',
        aggregate_revision: 2
      }
    ])

    database.exec(`
      CREATE TRIGGER fail_layout_audit
      BEFORE INSERT ON audit_events
      WHEN NEW.reason = 'workflow_template_layout_updated'
      BEGIN
        SELECT RAISE(ABORT, 'forced layout audit failure');
      END;
    `)
    await expect(
      workflowTemplates.updateNodePositions(
        draft.id,
        2,
        [
          {
            nodeId: 'layout-template-v1-node-first',
            position: { x: 40, y: 80 }
          }
        ],
        400
      )
    ).rejects.toThrow('forced layout audit failure')
    await expect(workflowTemplates.getTemplate(draft.id)).resolves.toMatchObject({
      revision: 2,
      updatedAt: 200,
      currentVersion: {
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'layout-template-v1-node-first',
            position: { x: 0, y: 0 }
          })
        ])
      }
    })
  })

  it('preserves published definitions while storing and listing a later draft', async () => {
    const { workflowTemplates } = createSqliteRepositories(database)
    const versionOne: WorkflowTemplateRecord = {
      id: 'versioned-template',
      name: 'Versioned delivery',
      description: '',
      status: 'draft',
      createdAt: 100,
      updatedAt: 100,
      currentVersion: {
        id: 'versioned-template-v1',
        templateId: 'versioned-template',
        version: 1,
        status: 'draft',
        checksum: 'draft-v1',
        createdAt: 100,
        nodes: [
          {
            id: 'versioned-template-v1-node-analysis',
            stableKey: 'analysis',
            type: 'ai_generate',
            name: 'Analysis',
            description: '',
            order: 0,
            allowSkip: false
          }
        ],
        edges: []
      }
    }
    await workflowTemplates.saveDraft(versionOne, 0)
    await workflowTemplates.setStatus(
      versionOne.id,
      1,
      'published',
      200,
      'published-v1'
    )
    const publishedVersion = await workflowTemplates.getVersion(
      versionOne.currentVersion.id
    )

    await expect(
      workflowTemplates.saveDraft(
        {
          ...versionOne,
          status: 'draft',
          updatedAt: 300,
          currentVersion: {
            ...versionOne.currentVersion,
            status: 'draft',
            checksum: 'overwritten',
            nodes: []
          }
        },
        2
      )
    ).rejects.toThrow('Published workflow template versions are immutable')

    const versionTwo: WorkflowTemplateRecord = {
      ...versionOne,
      status: 'draft',
      updatedAt: 300,
      currentVersion: {
        ...structuredClone(versionOne.currentVersion),
        id: 'versioned-template-v2',
        version: 2,
        status: 'draft',
        checksum: 'draft-v2',
        createdAt: 300,
        nodes: [
          {
            ...versionOne.currentVersion.nodes[0],
            id: 'versioned-template-v2-node-analysis'
          }
        ]
      }
    }
    await expect(
      workflowTemplates.saveDraft(versionTwo, 2)
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        revision: 3,
        currentVersion: { id: 'versioned-template-v2', version: 2 }
      }
    })

    await expect(
      workflowTemplates.listVersions(versionOne.id)
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'versioned-template-v2',
        version: 2,
        status: 'draft'
      }),
      publishedVersion
    ])
    await expect(
      workflowTemplates.getVersion(versionOne.currentVersion.id)
    ).resolves.toEqual(publishedVersion)

    await workflowTemplates.setStatus(
      versionOne.id,
      3,
      'published',
      400,
      'published-v2'
    )
    await workflowTemplates.setStatus(
      versionOne.id,
      4,
      'archived',
      500,
      'published-v2'
    )
    await expect(
      workflowTemplates.listPublishedVersions()
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateId: versionOne.id })
      ])
    )
    await expect(
      workflowTemplates.getVersion(versionOne.currentVersion.id)
    ).resolves.toMatchObject({ status: 'archived' })
  })

  it('lists the current work root first and preserves history by recent use', async () => {
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
    const third: WorkRootRecord = {
      id: 'root-3',
      path: '/work/three',
      isCurrent: true,
      createdAt: 3,
      lastUsedAt: 3
    }

    await expect(workRoots.setCurrent(first, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: { ...first, revision: 1 }
    })
    await expect(workRoots.setCurrent(second, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: { ...second, revision: 1 }
    })
    await expect(workRoots.setCurrent(third, 0)).resolves.toMatchObject({
      status: 'saved',
      entity: { ...third, revision: 1 }
    })

    await expect(workRoots.getCurrent()).resolves.toEqual({
      ...third,
      revision: 1
    })
    await expect(workRoots.list()).resolves.toEqual([
      { ...third, revision: 1 },
      { ...second, isCurrent: false, revision: 2 },
      { ...first, isCurrent: false, revision: 2 }
    ])

    const reselectedFirst = {
      ...first,
      lastUsedAt: 4
    }
    await expect(
      workRoots.setCurrent(reselectedFirst, 2)
    ).resolves.toMatchObject({
      status: 'saved',
      entity: { ...reselectedFirst, revision: 3 }
    })
    await expect(workRoots.list()).resolves.toEqual([
      { ...reselectedFirst, revision: 3 },
      { ...third, isCurrent: false, revision: 2 },
      { ...second, isCurrent: false, revision: 2 }
    ])
  })

  it('supports workspace CRUD and rejects stale revisions', async () => {
    const { workspaces } = createSqliteRepositories(database)

    const created = await workspaces.save(workspace, 0)
    expect(created).toEqual({
      status: 'saved',
      entity: { ...workspace, revision: 1 }
    })

    const updatedWorkspace = {
      ...workspace,
      label: 'Renamed',
      relocatedAt: 11,
      relocationSource: 'user' as const,
      updatedAt: 11
    }
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

  it('lists deleted entities with lifecycle metadata in deletion order', async () => {
    const repositories = createSqliteRepositories(database)
    const savedWorkspace = await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)
    await repositories.workspaces.delete(
      workspace.id,
      savedWorkspace.entity.revision,
      {
        originalPath: '/work/space',
        trashPath: '/work/.realmflow/trash/workspace-1',
        deletedAt: 30,
        triggerSource: 'user'
      }
    )
    await repositories.requirements.delete(requirement.id, 1, {
      originalPath: '/work/space/requirement',
      trashPath: '/work/.realmflow/trash/requirement-1',
      deletedAt: 40,
      triggerSource: 'user'
    })

    await expect(repositories.trash.list()).resolves.toEqual([
      {
        entityType: 'requirement',
        entityId: requirement.id,
        displayName: requirement.title,
        workspaceId: workspace.id,
        originalPath: '/work/space/requirement',
        trashPath: '/work/.realmflow/trash/requirement-1',
        deletedAt: 40,
        triggerSource: 'user',
        state: 'trashed'
      },
      {
        entityType: 'space',
        entityId: workspace.id,
        displayName: workspace.label,
        originalPath: '/work/space',
        trashPath: '/work/.realmflow/trash/workspace-1',
        deletedAt: 30,
        triggerSource: 'user',
        state: 'trashed'
      }
    ])
  })

  it('marks a workspace purge set and hard-deletes its complete aggregate', async () => {
    let repositories = createSqliteRepositories(database)
    const savedWorkspace = await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)
    await repositories.requirements.delete(requirement.id, 1, {
      originalPath: '/work/space/requirement',
      trashPath: '/work/.realmflow/trash/requirement-1',
      deletedAt: 40,
      triggerSource: 'user'
    })
    await repositories.workspaces.delete(
      workspace.id,
      savedWorkspace.entity.revision,
      {
        originalPath: '/work/space',
        trashPath: '/work/.realmflow/trash/workspace-1',
        deletedAt: 50,
        triggerSource: 'user'
      }
    )

    const purgeSet = await repositories.trash.getPurgeSet({
      entityType: 'space',
      entityId: workspace.id
    })
    expect(purgeSet.map((item) => item.entityId)).toEqual([
      workspace.id,
      requirement.id
    ])
    await expect(repositories.trash.markPurging(purgeSet)).resolves.toBe(true)
    await expect(repositories.trash.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: workspace.id, state: 'purging' }),
        expect.objectContaining({ entityId: requirement.id, state: 'purging' })
      ])
    )
    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)
    await expect(
      repositories.trash.get({
        entityType: 'space',
        entityId: workspace.id
      })
    ).resolves.toMatchObject({ state: 'purging' })

    await expect(
      repositories.trash.hardPurge({
        entityType: 'space',
        entityId: workspace.id
      })
    ).resolves.toBe(true)
    await expect(repositories.trash.list()).resolves.toEqual([])
    await expect(
      repositories.workspaces.get(workspace.id)
    ).resolves.toBeUndefined()
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toBeUndefined()
  })

  it('saves requirement workflow aggregates with entity-level CAS', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)
    const aggregate: RequirementWorkflow = {
      requirementId: requirement.id,
      templateVersionId: 'builtin-sdlc-v1',
      revision: 0,
      maxParallelism: 1,
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

    const created = await repositories.requirementWorkflows.save(aggregate, 0, {
      reason: 'workflow_created',
      triggerSource: 'user'
    })
    expect(created).toMatchObject({
      status: 'saved',
      entity: { revision: 1 }
    })

    const updated = {
      ...aggregate,
      revision: 1,
      maxParallelism: 4,
      nodes: aggregate.nodes.map((node) =>
        node.id === 'node-analysis'
          ? { ...node, status: 'running' as const }
          : node
      )
    }
    await expect(
      repositories.requirementWorkflows.save(updated, 1, {
        reason: 'parallelism_changed',
        triggerSource: 'user'
      })
    ).resolves.toMatchObject({ status: 'saved', entity: { revision: 2 } })
    await expect(
      repositories.requirementWorkflows.save(aggregate, 1, {
        reason: 'nodes_reordered',
        triggerSource: 'user'
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { revision: 2 }
    })
    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      revision: 2,
      maxParallelism: 4,
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'node-analysis',
          status: 'running',
          executor: aggregate.nodes[0].executor,
          completionGate: aggregate.nodes[0].completionGate
        })
      ])
    })

    await expect(
      repositories.requirementWorkflows.listRevisions(requirement.id)
    ).resolves.toMatchObject([
      {
        requirementId: requirement.id,
        revision: 1,
        reason: 'workflow_created',
        triggerSource: 'user',
        snapshot: { revision: 1 },
        diff: {
          addedNodeIds: ['node-analysis', 'node-design'],
          removedNodeIds: [],
          updatedNodeIds: [],
          reorderedNodeIds: [],
          addedEdgeIds: ['edge-analysis-design'],
          removedEdgeIds: [],
          updatedEdgeIds: []
        },
        createdAt: expect.any(Number)
      },
      {
        requirementId: requirement.id,
        revision: 2,
        reason: 'parallelism_changed',
        triggerSource: 'user',
        snapshot: {
          revision: 2,
          maxParallelism: 4,
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 'node-analysis', status: 'running' })
          ])
        },
        diff: {
          addedNodeIds: [],
          removedNodeIds: [],
          updatedNodeIds: ['node-analysis'],
          reorderedNodeIds: [],
          addedEdgeIds: [],
          removedEdgeIds: [],
          updatedEdgeIds: []
        },
        createdAt: expect.any(Number)
      }
    ])
    expect(
      database
        .prepare(
          `SELECT event_type, reason
           FROM audit_events
           WHERE scope = 'requirement_workflow'
             AND aggregate_revision = 2`
        )
        .get()
    ).toEqual({
      event_type: 'workflow_parallelism_changed',
      reason: 'parallelism_changed'
    })

    const invalidUpdate = {
      ...updated,
      revision: 2,
      nodes: updated.nodes.map((node) =>
        node.id === 'node-analysis'
          ? { ...node, status: 'completed' as const }
          : node
      )
    }
    await expect(
      repositories.requirementWorkflows.save(invalidUpdate, 2, {
        reason: 'node_status_changed',
        triggerSource: 'external' as never
      })
    ).rejects.toThrow()
    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({ revision: 2 })
    await expect(
      repositories.requirementWorkflows.listRevisions(requirement.id)
    ).resolves.toHaveLength(2)

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const reloadedRepositories = createSqliteRepositories(database)
    await expect(
      reloadedRepositories.requirementWorkflows.listRevisions(requirement.id)
    ).resolves.toMatchObject([
      { snapshot: { maxParallelism: 1 } },
      { snapshot: { maxParallelism: 4 } }
    ])
    await expect(
      reloadedRepositories.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({ maxParallelism: 4 })
  })

  it('persists requirements, sessions, messages and artifacts', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)

    const session: ChatSessionRecord = {
      id: 'session-1',
      kind: 'requirement_node',
      knowledgeScope: { kind: 'node_configuration' },
      workspaceId: workspace.id,
      requirementId: requirement.id,
      nodeRunId: 'node-run-discussion',
      title: 'Discussion',
      sortOrder: 0,
      createdAt: 30,
      updatedAt: 31,
      messages: [
        {
          id: 'message-1',
          role: 'user',
          status: 'completed',
          content: 'Question',
          sortOrder: 0,
          createdAt: 30
        },
        {
          id: 'message-2',
          role: 'assistant',
          status: 'completed',
          content: 'Answer',
          sortOrder: 1,
          createdAt: 31
        }
      ]
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
    await repositories.artifacts.save(artifact, 0)

    await expect(
      repositories.requirements.listByWorkspace(workspace.id)
    ).resolves.toEqual([{ ...requirement, revision: 1 }])
    await expect(
      repositories.chatSessions.listByWorkspace(workspace.id)
    ).resolves.toEqual([{ ...session, revision: 1 }])
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
      knowledgeScope: { kind: 'none' },
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
      knowledgeScope: { kind: 'node_configuration' },
      workspaceId: workspace.id,
      requirementId: requirement.id,
      nodeRunId: 'node-run-1',
      title: 'Node chat',
      sortOrder: 1,
      messages: [
        {
          id: 'message-tool',
          role: 'tool',
          status: 'completed',
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
      listRecent: (query: object) => Promise<{
        conversations: Array<ChatSessionRecord & { revision: number }>
        folderPaths: string[]
      }>
    }
    await expect(recentRepository.listRecent({})).resolves.toEqual({
      conversations: [{ ...general, revision: 1 }],
      folderPaths: ['/tmp/task-folder']
    })
  })

  it('lists recent conversations with stable ordering and folder options', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    await repositories.requirements.save(requirement, 0)
    const sessions = [
      {
        id: 'session-node-newest',
        kind: 'requirement_node',
        knowledgeScope: { kind: 'node_configuration' },
        workspaceId: workspace.id,
        requirementId: requirement.id,
        nodeRunId: 'node-run-newest',
        title: 'Node newest',
        sortOrder: 0,
        messages: [],
        createdAt: 500,
        updatedAt: 500
      },
      {
        id: 'session-space-z',
        kind: 'space',
        knowledgeScope: {
          kind: 'workspace',
          workspaceId: workspace.id
        },
        workspaceId: workspace.id,
        title: 'Space Z',
        sortOrder: 1,
        messages: [],
        createdAt: 300,
        updatedAt: 300
      },
      {
        id: 'session-folder-b',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        folderPath: '/tmp/folder-b',
        title: 'Folder B',
        sortOrder: 2,
        messages: [],
        createdAt: 300,
        updatedAt: 300
      },
      {
        id: 'session-folder-a',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        folderPath: '/tmp/folder-a',
        title: 'Folder A',
        sortOrder: 3,
        messages: [],
        createdAt: 200,
        updatedAt: 200
      }
    ] as ChatSessionRecord[]
    for (const session of sessions) {
      await repositories.chatSessions.save(session, 0)
    }

    const recentRepository = repositories.chatSessions as unknown as {
      listRecent: (query: object) => Promise<{
        conversations: Array<ChatSessionRecord & { revision: number }>
        folderPaths: string[]
      }>
    }

    await expect(recentRepository.listRecent({})).resolves.toEqual({
      conversations: [
        { ...sessions[2], revision: 1 },
        { ...sessions[1], revision: 1 },
        { ...sessions[3], revision: 1 }
      ],
      folderPaths: ['/tmp/folder-b', '/tmp/folder-a']
    })
  })

  it('intersects recent type, context, and inclusive time filters', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.workspaces.save(workspace, 0)
    const sessions = [
      {
        id: 'session-general-boundary',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        folderPath: '/tmp/filter-folder',
        title: 'Boundary',
        sortOrder: 0,
        messages: [],
        createdAt: 200,
        updatedAt: 200
      },
      {
        id: 'session-general-older',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        folderPath: '/tmp/filter-folder',
        title: 'Older',
        sortOrder: 1,
        messages: [],
        createdAt: 199,
        updatedAt: 199
      },
      {
        id: 'session-space',
        kind: 'space',
        knowledgeScope: {
          kind: 'workspace',
          workspaceId: workspace.id
        },
        workspaceId: workspace.id,
        title: 'Space',
        sortOrder: 2,
        messages: [],
        createdAt: 300,
        updatedAt: 300
      }
    ] as ChatSessionRecord[]
    for (const session of sessions) {
      await repositories.chatSessions.save(session, 0)
    }

    const recentRepository = repositories.chatSessions as unknown as {
      listRecent: (query: object) => Promise<{
        conversations: Array<ChatSessionRecord & { revision: number }>
        folderPaths: string[]
      }>
    }

    await expect(
      recentRepository.listRecent({
        kind: 'general',
        folderPath: '/tmp/filter-folder',
        updatedAfter: 200
      })
    ).resolves.toMatchObject({
      conversations: [{ ...sessions[0], revision: 1 }]
    })
    await expect(
      recentRepository.listRecent({
        kind: 'space',
        workspaceId: workspace.id
      })
    ).resolves.toMatchObject({
      conversations: [{ ...sessions[2], revision: 1 }]
    })
  })

  it('persists conversation message lifecycle fields across database reopen', async () => {
    let repositories = createSqliteRepositories(database)
    const session = {
      id: 'session-lifecycle',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Lifecycle',
      sortOrder: 0,
      messages: [
        {
          id: 'message-user',
          role: 'user',
          status: 'completed',
          content: 'Inspect the run',
          sortOrder: 0,
          createdAt: 70
        },
        {
          id: 'message-assistant',
          role: 'assistant',
          status: 'failed',
          runId: 'run-conversation-1',
          error: 'Provider stream interrupted',
          content: 'Partial answer',
          sortOrder: 1,
          createdAt: 71
        },
        {
          id: 'message-tool',
          role: 'tool',
          status: 'completed',
          runId: 'run-conversation-1',
          content: 'Tool result',
          sortOrder: 2,
          createdAt: 72
        }
      ],
      createdAt: 70,
      updatedAt: 72
    } as unknown as ChatSessionRecord

    await repositories.chatSessions.save(session, 0)
    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)

    await expect(repositories.chatSessions.get(session.id)).resolves.toEqual({
      ...session,
      revision: 1
    })
  })

  it('persists node message references and enforces one conversation per node run', async () => {
    let repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-conversation', 'waiting_user')
    await repositories.nodeRuns.save(run, 0)
    await repositories.nodeTodos.save(
      {
        id: 'todo-conversation',
        nodeRunId: run.id,
        title: 'Confirm release window',
        required: true,
        status: 'pending',
        createdAt: 75,
        updatedAt: 75
      },
      0
    )
    await repositories.nodeQuestions.save(
      {
        id: 'question-conversation',
        nodeRunId: run.id,
        prompt: 'Ship tonight?',
        required: true,
        status: 'answered',
        answer: 'Yes',
        createdAt: 76,
        updatedAt: 77,
        answeredAt: 77
      },
      0
    )
    await repositories.artifacts.save(
      {
        id: 'artifact-conversation',
        requirementId: requirement.id,
        stageId: 'analysis',
        nodeId: run.nodeId,
        relativePath: 'artifacts/conversation.md',
        kind: 'markdown',
        checksum: 'sha256:conversation',
        version: 1,
        byteSize: 20,
        isPrimary: true,
        createdAt: 78,
        updatedAt: 78
      },
      0
    )
    const session: ChatSessionRecord = {
      id: 'session-node-references',
      kind: 'requirement_node',
      knowledgeScope: { kind: 'node_configuration' },
      workspaceId: workspace.id,
      requirementId: requirement.id,
      nodeRunId: run.id,
      title: 'Analysis conversation',
      sortOrder: 79,
      messages: [
        {
          id: 'message-node-references',
          role: 'user',
          status: 'completed',
          content: 'Yes',
          questionId: 'question-conversation',
          todoId: 'todo-conversation',
          toolCallId: 'tool-call-conversation',
          artifactId: 'artifact-conversation',
          sortOrder: 0,
          createdAt: 79
        }
      ],
      createdAt: 79,
      updatedAt: 79
    }

    await repositories.chatSessions.save(session, 0)
    await expect(
      repositories.chatSessions.listByNodeRun(run.id)
    ).resolves.toEqual([{ ...session, revision: 1 }])
    await expect(
      repositories.chatSessions.save(
        {
          ...session,
          id: 'session-node-conflict',
          messages: []
        },
        0
      )
    ).rejects.toThrow()

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)
    await expect(repositories.chatSessions.get(session.id)).resolves.toEqual({
      ...session,
      revision: 1
    })
  })

  it('starts a conversation turn atomically and replays the same message idempotently', async () => {
    const repositories = createSqliteRepositories(database)
    const turns = repositories.chatSessions as typeof repositories.chatSessions & {
      beginTurn: (input: {
        session: ChatSessionRecord
        expectedRevision: number
        userMessageId: string
        assistantMessageId: string
        content: string
        modelName?: string
        createdAt: number
      }) => Promise<{
        status: string
        entity: ChatSessionRecord & { revision: number }
      }>
    }
    const session: ChatSessionRecord = {
      id: 'session-turn',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Atomic turn',
      sortOrder: 80,
      messages: [],
      createdAt: 80,
      updatedAt: 80
    }
    const command = {
      session,
      expectedRevision: 0,
      userMessageId: 'message-request-1',
      assistantMessageId: 'message-request-1:assistant',
      content: '  Start the turn  ',
      processing: await new ConversationProcessorPipeline(
        createBuiltinConversationProcessors()
      ).run({
        messageId: 'message-request-1',
        content: '  Start the turn  ',
        scenarioId: 'general',
        createdAt: 81
      }),
      modelName: 'DeepSeek V4 Pro',
      createdAt: 81
    }

    const started = await turns.beginTurn(command)
    expect(started).toMatchObject({
      status: 'started',
      entity: {
        revision: 1,
        messages: [
          {
            id: 'message-request-1',
            role: 'user',
            status: 'completed',
            content: '  Start the turn  ',
            processing: expect.objectContaining({
              rawUserInput: expect.objectContaining({
                content: '  Start the turn  '
              }),
              normalizedText: 'Start the turn'
            }),
            sortOrder: 0
          },
          {
            id: 'message-request-1:assistant',
            role: 'assistant',
            status: 'pending',
            content: '',
            modelName: 'DeepSeek V4 Pro',
            sortOrder: 1
          }
        ]
      }
    })

    const replayed = await turns.beginTurn(command)
    expect(replayed.status).toBe('idempotent')
    expect(replayed.entity).toEqual(started.entity)
    expect(
      database.prepare('SELECT COUNT(*) FROM chat_messages').pluck().get()
    ).toBe(2)

    const bound = await repositories.chatSessions.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-request-1:assistant',
      runId: 'run-1',
      expectedRevision: 1,
      updatedAt: 82
    })
    expect(
      bound.entity.messages.find(({ id }) => id === 'message-request-1')
        ?.processing
    ).toEqual(command.processing)

    await expect(
      repositories.chatSessions.save(
        {
          ...bound.entity,
          messages: bound.entity.messages.map((message) =>
            message.id === 'message-request-1'
              ? { ...message, content: 'Rewritten input' }
              : message
          )
        },
        bound.entity.revision
      )
    ).rejects.toThrow('Conversation raw user input is immutable')
  })

  it('rejects conflicting and concurrent conversation turns without partial writes', async () => {
    const repositories = createSqliteRepositories(database)
    const turns = repositories.chatSessions as typeof repositories.chatSessions & {
      beginTurn: (input: {
        session: ChatSessionRecord
        expectedRevision: number
        userMessageId: string
        assistantMessageId: string
        content: string
        createdAt: number
      }) => Promise<{ status: string; entity?: ChatSessionRecord }>
    }
    const session: ChatSessionRecord = {
      id: 'session-turn-conflict',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Conflict',
      sortOrder: 90,
      messages: [],
      createdAt: 90,
      updatedAt: 90
    }

    await expect(
      turns.beginTurn({
        session,
        expectedRevision: 0,
        userMessageId: 'same-id',
        assistantMessageId: 'same-id',
        content: 'Atomic failure',
        createdAt: 91
      })
    ).rejects.toThrow()
    await expect(repositories.chatSessions.get(session.id)).resolves.toBeUndefined()

    await turns.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-1',
      assistantMessageId: 'message-1:assistant',
      content: 'First',
      createdAt: 92
    })
    await expect(
      turns.beginTurn({
        session,
        expectedRevision: 1,
        userMessageId: 'message-2',
        assistantMessageId: 'message-2:assistant',
        content: 'Second',
        createdAt: 93
      })
    ).resolves.toMatchObject({ status: 'active' })
    await expect(
      turns.beginTurn({
        session,
        expectedRevision: 1,
        userMessageId: 'message-1',
        assistantMessageId: 'message-1:assistant',
        content: 'Changed',
        createdAt: 94
      })
    ).resolves.toMatchObject({ status: 'message_conflict' })
    expect(
      database.prepare('SELECT COUNT(*) FROM chat_messages').pluck().get()
    ).toBe(2)
  })

  it('binds and completes a pending assistant then recovers interrupted turns once', async () => {
    const repositories = createSqliteRepositories(database)
    const turns = repositories.chatSessions as typeof repositories.chatSessions & {
      beginTurn: (input: {
        session: ChatSessionRecord
        expectedRevision: number
        userMessageId: string
        assistantMessageId: string
        content: string
        createdAt: number
      }) => Promise<{
        status: string
        entity: ChatSessionRecord & { revision: number }
      }>
      bindTurnRun: (input: {
        sessionId: string
        assistantMessageId: string
        runId: string
        expectedRevision: number
        updatedAt: number
      }) => Promise<{
        status: string
        entity: ChatSessionRecord & { revision: number }
      }>
      finishTurn: (input: {
        sessionId: string
        assistantMessageId: string
        runId: string
        status: 'completed' | 'failed'
        content: string
        error?: string
        expectedRevision: number
        updatedAt: number
      }) => Promise<{
        status: string
        entity: ChatSessionRecord & { revision: number }
      }>
      recoverPendingTurns: (input: {
        error: string
        updatedAt: number
      }) => Promise<number>
    }
    const session: ChatSessionRecord = {
      id: 'session-finish',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Finish',
      sortOrder: 100,
      messages: [],
      createdAt: 100,
      updatedAt: 100
    }
    const started = await turns.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-finish',
      assistantMessageId: 'message-finish:assistant',
      content: 'Finish this',
      createdAt: 101
    })
    const bound = await turns.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-finish:assistant',
      runId: 'run-finish',
      expectedRevision: started.entity.revision,
      updatedAt: 102
    })
    expect(bound.entity.messages[1]).toMatchObject({
      status: 'pending',
      runId: 'run-finish'
    })
    const finished = await turns.finishTurn({
      sessionId: session.id,
      assistantMessageId: 'message-finish:assistant',
      runId: 'run-finish',
      status: 'failed',
      content: 'Partial',
      error: 'Stream interrupted',
      expectedRevision: bound.entity.revision,
      updatedAt: 103
    })
    expect(finished.entity.messages[1]).toMatchObject({
      status: 'failed',
      runId: 'run-finish',
      content: 'Partial',
      error: 'Stream interrupted',
      completedAt: 103
    })
    expect(
      await turns.recoverPendingTurns({
        error: 'Application interrupted',
        updatedAt: 104
      })
    ).toBe(0)

    const pendingSession: ChatSessionRecord = {
      id: 'session-recovery',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Recovery',
      sortOrder: 110,
      messages: [],
      createdAt: 110,
      updatedAt: 110
    }
    await turns.beginTurn({
      session: pendingSession,
      expectedRevision: 0,
      userMessageId: 'message-recovery',
      assistantMessageId: 'message-recovery:assistant',
      content: 'Recover this',
      createdAt: 111
    })
    expect(
      await turns.recoverPendingTurns({
        error: 'Application interrupted',
        updatedAt: 112
      })
    ).toBe(1)
    expect(
      await turns.recoverPendingTurns({
        error: 'Application interrupted',
        updatedAt: 113
      })
    ).toBe(0)
    await expect(
      repositories.chatSessions.get(pendingSession.id)
    ).resolves.toMatchObject({
      revision: 2,
      messages: [
        expect.any(Object),
        expect.objectContaining({
          status: 'failed',
          error: 'Application interrupted',
          completedAt: 112
        })
      ]
    })
  })

  it('preserves assistant execution history when a turn completes', async () => {
    const repositories = createSqliteRepositories(database)
    const session: ChatSessionRecord = {
      id: 'session-preserved-timeline',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Preserved timeline',
      sortOrder: 111,
      messages: [],
      createdAt: 120,
      updatedAt: 120
    }
    const started = await repositories.chatSessions.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-preserved-timeline',
      assistantMessageId: 'message-preserved-timeline:assistant',
      content: 'Complete with durable execution history',
      createdAt: 121
    })
    const bound = await repositories.chatSessions.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-preserved-timeline:assistant',
      runId: 'run-preserved-timeline',
      expectedRevision: started.entity.revision,
      updatedAt: 122
    })
    const eventStore = new SqliteAssistantRunEventStore(database)
    const completedEvent: AssistantRunEvent = {
      id: 'event-preserved-timeline-completed',
      runId: 'run-preserved-timeline',
      sequence: 1,
      type: 'run.completed',
      timestamp: 123,
      data: {}
    }
    const completedProjection = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: completedEvent.runId,
        assistantMessageId: 'message-preserved-timeline:assistant',
        startedAt: 121
      }),
      completedEvent
    )
    await eventStore.appendAndProject(completedEvent, completedProjection)

    const finished = await repositories.chatSessions.finishTurn({
      sessionId: session.id,
      assistantMessageId: 'message-preserved-timeline:assistant',
      runId: completedEvent.runId,
      status: 'completed',
      content: 'Done',
      expectedRevision: bound.entity.revision,
      updatedAt: 124
    })

    expect(
      database
        .prepare(
          'SELECT COUNT(*) FROM assistant_run_events WHERE run_id = ?'
        )
        .pluck()
        .get(completedEvent.runId)
    ).toBe(1)
    expect(await eventStore.getSnapshot(completedEvent.runId)).toEqual(
      completedProjection
    )
    expect(finished.entity.messages[1]).toMatchObject({
      status: 'completed',
      runId: completedEvent.runId,
      content: 'Done',
      execution: completedProjection
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const reopenedRepositories = createSqliteRepositories(database)
    const reopenedEventStore = new SqliteAssistantRunEventStore(database)

    await expect(
      reopenedRepositories.chatSessions.get(session.id)
    ).resolves.toMatchObject({
      messages: [
        expect.any(Object),
        expect.objectContaining({
          id: 'message-preserved-timeline:assistant',
          status: 'completed',
          execution: completedProjection
        })
      ]
    })
    await expect(
      reopenedEventStore.getSnapshot(completedEvent.runId)
    ).resolves.toEqual(completedProjection)
  })

  it('allows an empty completed message for a persisted waiting-input projection', async () => {
    const repositories = createSqliteRepositories(database)
    const session: ChatSessionRecord = {
      id: 'session-waiting-input-timeline',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Waiting input timeline',
      sortOrder: 114,
      messages: [],
      createdAt: 150,
      updatedAt: 150
    }
    const started = await repositories.chatSessions.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-waiting-input',
      assistantMessageId: 'message-waiting-input:assistant',
      content: 'Continue until confirmation is required',
      createdAt: 151
    })
    const bound = await repositories.chatSessions.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-waiting-input:assistant',
      runId: 'run-waiting-input',
      expectedRevision: started.entity.revision,
      updatedAt: 152
    })
    const eventStore = new SqliteAssistantRunEventStore(database)
    const waitingEvent: AssistantRunEvent = {
      id: 'event-waiting-input',
      runId: 'run-waiting-input',
      sequence: 1,
      type: 'run.waiting_input',
      timestamp: 153,
      data: { reason: 'consecutive_tool_failures' }
    }
    const waitingProjection = projectAssistantTurn(
      createAssistantTurnProjection({
        runId: waitingEvent.runId,
        assistantMessageId: 'message-waiting-input:assistant',
        startedAt: 151
      }),
      waitingEvent
    )
    await eventStore.appendAndProject(waitingEvent, waitingProjection)

    const finished = await repositories.chatSessions.finishTurn({
      sessionId: session.id,
      assistantMessageId: 'message-waiting-input:assistant',
      runId: waitingEvent.runId,
      status: 'completed',
      content: '',
      expectedRevision: bound.entity.revision,
      updatedAt: 154
    })

    expect(finished.entity.messages[1]).toMatchObject({
      status: 'completed',
      content: '',
      execution: waitingProjection
    })
  })

  it('rejects an empty completed message for a normally completed projection', async () => {
    const repositories = createSqliteRepositories(database)
    const session: ChatSessionRecord = {
      id: 'session-empty-completed-timeline',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Empty completed timeline',
      sortOrder: 115,
      messages: [],
      createdAt: 160,
      updatedAt: 160
    }
    const started = await repositories.chatSessions.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-empty-completed',
      assistantMessageId: 'message-empty-completed:assistant',
      content: 'Return an answer',
      createdAt: 161
    })
    const bound = await repositories.chatSessions.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-empty-completed:assistant',
      runId: 'run-empty-completed',
      expectedRevision: started.entity.revision,
      updatedAt: 162
    })
    const eventStore = new SqliteAssistantRunEventStore(database)
    const completedEvent: AssistantRunEvent = {
      id: 'event-empty-completed',
      runId: 'run-empty-completed',
      sequence: 1,
      type: 'run.completed',
      timestamp: 163,
      data: {}
    }
    await eventStore.appendAndProject(
      completedEvent,
      projectAssistantTurn(
        createAssistantTurnProjection({
          runId: completedEvent.runId,
          assistantMessageId: 'message-empty-completed:assistant',
          startedAt: 161
        }),
        completedEvent
      )
    )

    await expect(
      repositories.chatSessions.finishTurn({
        sessionId: session.id,
        assistantMessageId: 'message-empty-completed:assistant',
        runId: completedEvent.runId,
        status: 'completed',
        content: '',
        expectedRevision: bound.entity.revision,
        updatedAt: 164
      })
    ).rejects.toThrow('Completed conversation response is empty')
  })

  it('keeps a bound assistant pending when its execution projection is missing', async () => {
    const repositories = createSqliteRepositories(database)
    const session: ChatSessionRecord = {
      id: 'session-missing-projection',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Missing projection',
      sortOrder: 112,
      messages: [],
      createdAt: 130,
      updatedAt: 130
    }
    const started = await repositories.chatSessions.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-missing-projection',
      assistantMessageId: 'message-missing-projection:assistant',
      content: 'Do not report a false completion',
      createdAt: 131
    })
    const bound = await repositories.chatSessions.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-missing-projection:assistant',
      runId: 'run-missing-projection',
      expectedRevision: started.entity.revision,
      updatedAt: 132
    })

    await expect(
      repositories.chatSessions.finishTurn({
        sessionId: session.id,
        assistantMessageId: 'message-missing-projection:assistant',
        runId: 'run-missing-projection',
        status: 'completed',
        content: 'This must not commit',
        expectedRevision: bound.entity.revision,
        updatedAt: 133
      })
    ).rejects.toThrow('assistant_execution_projection_missing')
    await expect(repositories.chatSessions.get(session.id)).resolves.toMatchObject({
      revision: bound.entity.revision,
      messages: [
        expect.any(Object),
        expect.objectContaining({
          id: 'message-missing-projection:assistant',
          status: 'pending',
          content: ''
        })
      ]
    })
  })

  it('keeps a bound assistant pending while its execution projection is running', async () => {
    const repositories = createSqliteRepositories(database)
    const session: ChatSessionRecord = {
      id: 'session-running-projection',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Running projection',
      sortOrder: 113,
      messages: [],
      createdAt: 140,
      updatedAt: 140
    }
    const started = await repositories.chatSessions.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-running-projection',
      assistantMessageId: 'message-running-projection:assistant',
      content: 'Wait for the terminal event',
      createdAt: 141
    })
    const bound = await repositories.chatSessions.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-running-projection:assistant',
      runId: 'run-running-projection',
      expectedRevision: started.entity.revision,
      updatedAt: 142
    })
    const eventStore = new SqliteAssistantRunEventStore(database)
    const runningEvent: AssistantRunEvent = {
      id: 'event-running-projection-started',
      runId: 'run-running-projection',
      sequence: 1,
      type: 'run.started',
      timestamp: 143,
      data: {}
    }
    await eventStore.appendAndProject(
      runningEvent,
      projectAssistantTurn(
        createAssistantTurnProjection({
          runId: runningEvent.runId,
          assistantMessageId: 'message-running-projection:assistant',
          startedAt: 141
        }),
        runningEvent
      )
    )

    await expect(
      repositories.chatSessions.finishTurn({
        sessionId: session.id,
        assistantMessageId: 'message-running-projection:assistant',
        runId: runningEvent.runId,
        status: 'completed',
        content: 'This must not commit',
        expectedRevision: bound.entity.revision,
        updatedAt: 144
      })
    ).rejects.toThrow('assistant_execution_projection_not_terminal')
    await expect(repositories.chatSessions.get(session.id)).resolves.toMatchObject({
      revision: bound.entity.revision,
      messages: [
        expect.any(Object),
        expect.objectContaining({
          id: 'message-running-projection:assistant',
          status: 'pending',
          content: ''
        })
      ]
    })
  })

  it('atomically rebinds a pending assistant to a fallback model run', async () => {
    const repositories = createSqliteRepositories(database)
    const turns = repositories.chatSessions as typeof repositories.chatSessions & {
      rebindTurnRun: (input: {
        sessionId: string
        assistantMessageId: string
        previousRunId: string
        runId: string
        modelName: string
        expectedRevision: number
        updatedAt: number
      }) => Promise<{
        status: string
        entity: ChatSessionRecord & { revision: number }
      }>
    }
    const session: ChatSessionRecord = {
      id: 'session-fallback',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Fallback',
      sortOrder: 101,
      messages: [],
      createdAt: 100,
      updatedAt: 100
    }
    const started = await turns.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'message-fallback',
      assistantMessageId: 'message-fallback:assistant',
      content: 'Use another provider',
      modelName: 'DeepSeek V4 Flash',
      createdAt: 101
    })
    const bound = await turns.bindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-fallback:assistant',
      runId: 'run-deepseek',
      expectedRevision: started.entity.revision,
      updatedAt: 102
    })

    const rebound = await turns.rebindTurnRun({
      sessionId: session.id,
      assistantMessageId: 'message-fallback:assistant',
      previousRunId: 'run-deepseek',
      runId: 'run-volcengine',
      modelName: 'Doubao Seed 2.1 Pro',
      expectedRevision: bound.entity.revision,
      updatedAt: 103
    })

    expect(rebound).toMatchObject({
      status: 'updated',
      entity: {
        revision: bound.entity.revision + 1,
        messages: [
          expect.any(Object),
          expect.objectContaining({
            status: 'pending',
            runId: 'run-volcengine',
            modelName: 'Doubao Seed 2.1 Pro'
          })
        ]
      }
    })
    await expect(
      turns.rebindTurnRun({
        sessionId: session.id,
        assistantMessageId: 'message-fallback:assistant',
        previousRunId: 'run-deepseek',
        runId: 'run-stale',
        modelName: 'Stale',
        expectedRevision: bound.entity.revision,
        updatedAt: 104
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { revision: rebound.entity.revision }
    })
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
        listByNode: (nodeId: string) => Promise<unknown[]>
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
    await expect(
      repositories.nodeRuns.listByNode('node-analysis')
    ).resolves.toEqual([{ ...interrupted, revision: 1 }])
  })

  it('transitions node runs with durable atomic history', async () => {
    let repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-state-machine', 'ready')
    await repositories.nodeRuns.save(run, 0)

    await expect(
      repositories.unitOfWork.execute(() =>
        repositories.nodeRuns.transition({
          nodeRunId: run.id,
          expectedRevision: 1,
          status: 'running',
          reason: 'node_started',
          triggerSource: 'system',
          transitionedAt: 80
        })
      )
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        status: 'running',
        revision: 2,
        updatedAt: 80,
        completedAt: undefined
      }
    })
    await expect(repositories.nodeRuns.listTransitions(run.id)).resolves.toEqual(
      [
        {
          nodeRunId: run.id,
          nodeRunRevision: 2,
          fromStatus: 'ready',
          toStatus: 'running',
          reason: 'node_started',
          triggerSource: 'system',
          transitionedAt: 80
        }
      ]
    )

    await expect(
      repositories.nodeRuns.transition({
        nodeRunId: run.id,
        expectedRevision: 2,
        status: 'running',
        reason: 'node_started',
        triggerSource: 'system',
        transitionedAt: 81
      })
    ).resolves.toMatchObject({
      status: 'saved',
      entity: { status: 'running', revision: 2 }
    })
    await expect(
      repositories.nodeRuns.transition({
        nodeRunId: run.id,
        expectedRevision: 1,
        status: 'paused',
        reason: 'node_paused',
        triggerSource: 'user',
        transitionedAt: 82
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { status: 'running', revision: 2 }
    })

    database.exec(`
      CREATE TRIGGER fail_node_run_transition_history
      BEFORE INSERT ON node_run_transitions
      WHEN NEW.reason = 'force_failure'
      BEGIN
        SELECT RAISE(ABORT, 'forced node history failure');
      END;
    `)
    await expect(
      repositories.nodeRuns.transition({
        nodeRunId: run.id,
        expectedRevision: 2,
        status: 'paused',
        reason: 'force_failure',
        triggerSource: 'user',
        transitionedAt: 83
      })
    ).rejects.toThrow('forced node history failure')
    await expect(repositories.nodeRuns.get(run.id)).resolves.toMatchObject({
      status: 'running',
      revision: 2
    })

    database.exec('DROP TRIGGER fail_node_run_transition_history')
    await expect(repositories.nodeRuns.interruptRunning(84)).resolves.toBe(1)
    await expect(repositories.nodeRuns.get(run.id)).resolves.toMatchObject({
      status: 'interrupted',
      revision: 3,
      updatedAt: 84
    })
    await expect(
      repositories.nodeRuns.listTransitions(run.id)
    ).resolves.toHaveLength(2)

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)
    await expect(
      repositories.nodeRuns.listTransitions(run.id)
    ).resolves.toMatchObject([
      { toStatus: 'running' },
      {
        fromStatus: 'running',
        toStatus: 'interrupted',
        reason: 'startup_interrupted',
        triggerSource: 'recovery'
      }
    ])
  })

  it('transitions workflow executions with durable atomic history', async () => {
    let repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)

    await expect(
      repositories.unitOfWork.execute(() =>
        repositories.workflowExecutions.transition({
          executionId: 'execution-1',
          expectedRevision: 1,
          status: 'waiting_user',
          reason: 'node_waiting_user',
          triggerSource: 'system',
          transitionedAt: 80
        })
      )
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        status: 'waiting_user',
        revision: 2,
        updatedAt: 80,
        completedAt: undefined
      }
    })
    await expect(
      repositories.workflowExecutions.listTransitions('execution-1')
    ).resolves.toEqual([
      {
        executionId: 'execution-1',
        executionRevision: 2,
        fromStatus: 'running',
        toStatus: 'waiting_user',
        reason: 'node_waiting_user',
        triggerSource: 'system',
        transitionedAt: 80
      }
    ])

    await expect(
      repositories.workflowExecutions.transition({
        executionId: 'execution-1',
        expectedRevision: 2,
        status: 'waiting_user',
        reason: 'node_waiting_user',
        triggerSource: 'system',
        transitionedAt: 81
      })
    ).resolves.toMatchObject({
      status: 'saved',
      entity: { status: 'waiting_user', revision: 2 }
    })
    await expect(
      repositories.workflowExecutions.listTransitions('execution-1')
    ).resolves.toHaveLength(1)

    await expect(
      repositories.workflowExecutions.transition({
        executionId: 'execution-1',
        expectedRevision: 1,
        status: 'paused',
        reason: 'workflow_paused',
        triggerSource: 'user',
        transitionedAt: 82
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { status: 'waiting_user', revision: 2 }
    })
    await expect(
      repositories.workflowExecutions.transition({
        executionId: 'execution-1',
        expectedRevision: 2,
        status: 'created',
        reason: 'invalid_reset',
        triggerSource: 'system',
        transitionedAt: 82
      })
    ).rejects.toThrow(
      'Workflow execution cannot transition from waiting_user to created'
    )

    database.exec(`
      CREATE TRIGGER fail_workflow_transition_history
      BEFORE INSERT ON workflow_execution_transitions
      WHEN NEW.reason = 'force_failure'
      BEGIN
        SELECT RAISE(ABORT, 'forced history failure');
      END;
    `)
    await expect(
      repositories.workflowExecutions.transition({
        executionId: 'execution-1',
        expectedRevision: 2,
        status: 'paused',
        reason: 'force_failure',
        triggerSource: 'user',
        transitionedAt: 83
      })
    ).rejects.toThrow('forced history failure')
    await expect(
      repositories.workflowExecutions.get('execution-1')
    ).resolves.toMatchObject({ status: 'waiting_user', revision: 2 })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)
    await expect(
      repositories.workflowExecutions.listTransitions('execution-1')
    ).resolves.toHaveLength(1)
  })

  it('returns the latest workflow execution including terminal states', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    database
      .prepare(
        `UPDATE workflow_executions
         SET status = 'completed', revision = 2, updated_at = 90, completed_at = 90
         WHERE id = 'execution-1'`
      )
      .run()

    await expect(
      repositories.workflowExecutions.getLatestByRequirement(requirement.id)
    ).resolves.toMatchObject({
      id: 'execution-1',
      status: 'completed',
      revision: 2,
      completedAt: 90
    })
    await expect(
      repositories.workflowExecutions.getActiveByRequirement(requirement.id)
    ).resolves.toBeUndefined()
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

    await expect(
      repositories.workflowDispatches.enqueue(dispatch)
    ).resolves.toEqual({
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
        get: (id: string) => Promise<unknown>
        save: (
          entity: NodeTodoRecord,
          expectedRevision: number
        ) => Promise<unknown>
        listByNodeRun: (nodeRunId: string) => Promise<unknown[]>
        transition: (input: {
          todoId: string
          expectedRevision: number
          status: NodeTodoRecord['status']
          reason: string
          triggerSource: 'user' | 'system' | 'recovery'
          transitionedAt: number
        }) => Promise<unknown>
        listTransitions: (nodeTodoId: string) => Promise<unknown[]>
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

    await expect(repositories.nodeTodos.get(todo.id)).resolves.toEqual({
      ...todo,
      revision: 1
    })
    await expect(repositories.nodeTodos.listByNodeRun(run.id)).resolves.toEqual(
      [{ ...todo, revision: 1 }]
    )
    await expect(
      repositories.nodeQuestions.listByNodeRun(run.id)
    ).resolves.toEqual([{ ...question, revision: 1 }])
  })

  it('provides a node approval repository', () => {
    const repositories = createSqliteRepositories(database) as unknown as {
      nodeApprovals?: unknown
    }

    expect(repositories.nodeApprovals).toBeDefined()
  })

  it('persists revisioned approval decisions with idempotency and audit', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-approval', 'waiting_user')
    await repositories.nodeRuns.save(run, 0)

    const first = await repositories.nodeApprovals.decide({
      nodeRunId: run.id,
      decisionId: 'decision-reject',
      expectedRevision: 0,
      result: 'rejected',
      actorType: 'local_user',
      actorId: 'local-user',
      note: '  Missing rollback evidence  ',
      decidedAt: 90
    })

    expect(first).toEqual({
      status: 'saved',
      entity: {
        nodeRunId: run.id,
        decisionId: 'decision-reject',
        result: 'rejected',
        actorType: 'local_user',
        actorId: 'local-user',
        note: 'Missing rollback evidence',
        revision: 1,
        createdAt: 90,
        updatedAt: 90,
        decidedAt: 90
      }
    })
    await expect(
      repositories.nodeApprovals.decide({
        nodeRunId: run.id,
        decisionId: 'decision-reject',
        expectedRevision: 0,
        result: 'rejected',
        actorType: 'local_user',
        actorId: 'local-user',
        note: 'Missing rollback evidence',
        decidedAt: 90
      })
    ).resolves.toEqual(first)
    await expect(
      repositories.nodeApprovals.decide({
        nodeRunId: run.id,
        decisionId: 'decision-reject',
        expectedRevision: 0,
        result: 'approved',
        actorType: 'local_user',
        actorId: 'local-user',
        decidedAt: 91
      })
    ).rejects.toThrow('Approval decision id conflicts with existing content')
    await expect(
      repositories.nodeApprovals.decide({
        nodeRunId: run.id,
        decisionId: 'decision-stale',
        expectedRevision: 0,
        result: 'approved',
        actorType: 'local_user',
        actorId: 'local-user',
        decidedAt: 91
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { decisionId: 'decision-reject', revision: 1 }
    })

    await expect(
      repositories.nodeApprovals.decide({
        nodeRunId: run.id,
        decisionId: 'decision-approve',
        expectedRevision: 1,
        result: 'approved',
        actorType: 'local_user',
        actorId: 'local-user',
        note: ' ',
        decidedAt: 92
      })
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        decisionId: 'decision-approve',
        result: 'approved',
        revision: 2,
        updatedAt: 92,
        decidedAt: 92
      }
    })
    await expect(
      repositories.nodeApprovals.getByNodeRun(run.id)
    ).resolves.toMatchObject({
      decisionId: 'decision-approve',
      result: 'approved',
      revision: 2
    })
    await expect(
      repositories.nodeApprovals.listDecisions(run.id)
    ).resolves.toEqual([
      {
        nodeRunId: run.id,
        approvalRevision: 1,
        decisionId: 'decision-reject',
        result: 'rejected',
        actorType: 'local_user',
        actorId: 'local-user',
        note: 'Missing rollback evidence',
        decidedAt: 90
      },
      {
        nodeRunId: run.id,
        approvalRevision: 2,
        decisionId: 'decision-approve',
        previousResult: 'rejected',
        result: 'approved',
        actorType: 'local_user',
        actorId: 'local-user',
        decidedAt: 92
      }
    ])

    await expect(
      repositories.unitOfWork.execute(async () => {
        await repositories.nodeApprovals.decide({
          nodeRunId: run.id,
          decisionId: 'decision-rollback',
          expectedRevision: 2,
          result: 'rejected',
          actorType: 'local_user',
          actorId: 'local-user',
          decidedAt: 93
        })
        throw new Error('abort approval decision')
      })
    ).rejects.toThrow('abort approval decision')
    await expect(
      repositories.nodeApprovals.getByNodeRun(run.id)
    ).resolves.toMatchObject({ decisionId: 'decision-approve', revision: 2 })
    await expect(
      repositories.nodeApprovals.listDecisions(run.id)
    ).resolves.toHaveLength(2)
  })

  it('transitions node questions with durable atomic history', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-question-transition', 'waiting_user')
    await repositories.nodeRuns.save(run, 0)
    const question: NodeQuestionRecord = {
      id: 'question-transition',
      nodeRunId: run.id,
      prompt: 'Which rollout strategy?',
      required: true,
      status: 'open',
      createdAt: 80,
      updatedAt: 80
    }
    await repositories.nodeQuestions.save(question, 0)

    await expect(
      repositories.nodeQuestions.transition({
        questionId: question.id,
        expectedRevision: 1,
        status: 'answered',
        answer: 'Canary',
        reason: 'question_answered',
        triggerSource: 'user',
        transitionedAt: 81
      })
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        status: 'answered',
        answer: 'Canary',
        revision: 2,
        updatedAt: 81,
        answeredAt: 81
      }
    })
    await expect(
      repositories.nodeQuestions.listTransitions(question.id)
    ).resolves.toEqual([
      {
        nodeQuestionId: question.id,
        nodeQuestionRevision: 2,
        fromStatus: 'open',
        toStatus: 'answered',
        reason: 'question_answered',
        triggerSource: 'user',
        transitionedAt: 81
      }
    ])

    await expect(
      repositories.nodeQuestions.transition({
        questionId: question.id,
        expectedRevision: 1,
        status: 'answered',
        answer: 'Blue-green',
        reason: 'stale_answer',
        triggerSource: 'user',
        transitionedAt: 82
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { answer: 'Canary', revision: 2 }
    })
    await expect(
      repositories.nodeQuestions.listTransitions(question.id)
    ).resolves.toHaveLength(1)

    await expect(
      repositories.unitOfWork.execute(async () => {
        const optional: NodeQuestionRecord = {
          ...question,
          id: 'question-optional',
          required: false,
          createdAt: 82,
          updatedAt: 82
        }
        await repositories.nodeQuestions.save(optional, 0)
        await repositories.nodeQuestions.transition({
          questionId: optional.id,
          expectedRevision: 1,
          status: 'dismissed',
          reason: 'question_dismissed',
          triggerSource: 'user',
          transitionedAt: 83
        })
        throw new Error('abort question transition')
      })
    ).rejects.toThrow('abort question transition')
    await expect(
      repositories.nodeQuestions.get('question-optional')
    ).resolves.toBeUndefined()
    await expect(
      repositories.nodeQuestions.listTransitions('question-optional')
    ).resolves.toEqual([])
  })

  it('transitions node todos with durable atomic history', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-todo-transition', 'running')
    await repositories.nodeRuns.save(run, 0)
    const todo: NodeTodoRecord = {
      id: 'todo-transition',
      nodeRunId: run.id,
      title: 'Inspect migration',
      required: true,
      status: 'pending',
      createdAt: 80,
      updatedAt: 80
    }
    await repositories.nodeTodos.save(todo, 0)

    await expect(
      repositories.nodeTodos.transition({
        todoId: todo.id,
        expectedRevision: 1,
        status: 'blocked',
        reason: 'dependency_missing',
        triggerSource: 'user',
        transitionedAt: 81
      })
    ).resolves.toMatchObject({
      status: 'saved',
      entity: { status: 'blocked', revision: 2, updatedAt: 81 }
    })
    await expect(
      repositories.nodeTodos.listTransitions(todo.id)
    ).resolves.toEqual([
      {
        nodeTodoId: todo.id,
        nodeTodoRevision: 2,
        fromStatus: 'pending',
        toStatus: 'blocked',
        reason: 'dependency_missing',
        triggerSource: 'user',
        transitionedAt: 81
      }
    ])

    await expect(
      repositories.nodeTodos.transition({
        todoId: todo.id,
        expectedRevision: 1,
        status: 'completed',
        reason: 'stale_write',
        triggerSource: 'user',
        transitionedAt: 82
      })
    ).resolves.toMatchObject({
      status: 'conflict',
      entity: { status: 'blocked', revision: 2 }
    })
    await expect(
      repositories.nodeTodos.listTransitions(todo.id)
    ).resolves.toHaveLength(1)

    await expect(
      repositories.unitOfWork.execute(async () => {
        await repositories.nodeTodos.transition({
          todoId: todo.id,
          expectedRevision: 2,
          status: 'in_progress',
          reason: 'dependency_available',
          triggerSource: 'user',
          transitionedAt: 83
        })
        throw new Error('abort todo transition')
      })
    ).rejects.toThrow('abort todo transition')
    await expect(repositories.nodeTodos.get(todo.id)).resolves.toMatchObject({
      status: 'blocked',
      revision: 2
    })
    await expect(
      repositories.nodeTodos.listTransitions(todo.id)
    ).resolves.toHaveLength(1)
  })

  it('records todo completion time and cascades transition history on delete', async () => {
    const repositories = createSqliteRepositories(database)
    await seedWorkflowExecution(repositories)
    const run = nodeRun('node-run-todo-delete', 'running')
    await repositories.nodeRuns.save(run, 0)
    const todo: NodeTodoRecord = {
      id: 'todo-delete',
      nodeRunId: run.id,
      title: 'Confirm release',
      required: true,
      status: 'pending',
      createdAt: 90,
      updatedAt: 90
    }
    await repositories.nodeTodos.save(todo, 0)

    await expect(
      repositories.nodeTodos.transition({
        todoId: todo.id,
        expectedRevision: 1,
        status: 'completed',
        reason: 'done',
        triggerSource: 'user',
        transitionedAt: 91
      })
    ).resolves.toMatchObject({
      status: 'saved',
      entity: {
        status: 'completed',
        completedAt: 91,
        revision: 2
      }
    })
    await expect(repositories.nodeTodos.get(todo.id)).resolves.toMatchObject({
      completedAt: 91
    })
    await expect(repositories.nodeTodos.delete(todo.id, 1)).resolves.toBe(false)
    await expect(repositories.nodeTodos.delete(todo.id, 2)).resolves.toBe(true)
    await expect(repositories.nodeTodos.get(todo.id)).resolves.toBeUndefined()
    await expect(
      repositories.nodeTodos.listTransitions(todo.id)
    ).resolves.toEqual([])
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
    await repositories.modelPool.saveProvider(
      {
        id: 'provider-run',
        type: 'local',
        name: 'Local',
        baseUrl: 'http://127.0.0.1',
        enabled: true
      },
      0
    )
    await repositories.modelPool.saveProfile(
      {
        id: 'profile-run',
        providerId: 'provider-run',
        modelId: 'local-model',
        displayName: 'Local model',
        enabled: true,
        capabilities: {
          text: true,
          vision: false,
          toolCalling: false,
          structuredOutput: false
        },
        contextWindow: 32_000,
        timeoutMs: 30_000,
        maxRetries: 1,
        maxConcurrency: 1,
        inputCostPerMillionTokens: 0,
        outputCostPerMillionTokens: 0
      },
      0
    )
    const run = createAiRun(
      'run-1',
      requirement.id,
      'analysis',
      undefined,
      {
        workspaceId: workspace.id,
        modelProfileId: 'profile-run',
        startedAt: 100
      }
    )

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
        type: 'answer.delta',
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
      lastSequence: 2,
      workspaceId: workspace.id,
      modelProfileId: 'profile-run',
      startedAt: 100
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
      type: 'openai_completions',
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
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 4,
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
      {
        ...provider,
        source: 'custom',
        baseUrlOverridden: false,
        revision: 1
      }
    ])
    await expect(modelPool.listProfiles()).resolves.toEqual([
      { ...profile, revision: 1 }
    ])
  })

  it('persists the application model default with entity-level CAS', async () => {
    const { modelDefaults } = createSqliteRepositories(database)

    await expect(modelDefaults.get()).resolves.toEqual({
      mode: 'auto',
      revision: 0
    })
    await expect(
      modelDefaults.save(
        {
          mode: 'profile',
          providerId: 'provider-1',
          profileId: 'profile-1'
        },
        0
      )
    ).resolves.toEqual({
      status: 'saved',
      entity: {
        mode: 'profile',
        providerId: 'provider-1',
        profileId: 'profile-1',
        revision: 1
      }
    })
    await expect(
      modelDefaults.save({ mode: 'auto' }, 0)
    ).resolves.toEqual({
      status: 'conflict',
      entity: {
        mode: 'profile',
        providerId: 'provider-1',
        profileId: 'profile-1',
        revision: 1
      }
    })

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    await expect(
      createSqliteRepositories(database).modelDefaults.get()
    ).resolves.toEqual({
      mode: 'profile',
      providerId: 'provider-1',
      profileId: 'profile-1',
      revision: 1
    })
  })

  it('round-trips catalog ownership and user enablement overrides', async () => {
    const { modelPool } = createSqliteRepositories(database)
    const provider: ModelProvider = {
      id: 'builtin-deepseek',
      type: 'openai_completions',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      enabled: true
    }
    const profile: ModelProfile = {
      id: 'builtin-deepseek:deepseek-v4-flash',
      providerId: provider.id,
      modelId: 'deepseek-v4-flash',
      displayName: 'DeepSeek V4 Flash',
      source: 'catalog',
      catalogProviderId: 'deepseek',
      catalogModelId: 'deepseek-v4-flash',
      catalogVersion: 1,
      defaultEnabled: true,
      enabledOverride: false,
      enabled: false,
      lifecycleStatus: 'active',
      capabilities: {
        text: true,
        vision: false,
        toolCalling: true,
        structuredOutput: true
      },
      inputTypes: ['text'],
      reasoning: true,
      contextWindow: 1_000_000,
      maxOutputTokens: 384_000,
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 2,
      inputCostPerMillionTokens: 0.14,
      outputCostPerMillionTokens: 0.28
    }

    await modelPool.saveProvider(provider, 0)
    await expect(modelPool.saveProfile(profile, 0)).resolves.toEqual({
      status: 'saved',
      entity: { ...profile, revision: 1 }
    })
    await expect(modelPool.getProfile(profile.id)).resolves.toEqual({
      ...profile,
      revision: 1
    })
  })

  it('round-trips complete custom model metadata', async () => {
    const { modelPool } = createSqliteRepositories(database)
    const provider: ModelProvider = {
      id: 'provider-custom-model',
      type: 'openai_responses',
      name: 'Custom Responses',
      baseUrl: 'https://api.example.com/v1',
      enabled: true,
      source: 'custom',
      icon: 'sparkles',
      baseUrlOverridden: false
    }
    const profile: ModelProfile = {
      id: 'profile-custom-model',
      providerId: provider.id,
      modelId: 'reasoning-model',
      displayName: 'Reasoning Model',
      source: 'custom',
      icon: 'brain',
      apiType: 'openai_responses',
      deepSeekThinking: true,
      enabled: false,
      capabilities: {
        text: true,
        vision: true,
        toolCalling: true,
        structuredOutput: true
      },
      inputTypes: ['text', 'image'],
      reasoning: true,
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 4,
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 8
    }
    await modelPool.saveProvider(provider, 0)

    await expect(modelPool.saveProfile(profile, 0)).resolves.toEqual({
      status: 'saved',
      entity: { ...profile, revision: 1 }
    })
    await expect(modelPool.getProfile(profile.id)).resolves.toEqual({
      ...profile,
      revision: 1
    })
  })

  it('protects referenced providers and persists immutable provider events', async () => {
    const repositories = createSqliteRepositories(database)
    const provider: ModelProvider = {
      id: 'provider-protected',
      type: 'openai_completions',
      name: 'Protected',
      baseUrl: 'https://api.example.com/v1',
      enabled: true
    }
    const profile: ModelProfile = {
      id: 'profile-protected',
      providerId: provider.id,
      modelId: 'example-model',
      displayName: 'Example',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      },
      contextWindow: 4_096,
      timeoutMs: 60_000,
      maxRetries: 1,
      maxConcurrency: 1,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0
    }
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)

    await expect(
      repositories.modelPool.countProfilesByProvider(provider.id)
    ).resolves.toBe(1)
    await expect(
      repositories.modelPool.deleteProvider(provider.id, 1)
    ).resolves.toBe(false)
    expect(() =>
      database
        .prepare('DELETE FROM model_providers WHERE id = ?')
        .run(provider.id)
    ).toThrow('Model provider is referenced by model profiles')
    await repositories.modelProviderEvents.append({
      id: 'provider-event-1',
      idempotencyKey: 'provider-protected:created:1',
      providerId: provider.id,
      eventType: 'created',
      fromRevision: 0,
      toRevision: 1,
      triggerSource: 'user',
      occurredAt: 100
    })
    await expect(
      repositories.modelProviderEvents.listByProvider(provider.id)
    ).resolves.toHaveLength(1)
    expect(() =>
      database
        .prepare(
          'UPDATE model_provider_events SET occurred_at = 101 WHERE id = ?'
        )
        .run('provider-event-1')
    ).toThrow('Model provider events are immutable')
  })

  it('counts persisted profile references and rejects a referenced delete', async () => {
    const repositories = createSqliteRepositories(database)
    const provider: ModelProvider = {
      id: 'provider-referenced-profile',
      type: 'local',
      name: 'Local',
      baseUrl: 'http://127.0.0.1',
      enabled: true
    }
    const profile: ModelProfile = {
      id: 'profile-referenced',
      providerId: provider.id,
      modelId: 'referenced-model',
      displayName: 'Referenced Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      },
      contextWindow: 8_192,
      timeoutMs: 60_000,
      maxRetries: 1,
      maxConcurrency: 2,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0
    }
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    await seedWorkflowExecution(repositories)
    const fixedModel = JSON.stringify({
      model: { strategy: 'fixed', profileId: profile.id }
    })
    database
      .prepare('UPDATE workflow_nodes SET config_json = ? WHERE id = ?')
      .run(fixedModel, 'builtin-analysis')
    database
      .prepare('UPDATE requirement_nodes SET config_json = ? WHERE id = ?')
      .run(fixedModel, 'node-analysis')
    await repositories.nodeRuns.save(
      {
        id: 'profile-node-run',
        executionId: 'execution-1',
        nodeId: 'node-analysis',
        status: 'interrupted',
        attempt: 1,
        checkpoint: { modelProfileId: profile.id },
        createdAt: 80,
        updatedAt: 80
      },
      0
    )
    await repositories.chatSessions.save(
      {
        id: 'profile-conversation',
        kind: 'general',
        knowledgeScope: { kind: 'none' },
        title: 'Pinned conversation',
        sortOrder: 1,
        messages: [],
        modelProfileId: profile.id,
        createdAt: 80,
        updatedAt: 80
      },
      0
    )
    await repositories.modelMetrics.append({
      id: 'profile-metric',
      source: 'workflow_node',
      providerId: provider.id,
      modelProfileId: profile.id,
      aiRunId: 'profile-metric-run',
      inputTokens: 1,
      outputTokens: 1,
      durationMs: 1,
      throughputTokensPerSecond: 1_000,
      retryCount: 0,
      status: 'completed',
      estimatedInputCost: 0,
      estimatedOutputCost: 0,
      estimatedCost: 0,
      startedAt: 80
    })
    const modelPool = repositories.modelPool as typeof repositories.modelPool & {
      getProfileReferences: (id: string) => Promise<{
        workflowCount: number
        runCount: number
        conversationCount: number
        metricCount: number
      }>
      deleteProfile: (id: string, revision: number) => Promise<boolean>
    }

    await expect(modelPool.getProfileReferences(profile.id)).resolves.toEqual({
      workflowCount: 2,
      runCount: 1,
      conversationCount: 1,
      metricCount: 1
    })
    await expect(modelPool.deleteProfile(profile.id, 1)).resolves.toBe(false)
    expect(() =>
      database
        .prepare('DELETE FROM model_profiles WHERE id = ?')
        .run(profile.id)
    ).toThrow('Model profile is referenced')
    await expect(repositories.modelPool.getProfile(profile.id)).resolves.toEqual({
      ...profile,
      revision: 1
    })
  })

  it('persists model profile events as immutable history', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelProfileEvents.append({
      id: 'profile-event-1',
      idempotencyKey: 'profile-1:created:1',
      profileId: 'profile-1',
      providerId: 'provider-1',
      eventType: 'created',
      fromRevision: 0,
      toRevision: 1,
      triggerSource: 'user',
      occurredAt: 100
    })

    await expect(
      repositories.modelProfileEvents.listByProfile('profile-1')
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'profile-event-1',
        eventType: 'created',
        occurredAt: 100
      })
    ])
    expect(() =>
      database
        .prepare(
          'UPDATE model_profile_events SET occurred_at = 101 WHERE id = ?'
        )
        .run('profile-event-1')
    ).toThrow('Model profile events are immutable')
  })

  it('persists immutable availability checks and resolves current revisions', async () => {
    const { modelAvailabilityChecks } = createSqliteRepositories(database)
    const current: ModelAvailabilityCheck = {
      id: 'availability-current',
      requestId: 'availability-request-current',
      providerId: 'provider-1',
      profileId: 'profile-1',
      providerRevision: 2,
      profileRevision: 3,
      status: 'available',
      checkedCapabilities: ['text', 'toolCalling'],
      missingCapabilities: [],
      latencyMs: 24,
      message: 'Model is available',
      checkedAt: 200,
      triggerSource: 'user'
    }
    const older = {
      ...current,
      id: 'availability-older',
      requestId: 'availability-request-older',
      checkedAt: 100
    }
    const stale = {
      ...current,
      id: 'availability-stale',
      requestId: 'availability-request-stale',
      profileRevision: 2,
      checkedAt: 300
    }

    await modelAvailabilityChecks.append(older)
    await modelAvailabilityChecks.append(current)
    await modelAvailabilityChecks.append(stale)

    await expect(
      modelAvailabilityChecks.getByRequestId(current.requestId)
    ).resolves.toEqual(current)
    await expect(
      modelAvailabilityChecks.getLatestCurrent('profile-1', 2, 3)
    ).resolves.toEqual(current)
    await expect(
      modelAvailabilityChecks.append({
        ...current,
        id: 'availability-duplicate'
      })
    ).rejects.toThrow()
    expect(() =>
      database
        .prepare(
          'UPDATE model_availability_checks SET checked_at = 201 WHERE id = ?'
        )
        .run(current.id)
    ).toThrow('Model availability checks are immutable')
    expect(() =>
      database
        .prepare('DELETE FROM model_availability_checks WHERE id = ?')
        .run(current.id)
    ).toThrow('Model availability checks are immutable')
  })

  it('stores encrypted model credentials as binary values', async () => {
    const repositories = createSqliteRepositories(database)
    await repositories.modelPool.saveProvider(
      {
        id: 'provider-1',
        type: 'openai_completions',
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
    await expect(repositories.modelCredentials.list()).resolves.toEqual([
      {
        id: 'credential-1',
        providerId: 'provider-1',
        encryptedValue: Uint8Array.from([1, 2, 3]),
        nonce: Uint8Array.from([4, 5]),
        authTag: Uint8Array.from([6, 7]),
        keyVersion: 1,
        createdAt: 100,
        updatedAt: 100
      }
    ])
  })

  it('persists model credential key rotations as idempotent immutable events', async () => {
    const { modelCredentialKeyRotations } = createSqliteRepositories(database)
    const rotation = {
      id: 'rotation-event-1',
      requestId: 'rotation-request-1',
      fromKeyVersion: 1,
      toKeyVersion: 2,
      credentialCount: 3,
      triggerSource: 'user' as const,
      rotatedAt: 200
    }

    await modelCredentialKeyRotations.append(rotation)

    await expect(
      modelCredentialKeyRotations.getByRequestId(rotation.requestId)
    ).resolves.toEqual(rotation)
    await expect(
      modelCredentialKeyRotations.append({
        ...rotation,
        id: 'rotation-event-duplicate'
      })
    ).rejects.toThrow()
    expect(() =>
      database
        .prepare(
          `UPDATE model_credential_key_rotations
           SET credential_count = 4 WHERE id = ?`
        )
        .run(rotation.id)
    ).toThrow('Model credential key rotations are immutable')
    expect(() =>
      database
        .prepare('DELETE FROM model_credential_key_rotations WHERE id = ?')
        .run(rotation.id)
    ).toThrow('Model credential key rotations are immutable')
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
      timeoutMs: 60_000,
      maxRetries: 1,
      maxConcurrency: 1,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0
    }
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    const metric: ModelCallMetric = {
      id: 'metric-1',
      source: 'workflow_stage',
      providerId: provider.id,
      modelProfileId: profile.id,
      workspaceId: workspace.id,
      requirementId: requirement.id,
      aiRunId: 'metric-run-1',
      inputTokens: 120,
      outputTokens: 40,
      cachedTokens: 20,
      reasoningTokens: 10,
      startedAt: 1_000,
      firstTokenLatencyMs: 25,
      durationMs: 80,
      throughputTokensPerSecond: 727.27,
      retryCount: 1,
      status: 'completed',
      estimatedInputCost: 0,
      estimatedOutputCost: 0,
      estimatedCost: 0
    }

    await repositories.requirements.save(requirement, 0)
    await expect(repositories.modelMetrics.append(metric)).resolves.toEqual(metric)

    await expect(
      repositories.modelMetrics.list({ workspaceId: workspace.id })
    ).resolves.toEqual([metric])
    await expect(
      repositories.modelMetrics.list({ providerId: 'missing' })
    ).resolves.toEqual([])
    await expect(
      repositories.modelMetrics.append({
        ...metric,
        id: 'metric-replay',
        outputTokens: 999
      })
    ).resolves.toEqual(metric)
    await expect(repositories.modelMetrics.list()).resolves.toEqual([metric])
    expect(() =>
      database
        .prepare(
          'UPDATE model_call_metrics SET duration_ms = 1 WHERE id = ?'
        )
        .run(metric.id)
    ).toThrow('Model call metrics are immutable')
    expect(() =>
      database
        .prepare('DELETE FROM model_call_metrics WHERE id = ?')
        .run(metric.id)
    ).toThrow('Model call metrics are immutable')
  })

  it('records conversation metrics for sidecar runs outside ai_runs', async () => {
    const repositories = createSqliteRepositories(database)
    const provider: ModelProvider = {
      id: 'provider-conversation',
      type: 'local',
      name: 'Local Conversation',
      baseUrl: 'http://127.0.0.1',
      enabled: true
    }
    const profile: ModelProfile = {
      id: 'profile-conversation',
      providerId: provider.id,
      modelId: 'conversation-model',
      displayName: 'Conversation Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      },
      contextWindow: 4_096,
      timeoutMs: 60_000,
      maxRetries: 1,
      maxConcurrency: 1,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0
    }
    const conversation = {
      id: 'conversation-metric-session',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Metric conversation',
      sortOrder: 0,
      messages: [],
      createdAt: 1_000,
      updatedAt: 1_000
    } as unknown as ChatSessionRecord
    const metric: ModelCallMetric = {
      id: 'conversation-metric',
      source: 'general_conversation',
      providerId: provider.id,
      modelProfileId: profile.id,
      conversationId: conversation.id,
      aiRunId: 'sidecar-run-not-in-ai-runs',
      inputTokens: 12,
      outputTokens: 5,
      cachedTokens: 0,
      reasoningTokens: 0,
      startedAt: 1_001,
      durationMs: 25,
      throughputTokensPerSecond: 200,
      retryCount: 0,
      status: 'completed',
      estimatedInputCost: 0,
      estimatedOutputCost: 0,
      estimatedCost: 0
    }

    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    await repositories.chatSessions.save(conversation, 0)
    await repositories.modelMetrics.append(metric)

    await expect(
      repositories.modelMetrics.list({ conversationId: conversation.id })
    ).resolves.toEqual([metric])
    expect(
      database
        .prepare(
          `SELECT requested_reasoning, effective_reasoning
           FROM model_call_metrics WHERE id = ?`
        )
        .get(metric.id)
    ).toEqual({
      requested_reasoning: null,
      effective_reasoning: null
    })
  })

  it('persists immutable context snapshots and links model metrics by ID', async () => {
    const repositories = createSqliteRepositories(database)
    const provider: ModelProvider = {
      id: 'provider-context',
      type: 'local',
      name: 'Local Context',
      baseUrl: 'http://127.0.0.1',
      enabled: true
    }
    const profile: ModelProfile = {
      id: 'profile-context',
      providerId: provider.id,
      modelId: 'context-model',
      displayName: 'Context Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false
      },
      contextWindow: 8_192,
      timeoutMs: 30_000,
      maxRetries: 2,
      maxConcurrency: 1,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0
    }
    await repositories.modelPool.saveProvider(provider, 0)
    await repositories.modelPool.saveProfile(profile, 0)
    await seedWorkflowExecution(repositories)
    await repositories.nodeRuns.save(nodeRun('context-node-run', 'ready'), 0)
    const contextSnapshots = (
      repositories as typeof repositories & {
        contextSnapshots?: {
          append: (snapshot: unknown) => Promise<void>
          get: (id: string) => Promise<unknown>
          getByNodeRun: (nodeRunId: string) => Promise<unknown>
        }
      }
    ).contextSnapshots

    expect(contextSnapshots).toBeDefined()
    const snapshot = {
      id: 'context-snapshot-1',
      requirementId: requirement.id,
      nodeId: 'node-analysis',
      nodeRunId: 'context-node-run',
      providerId: provider.id,
      modelProfileId: profile.id,
      modelId: profile.modelId,
      modelParameters: {
        timeoutMs: profile.timeoutMs,
        maxRetries: profile.maxRetries,
        maxConcurrency: profile.maxConcurrency
      },
      policyVersion: 3,
      content: '## Requirement\nPersist exact context.\n\n',
      sources: [
        {
          kind: 'requirement',
          id: requirement.id,
          version: 1,
          characterCount: 39,
          includedCharacters: 39,
          estimatedTokens: 10,
          status: 'included',
          truncated: false,
          summarized: false,
          redacted: false,
          preview: '## Requirement\nPersist exact context.\n\n'
        }
      ],
      plan: {
        totalTokenBudget: 10,
        allocations: { fixed: 10, knowledge: 0 }
      },
      insufficientKnowledge: false,
      characterCount: 39,
      estimatedTokens: 10,
      checksum: `sha256:${'a'.repeat(64)}`,
      createdAt: 100
    }
    await contextSnapshots!.append(snapshot)

    await expect(contextSnapshots!.get(snapshot.id)).resolves.toEqual(snapshot)
    await expect(
      contextSnapshots!.getByNodeRun(snapshot.nodeRunId)
    ).resolves.toEqual(snapshot)
    await expect(
      contextSnapshots!.append({ ...snapshot, id: 'duplicate-snapshot' })
    ).rejects.toThrow()
    expect(() =>
      database
        .prepare('UPDATE context_snapshots SET content = ? WHERE id = ?')
        .run('changed', snapshot.id)
    ).toThrow('Context snapshots are immutable')

    const metric: ModelCallMetric & { contextSnapshotId: string } = {
      id: 'metric-context',
      source: 'workflow_node',
      providerId: provider.id,
      modelProfileId: profile.id,
      requirementId: requirement.id,
      nodeId: 'node-analysis',
      aiRunId: 'metric-context-run',
      contextSnapshotId: snapshot.id,
      requestedReasoning: 'high',
      effectiveReasoning: 'high',
      inputTokens: 10,
      outputTokens: 2,
      cachedTokens: 0,
      reasoningTokens: 0,
      startedAt: 101,
      durationMs: 5,
      throughputTokensPerSecond: 400,
      retryCount: 0,
      status: 'completed',
      estimatedInputCost: 0,
      estimatedOutputCost: 0,
      estimatedCost: 0
    }
    await repositories.modelMetrics.append(metric)
    await expect(
      repositories.modelMetrics.list({ requirementId: requirement.id })
    ).resolves.toEqual([metric])
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
      maxParallelism: 1,
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
    0,
    { reason: 'workflow_created', triggerSource: 'system' }
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
