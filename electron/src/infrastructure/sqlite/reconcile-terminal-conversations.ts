import type Database from 'better-sqlite3'
import type { RunCheckpoint } from '../../../../domain/agent-run-recovery'
import { createAssistantTurnProjection, projectAssistantTurn, type AssistantRunEvent } from '../../../../domain/assistant-turn'
import type { SqliteAssistantRunEventStore } from './assistant-run-event-store'
import type { ConversationGeneratedArtifactService } from '../../application/conversation/conversation-generated-artifacts'

/** A terminal runtime is no longer a provider-recovery candidate. Repair its
 * interrupted conversation delivery from local facts only. */
export async function reconcileTerminalConversations(
  database: Database.Database,
  timeline: SqliteAssistantRunEventStore,
  artifacts?: Pick<ConversationGeneratedArtifactService, 'finalizeRun'>
): Promise<void> {
  const rows = database.prepare(`
    SELECT r.id, r.lifecycle_status, r.updated_at, r.created_at,
           m.id AS message_id, m.session_id, c.checkpoint_json
    FROM agent_runtime_runs r
    JOIN chat_messages m ON m.run_id = r.id AND m.role = 'assistant'
    LEFT JOIN agent_run_checkpoints c ON c.run_id = r.id AND c.ordinal = r.current_checkpoint_ordinal
    WHERE r.lifecycle_status IN ('completed', 'failed', 'cancelled')
      AND (m.status = 'pending'
        OR (r.lifecycle_status = 'completed' AND m.status <> 'completed')
        OR (m.source_json IS NULL AND EXISTS (
          SELECT 1 FROM conversation_generated_artifact_runs a
          WHERE a.run_id = r.id AND json_array_length(a.state_json, '$.final') > 0
        ))
        OR NOT EXISTS (
          SELECT 1 FROM assistant_run_events e
          WHERE e.run_id = r.id AND e.event_type = 'run.' || r.lifecycle_status
        ) AND NOT EXISTS (
          SELECT 1 FROM assistant_turn_projections p
          WHERE p.run_id = r.id
            AND json_extract(p.projection_json, '$.status')
              IN ('completed', 'failed', 'cancelled')
        ))
    ORDER BY r.created_at, r.id
  `).all() as Array<{
    id: string; lifecycle_status: 'completed' | 'failed' | 'cancelled'
    updated_at: number; created_at: number; message_id: string; session_id: string; checkpoint_json: string | null
  }>
  for (const row of rows) {
    const checkpoint = row.checkpoint_json ? JSON.parse(row.checkpoint_json) as RunCheckpoint : undefined
    const current = await timeline.getSnapshot(row.id) ?? createAssistantTurnProjection({
      runId: row.id, assistantMessageId: row.message_id, startedAt: row.created_at
    })
    const answer = checkpoint?.messageWindow.find((message) => message.id === `answer:${row.id}`)?.content
    const source = await artifacts?.finalizeRun({
      runId: row.id, conversationId: row.session_id, assistantMessageId: row.message_id, status: row.lifecycle_status
    })
    if (['completed', 'failed', 'cancelled'].includes(current.status)) {
      await timeline.repairRecoveredTerminalDelivery(
        { ...current, status: row.lifecycle_status },
        row.updated_at,
        source,
        answer
      )
      continue
    }
    const sequence = current.lastSequence + 1
    const base = {
      id: `${row.id}:conversation-reconcile:${sequence}`,
      runId: row.id, sequence, timestamp: row.updated_at,
    }
    const data = answer !== undefined ? { recoveredAnswer: answer } : {}
    const event: AssistantRunEvent = row.lifecycle_status === 'failed'
      ? { ...base, type: 'run.failed', data: { ...data, message: 'Conversation run failed' } }
      : row.lifecycle_status === 'cancelled'
        ? { ...base, type: 'run.cancelled', data: { ...data, message: 'Conversation run cancelled' } }
        : { ...base, type: 'run.completed', data }
    await timeline.appendRecoveredAndProject(event, projectAssistantTurn(current, event), source)
  }
}
