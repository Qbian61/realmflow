import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../test-manifest-fixture'
import {
  DshSubagentRuntimePolicy,
  type DshSubagentRuntimeEvent
} from './subagent-runtime-policy'

describe('DshSubagentRuntimePolicy', () => {
  it('spawns only manifest-declared agents with narrowed child authority and emits lineage events', async () => {
    const parent = createDshRunManifest()
    const child = createDshRunManifest({
      manifestId: 'child-manifest-1',
      runId: 'child-run-1',
      sessionId: 'child-session-1',
      budget: {
        ...parent.budget,
        maxToolCalls: 8,
        maxSubagents: 0,
        maxRuntimeMs: 300_000,
        maxInputTokens: 32_000,
        maxOutputTokens: 4_000
      }
    })
    const signal = new AbortController().signal
    const events: DshSubagentRuntimeEvent[] = []
    const adapter = {
      spawn: vi.fn(async (_agent, request, context) => {
        expect(request.objective).toBe('Collect project facts')
        expect(context.signal).toBe(signal)
        expect(context.lineage).toEqual({
          parentRunId: parent.runId,
          childRunId: 'child-run-1',
          agentId: 'builtin.general',
          depth: 1
        })
        return {
          status: 'completed' as const,
          output: { summary: 'done' }
        }
      })
    }
    const runtime = new DshSubagentRuntimePolicy({
      manifest: parent,
      adapter,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.spawn({
        agentId: 'builtin.general',
        callId: 'subagent-call-1',
        childManifest: child,
        objective: 'Collect project facts',
        depth: 1,
        signal
      })
    ).resolves.toEqual({
      status: 'completed',
      output: { summary: 'done' }
    })

    expect(adapter.spawn).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.kind)).toEqual([
      'subagent.spawned',
      'subagent.waiting',
      'subagent.completed'
    ])
  })

  it('rejects undeclared agents and child manifests that widen parent authority before spawning', async () => {
    const parent = createDshRunManifest()
    const widerChild = createDshRunManifest({
      manifestId: 'child-manifest-2',
      runId: 'child-run-2',
      sessionId: 'child-session-2',
      budget: {
        ...parent.budget,
        maxToolCalls: parent.budget.maxToolCalls + 1
      }
    })
    const adapter = {
      spawn: vi.fn(async () => ({
        status: 'completed' as const,
        output: {}
      }))
    }
    const events: DshSubagentRuntimeEvent[] = []
    const runtime = new DshSubagentRuntimePolicy({
      manifest: parent,
      adapter,
      emitEvent: (event) => events.push(event)
    })

    await expect(
      runtime.spawn({
        agentId: 'builtin.unknown',
        callId: 'subagent-call-2',
        childManifest: parent,
        objective: 'Collect project facts',
        depth: 1
      })
    ).rejects.toThrow(/agent is not declared/i)
    await expect(
      runtime.spawn({
        agentId: 'builtin.general',
        callId: 'subagent-call-3',
        childManifest: widerChild,
        objective: 'Collect project facts',
        depth: 1
      })
    ).rejects.toThrow(/child budget widens parent/i)

    expect(adapter.spawn).not.toHaveBeenCalled()
    expect(events.map((event) => event.kind)).toEqual([
      'subagent.denied',
      'subagent.denied'
    ])
  })
})
