import type Database from 'better-sqlite3'
import type {
  ConversationContextProjection
} from '../../../../domain/conversation-context-projection'
import type {
  TurnContextRoute
} from '../../../../domain/conversation-context-route'
import type {
  ConversationMemoryEntry,
  ConversationMemoryScope
} from '../../../../domain/conversation-memory'
import type {
  RuntimeResourceLeaseStatus,
  RuntimeResourceType
} from '../../../../domain/runtime-resource-lease'

type TurnContextRouteRow = {
  source_message_id: string
  policy_version: string
  source_digest: string
  relation: TurnContextRoute['relation']
  predecessor_message_id: string | null
  selected_message_ids_json: string
  excluded_message_ids_json: string
  reasons_json: string
  confidence: number
  created_at: number
}

type ContextProjectionRow = {
  projection_json: string
}

type TranscriptSearchRow = {
  message_id: string
  role: 'user' | 'assistant'
  content: string
  rank: number
}

type ConversationMemoryRow = {
  id: string
  scope: ConversationMemoryScope
  scope_id: string
  kind: ConversationMemoryEntry['kind']
  content: string
  source_message_ids_json: string
  source_digest: string
  importance: number
  valid_from: number
  expires_at: number | null
  superseded_by: string | null
  trust: ConversationMemoryEntry['trust']
}

type ContextDiagnosticsRow = TurnContextRouteRow & {
  projection_json: string
  projection_digest: string
}

export class SqliteConversationContextRepository {
  constructor(private readonly database: Database.Database) {}

  insertTurn(input: {
    route: TurnContextRoute
    projection: ConversationContextProjection
  }): void {
    const { route, projection } = input
    if (
      route.sourceMessageId !== projection.sourceMessageId ||
      route.policyVersion !== projection.routePolicyVersion
    ) {
      throw new Error('Conversation context route and projection conflict')
    }
    this.database
      .prepare(
        `INSERT INTO conversation_turn_context_routes (
          source_message_id, policy_version, source_digest, relation,
          predecessor_message_id, selected_message_ids_json,
          excluded_message_ids_json, reasons_json, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        route.sourceMessageId,
        route.policyVersion,
        route.sourceDigest,
        route.relation,
        route.predecessorMessageId ?? null,
        JSON.stringify(route.selectedMessageIds),
        JSON.stringify(route.excludedMessageIds),
        JSON.stringify(route.reasons),
        route.confidence,
        route.createdAt
      )
    this.database
      .prepare(
        `INSERT INTO conversation_context_projections (
          id, conversation_id, source_message_id, route_policy_version,
          projection_policy_version, projection_json, character_count,
          estimated_tokens, digest, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        projection.id,
        projection.conversationId,
        projection.sourceMessageId,
        projection.routePolicyVersion,
        projection.projectionPolicyVersion,
        JSON.stringify(projection),
        projection.characterCount,
        projection.estimatedTokens,
        projection.digest,
        projection.createdAt
      )
  }

  getRoute(sourceMessageId: string): TurnContextRoute | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM conversation_turn_context_routes
         WHERE source_message_id = ?`
      )
      .get(sourceMessageId) as TurnContextRouteRow | undefined
    if (!row) return undefined
    return {
      schemaVersion: 1,
      policyVersion: row.policy_version,
      sourceMessageId: row.source_message_id,
      sourceDigest: row.source_digest,
      relation: row.relation,
      ...(row.predecessor_message_id
        ? { predecessorMessageId: row.predecessor_message_id }
        : {}),
      selectedMessageIds: JSON.parse(
        row.selected_message_ids_json
      ) as string[],
      excludedMessageIds: JSON.parse(
        row.excluded_message_ids_json
      ) as string[],
      reasons: JSON.parse(row.reasons_json) as TurnContextRoute['reasons'],
      confidence: row.confidence,
      createdAt: row.created_at
    }
  }

  getProjection(
    sourceMessageId: string
  ): ConversationContextProjection | undefined {
    const row = this.database
      .prepare(
        `SELECT projection_json FROM conversation_context_projections
         WHERE source_message_id = ?`
      )
      .get(sourceMessageId) as ContextProjectionRow | undefined
    return row
      ? (JSON.parse(row.projection_json) as ConversationContextProjection)
      : undefined
  }

  searchTranscript(input: {
    conversationId: string
    query: string
    limit: number
  }): Array<{
    messageId: string
    role: 'user' | 'assistant'
    content: string
    rank: number
  }> {
    const query = ftsQuery(input.query)
    if (!query) return []
    return (
      this.database
        .prepare(
          `SELECT message_id, role, content, bm25(chat_messages_fts) AS rank
           FROM chat_messages_fts
           WHERE chat_messages_fts MATCH ? AND session_id = ?
           ORDER BY rank, message_id
           LIMIT ?`
        )
        .all(
          query,
          input.conversationId,
          Math.max(1, Math.min(50, input.limit))
        ) as TranscriptSearchRow[]
    ).map((row) => ({
      messageId: row.message_id,
      role: row.role,
      content: row.content,
      rank: row.rank
    }))
  }

  saveMemory(entry: ConversationMemoryEntry): void {
    this.database
      .prepare(
        `INSERT INTO conversation_memory_entries (
          id, scope, scope_id, kind, content, source_message_ids_json,
          source_digest, importance, valid_from, expires_at,
          superseded_by, trust
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.scope,
        entry.scopeId,
        entry.kind,
        entry.content,
        JSON.stringify(entry.sourceMessageIds),
        entry.sourceDigest,
        entry.importance,
        entry.validFrom,
        entry.expiresAt ?? null,
        entry.supersededBy ?? null,
        entry.trust
      )
  }

