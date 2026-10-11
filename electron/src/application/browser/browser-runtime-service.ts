import { randomUUID } from 'node:crypto'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  BrowserAction, BrowserCallContext, BrowserDriver, BrowserSession,
  BrowserSessionRepository, BrowserEffectEvidence
} from './browser-runtime-port'
import type {
  RuntimeResourceLeaseService
} from '../tools/runtime-resource-lease-service'

export class BrowserRuntimeService {
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly active = new Set<string>()
  private readonly runSessions = new Map<string, Set<string>>()
  private readonly sessionRuns = new Map<string, string>()
  private readonly inspections = new Map<string, string>()

  constructor(
    private readonly repository: BrowserSessionRepository,
    private readonly driver: BrowserDriver,
    private readonly leases?: RuntimeResourceLeaseService
  ) {}

  async createSession(call: BrowserCallContext): Promise<BrowserSession> {
    return this.open(`browser-${randomUUID()}`, call)
  }

  async attachSession(profileId: string, call: BrowserCallContext): Promise<BrowserSession> {
    return this.serial(profileId, async () => {
      const sessions = this.repository.list().filter((s) => s.profileId === profileId)
      if (!sessions.length || sessions.some((s) => s.ownerKey !== call.ownerKey)) {
        throw browserError('owner', 'Browser profile owner does not match')
      }
      if (sessions.some((s) => s.status === 'active')) {
        throw browserError('profile_active', 'Browser profile is already active')
      }
      return this.open(profileId, call)
    })
  }

  async closeSession(id: string, call: BrowserCallContext): Promise<void> {
    return this.serial(id, async () => {
      const session = this.owned(id, call)
      if (session.status === 'closed') return
      await this.driver.close(id)
      this.active.delete(id)
      this.untrack(id)
      this.transition(session, 'closed', call.executionId)
    })
  }

  async describe(id: string, action: BrowserAction, args: JsonObject, call: BrowserCallContext): Promise<BrowserEffectEvidence> {
    return this.serial(id, async () => {
      call.signal.throwIfAborted()
      const session = this.owned(id, call)
      if (session.status !== 'active' || !this.active.has(id)) {
        throw browserError('session_inactive', 'Browser session is not active')
      }
      if (!this.driver.describe) throw browserError('unavailable', 'Browser target inspection is unavailable')
      const evidence = await this.driver.describe(session, action, args, call.signal)
      this.inspections.set(JSON.stringify([id, call.executionId, action, args]), evidence.targetDigest)
      return evidence
    })
  }

  async execute(id: string, action: BrowserAction, args: JsonObject, call: BrowserCallContext): Promise<JsonObject> {
    return this.serial(id, async () => {
      call.signal.throwIfAborted()
      const session = this.owned(id, call)
      if (session.status !== 'active' || !this.active.has(id)) {
        throw browserError('session_inactive', 'Browser session is not active; attach its profile to resume')
      }
      const inspectionKey = JSON.stringify([id, call.executionId, action, args])
      const expected = this.inspections.get(inspectionKey)
      this.inspections.delete(inspectionKey)
      if (this.driver.describe) {
        if (!expected) throw browserError('target_changed', 'Browser target inspection is required')
        const actual = await this.driver.describe(session, action, args, call.signal)
        if (actual.targetDigest !== expected) throw browserError('target_changed', 'Browser target changed; request authorization again')
      }
      const stop = () => { void this.driver.close(id).catch(() => {}) }
      call.signal.addEventListener('abort', stop, { once: true })
      try {
        const result = await this.driver.execute(
          { ...session, executionId: call.executionId }, action, args, call.signal, call.scopeRoots
        )
        call.signal.throwIfAborted()
        return result
      } catch (error) {
        await this.driver.close(id).catch(() => {})
        this.active.delete(id)
        this.untrack(id)
        this.transition(session, 'interrupted', call.executionId)
        throw error
      } finally {
        call.signal.removeEventListener('abort', stop)
      }
    })
  }

  async describeCurrent(
    action: BrowserAction,
    args: JsonObject,
    call: BrowserCallContext
  ): Promise<BrowserEffectEvidence> {
    const sessionId = await this.currentSessionId(call)
    return {
      ...(await this.describe(sessionId, action, args, call)),
      sessionId
    }
  }

  async resolveCurrentSessionId(call: BrowserCallContext): Promise<string> {
    return this.currentSessionId(call)
  }

  async executeCurrent(
    action: BrowserAction,
    args: JsonObject,
    call: BrowserCallContext
  ): Promise<JsonObject> {
    return this.execute(await this.currentSessionId(call), action, args, call)
  }

  async ensureCurrentSession(
    call: BrowserCallContext
  ): Promise<BrowserSession & { created: boolean }> {
    try {
      const id = await this.currentSessionId(call)
      const session = this.repository.get(id)
      if (!session) throw runtimeResourceStale()
      return { ...session, created: false }
    } catch (error) {
      if (!isRuntimeResourceStale(error) || !call.runId) throw error
      this.leases?.expireCurrent(call.runId, 'browser_session')
      return { ...(await this.createSession(call)), created: true }
    }
  }

  async closeCurrent(call: BrowserCallContext): Promise<string> {
    const sessionId = await this.currentSessionId(call)
    await this.closeSession(sessionId, call)
    return sessionId
  }

