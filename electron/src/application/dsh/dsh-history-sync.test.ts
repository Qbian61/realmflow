import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import type { DshRunOwner } from '../../../../domain/dsh-run-manifest'
import {
  createDshSessionBinding,
  dshRunOwnerKey,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import {
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'
import type { DshRuntimeEventProjectionResult } from './dsh-runtime-event-projector'
import { DshRuntimeEventIngestor } from './dsh-runtime-event-ingestor'
import { DshHistorySync } from './dsh-history-sync'

const owner: DshRunOwner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

describe('DshHistorySync', () => {
  it('reads bounded history after the durable cursor and rebuilds projections idempotently', async () => {
    const harness = createHarness({
      lastProjectedSequence: 1,
      events: [
        runtimeEvent({ sequence: 2, eventId: 'event-2' }, 'digest-placeholder'),
        runtimeEvent(
          {
            sequence: 3,
            eventId: 'product-command-event-1',
            kind: 'product_command.completed',
            data: {
              commandId: 'command-1',
              command: 'realmflow.node.answer_question',
              idempotencyKey: 'product-command-1',
              productVersion: 'node-v2',
              output: { answerId: 'answer-1' },
              resultSummary: 'Node answer saved'
            }
          },
          'digest-placeholder'
        )
      ]
    })

    const first = await harness.sync.syncRun({
      runtimeInstanceId: 'runtime-1',
      manifest: harness.manifest,
      limit: 50
    })
    const second = await harness.sync.syncRun({
      runtimeInstanceId: 'runtime-1',
      manifest: harness.manifest,
      limit: 50
    })

    expect(first).toEqual({
      status: 'synced',
      dshSessionId: harness.manifest.sessionId,
      fromSequence: 1,
      toSequence: 3,
      projectedEvents: 2,
      productCommandResultsReconciled: 1,
      hasMore: false
    })
    expect(second).toEqual({
      status: 'synced',
      dshSessionId: harness.manifest.sessionId,
      fromSequence: 3,
      toSequence: 3,
      projectedEvents: 0,
      productCommandResultsReconciled: 0,
      hasMore: false
    })
    expect(harness.history.readRange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        afterSequence: 1,
        limit: 50,
        sessionId: harness.manifest.sessionId,
        owner
      })
    )
    expect(harness.history.readRange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        afterSequence: 3,
        limit: 50
      })
    )
    expect(harness.projector.project).toHaveBeenCalledTimes(2)
    expect(harness.sessions.binding.lastProjectedSequence).toBe(3)
    expect(
      harness.productCommandResults.reconcileCompletedResult
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeInstanceId: 'runtime-1',
        sessionId: harness.manifest.sessionId,
        runId: harness.manifest.runId,
        commandId: 'command-1',
        command: 'realmflow.node.answer_question',
        idempotencyKey: 'product-command-1',
        sequence: 3,
        productVersion: 'node-v2',
        output: { answerId: 'answer-1' }
      })
    )
    expect(harness.productCommandResults.execute).not.toHaveBeenCalled()
  })

  it('rejects cross-owner stored history before projection', async () => {
    const harness = createHarness({
      lastProjectedSequence: 1,
      historySessionOwner: { workspaceId: 'workspace-2' },
      events: [runtimeEvent({ sequence: 2, eventId: 'event-2' }, 'digest-placeholder')]
    })

    await expect(
      harness.sync.syncRun({
        runtimeInstanceId: 'runtime-1',
        manifest: harness.manifest,
        limit: 50
      })
    ).rejects.toThrow(/owner|session/i)

    expect(harness.projector.project).not.toHaveBeenCalled()
    expect(harness.sessions.binding.lastProjectedSequence).toBe(1)
  })

  it('rejects sequence gaps before applying any repaired projection', async () => {
    const harness = createHarness({
      lastProjectedSequence: 1,
      events: [
        runtimeEvent({ sequence: 2, eventId: 'event-2' }, 'digest-placeholder'),
        runtimeEvent({ sequence: 4, eventId: 'event-4' }, 'digest-placeholder')
      ]
    })

    await expect(
      harness.sync.syncRun({
        runtimeInstanceId: 'runtime-1',
        manifest: harness.manifest,
        limit: 50
      })
    ).rejects.toThrow(/sequence gap/i)

    expect(harness.projector.project).not.toHaveBeenCalled()
    expect(harness.sessions.binding.lastProjectedSequence).toBe(1)
    expect(
      harness.productCommandResults.reconcileCompletedResult
    ).not.toHaveBeenCalled()
  })

  it('rejects malformed Product Command history instead of replaying the command', async () => {
    const harness = createHarness({
      lastProjectedSequence: 1,
      events: [
        runtimeEvent(
          {
            sequence: 2,
            eventId: 'product-command-event-1',
            kind: 'product_command.completed',
            data: {
              commandId: 'command-1',
              command: 'realmflow.node.answer_question',
              productVersion: 'node-v2',
              output: { answerId: 'answer-1' }
            }
          },
          'digest-placeholder'
        )
      ]
    })

    await expect(
      harness.sync.syncRun({
        runtimeInstanceId: 'runtime-1',
        manifest: harness.manifest,
        limit: 50
      })
    ).rejects.toThrow(/idempotency/i)

    expect(harness.projector.project).not.toHaveBeenCalled()
    expect(harness.productCommandResults.execute).not.toHaveBeenCalled()
  })
})

