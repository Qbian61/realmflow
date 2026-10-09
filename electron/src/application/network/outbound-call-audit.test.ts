import { vi } from 'vitest'
import type {
  OutboundCallQuery,
  OutboundCallRecord
} from '../../../../domain/outbound-call'
import { OutboundCallAuditService } from './outbound-call-audit'

describe('OutboundCallAuditService', () => {
  it('returns the existing record when an identical start is replayed', async () => {
    const repository = inMemoryRepository()
    const audit = new OutboundCallAuditService({
      repository,
      createId: () => 'call-1',
      now: () => 100
    })
    const input = startInput()

    const first = await audit.start(input)
    const replay = await audit.start(input)

    expect(replay).toEqual(first)
    expect(repository.appendStarted).toHaveBeenCalledTimes(2)
    expect(repository.records).toHaveLength(1)
  })

  it('rejects idempotency reuse for a different logical call', async () => {
    const audit = new OutboundCallAuditService({
      repository: inMemoryRepository(),
      createId: () => 'call-1',
      now: () => 100
    })
    await audit.start(startInput())

    await expect(
      audit.start({
        ...startInput(),
        target: { type: 'model_provider', id: 'provider-2' }
      })
    ).rejects.toThrow('Outbound call idempotency key is already in use')
  })

  it('keeps the first terminal result when completion is replayed', async () => {
    const repository = inMemoryRepository()
    const audit = new OutboundCallAuditService({
      repository,
      createId: () => 'call-1',
      now: () => 100
    })
    const started = await audit.start(startInput())

    const completed = await audit.finish(started.id, {
      status: 'succeeded',
      retryCount: 1,
      completedAt: 180
    })
    const replay = await audit.finish(started.id, {
      status: 'cancelled',
      retryCount: 1,
      completedAt: 190
    })

    expect(completed.status).toBe('succeeded')
    expect(replay).toEqual(completed)
  })

  it('validates query bounds and identifiers before repository access', async () => {
    const repository = inMemoryRepository()
    const audit = new OutboundCallAuditService({ repository })

    await expect(audit.query({ from: 20, to: 10 })).rejects.toThrow(
      'Outbound call query time range is invalid'
    )
    await expect(audit.query({ limit: 201 })).rejects.toThrow(
      'Outbound call query limit must be between 1 and 200'
    )
    await expect(
      audit.query({ ownerId: 'https://secret.example' })
    ).rejects.toThrow('Outbound call query ownerId is invalid')
    expect(repository.list).not.toHaveBeenCalled()
  })

  it('accepts MCP calls as a first-class audited network target', async () => {
    const repository = inMemoryRepository()
    const audit = new OutboundCallAuditService({
      repository,
      createId: () => 'call-mcp',
      now: () => 100
    })

    await audit.start({
      idempotencyKey: 'mcp-connect-search-1',
      callType: 'mcp',
      target: { type: 'mcp_server', id: 'search' },
      owner: { type: 'application', id: 'realmflow' }
    })
    await audit.query({ callType: 'mcp' })

    expect(repository.list).toHaveBeenCalledWith({
      callType: 'mcp',
      limit: 100
    })
  })
})

function startInput() {
  return {
    idempotencyKey: 'model-run:run-1',
    callType: 'model_completion' as const,
    target: { type: 'model_provider' as const, id: 'provider-1' },
    owner: { type: 'ai_run' as const, id: 'run-1' },
    providerId: 'provider-1',
    modelProfileId: 'profile-1',
    aiRunId: 'run-1'
  }
}

function inMemoryRepository() {
  const records: OutboundCallRecord[] = []
  return {
    records,
    appendStarted: vi.fn(async (record: OutboundCallRecord) => {
      if (
        records.some(
          (candidate) =>
            candidate.idempotencyKey === record.idempotencyKey
        )
      ) {
        return 'duplicate' as const
      }
      records.push(record)
      return 'appended' as const
    }),
    complete: vi.fn(async (record: OutboundCallRecord) => {
      const index = records.findIndex(
        (candidate) =>
          candidate.id === record.id && candidate.status === 'started'
      )
      if (index < 0) return 'unchanged' as const
      records[index] = record
      return 'completed' as const
    }),
    getById: vi.fn(async (id: string) =>
      records.find((record) => record.id === id)
    ),
    getByIdempotencyKey: vi.fn(async (key: string) =>
      records.find((record) => record.idempotencyKey === key)
    ),
    recoverInterrupted: vi.fn(async () => 0),
    list: vi.fn(async (_query: OutboundCallQuery) => [...records])
  }
}