  recover(): void {
    this.runSessions.clear()
    this.sessionRuns.clear()
    this.leases?.interruptActiveOnStartup()
    for (const session of this.repository.list()) {
      if (session.status === 'active') this.transition(session, 'interrupted', 'recovery')
    }
  }

  async shutdown(): Promise<void> {
    for (const id of [...this.active]) {
      await this.serial(id, async () => {
        const session = this.repository.get(id)
        await this.driver.close(id)
        this.active.delete(id)
        this.untrack(id)
        if (session?.status === 'active') this.transition(session, 'interrupted', 'shutdown')
      })
    }
  }

  async closeRunSessions(runId: string): Promise<void> {
    if (this.leases) {
      await this.leases.releaseRun(runId, async (lease) => {
        const id = lease.resourceId
        await this.serial(id, async () => {
          const session = this.repository.get(id)
          if (!session || session.status !== 'active') {
            this.active.delete(id)
            this.untrack(id)
            return
          }
          await this.driver.close(id)
          this.active.delete(id)
          this.untrack(id)
          this.transition(session, 'closed', `run-terminal:${runId}`)
        })
      })
      return
    }
    const ids = [...(this.runSessions.get(runId) ?? [])]
    const failures: unknown[] = []
    for (const id of ids) {
      try {
        await this.serial(id, async () => {
          const session = this.repository.get(id)
          if (!session || session.status !== 'active') {
            this.active.delete(id)
            this.untrack(id)
            return
          }
          await this.driver.close(id)
          this.active.delete(id)
          this.untrack(id)
          this.transition(session, 'closed', `run-terminal:${runId}`)
        })
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        'One or more Agent browser sessions could not be closed'
      )
    }
  }

  private async open(profileId: string, call: BrowserCallContext): Promise<BrowserSession> {
    call.signal.throwIfAborted()
    const now = Date.now()
    const session: BrowserSession = {
      id: `browser-${randomUUID()}`, profileId, ownerKey: call.ownerKey,
      status: 'active', revision: 1, createdAt: now, updatedAt: now,
      executionId: call.executionId
    }
    try {
      await this.driver.open(session, call.signal)
      call.signal.throwIfAborted()
      this.repository.insert(session)
      this.active.add(session.id)
      if (call.runId) this.track(session.id, call.runId)
      if (call.runId && this.leases) {
        this.leases.acquire({
          resourceType: 'browser_session',
          resourceId: session.id,
          ...(call.conversationId
            ? { conversationId: call.conversationId }
            : {}),
          ...(call.ownerScopeDigest
            ? { ownerScopeDigest: call.ownerScopeDigest }
            : {}),
          ownerRunId: call.runId,
          authorityDigest: requireAuthorityDigest(call)
        })
      }
      return { ...session }
    } catch (error) {
      await this.driver.close(session.id).catch(() => {})
      throw error
    }
  }

  private owned(id: string, call: BrowserCallContext): BrowserSession {
    const session = this.repository.get(id)
    if (!session || session.ownerKey !== call.ownerKey) {
      throw browserError('owner', 'Browser session owner does not match')
    }
    const ownerRunId = this.sessionRuns.get(id)
    if (ownerRunId && call.runId !== ownerRunId) {
      throw runtimeResourceStale()
    }
    return session
  }

  private async currentSessionId(call: BrowserCallContext): Promise<string> {
    if (!call.runId) throw runtimeResourceStale()
    if (this.leases) {
      const lease = await this.leases.resolveCurrent({
        resourceType: 'browser_session',
        ownerRunId: call.runId,
        authorityDigest: requireAuthorityDigest(call),
        isResourceActive: (id) => this.active.has(id)
      })
      return lease.resourceId
    }
    const sessionId = [...(this.runSessions.get(call.runId) ?? [])].find(
      (id) => this.active.has(id)
    )
    if (!sessionId) throw runtimeResourceStale()
    return sessionId
  }

  private transition(session: BrowserSession, status: BrowserSession['status'], executionId: string): void {
    this.repository.update({
      ...session, status, revision: session.revision + 1, updatedAt: Date.now(), executionId
    }, session.revision)
  }

  private track(sessionId: string, runId: string): void {
    this.untrack(sessionId)
    const sessions = this.runSessions.get(runId) ?? new Set<string>()
    sessions.add(sessionId)
    this.runSessions.set(runId, sessions)
    this.sessionRuns.set(sessionId, runId)
  }

  private untrack(sessionId: string): void {
    const runId = this.sessionRuns.get(sessionId)
    if (!runId) return
    const sessions = this.runSessions.get(runId)
    sessions?.delete(sessionId)
    if (sessions?.size === 0) this.runSessions.delete(runId)
    this.sessionRuns.delete(sessionId)
  }

  private async serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(operation)
    this.queues.set(key, current)
    try {
      return await current
    } finally {
      if (this.queues.get(key) === current) this.queues.delete(key)
    }
  }
}

export function browserError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: `browser_${code}` })
}

function requireAuthorityDigest(call: BrowserCallContext): string {
  if (!call.authorityDigest) throw runtimeResourceStale()
  return call.authorityDigest
}

function runtimeResourceStale(): Error & {
  code: 'runtime_resource_stale'
  retryable: true
} {
  return Object.assign(
    new Error('Runtime resource is stale for the current run'),
    { code: 'runtime_resource_stale' as const, retryable: true as const }
  )
}

function isRuntimeResourceStale(
  error: unknown
): error is Error & { code: 'runtime_resource_stale' } {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'runtime_resource_stale'
  )
}
