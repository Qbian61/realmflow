import { describe, expect, it, vi } from 'vitest'
import type { DshRunOwner } from '../../../../domain/dsh-run-manifest'
import {
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'
import { createDshRunManifest } from '../test-manifest-fixture'
import { DshHistoryQuery } from './history-query'

const owner: DshRunOwner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

describe('DshHistoryQuery', () => {
  it('reads a bounded normalized event range after the last projected sequence', async () => {
    const harness = createHarness()

    const result = await harness.query.readRange({
      runtimeInstanceId: 'runtime-1',
      sessionId: harness.manifest.sessionId,
      runId: harness.manifest.runId,
      manifestDigest: harness.manifest.digest,
      owner,
      afterSequence: 1,
      limit: 2
    })

    expect(harness.store.readEventsAfter).toHaveBeenCalledWith({
      sessionId: harness.manifest.sessionId,
      afterSequence: 1,
      limit: 2
    })
    expect(result).toMatchObject({
      afterSequence: 1,
      nextAfterSequence: 3,
      hasMore: true
    })
    expect(result.events.map((event) => event.sequence)).toEqual([2, 3])
    expect(result.events[0]?.data).toEqual({ delta: 'hello [redacted]' })
  })

  it('rejects unbounded reads, malformed stored session identity, and cross-owner history', async () => {
    const harness = createHarness()

    await expect(
      harness.query.readRange({
        runtimeInstanceId: 'runtime-1',
        sessionId: harness.manifest.sessionId,
        runId: harness.manifest.runId,
        manifestDigest: harness.manifest.digest,
        owner,
        afterSequence: 1,
        limit: 501
      })
    ).rejects.toThrow(/bounded|limit/i)

    harness.store.readSession.mockResolvedValueOnce({
      runtimeInstanceId: 'runtime-1',
      sessionId: harness.manifest.sessionId,
      runId: 'run-other',
      manifestDigest: harness.manifest.digest,
      owner
    })
    await expect(
      harness.query.readRange({
        runtimeInstanceId: 'runtime-1',
        sessionId: harness.manifest.sessionId,
        runId: harness.manifest.runId,
        manifestDigest: harness.manifest.digest,
        owner,
        afterSequence: 1,
        limit: 2
      })
    ).rejects.toThrow(/stored session/i)

    harness.store.readSession.mockResolvedValueOnce({
      runtimeInstanceId: 'runtime-1',
      sessionId: harness.manifest.sessionId,
      runId: harness.manifest.runId,
      manifestDigest: harness.manifest.digest,
      owner: { workspaceId: 'workspace-2' }
    })
    await expect(
      harness.query.readRange({
        runtimeInstanceId: 'runtime-1',
        sessionId: harness.manifest.sessionId,
        runId: harness.manifest.runId,
        manifestDigest: harness.manifest.digest,
        owner,
        afterSequence: 1,
        limit: 2
      })
    ).rejects.toThrow(/owner/i)
  })

  it('rejects sequence gaps and events outside the requested session before returning history', async () => {
    const harness = createHarness({
      events: [
        runtimeEvent({ sequence: 2, eventId: 'event-2' }, 'digest-placeholder'),
        runtimeEvent({ sequence: 4, eventId: 'event-4' }, 'digest-placeholder')
      ]
    })

    await expect(
      harness.query.readRange({
        runtimeInstanceId: 'runtime-1',
        sessionId: harness.manifest.sessionId,
        runId: harness.manifest.runId,
        manifestDigest: harness.manifest.digest,
        owner,
        afterSequence: 1,
        limit: 2
      })
    ).rejects.toThrow(/sequence gap/i)

    harness.store.readEventsAfter.mockResolvedValueOnce([
      {
        ...runtimeEvent(
          {
            sequence: 2,
            eventId: 'event-2',
            sessionId: 'session-other'
          },
          harness.manifest.digest
        )
      }
    ])
    await expect(
      harness.query.readRange({
        runtimeInstanceId: 'runtime-1',
        sessionId: harness.manifest.sessionId,
        runId: harness.manifest.runId,
        manifestDigest: harness.manifest.digest,
        owner,
        afterSequence: 1,
        limit: 2
      })
    ).rejects.toThrow(/stored event/i)
  })
})

function createHarness(options: { events?: DshRuntimeEventEnvelope[] } = {}) {
  const manifest = createDshRunManifest({
    runId: 'run-1',
    sessionId: 'session-1',
    owner
  })
  const events =
    options.events?.map((event) => ({
      ...event,
      manifestDigest:
        event.manifestDigest === 'digest-placeholder'
          ? manifest.digest
          : event.manifestDigest
    })) ?? [
      runtimeEvent(
        {
          sequence: 2,
          eventId: 'event-2',
          data: { delta: 'hello token=sk-live-secret' }
        },
        manifest.digest
      ),
      runtimeEvent(
        {
          sequence: 3,
          eventId: 'event-3',
          data: { delta: 'world' }
        },
        manifest.digest
      )
    ]
  const store = {
    readSession: vi.fn(async () => ({
      runtimeInstanceId: 'runtime-1',
      sessionId: manifest.sessionId,
      runId: manifest.runId,
      manifestDigest: manifest.digest,
      owner
    })),
    readEventsAfter: vi.fn(async () => events)
  }
  const query = new DshHistoryQuery({
    store,
    maxLimit: 500
  })
  return { manifest, query, store }
}

function runtimeEvent(
  overrides: Partial<DshRuntimeEventEnvelope>,
  manifestDigest: string
): DshRuntimeEventEnvelope {
  return {
    schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
    runtimeInstanceId: 'runtime-1',
    sessionId: 'session-1',
    runId: 'run-1',
    manifestDigest,
    owner,
    eventId: 'event-1',
    sequence: 1,
    kind: 'model.text_delta',
    occurredAt: 1_000,
    data: { delta: 'hello' },
    ...overrides
  }
}
