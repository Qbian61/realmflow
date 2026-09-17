import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeRunRecord } from '../../application/ports/business-repositories'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../sqlite/database'
import { createSqliteRepositories } from '../sqlite/repositories'
import { SqliteNodeRunResumer } from './sqlite-node-run-resumer'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-node-resumer-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteNodeRunResumer', () => {
  it('resumes a custom node through its persisted node identity and model profile', async () => {
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
        status: 'active',
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1
      },
      0
    )
    await repositories.requirementWorkflows.save(
      {
        requirementId: 'requirement-1',
        templateVersionId: 'builtin-sdlc-v1',
        revision: 0,
        nodes: [
          {
            id: 'custom-security-review',
            type: 'ai_generate',
            name: 'Security review',
            description: '',
            order: 0,
            status: 'interrupted',
            allowSkip: false,
            executor: {
              kind: 'ai_generate',
              prompt: 'Review the implementation for security issues.',
              artifact: {
                relativePath: 'reviews/security.md',
                kind: 'markdown'
              }
            }
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
      .run(
        'execution-1',
        'requirement-1',
        'interrupted',
        'custom-security-review',
        1,
        1,
        1
      )
    const executeNode = {
      execute: vi.fn().mockResolvedValue({
        runId: 'new-ai-run',
        completion: Promise.resolve()
      })
    }
    const resumer = new SqliteNodeRunResumer(database, executeNode)
    const nodeRun: NodeRunRecord & { revision: number } = {
      id: 'node-run-1',
      executionId: 'execution-1',
      nodeId: 'custom-security-review',
      status: 'interrupted',
      attempt: 1,
      checkpoint: { modelProfileId: 'profile-1' },
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }

    await expect(resumer.resume(nodeRun)).resolves.toEqual({
      aiRunId: 'new-ai-run'
    })
    expect(executeNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'custom-security-review',
      nodeRunId: 'node-run-1',
      modelProfileId: 'profile-1'
    })
  })
})
