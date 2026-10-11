import type { ToolEventStore } from './tool-event-store'
import type { ApprovalHistoryQuery, ApprovalHistoryRecord, ApprovalHistoryView } from '../../../../shared/tool-permissions'
import { normalizeApprovalProfile, type EffectiveRisk } from '../../../../domain/approval-profile'

export class ApprovalObservabilityService {
  constructor(private readonly dependencies: { events: Pick<ToolEventStore, 'scan'> }) {}
  async query(query: ApprovalHistoryQuery): Promise<ApprovalHistoryView> {
    const records = new Map<string, ApprovalHistoryRecord>()
    const decided = new Set<string>()
    let position = 0
    while (true) {
      const batch = await this.dependencies.events.scan(position, 1000)
      for (const event of batch) {
        const payload = event.payload
        let record = records.get(event.streamId)
        if (event.eventType === 'tool.invocation_requested') {
          const definition = payload.definition as { id?: string } | undefined
          record = { executionId: event.streamId, toolId: definition?.id ?? '',
            approvalProfileId: normalizeApprovalProfile(payload.approvalProfileId ?? 'protected'),
            outcome: 'automatic', asked: false, occurredAt: event.metadata.occurredAt, waitMs: 0 }
          records.set(event.streamId, record)
        }
        if (!record) continue
        if (typeof payload.effectiveRisk === 'string' && /^L[0-4]$/.test(payload.effectiveRisk))
          record.effectiveRisk = payload.effectiveRisk as EffectiveRisk
        if (event.eventType === 'tool.permission_requested') {
          decided.add(event.streamId)
          record.approvalProfileId = normalizeApprovalProfile(payload.approvalProfileId)
          record.outcome = 'waiting'
          record.asked = true
          record.occurredAt = Number(payload.requestedAt ?? event.metadata.occurredAt)
        }
        if (event.eventType === 'tool.authorization_auto_granted') {
          decided.add(event.streamId)
          record.outcome = Array.isArray(payload.grantIds) && payload.grantIds.length ? 'reused' : 'automatic'
        }
        if (event.eventType === 'tool.permission_decided') {
          record.outcome = payload.decision === 'deny' ? 'denied' : 'approved'
          record.waitMs = Math.max(0, Number(payload.resolvedAt ?? event.metadata.occurredAt) - record.occurredAt)
        }
        if (event.eventType === 'tool.failed' && !decided.has(event.streamId)) {
          const error = payload.error as { code?: string } | undefined
          if (error?.code?.startsWith('authorization_') || error?.code?.startsWith('permission_')) {
            record.outcome = 'denied'
            decided.add(event.streamId)
          }
        }
        if (event.eventType === 'tool.permission_expired' || event.eventType === 'tool.permission_cancelled') {
          record.outcome = event.eventType === 'tool.permission_expired' ? 'expired' : 'cancelled'
          record.waitMs = Math.max(0, event.metadata.occurredAt - record.occurredAt)
        }
      }
      position = batch.at(-1)?.globalPosition ?? position
      if (batch.length < 1000) break
    }
    const all = [...records.values()].filter(record => decided.has(record.executionId))
    const metrics = (['cautious', 'protected', 'trusted'] as const).map(approvalProfileId => {
      const matching = all.filter(record => record.approvalProfileId === approvalProfileId)
      return { approvalProfileId, automatic: matching.filter(r => r.outcome === 'automatic').length,
        reused: matching.filter(r => r.outcome === 'reused').length, asked: matching.filter(r => r.asked).length,
        denied: matching.filter(r => r.outcome === 'denied').length,
        waitMs: matching.reduce((sum, r) => sum + r.waitMs, 0) }
    })
    return { records: all.filter(r => !query.risk || r.effectiveRisk === query.risk)
      .sort((a, b) => b.occurredAt - a.occurredAt).slice(0, query.limit ?? 100), metrics }
  }
}
