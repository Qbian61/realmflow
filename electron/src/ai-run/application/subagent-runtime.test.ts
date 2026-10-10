import { vi } from 'vitest'
import type { DelegationPolicy, DelegationRequest } from '../../../../domain/subagent'
import { SubagentRuntime } from './subagent-runtime'

describe('SubagentRuntime', () => {
  it('does not start or charge tasks when the parent signal is already cancelled', async () => {
    const runTask = vi.fn(async (task) => ({
      taskId: task.id, status: 'completed' as const, summary: 'Done',
      evidence: [], unresolved: [], artifactIds: []
    }))
    const runtime = new SubagentRuntime({ runTask })
    const controller = new AbortController()
    controller.abort()
    const bounded = policy({
      rootBudgets: { maxToolCalls: 1, maxSubagents: 1, timeoutMs: 900_000, maxRetries: 2 }
    })
    expect(await runtime.execute({
      rootRunId: 'root-1', request: request('one'), policy: bounded, signal: controller.signal
    })).toMatchObject({ status: 'cancelled', tasks: [{ taskId: 'one', status: 'cancelled' }] })
    expect(runTask).not.toHaveBeenCalled()
    expect(await runtime.execute({
      rootRunId: 'root-1', request: request('two'), policy: bounded, signal: new AbortController().signal
    })).toMatchObject({ status: 'completed' })
  })

  it('runs independent tasks with bounded concurrency and preserves request order', async () => {
    let active = 0
    let peak = 0
    const releases: Array<() => void> = []
    const runtime = new SubagentRuntime({
      runTask: vi.fn().mockImplementation(async (task) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise<void>((resolve) => releases.push(resolve))
        active -= 1
        return {
          taskId: task.id,
          status: 'completed',
          summary: `Summary ${task.id}`,
          evidence: [],
          unresolved: [],
          artifactIds: []
        }
      })
    })
    const execution = runtime.execute({
      rootRunId: 'root-1',
      request: request('one', 'two', 'three'),
      policy: policy({ maximumConcurrency: 2 }),
      signal: new AbortController().signal
    })

    await vi.waitFor(() => expect(releases).toHaveLength(2))
    expect(peak).toBe(2)
    releases.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    releases.splice(0).forEach((release) => release())

    await expect(execution).resolves.toMatchObject({
      status: 'completed',
      tasks: [
        { taskId: 'one' },
        { taskId: 'two' },
        { taskId: 'three' }
      ]
    })
  })

  it('keeps sibling results when one child fails', async () => {
    const runtime = new SubagentRuntime({
      runTask: vi.fn().mockImplementation(async (task) =>
        task.id === 'two'
          ? {
              taskId: task.id,
              status: 'failed',
              summary: 'Provider failed',
              evidence: [],
              unresolved: ['Retry later'],
              artifactIds: [],
              errorCode: 'provider_failed'
            }
          : {
              taskId: task.id,
              status: 'completed',
              summary: `Summary ${task.id}`,
              evidence: [],
              unresolved: [],
              artifactIds: []
            }
      )
    })

    await expect(
      runtime.execute({
        rootRunId: 'root-1',
        request: request('one', 'two', 'three'),
        policy: policy(),
        signal: new AbortController().signal
      })
    ).resolves.toMatchObject({
      status: 'partial',
      tasks: [
        { taskId: 'one', status: 'completed' },
        { taskId: 'two', status: 'failed' },
        { taskId: 'three', status: 'completed' }
      ]
    })
  })

  it('charges the root budget across repeated delegation calls', async () => {
    const runtime = new SubagentRuntime({
      runTask: vi.fn().mockImplementation(async (task) => ({
        taskId: task.id,
        status: 'completed',
        summary: 'Done',
        evidence: [],
        unresolved: [],
        artifactIds: []
      }))
    })

    await runtime.execute({
      rootRunId: 'root-1',
      request: request('one', 'two'),
      policy: policy({
        rootBudgets: {
          maxToolCalls: 4,
          maxSubagents: 3,
          timeoutMs: 900_000,
          maxRetries: 2
        }
      }),
      signal: new AbortController().signal
    })

    await expect(
      runtime.execute({
        rootRunId: 'root-1',
        request: request('three', 'four'),
        policy: policy({
          rootBudgets: {
            maxToolCalls: 4,
            maxSubagents: 3,
            timeoutMs: 900_000,
            maxRetries: 2
          }
        }),
        signal: new AbortController().signal
      })
    ).rejects.toThrow('Subagent delegation exceeds the root budget')
  })

  it('cancels active and queued children when the root is cancelled', async () => {
    const started: string[] = []
    const runtime = new SubagentRuntime({
      runTask: vi.fn().mockImplementation(
        (task, signal) =>
          new Promise((resolve) => {
            started.push(task.id)
            signal.addEventListener(
              'abort',
              () =>
                resolve({
                  taskId: task.id,
                  status: 'cancelled',
                  summary: 'Cancelled',
                  evidence: [],
                  unresolved: [],
                  artifactIds: []
                }),
              { once: true }
            )
          })
      )
    })
    const execution = runtime.execute({
      rootRunId: 'root-1',
      request: request('one', 'two', 'three'),
      policy: policy({ maximumConcurrency: 2 }),
      signal: new AbortController().signal
    })

    await vi.waitFor(() => expect(started).toEqual(['one', 'two']))
    runtime.cancel('root-1')

    await expect(execution).resolves.toMatchObject({
      status: 'cancelled',
      tasks: [
        { taskId: 'one', status: 'cancelled' },
        { taskId: 'two', status: 'cancelled' },
        { taskId: 'three', status: 'cancelled' }
      ]
    })
    expect(started).toEqual(['one', 'two'])
  })

  it('releases the root budget ledger after the root reaches a terminal state', async () => {
    const runtime = new SubagentRuntime({
      runTask: vi.fn().mockImplementation(async (task) => ({
        taskId: task.id,
        status: 'completed',
        summary: 'Done',
        evidence: [],
        unresolved: [],
        artifactIds: []
      }))
    })
    const bounded = policy({
      rootBudgets: {
        maxToolCalls: 1,
        maxSubagents: 1,
        timeoutMs: 900_000,
        maxRetries: 2
      }
    })

    await runtime.execute({
      rootRunId: 'root-1',
      request: request('one'),
      policy: bounded,
      signal: new AbortController().signal
    })
    runtime.release('root-1')

    await expect(
      runtime.execute({
        rootRunId: 'root-1',
        request: request('two'),
        policy: bounded,
        signal: new AbortController().signal
      })
    ).resolves.toMatchObject({ status: 'completed' })
  })
})

function request(...ids: string[]): DelegationRequest {
  return {
    tasks: ids.map((id) => ({
      id,
      objective: `Inspect ${id}`,
      completionCriteria: [`Summarize ${id}`],
      maxToolCalls: 1,
      resultFormat: 'research_summary',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' }
    }))
  }
}

function policy(
  patch: Partial<DelegationPolicy> = {}
): DelegationPolicy {
  return {
    scenarioId: 'space',
    parentScope: { kind: 'workspace', workspaceId: 'workspace-1' },
    delegationDepth: 0,
    maximumDepth: 2,
    maximumConcurrency: 4,
    rootBudgets: {
      maxToolCalls: 8,
      maxSubagents: 8,
      timeoutMs: 900_000,
      maxRetries: 2
    },
    consumedSubagents: 0,
    consumedToolCalls: 0,
    ...patch
  }
}