  replaceMemory(
    previousId: string,
    entry: ConversationMemoryEntry
  ): void {
    this.database.transaction(() => {
      this.saveMemory(entry)
      const updated = this.database
        .prepare(
          `UPDATE conversation_memory_entries
           SET superseded_by = ?
           WHERE id = ? AND superseded_by IS NULL`
        )
        .run(entry.id, previousId)
      if (updated.changes !== 1) {
        throw new Error('Conversation memory supersede conflict')
      }
    })()
  }

  expireMemory(id: string, expiresAt: number): void {
    const updated = this.database
      .prepare(
        `UPDATE conversation_memory_entries
         SET expires_at = ?
         WHERE id = ? AND superseded_by IS NULL
           AND expires_at IS NULL AND valid_from < ?`
      )
      .run(expiresAt, id, expiresAt)
    if (updated.changes !== 1) {
      throw new Error('Conversation memory expiry conflict')
    }
  }

  listMemoryEntries(input: {
    scope: ConversationMemoryScope
    scopeId: string
  }): ConversationMemoryEntry[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM conversation_memory_entries
           WHERE scope = ? AND scope_id = ?
           ORDER BY valid_from DESC, rowid`
        )
        .all(input.scope, input.scopeId) as ConversationMemoryRow[]
    ).map(mapMemory)
  }

  getLatestDiagnostics(conversationId: string) {
    const row = this.database
      .prepare(
        `SELECT route.*,
                projection.projection_json,
                projection.digest AS projection_digest
         FROM conversation_context_projections projection
         JOIN conversation_turn_context_routes route
           ON route.source_message_id = projection.source_message_id
         WHERE projection.conversation_id = ?
         ORDER BY projection.created_at DESC, projection.id DESC
         LIMIT 1`
      )
      .get(conversationId) as ContextDiagnosticsRow | undefined
    if (!row) return undefined
    const projection = JSON.parse(
      row.projection_json
    ) as ConversationContextProjection
    const exclusionCounts = new Map<string, number>()
    for (const exclusion of projection.excluded) {
      exclusionCounts.set(
        exclusion.reason,
        (exclusionCounts.get(exclusion.reason) ?? 0) + 1
      )
    }
    const leases = this.database
      .prepare(
        `SELECT resource_type, status, epoch
         FROM runtime_resource_leases
         WHERE conversation_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 8`
      )
      .all(conversationId) as Array<{
        resource_type: RuntimeResourceType
        status: RuntimeResourceLeaseStatus
        epoch: number
      }>
    return {
      sourceMessageId: row.source_message_id,
      relation: row.relation,
      reasons: JSON.parse(row.reasons_json) as string[],
      selectedMessageCount: (
        JSON.parse(row.selected_message_ids_json) as string[]
      ).length,
      excluded: [...exclusionCounts].map(([reason, count]) => ({
        reason,
        count
      })),
      recentMessageCount: projection.recentMessages.length,
      compactedFactCount: projection.compactedFacts.length,
      recalledMemoryCount: projection.recalledMemory.length,
      characterCount: projection.characterCount,
      estimatedTokens: projection.estimatedTokens,
      projectionDigest: row.projection_digest,
      createdAt: projection.createdAt,
      leases: leases.map((lease) => ({
        resourceType: lease.resource_type,
        status: lease.status,
        epoch: lease.epoch
      }))
    }
  }
}

function ftsQuery(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' AND ')
}

function mapMemory(row: ConversationMemoryRow): ConversationMemoryEntry {
  return {
    id: row.id,
    scope: row.scope,
    scopeId: row.scope_id,
    kind: row.kind,
    content: row.content,
    sourceMessageIds: JSON.parse(row.source_message_ids_json) as string[],
    sourceDigest: row.source_digest,
    importance: row.importance,
    validFrom: row.valid_from,
    ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
    ...(row.superseded_by === null
      ? {}
      : { supersededBy: row.superseded_by }),
    trust: row.trust
  }
}
