import { describe, expect, it, vi } from 'vitest'
import {
  createDshSessionBinding,
  dshRunOwnerKey,
  type DshSessionBinding
} from '../../../../domain/dsh-session-binding'
import type { DshRunOwner } from '../../../../domain/dsh-run-manifest'
import type {
  DshAcpMcpServer,
  DshAcpPromptBlock
} from '../../ai-run/application/ports'
import {
  DshSessionLifecycleService,
  type DshSessionLifecycleProjectionWait
} from './dsh-session-lifecycle-service'

const owner = { workspaceId: 'workspace-1' }

describe('DshSessionLifecycleService', () => {
  it('cancels an active RealmFlow run through DSH session/cancel', async () => {
    const harness = createHarness()

    await harness.service.cancel({ owner })

    expect(harness.runtime.cancelledSessionIds).toEqual(['dsh-session-1'])
    expect(harness.sessions.transitions).toEqual([
      { sessionId: 'dsh-session-1', status: 'cancelled', at: 1_001 }
    ])
  })

  it('persists pause intent before close and marks paused only after durable session.closed projection', async () => {
    const harness = createHarness({
      binding: sessionBinding({ lastProjectedSequence: 7 })
    })

    const pause = harness.service.pause({
      owner,
      reason: 'user_requested'
    })
    await flush()

    expect(harness.sessions.transitions).toEqual([
      { sessionId: 'dsh-session-1', status: 'closing', at: 1_001 }
    ])
    expect(harness.runtime.closedSessionIds).toEqual(['dsh-session-1'])
    expect(harness.projection.waits).toEqual([
      {
        sessionId: 'dsh-session-1',
        kind: 'session.closed',
        afterSequence: 7
      }
    ])
    expect(harness.sessions.current?.lifecycleStatus).toBe('closing')

    harness.projection.resolveNext({ sequence: 8 })
    await expect(pause).resolves.toEqual({
      status: 'paused',
      dshSessionId: 'dsh-session-1',
      projectedSequence: 8
    })
    expect(harness.sessions.transitions.at(-1)).toEqual({
      sessionId: 'dsh-session-1',
      status: 'paused',
      at: 1_002
    })
  })

  it('resumes a paused session through session/resume and sends a continuation prompt after durable projection', async () => {
    const harness = createHarness({
      binding: sessionBinding({
        lifecycleStatus: 'paused',
        lastProjectedSequence: 8
      })
    })
    const prompt: DshAcpPromptBlock[] = [
      { type: 'text', text: 'Continue from the durable pause point.' }
    ]
    const mcpServers: DshAcpMcpServer[] = [
      { name: 'realmflow-docs', url: 'http://127.0.0.1:7777/mcp' }
    ]

    const resume = harness.service.resume({
      owner,
      cwd: '/workspace/one',
      mcpServers,
      continuationPrompt: prompt
    })
    await flush()

    expect(harness.runtime.resumedSessions).toEqual([
      {
        sessionId: 'dsh-session-1',
        cwd: '/workspace/one',
        mcpServers
      }
    ])
    expect(harness.projection.waits).toEqual([
      {
        sessionId: 'dsh-session-1',
        kind: 'session.resumed',
        afterSequence: 8
      }
    ])
    expect(harness.runtime.prompts).toEqual([])

    harness.projection.resolveNext({ sequence: 9 })
    await expect(resume).resolves.toEqual({
      status: 'running',
      dshSessionId: 'dsh-session-1',
      projectedSequence: 9
    })
    expect(harness.sessions.transitions).toEqual([
      { sessionId: 'dsh-session-1', status: 'active', at: 1_001 }
    ])
    expect(harness.runtime.prompts).toEqual([
      {
        sessionId: 'dsh-session-1',
        prompt
      }
    ])
  })

  it('rejects new work for the same closing session while independent sessions remain admissible', async () => {
    const harness = createHarness({
      binding: sessionBinding({ lifecycleStatus: 'closing' })
    })

    await expect(harness.service.assertNewWorkAllowed({ owner })).rejects.toThrow(
      'DSH session is closing'
    )
    await expect(
      harness.service.assertNewWorkAllowed({
        owner: { workspaceId: 'workspace-2' }
      })
    ).resolves.toEqual({ status: 'allowed' })
  })
})

