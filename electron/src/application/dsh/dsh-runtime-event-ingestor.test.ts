import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import {
  createDshSessionBinding,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import {
  DSH_RUNTIME_EVENT_SCHEMA_VERSION,
  type DshRuntimeEventEnvelope
} from '../../../../shared/dsh-runtime-event-contract'
import type { DshRuntimeEventProjectionResult } from './dsh-runtime-event-projector'
import { DshRuntimeEventIngestor } from './dsh-runtime-event-ingestor'

const owner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

describe('DshRuntimeEventIngestor', () => {
  it('projects the next manifest-bound event before advancing the durable cursor', async () => {
    const harness = createHarness()

    const result = await harness.ingestor.ingest(
      runtimeEvent(harness, {
        data: {
          delta:
            'hello token=sk-live-secret /Users/bytedance/private https://secret.example'
        }
      })
    )

    expect(result).toMatchObject({
      status: 'projected',
      cursor: 1
    })
    expect(harness.order).toEqual([
      'project:model.text_delta:1',
      'cursor:1',
      'audit:model.text_delta:1'
    ])
    expect(harness.projector.project).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'model.text_delta',
        sequence: 1,
        data: {
          delta: 'hello [redacted] [local path] [url]'
        }
      })
    )
    expect(harness.sessions.binding.lastProjectedSequence).toBe(1)
    expect(JSON.stringify(harness.auditEvents)).not.toContain('sk-live-secret')
    expect(JSON.stringify(harness.auditEvents)).not.toContain(
      'secret.example'
    )
    expect(JSON.stringify(harness.auditEvents)).not.toContain(
      '/Users/bytedance/private'
    )
  })

  it('skips duplicate projected sequences and rejects gaps before projection', async () => {
    const harness = createHarness({ lastProjectedSequence: 1 })

    await expect(
      harness.ingestor.ingest(runtimeEvent(harness, { sequence: 1 }))
    ).resolves.toMatchObject({ status: 'duplicate', cursor: 1 })
    expect(harness.projector.project).not.toHaveBeenCalled()

    await expect(
      harness.ingestor.ingest(runtimeEvent(harness, { sequence: 3 }))
    ).rejects.toThrow(/sequence/i)
    expect(harness.projector.project).not.toHaveBeenCalled()
    expect(harness.sessions.binding.lastProjectedSequence).toBe(1)
  })

  it('rejects unaccepted runtime identity, manifest mismatch, and cross-owner events', async () => {
    const harness = createHarness()

    await expect(
      harness.ingestor.ingest(
        runtimeEvent(harness, { runtimeInstanceId: 'runtime-other' })
      )
    ).rejects.toThrow(/accepted|binding/i)

    await expect(
      harness.ingestor.ingest(
        runtimeEvent(harness, { manifestDigest: '9'.repeat(64) })
      )
    ).rejects.toThrow(/accepted|manifest/i)

    await expect(
      harness.ingestor.ingest(
        runtimeEvent(harness, {
          owner: {
            workspaceId: 'workspace-2',
            requirementId: 'requirement-2',
            nodeRunId: 'node-run-2'
          }
        })
      )
    ).rejects.toThrow(/owner/i)
    expect(harness.projector.project).not.toHaveBeenCalled()
  })

  it('does not advance the cursor when durable projection fails', async () => {
    const harness = createHarness({
      project: async () => {
        throw new Error('projection store unavailable')
      }
    })

    await expect(
      harness.ingestor.ingest(runtimeEvent(harness))
    ).rejects.toThrow(/projection store unavailable/)

    expect(harness.sessions.advanceProjection).not.toHaveBeenCalled()
    expect(harness.sessions.binding.lastProjectedSequence).toBe(0)
  })
})

function createHarness(
  options: {
    lastProjectedSequence?: number
    project?: (
      event: DshRuntimeEventEnvelope
    ) => Promise<DshRuntimeEventProjectionResult>
  } = {}
) {
  const manifest = createDshRunManifest({
    runId: 'run-1',
    sessionId: 'session-1',
    owner
  })
  const order: string[] = []
  const auditEvents: unknown[] = []
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
      order.push(`project:${event.kind}:${event.sequence}`)
      if (options.project) return options.project(event)
      return {
        schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
        eventId: event.eventId,
        kind: event.kind,
        runtimeInstanceId: event.runtimeInstanceId,
        sessionId: event.sessionId,
        runId: event.runId,
        sequence: event.sequence,
        placements: [
          { surface: 'assistant_reply', mode: 'inline' },
          { surface: 'runtime_governance', mode: 'summary' }
        ]
      } satisfies DshRuntimeEventProjectionResult
    })
  }
  const ingestor = new DshRuntimeEventIngestor({
    sessions,
    projector,
    audit: {
      record: (event) => {
        order.push(`audit:${event.kind}:${event.sequence}`)
        auditEvents.push(event)
      }
    },
    now: () => 2_000
  })
  ingestor.acceptRunManifest({
    runtimeInstanceId: 'runtime-1',
    manifest
  })
  return { auditEvents, ingestor, manifest, order, projector, sessions }
}

function runtimeEvent(
  harness: ReturnType<typeof createHarness>,
  overrides: Partial<DshRuntimeEventEnvelope> = {}
): DshRuntimeEventEnvelope {
  return {
    schemaVersion: DSH_RUNTIME_EVENT_SCHEMA_VERSION,
    runtimeInstanceId: 'runtime-1',
    sessionId: harness.manifest.sessionId,
    runId: harness.manifest.runId,
    manifestDigest: harness.manifest.digest,
    owner,
    eventId: 'event-1',
    sequence: 1,
    kind: 'model.text_delta',
    occurredAt: 1_234,
    data: { delta: 'hello' },
    ...overrides
  }
}

class InMemoryDshSessionBindings {
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
