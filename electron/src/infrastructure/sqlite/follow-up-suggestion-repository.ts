import type Database from 'better-sqlite3'
import type {
  FollowUpSuggestionSet,
  FollowUpSuggestionSetStatus
} from '../../../../domain/follow-up-suggestion'
import type {
  BeginSuggestedTurnResult,
  FollowUpSuggestionRepository,
  ChatSessionRepository
} from '../../application/ports/business-repositories'
import { SqliteChatSessionRepository } from './repositories'

type SuggestionSetRow = {
  id: string
  conversation_id: string
  assistant_message_id: string
  source_run_id: string
  source_digest: string
  response_locale: string
  status: FollowUpSuggestionSetStatus
  revision: number
  created_at: number
  updated_at: number
}

type SuggestionRow = {
  id: string
  label: string
  prompt: string
  intent: FollowUpSuggestionSet['suggestions'][number]['intent']
  sort_order: number
}

export class SqliteFollowUpSuggestionRepository
  implements FollowUpSuggestionRepository
{
  private readonly sessions: SqliteChatSessionRepository

  constructor(private readonly database: Database.Database) {
    this.sessions = new SqliteChatSessionRepository(database)
  }

  async getReadySuggestion(input: {
    sessionId: string
    suggestionSetId: string
    suggestionId: string
    expectedSuggestionRevision: number
  }): Promise<
    { prompt: string; suggestionRevision: number } | undefined
  > {
    const row = this.database
      .prepare(
        `SELECT suggestion.prompt, suggestion_set.revision
         FROM assistant_follow_up_suggestions suggestion
         JOIN assistant_follow_up_suggestion_sets suggestion_set
           ON suggestion_set.id = suggestion.suggestion_set_id
         WHERE suggestion_set.id = ?
           AND suggestion.id = ?
           AND suggestion_set.conversation_id = ?
           AND suggestion_set.status = 'ready'
           AND suggestion_set.revision = ?`
      )
      .get(
        input.suggestionSetId,
        input.suggestionId,
        input.sessionId,
        input.expectedSuggestionRevision
      ) as { prompt: string; revision: number } | undefined
    return row
      ? { prompt: row.prompt, suggestionRevision: row.revision }
      : undefined
  }

  async saveGenerated(
    set: FollowUpSuggestionSet
  ): Promise<FollowUpSuggestionSet> {
    const id = this.database.transaction(() => {
      const existing = this.database
        .prepare(
          `SELECT id FROM assistant_follow_up_suggestion_sets
           WHERE assistant_message_id = ? AND source_digest = ?`
        )
        .pluck()
        .get(set.assistantMessageId, set.sourceDigest) as string | undefined
      if (existing) return existing

      const head = this.database
        .prepare(
          `SELECT id, role, status FROM chat_messages
           WHERE session_id = ?
           ORDER BY sort_order DESC, id DESC LIMIT 1`
        )
        .get(set.conversationId) as
        | { id: string; role: string; status: string }
        | undefined
      const status: FollowUpSuggestionSetStatus =
        head?.id === set.assistantMessageId &&
        head.role === 'assistant' &&
        head.status === 'completed'
          ? 'ready'
          : 'superseded'
      this.database
        .prepare(
          `INSERT INTO assistant_follow_up_suggestion_sets (
             id, conversation_id, assistant_message_id, source_run_id,
             source_digest, response_locale, status, revision, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          set.id,
          set.conversationId,
          set.assistantMessageId,
          set.sourceRunId,
          set.sourceDigest,
          set.responseLocale,
          status,
          set.revision,
          set.createdAt,
          set.updatedAt
        )
      const insertSuggestion = this.database.prepare(
        `INSERT INTO assistant_follow_up_suggestions (
           id, suggestion_set_id, label, prompt, intent, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const suggestion of set.suggestions) {
        insertSuggestion.run(
          suggestion.id,
          set.id,
          suggestion.label,
          suggestion.prompt,
          suggestion.intent,
          suggestion.sortOrder
        )
      }
      return set.id
    })()
    return this.requireSet(id)
  }

  async beginSuggestedTurn(input: {
    sessionId: string
    suggestionSetId: string
    suggestionId: string
    expectedSessionRevision: number
    expectedSuggestionRevision: number
    userMessageId: string
    assistantMessageId: string
    processing?: Parameters<ChatSessionRepository['beginTurn']>[0]['processing']
    modelName?: string
    createdAt: number
  }): Promise<BeginSuggestedTurnResult> {
    const status = this.database.transaction(() => {
      const session = this.database
        .prepare('SELECT revision FROM chat_sessions WHERE id = ?')
        .get(input.sessionId) as { revision: number } | undefined
      const suggestion = this.database
        .prepare(
          `SELECT s.prompt, sets.assistant_message_id, sets.status,
                  sets.revision
           FROM assistant_follow_up_suggestions s
           JOIN assistant_follow_up_suggestion_sets sets
             ON sets.id = s.suggestion_set_id
           WHERE sets.id = ? AND s.id = ? AND sets.conversation_id = ?`
        )
        .get(
          input.suggestionSetId,
          input.suggestionId,
          input.sessionId
        ) as
        | {
            prompt: string
            assistant_message_id: string
            status: FollowUpSuggestionSetStatus
            revision: number
          }
        | undefined
      const headId = this.database
        .prepare(
          `SELECT id FROM chat_messages WHERE session_id = ?
           ORDER BY sort_order DESC, id DESC LIMIT 1`
        )
        .pluck()
        .get(input.sessionId) as string | undefined
      if (
        !session ||
        !suggestion ||
        session.revision !== input.expectedSessionRevision ||
        suggestion.revision !== input.expectedSuggestionRevision ||
        suggestion.status !== 'ready' ||
        headId !== suggestion.assistant_message_id
      ) {
        return 'conflict' as const
      }
      const sortOrder = this.database
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) + 1
           FROM chat_messages WHERE session_id = ?`
        )
        .pluck()
        .get(input.sessionId) as number
      const insertMessage = this.database.prepare(
        `INSERT INTO chat_messages (
           id, session_id, role, status, content, model_name, processing_json,
           source_json, sort_order, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      insertMessage.run(
        input.userMessageId,
        input.sessionId,
        'user',
        'completed',
        suggestion.prompt,
        null,
        input.processing ? JSON.stringify(input.processing) : null,
        JSON.stringify({
          kind: 'follow_up_suggestion',
          suggestionSetId: input.suggestionSetId,
          suggestionId: input.suggestionId,
          sourceAssistantMessageId: suggestion.assistant_message_id
        }),
        sortOrder,
        input.createdAt
      )
      insertMessage.run(
        input.assistantMessageId,
        input.sessionId,
        'assistant',
        'pending',
        '',
        input.modelName ?? null,
        null,
        null,
        sortOrder + 1,
        input.createdAt
      )
      this.database
        .prepare(
          `UPDATE assistant_follow_up_suggestion_sets
           SET status = 'superseded', revision = revision + 1, updated_at = ?
           WHERE id = ? AND status = 'ready' AND revision = ?`
        )
        .run(
          input.createdAt,
          input.suggestionSetId,
          input.expectedSuggestionRevision
        )
      this.database
        .prepare(
          `UPDATE chat_sessions
           SET revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`
        )
        .run(
          input.createdAt,
          input.sessionId,
          input.expectedSessionRevision
        )
      return 'started' as const
    })()
    const entity = await this.sessions.get(input.sessionId)
    if (!entity) {
      throw new Error(`Conversation not found: ${input.sessionId}`)
    }
    return { status, entity }
  }

  private requireSet(id: string): FollowUpSuggestionSet {
    const row = this.database
      .prepare(
        `SELECT * FROM assistant_follow_up_suggestion_sets WHERE id = ?`
      )
      .get(id) as SuggestionSetRow | undefined
    if (!row) throw new Error(`Follow-up suggestion set not found: ${id}`)
    const suggestions = this.database
      .prepare(
        `SELECT id, label, prompt, intent, sort_order
         FROM assistant_follow_up_suggestions
         WHERE suggestion_set_id = ? ORDER BY sort_order`
      )
      .all(id) as SuggestionRow[]
    return {
      id: row.id,
      conversationId: row.conversation_id,
      assistantMessageId: row.assistant_message_id,
      sourceRunId: row.source_run_id,
      sourceDigest: row.source_digest,
      responseLocale: row.response_locale,
      status: row.status,
      suggestions: suggestions.map((suggestion) => ({
        id: suggestion.id,
        label: suggestion.label,
        prompt: suggestion.prompt,
        intent: suggestion.intent,
        sortOrder: suggestion.sort_order
      })),
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}
