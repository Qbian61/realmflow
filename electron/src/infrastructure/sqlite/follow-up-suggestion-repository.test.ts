import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReadyFollowUpSuggestionSet } from '../../../../domain/follow-up-suggestion'
import type { ChatSessionRecord } from '../../application/ports/business-repositories'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteFollowUpSuggestionRepository } from './follow-up-suggestion-repository'
import { SqliteChatSessionRepository } from './repositories'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-follow-ups-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('follow-up suggestion SQLite schema', () => {
  it('creates suggestion projections and message source storage', () => {
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'assistant_follow_up_%'
         ORDER BY name`
      )
      .pluck()
      .all()
    const messageColumns = database
      .prepare('PRAGMA table_info(chat_messages)')
      .all() as Array<{ name: string }>

    expect(tables).toEqual([
      'assistant_follow_up_suggestion_sets',
      'assistant_follow_up_suggestions'
    ])
    expect(messageColumns.map(({ name }) => name)).toContain('source_json')
  })
})

describe('SqliteFollowUpSuggestionRepository', () => {
  it('projects a ready set onto the source assistant message', async () => {
    const sessions = new SqliteChatSessionRepository(database)
    const suggestions = new SqliteFollowUpSuggestionRepository(database)
    await sessions.save(completedConversation(), 0)

    const saved = await suggestions.saveGenerated(
      createReadyFollowUpSuggestionSet(
        {
          id: 'set-1',
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          sourceRunId: 'run-1',
          sourceDigest: 'a'.repeat(64),
          responseLocale: 'zh-CN',
          createdAt: 100
        },
        [
          {
            id: 'suggestion-1',
            label: '验证结果',
            prompt: '请运行验证并总结结果。',
            intent: 'verify'
          }
        ]
      )
    )

    expect(saved.status).toBe('ready')
    await expect(sessions.get('conversation-1')).resolves.toMatchObject({
      messages: [
        {},
        {
          id: 'assistant-1',
          followUp: {
            suggestionSetId: 'set-1',
            revision: 1,
            suggestions: [
              {
                id: 'suggestion-1',
                label: '验证结果',
                prompt: '请运行验证并总结结果。',
                intent: 'verify'
              }
            ]
          }
        }
      ]
    })
  })

  it('stores a generated set as superseded when its assistant is no longer head', async () => {
    const sessions = new SqliteChatSessionRepository(database)
    const suggestions = new SqliteFollowUpSuggestionRepository(database)
    const conversation = completedConversation()
    conversation.messages.push({
      id: 'user-2',
      role: 'user',
      status: 'completed',
      content: 'Next',
      sortOrder: 2,
      createdAt: 101
    })
    await sessions.save(conversation, 0)

    const saved = await suggestions.saveGenerated(
      createReadyFollowUpSuggestionSet(
        {
          id: 'set-stale',
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          sourceRunId: 'run-1',
          sourceDigest: 'b'.repeat(64),
          responseLocale: 'zh-CN',
          createdAt: 102
        },
        [
          {
            id: 'suggestion-stale',
            label: '继续',
            prompt: '请继续。',
            intent: 'continue'
          }
        ]
      )
    )

    expect(saved.status).toBe('superseded')
    await expect(sessions.get('conversation-1')).resolves.not.toMatchObject({
      messages: [{}, { followUp: expect.anything() }]
    })
  })

  it('starts a suggested turn and supersedes the set atomically', async () => {
    const sessions = new SqliteChatSessionRepository(database)
    const suggestions = new SqliteFollowUpSuggestionRepository(database)
    await sessions.save(completedConversation(), 0)
    await suggestions.saveGenerated(
      createReadyFollowUpSuggestionSet(
        {
          id: 'set-send',
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          sourceRunId: 'run-1',
          sourceDigest: 'c'.repeat(64),
          responseLocale: 'zh-CN',
          createdAt: 100
        },
        [
          {
            id: 'suggestion-send',
            label: '继续',
            prompt: '请继续完成实现。',
            intent: 'continue'
          }
        ]
      )
    )

    const result = await suggestions.beginSuggestedTurn({
      sessionId: 'conversation-1',
      suggestionSetId: 'set-send',
      suggestionId: 'suggestion-send',
      expectedSessionRevision: 1,
      expectedSuggestionRevision: 1,
      userMessageId: 'user-suggested',
      assistantMessageId: 'assistant-pending',
      createdAt: 110
    })

    expect(result.status).toBe('started')
    expect(result.entity).toMatchObject({
      revision: 2,
      messages: [
        {},
        { id: 'assistant-1', followUp: undefined },
        {
          id: 'user-suggested',
          content: '请继续完成实现。',
          source: {
            kind: 'follow_up_suggestion',
            suggestionSetId: 'set-send',
            suggestionId: 'suggestion-send',
            sourceAssistantMessageId: 'assistant-1'
          }
        },
        { id: 'assistant-pending', status: 'pending' }
      ]
    })
    expect(
      database
        .prepare(
          `SELECT status FROM assistant_follow_up_suggestion_sets WHERE id = ?`
        )
        .pluck()
        .get('set-send')
    ).toBe('superseded')

    const stale = await suggestions.beginSuggestedTurn({
      sessionId: 'conversation-1',
      suggestionSetId: 'set-send',
      suggestionId: 'suggestion-send',
      expectedSessionRevision: 1,
      expectedSuggestionRevision: 1,
      userMessageId: 'user-duplicate',
      assistantMessageId: 'assistant-duplicate',
      createdAt: 120
    })
    expect(stale.status).toBe('conflict')
    expect(stale.entity.messages).toHaveLength(4)
  })
})

function completedConversation(): ChatSessionRecord {
  return {
    id: 'conversation-1',
    kind: 'general',
    knowledgeScope: { kind: 'none' },
    title: 'Conversation',
    sortOrder: 0,
    messages: [
      {
        id: 'user-1',
        role: 'user',
        status: 'completed',
        content: 'Question',
        sortOrder: 0,
        createdAt: 10
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        status: 'completed',
        content: 'Answer',
        runId: 'run-1',
        sortOrder: 1,
        createdAt: 20,
        completedAt: 30
      }
    ],
    createdAt: 10,
    updatedAt: 30
  }
}
