import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { SqliteAssistantRunEventStore } from '../../infrastructure/sqlite/assistant-run-event-store'
import { createSqliteRepositories } from '../../infrastructure/sqlite/repositories'
import type { WorkspaceMetadataStore } from '../../workspace/workspace-metadata-store'
import { WorkspaceService } from '../../workspace/workspace-service'
import { CreateFolderConversationUseCase } from './create-folder-conversation'
import { SendConversationMessageUseCase } from './send-conversation-message'

describe('folder conversation SQLite integration', () => {
  let temporaryDirectory: string
  let database: RealmFlowDatabase

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-folder-chat-'))
    database = openRealmFlowDatabase(join(temporaryDirectory, 'realmflow.db'))
  })

  afterEach(async () => {
    database.close()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('persists the canonical folder and rejects a turn after the folder is removed', async () => {
    const folderPath = join(temporaryDirectory, 'task')
    await mkdir(folderPath)
    const workspace = new WorkspaceService({} as WorkspaceMetadataStore)
    const binding = await workspace.bindSessionDirectory(folderPath)
    const canonicalFolderPath = binding.rootPath
    let repositories = createSqliteRepositories(database)
    const createRun = vi.fn(async () => ({ runId: 'run-folder-create' }))
    const sender = createSender(
      repositories.chatSessions,
      workspace,
      createRun,
      new SqliteAssistantRunEventStore(database)
    )
    const create = new CreateFolderConversationUseCase({
      folders: workspace,
      sender,
      now: () => 100
    })

    const created = await create.execute({
      id: 'conversation-folder',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Folder chat',
      prompt: 'Inspect folder',
      folderBindingId: binding.requirementId
    })

    expect(created).toMatchObject({
      id: 'conversation-folder',
      kind: 'general',
      folderPath: canonicalFolderPath,
      revision: 3
    })
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ folderPath: canonicalFolderPath }),
      undefined
    )

    database.close()
    database = openRealmFlowDatabase(join(temporaryDirectory, 'realmflow.db'))
    repositories = createSqliteRepositories(database)
    const reopened = await repositories.chatSessions.get(created.id)
    expect(reopened).toEqual(created)

    await rm(folderPath, { recursive: true })
    const appendRun = vi.fn()
    const append = createSender(
      repositories.chatSessions,
      workspace,
      appendRun,
      new SqliteAssistantRunEventStore(database)
    )
    await expect(
      append.execute({
        sessionId: created.id,
        content: 'Continue',
        expectedRevision: created.revision,
        messageId: 'message-after-delete'
      })
    ).rejects.toThrow('绑定的文件夹不可用，请检查目录后重试')
    expect(appendRun).not.toHaveBeenCalled()
    await expect(repositories.chatSessions.get(created.id)).resolves.toEqual(
      created
    )
  })
})

function createSender(
  sessions: ReturnType<typeof createSqliteRepositories>['chatSessions'],
  workspace: WorkspaceService,
  createRun: ReturnType<typeof vi.fn>,
  timeline: SqliteAssistantRunEventStore
) {
  return new SendConversationMessageUseCase({
    sessions,
    folderContext: {
      assertAvailable: (folderPath) =>
        workspace.assertSessionDirectoryAvailable(folderPath)
    },
    gateway: {
      createRun,
      cancelRun: vi.fn(),
      streamEvents: async function* () {
        yield event(1, 'answer.delta', { delta: 'Folder answer' })
        yield event(2, 'run.completed', {})
      }
    },
    timeline,
    createId: () => 'message-assistant',
    now: () => 100
  })
}

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data']
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId: 'run-folder-create',
    sequence,
    type,
    timestamp: '2026-09-20T00:00:00.000Z',
    data
  }
}
