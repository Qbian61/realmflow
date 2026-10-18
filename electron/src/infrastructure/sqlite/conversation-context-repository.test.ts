import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConversationMemoryEntry } from '../../../../domain/conversation-memory'
import type { ChatSessionRecord } from '../../application/ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { createSqliteRepositories } from './repositories'
import { SqliteConversationContextRepository } from './conversation-context-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteConversationContextRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-context-repository-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteConversationContextRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteConversationContextRepository', () => {
  it('searches completed user and assistant transcript text within one conversation', async () => {
    const sessions = createSqliteRepositories(database).chatSessions
    const session: ChatSessionRecord = {
      id: 'conversation-1',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Transcript',
      sortOrder: 0,
      turns: [],
      messages: [],
      createdAt: 1,
      updatedAt: 1
    }
    await sessions.beginTurn({
      session,
      expectedRevision: 0,
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      content: 'Investigate runtime_resource_stale for ABC-42',
      createdAt: 2
    })

    expect(
      repository.searchTranscript({
        conversationId: session.id,
        query: 'runtime_resource_stale',
        limit: 8
      })
    ).toEqual([
      expect.objectContaining({
        messageId: 'user-1',
        turnId: 'user-1:turn',
        role: 'user',
        content: expect.stringContaining('runtime_resource_stale')
      })
    ])
    expect(
      repository.searchTranscript({
        conversationId: session.id,
        query: 'not-yet-completed',
        limit: 8
      })
    ).toEqual([])

    database
      .prepare(
        `UPDATE chat_messages
         SET status = 'completed',
             content = 'Resolved ABC-42 without reusing the old handle.',
             completed_at = 4
         WHERE id = 'assistant-1'`
      )
      .run()

    expect(new Set(
      repository.searchTranscript({
        conversationId: session.id,
        query: 'ABC-42',
        limit: 8
      }).map(({ messageId }) => messageId)
    )).toEqual(new Set(['assistant-1', 'user-1']))
  })

  it('persists scoped memory entries without auto-promoting model summaries', () => {
    const trusted = memory('trusted', 'Use SQLite locally.', 'user_confirmed')
    const summary = memory('summary', 'Use cloud storage.', 'model_summary')
    repository.saveMemory(trusted)
    repository.saveMemory(summary)

    expect(
      repository.listMemoryEntries({
        scope: 'conversation',
        scopeId: 'conversation-1'
      })
    ).toEqual([trusted, summary])
  })

  it('supersedes and expires promoted memory deterministically', () => {
    const first = memory('first', 'First decision.', 'user_confirmed')
    const second = memory('second', 'Updated decision.', 'user_confirmed')
    repository.saveMemory(first)
    repository.replaceMemory(first.id, second)
    repository.expireMemory(second.id, 10)

    expect(
      repository.listMemoryEntries({
        scope: 'conversation',
        scopeId: 'conversation-1'
      })
    ).toEqual([
      { ...first, supersededBy: second.id },
      { ...second, expiresAt: 10 }
    ])
  })
})

function memory(
  id: string,
  content: string,
  trust: ConversationMemoryEntry['trust']
): ConversationMemoryEntry {
  return {
    id,
    scope: 'conversation',
    scopeId: 'conversation-1',
    kind: 'decision',
    content,
    sourceMessageIds: ['user-1'],
    sourceDigest: `digest-${id}`,
    importance: 0.8,
    validFrom: 1,
    trust
  }
}
