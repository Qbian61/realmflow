import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RequirementWorkflow } from '../../../../domain/workflow'
import type {
  ChatSessionRecord,
  NodeQuestionRecord,
  NodeRunRecord,
  RequirementRecord,
  WorkflowExecutionRecord,
  WorkspaceRecord
} from '../ports/business-repositories'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import {
  createSqliteRepositories,
  type SqliteRepositories
} from '../../infrastructure/sqlite/repositories'
import { ManageNodeQuestionsUseCase } from '../workflow/manage-node-questions'
import { BeginRequirementNodeTurnUseCase } from './begin-requirement-node-turn'

let directory: string
let database: RealmFlowDatabase

const workspace: WorkspaceRecord = {
  id: 'workspace-node-chat',
  path: '/spaces/node-chat',
  label: 'Node chat',
  description: '',
  rootPath: '/tmp/realmflow-node-chat',
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1
}

const requirement: RequirementRecord = {
  id: 'requirement-node-chat',
  workspaceId: workspace.id,
  title: 'Node conversation',
  stage: 'implementation',
  status: 'active',
  bodyRelativePath: 'requirement.md',
  sortOrder: 0,
  createdAt: 2,
  updatedAt: 2
}

const workflow: RequirementWorkflow = {
  requirementId: requirement.id,
  templateVersionId: 'builtin-sdlc-v1',
  revision: 0,
  maxParallelism: 1,
  nodes: [
    {
      id: 'node-build',
      type: 'ai_generate',
      name: 'Build',
      description: '',
      order: 0,
      status: 'waiting_user',
      allowSkip: false
    }
  ],
  edges: []
}

const execution: WorkflowExecutionRecord = {
  id: 'execution-node-chat',
  requirementId: requirement.id,
  status: 'waiting_user',
  currentNodeId: 'node-build',
  createdAt: 3,
  updatedAt: 3
}

const nodeRun: NodeRunRecord = {
  id: 'node-run-build',
  executionId: execution.id,
  nodeId: 'node-build',
  status: 'waiting_user',
  attempt: 1,
  createdAt: 4,
  updatedAt: 4
}

const question: NodeQuestionRecord = {
  id: 'question-rollout',
  nodeRunId: nodeRun.id,
  prompt: 'Which rollout?',
  required: true,
  status: 'open',
  createdAt: 5,
  updatedAt: 5
}

const session: ChatSessionRecord = {
  id: 'conversation-node-chat',
  kind: 'requirement_node',
  workspaceId: workspace.id,
  requirementId: requirement.id,
  nodeRunId: nodeRun.id,
  title: 'Build',
  sortOrder: 6,
  messages: [],
  createdAt: 6,
  updatedAt: 6
}

const turnInput = {
  session,
  expectedRevision: 0,
  userMessageId: 'message-answer',
  assistantMessageId: 'message-assistant',
  content: 'Canary',
  references: { questionId: question.id },
  createdAt: 10
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-node-chat-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('BeginRequirementNodeTurnUseCase SQLite transaction', () => {
  it('commits the question transition and linked turn together', async () => {
    const { repositories, useCase } = await createHarness()

    await expect(
      useCase.execute(turnInput, {
        id: question.id,
        nodeRunId: nodeRun.id,
        answer: 'Canary',
        expectedRevision: 1
      })
    ).resolves.toMatchObject({
      status: 'started',
      answeredQuestion: {
        id: question.id,
        status: 'answered',
        answer: 'Canary',
        revision: 2
      },
      entity: {
        id: session.id,
        revision: 1,
        messages: [
          {
            id: 'message-answer',
            questionId: question.id,
            status: 'completed'
          },
          { id: 'message-assistant', status: 'pending' }
        ]
      }
    })
    await expect(repositories.nodeQuestions.get(question.id)).resolves.toMatchObject(
      { status: 'answered', answer: 'Canary', revision: 2 }
    )
    await expect(
      repositories.nodeQuestions.listTransitions(question.id)
    ).resolves.toHaveLength(1)
    await expect(repositories.chatSessions.get(session.id)).resolves.toMatchObject({
      revision: 1,
      messages: [
        { id: 'message-answer', questionId: question.id },
        { id: 'message-assistant', status: 'pending' }
      ]
    })
  })

  it('rolls back the question and transition when chat persistence fails', async () => {
    const { repositories, useCase } = await createHarness()
    database.exec(`
      CREATE TRIGGER fail_node_chat_message
      BEFORE INSERT ON chat_messages
      BEGIN
        SELECT RAISE(ABORT, 'forced node chat failure');
      END;
    `)

    await expect(
      useCase.execute(turnInput, {
        id: question.id,
        nodeRunId: nodeRun.id,
        answer: 'Canary',
        expectedRevision: 1
      })
    ).rejects.toThrow('forced node chat failure')

    await expect(repositories.nodeQuestions.get(question.id)).resolves.toMatchObject(
      { status: 'open', revision: 1 }
    )
    await expect(
      repositories.nodeQuestions.listTransitions(question.id)
    ).resolves.toEqual([])
    await expect(repositories.chatSessions.get(session.id)).resolves.toBeUndefined()
  })
})

async function createHarness(): Promise<{
  repositories: SqliteRepositories
  useCase: BeginRequirementNodeTurnUseCase
}> {
  const repositories = createSqliteRepositories(database)
  await repositories.workspaces.save(workspace, 0)
  await repositories.requirements.save(requirement, 0)
  await repositories.requirementWorkflows.save(workflow, 0, {
    reason: 'workflow_created',
    triggerSource: 'system'
  })
  await repositories.workflowExecutions.save(execution, 0)
  await repositories.nodeRuns.save(nodeRun, 0)
  await repositories.nodeQuestions.save(question, 0)
  const questions = new ManageNodeQuestionsUseCase(
    {
      questions: repositories.nodeQuestions,
      nodeRuns: repositories.nodeRuns,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      unitOfWork: repositories.unitOfWork
    },
    () => 10
  )
  return {
    repositories,
    useCase: new BeginRequirementNodeTurnUseCase({
      sessions: repositories.chatSessions,
      questions,
      unitOfWork: repositories.unitOfWork
    })
  }
}