function createHarness(
  options: {
    lastProjectedSequence: number
    historySessionOwner?: DshRunOwner
    events: DshRuntimeEventEnvelope[]
  }
) {
  const manifest = createDshRunManifest({
    runId: 'run-1',
    sessionId: 'session-1',
    owner
  })
  const events = options.events.map((event) => ({
    ...event,
    manifestDigest:
      event.manifestDigest === 'digest-placeholder'
        ? manifest.digest
        : event.manifestDigest
  }))
  const order: string[] = []
  const sessions = new InMemoryDshSessionBindings(
    createDshSessionBinding({
      owner,
      dshSessionId: manifest.sessionId,
      runManifestDigest: manifest.digest,
      runtimeBuildDigest: 'b'.repeat(64),
      lastProjectedSequence: options.lastProjectedSequence,
      createdAt: 100
    }),
    order
  )
  const projector = {
    project: vi.fn(async (event: DshRuntimeEventEnvelope) => {
      order.push(`project:${event.sequence}`)
      return {
        schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
        eventId: event.eventId,
        kind: event.kind,
        runtimeInstanceId: event.runtimeInstanceId,
        sessionId: event.sessionId,
        runId: event.runId,
        sequence: event.sequence,
        placements: [{ surface: 'assistant_reply_timeline', mode: 'timeline' }]
      } satisfies DshRuntimeEventProjectionResult
    })
  }
  const ingestor = new DshRuntimeEventIngestor({
    sessions,
    projector,
    now: () => 2_000
  })
  const history = {
    readRange: vi.fn(async (input: { afterSequence: number }) => {
      const rangeEvents = events.filter(
        (event) => event.sequence > input.afterSequence
      )
      return {
        session: {
          runtimeInstanceId: 'runtime-1',
          sessionId: manifest.sessionId,
          runId: manifest.runId,
          manifestDigest: manifest.digest,
          owner: options.historySessionOwner ?? owner
        },
        afterSequence: input.afterSequence,
        nextAfterSequence:
          rangeEvents.at(-1)?.sequence ?? input.afterSequence,
        hasMore: false,
        events: rangeEvents
      }
    })
  }
  const productCommandResults = {
    reconcileCompletedResult: vi.fn(async () => 'recorded' as const),
    execute: vi.fn()
  }
  const sync = new DshHistorySync({
    sessions,
    history,
    ingestor,
    productCommandResults,
    defaultLimit: 50
  })
  return {
    history,
    ingestor,
    manifest,
    productCommandResults,
    projector,
    sessions,
    sync
  }
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

class InMemoryDshSessionBindings {
  getByOwner = vi.fn(async (candidateOwner: DshRunOwner) =>
    dshRunOwnerKey(candidateOwner) === this.binding.ownerKey
      ? this.binding
      : undefined
  )

  getByDshSessionId = vi.fn(async (dshSessionId: string) =>
    this.binding.dshSessionId === dshSessionId ? this.binding : undefined
  )

  advanceProjection = vi.fn(
    async (dshSessionId: string, sequence: number, updatedAt: number) => {
      if (this.binding.dshSessionId !== dshSessionId) {
        throw new Error('DSH session binding is missing')
      }
      this.order.push(`cursor:${sequence}`)
      this.binding = {
        ...this.binding,
        lastProjectedSequence: sequence,
        updatedAt
      }
      return this.binding
    }
  )

  constructor(
    public binding: DshSessionBinding,
    private readonly order: string[]
  ) {}
}
