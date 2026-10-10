import { describe, expect, it, vi } from 'vitest'
import { createRealmFlowApi } from '../preload-api'
import { registerAgentRuntimeIpc } from './agent-runtime-ipc'

describe('agent runtime IPC', () => {
  it('exposes separate typed query and state commands in preload', async () => {
    const invoke = vi.fn()
    const api = createRealmFlowApi({ invoke, on: vi.fn(), removeListener: vi.fn() }, 'darwin')
    expect(api.agentRuntime).toBeDefined()
    await api.agentRuntime!.get('run-1')
    const goal = { runId: 'run-1', requestId: 'goal-1', objective: 'Review', status: 'active' as const, expectedRevision: 0 }
    await api.agentRuntime!.updateGoal(goal)
    await api.agentRuntime!.steer({ runId: 'run-1', requestId: 'steer-1', message: 'Check UI' })
    await api.agentRuntime!.cancel({ runId: 'run-1', sessionId: 'session-1' })
    expect(invoke.mock.calls).toEqual([
      ['agent-runtime:get', { runId: 'run-1' }],
      ['agent-runtime:update-goal', goal],
      ['agent-runtime:steer', { runId: 'run-1', requestId: 'steer-1', message: 'Check UI' }],
      ['agent-runtime:cancel', { runId: 'run-1', sessionId: 'session-1' }]
    ])
  })

  it('resolves provider identity in Main and rejects identity injection before dispatch', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const cancel = vi.fn()
    const orchestrator = { status: vi.fn().mockResolvedValue({ runId: 'canonical' }), command: vi.fn() }
    registerAgentRuntimeIpc({
      orchestrator, resolveRunId: async (id) => id === 'provider' ? 'canonical' : undefined,
      resolveRun: async () => ({ id: 'canonical', snapshot: { conversationId: 'session-1' } }) as never,
      cancel,
      ipcMain: { handle: (name, handler) => handlers.set(name, handler as (...args: unknown[]) => unknown) }
    })
    const get = handlers.get('agent-runtime:get')!
    expect(get).toBeTypeOf('function')
    await expect(get({}, { runId: 'provider' })).resolves.toEqual({ runId: 'canonical' })
    await expect(get({}, { runId: 'missing' })).rejects.toThrow('runtime_run_unavailable')
    await expect(get({}, { runId: 'provider', scope: 'global' })).rejects.toThrow()
    const steer = handlers.get('agent-runtime:steer')!
    await expect(steer({}, { runId: 'provider', requestId: 's1', message: 'Focus' })).resolves.toEqual({ runId: 'canonical' })
    expect(orchestrator.command).toHaveBeenCalledWith('canonical', 's1', 'steer', { message: 'Focus' })
    await expect(steer({}, { runId: 'provider', requestId: 's2', message: 'Focus', sourceRunId: 'other' })).rejects.toThrow()
    expect(orchestrator.command).toHaveBeenCalledOnce()
    const cancelHandler = handlers.get('agent-runtime:cancel')!
    await expect(cancelHandler({}, { runId: 'provider', sessionId: 'session-1' })).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledWith('canonical')
    await expect(cancelHandler({}, { runId: 'provider', sessionId: 'foreign' }))
      .rejects.toThrow('runtime_scope_denied')
  })
})