function createHarness(options: { binding?: DshSessionBinding } = {}) {
  const sessions = new FakeDshLifecycleSessionStore(
    options.binding ?? sessionBinding()
  )
  const runtime = new FakeDshLifecycleRuntime()
  const projection = new FakeProjectionWait()
  const service = new DshSessionLifecycleService({
    runtime,
    sessions,
    projection,
    now: nextNow()
  })
  return {
    projection,
    runtime,
    service,
    sessions
  }
}

function sessionBinding(
  overrides: Partial<Parameters<typeof createDshSessionBinding>[0]> = {}
): DshSessionBinding {
  return createDshSessionBinding({
    owner,
    dshSessionId: 'dsh-session-1',
    runManifestDigest: 'a'.repeat(64),
    runtimeBuildDigest: 'b'.repeat(64),
    createdAt: 900,
    ...overrides
  })
}

function nextNow(): () => number {
  let value = 1_000
  return () => {
    value += 1
    return value
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

class FakeDshLifecycleSessionStore {
  current: DshSessionBinding | undefined
  readonly transitions: Array<{
    sessionId: string
    status: DshSessionBinding['lifecycleStatus']
    at: number
  }> = []

  constructor(binding: DshSessionBinding) {
    this.current = binding
  }

  async getByOwner(
    inputOwner: DshRunOwner
  ): Promise<DshSessionBinding | undefined> {
    if (this.current?.ownerKey !== dshRunOwnerKey(inputOwner)) return undefined
    return this.current
  }

  async transition(
    sessionId: string,
    status: DshSessionBinding['lifecycleStatus'],
    at: number
  ): Promise<DshSessionBinding> {
    this.transitions.push({ sessionId, status, at })
    this.current = createDshSessionBinding({
      owner: this.current!.owner,
      dshSessionId: sessionId,
      runManifestDigest: this.current!.runManifestDigest,
      runtimeBuildDigest: this.current!.runtimeBuildDigest,
      lastProjectedSequence: this.current!.lastProjectedSequence,
      lifecycleStatus: status,
      createdAt: this.current!.createdAt,
      updatedAt: at
    })
    return this.current
  }
}

class FakeDshLifecycleRuntime {
  readonly cancelledSessionIds: string[] = []
  readonly closedSessionIds: string[] = []
  readonly resumedSessions: Array<{
    sessionId: string
    cwd: string
    mcpServers?: DshAcpMcpServer[]
  }> = []
  readonly prompts: Array<{
    sessionId: string
    prompt: DshAcpPromptBlock[]
  }> = []
  start = vi.fn(async () => {})

  async cancel(input: { sessionId: string }): Promise<void> {
    this.cancelledSessionIds.push(input.sessionId)
  }

  async closeSession(input: { sessionId: string }): Promise<Record<string, never>> {
    this.closedSessionIds.push(input.sessionId)
    return {}
  }

  async resumeSession(input: {
    sessionId: string
    cwd: string
    mcpServers?: DshAcpMcpServer[]
  }): Promise<Record<string, never>> {
    this.resumedSessions.push(input)
    return {}
  }

  async prompt(input: {
    sessionId: string
    prompt: DshAcpPromptBlock[]
  }): Promise<{ stopReason: string }> {
    this.prompts.push(input)
    return { stopReason: 'end_turn' }
  }
}

class FakeProjectionWait {
  readonly waits: Array<DshSessionLifecycleProjectionWait> = []
  private readonly resolvers: Array<{
    resolve: (value: { sequence: number }) => void
  }> = []

  waitForDurableSessionEvent(
    input: DshSessionLifecycleProjectionWait
  ): Promise<{ sequence: number }> {
    this.waits.push(input)
    return new Promise((resolve) => {
      this.resolvers.push({ resolve })
    })
  }

  resolveNext(value: { sequence: number }): void {
    const next = this.resolvers.shift()
    if (next === undefined) throw new Error('No projection waiter')
    next.resolve(value)
  }
}
