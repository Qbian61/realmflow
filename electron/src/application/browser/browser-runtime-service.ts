import { randomUUID } from 'node:crypto'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  BrowserAction, BrowserCallContext, BrowserDriver, BrowserSession,
  BrowserSessionRepository
} from './browser-runtime-port'

export class BrowserRuntimeService {
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly active = new Set<string>()
  private readonly runSessions = new Map<string, Set<string>>()
  private readonly sessionRuns = new Map<string, string>()

  constructor(
    private readonly repository: BrowserSessionRepository,
    private readonly driver: BrowserDriver
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

  async execute(id: string, action: BrowserAction, args: JsonObject, call: BrowserCallContext): Promise<JsonObject> {
    return this.serial(id, async () => {
      call.signal.throwIfAborted()
      const session = this.owned(id, call)
      if (session.status !== 'active' || !this.active.has(id)) {
        throw browserError('session_inactive', 'Browser session is not active; attach its profile to resume')
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

  recover(): void {
    this.runSessions.clear()
    this.sessionRuns.clear()
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
    return session
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
