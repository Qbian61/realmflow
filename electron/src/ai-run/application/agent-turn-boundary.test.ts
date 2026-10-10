import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import type { RunCheckpoint } from '../../../../domain/agent-run-recovery'
import { AgentToolLoopCoordinator } from './agent-tool-loop-coordinator'

describe('Main-owned instruction turn boundary', () => {
  function setup(fail = false, failTerminal = false) {
    const saved: RunCheckpoint[] = []
    const committed: RunCheckpoint[] = []
    const acknowledgeTurn = vi.fn(async () => {
      expect(committed).toHaveLength(1)
    })
    const commit = vi.fn(async (checkpoint: RunCheckpoint, ids: string[]) => {
      expect(ids).toEqual(['adjust-1'])
      if (fail) throw new Error('disk failed')
      committed.push(checkpoint)
    })
    const createRun = vi.fn(async () => ({ runId: 'provider-1' }))
    const cancelRun = vi.fn(async () => undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun, cancelRun, acknowledgeTurn, submitToolResult: vi.fn(),
        streamEvents: async function* () {
          yield event(1, 'run.started')
          yield event(2, 'run.turn_ready', { agentTurn: 1 })
          yield event(2, 'run.turn_ready', { agentTurn: 1 })
          yield event(3, 'answer.delta', { delta: 'The final answer.' })
          yield event(4, 'run.completed')
        }
      },
      catalog: { list: vi.fn(async () => ({ packages: [], tools: [], skills: [] })) },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(), bindProviderRun: vi.fn(), transition: vi.fn(),
        getByProviderRunId: vi.fn(), listByRootRunId: vi.fn(), listByParentRunId: vi.fn(), listUnfinished: vi.fn()
      },
      checkpoints: { save: async (c) => {
        if (failTerminal && c.reason === 'terminal') throw new Error('terminal disk failed')
        saved.push(c); return true
      }, getLatest: vi.fn(), list: vi.fn() },
      turnBoundary: {
        pending: () => [{ id: 'adjust-1', sourceRunId: 'agent-1', message: 'Revised objective', status: 'queued', createdAt: 1 }],
        commit
      },
      createRuntimeRunId: () => 'agent-1', now: () => 100
    })
    return { coordinator, saved, committed, commit, acknowledgeTurn, createRun, cancelRun }
  }

  it('persists new instructions before acknowledgment and handles replay without adding messages twice', async () => {
    const f = setup()
    const run = await f.coordinator.createRun({
      conversationId: 'session-1', messages: [{ role: 'user', content: 'Start' }]
    })
    const events = []
    for await (const event of f.coordinator.streamEvents(run.runId, new AbortController().signal)) events.push(event)
    expect(f.createRun).toHaveBeenCalledWith(expect.anything(), undefined, expect.objectContaining({ turnGate: true }))
    expect(f.commit).toHaveBeenCalledOnce()
    expect(f.acknowledgeTurn).toHaveBeenCalledTimes(2)
    expect(f.acknowledgeTurn).toHaveBeenLastCalledWith('provider-1', {
      turn: 1, messages: [{ role: 'user', content: 'Revised objective' }]
    })
    expect(f.saved.at(-1)?.messageWindow.filter((m) => m.content === 'Revised objective')).toHaveLength(1)
    expect(events.map((e) => e.type)).toEqual(['run.started', 'answer.delta', 'run.completed'])
    expect(f.committed[0].toolConfiguration?.turnGate).toBe(true)
  })

  it('cancels the waiting provider without acknowledgment when the atomic checkpoint fails', async () => {
    const f = setup(true)
    const run = await f.coordinator.createRun({
      conversationId: 'session-1', messages: [{ role: 'user', content: 'Start' }]
    })
    await expect((async () => {
      for await (const _ of f.coordinator.streamEvents(run.runId, new AbortController().signal)) { /* drain */ }
    })()).rejects.toThrow('disk failed')
    expect(f.acknowledgeTurn).not.toHaveBeenCalled()
    expect(f.cancelRun).toHaveBeenCalledWith('provider-1')
    expect(f.saved.flatMap((c) => c.messageWindow).some((m) => m.content === 'Revised objective')).toBe(false)
  })

  it('persists the terminal checkpoint before consumers can stop or fail projection', async () => {
    const f = setup()
    const run = await f.coordinator.createRun({
      conversationId: 'session-1', messages: [], applicationLocale: 'en'
    })
    for await (const output of f.coordinator.streamEvents(run.runId, new AbortController().signal)) {
      if (output.type === 'run.completed') {
        expect(f.saved.at(-1)?.reason).toBe('terminal')
        expect(f.saved.at(-1)?.projectionCursor).toBe(output.sequence)
        expect(f.saved.at(-1)?.messageWindow.at(-1)).toMatchObject({
          role: 'assistant', content: 'The final answer.'
        })
        break
      }
    }
  })

  it('does not expose completion if its terminal checkpoint cannot commit', async () => {
    const f = setup(false, true)
    const run = await f.coordinator.createRun({
      conversationId: 'session-1', messages: [], applicationLocale: 'en'
    })
    const emitted: string[] = []
    await expect((async () => {
      for await (const output of f.coordinator.streamEvents(run.runId, new AbortController().signal)) {
        emitted.push(output.type)
      }
    })()).rejects.toThrow('terminal disk failed')
    expect(emitted).not.toContain('run.completed')
  })
})

function event(sequence: number, type: AiRunEvent['type'], data = {}): AiRunEvent {
  return { id: `provider-1:${sequence}`, runId: 'provider-1', sequence, type, data, timestamp: new Date(100).toISOString() }
}
