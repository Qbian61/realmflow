import { describe, expect, it } from 'vitest'
import { ApprovalObservabilityService } from './approval-observability-service'

describe('Approval observability', () => {
  it('does not report a policy rejection as an automatic approval', async () => {
    const events = [
      { streamId: 'denied', globalPosition: 1, eventType: 'tool.invocation_requested',
        payload: { approvalProfileId: 'trusted', definition: { id: 'unsafe' } }, metadata: { occurredAt: 1 } },
      { streamId: 'denied', globalPosition: 2, eventType: 'tool.failed',
        payload: { error: { code: 'authorization_revoked' } }, metadata: { occurredAt: 2 } },
    ]
    const service = new ApprovalObservabilityService({
      events: { scan: async (after: number) => events.filter(e => e.globalPosition > after) } as never
    })
    expect((await service.query({})).metrics.find(m => m.approvalProfileId === 'trusted'))
      .toMatchObject({ automatic: 0, denied: 1 })
  })

  it('derives mode counts, risk filtering and wait time from committed events without exposing resources', async () => {
    const events = [
      { streamId: 'one', globalPosition: 1, eventType: 'tool.invocation_requested',
        payload: { approvalProfileId: 'cautious', definition: { id: 'tool-one' } }, metadata: { occurredAt: 10 } },
      { streamId: 'one', globalPosition: 2, eventType: 'tool.permission_requested',
        payload: { requestId: 'request', effectiveRisk: 'L1', approvalProfileId: 'cautious', requestedAt: 20 }, metadata: { occurredAt: 20 } },
      { streamId: 'one', globalPosition: 3, eventType: 'tool.permission_decided',
        payload: { requestId: 'request', decision: 'deny', resolvedAt: 120 }, metadata: { occurredAt: 120 } },
      { streamId: 'two', globalPosition: 4, eventType: 'tool.invocation_requested',
        payload: { approvalProfileId: 'protected', definition: { id: 'tool-two' } }, metadata: { occurredAt: 130 } },
      { streamId: 'two', globalPosition: 5, eventType: 'tool.authorization_auto_granted',
        payload: { effectiveRisk: 'L0', grantIds: [] }, metadata: { occurredAt: 130 } },
    ]
    const service = new ApprovalObservabilityService({
      events: { scan: async (after: number) => events.filter(e => e.globalPosition > after) } as never
    })
    const result = await service.query({ risk: 'L1' })
    expect(result.records).toEqual([expect.objectContaining({ executionId: 'one', effectiveRisk: 'L1', outcome: 'denied', waitMs: 100 })])
    expect(result.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ approvalProfileId: 'cautious', asked: 1, denied: 1, waitMs: 100 }),
      expect.objectContaining({ approvalProfileId: 'protected', automatic: 1, asked: 0 })
    ]))
    expect(JSON.stringify(result)).not.toContain('resources')
  })

  it('keeps reused approvals separate from automatic decisions and does not double-count replayed scans', async () => {
    const events = [
      { streamId: 'one', globalPosition: 1, eventType: 'tool.invocation_requested',
        payload: { approvalProfileId: 'trusted', definition: { id: 'tool-one' } }, metadata: { occurredAt: 1 } },
      { streamId: 'one', globalPosition: 2, eventType: 'tool.authorization_auto_granted',
        payload: { grantIds: ['grant-1'], effectiveRisk: 'L2' }, metadata: { occurredAt: 2 } }
    ]
    const service = new ApprovalObservabilityService({
      events: { scan: async (after: number) => events.filter(e => e.globalPosition > after) } as never
    })
    await service.query({})
    expect((await service.query({})).metrics.find(m => m.approvalProfileId === 'trusted'))
      .toMatchObject({ automatic: 0, reused: 1 })
  })
})
