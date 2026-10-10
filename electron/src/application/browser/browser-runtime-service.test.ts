import { describe, expect, it, vi } from 'vitest'
import { BrowserRuntimeService } from './browser-runtime-service'
import type { BrowserDriver, BrowserSession, BrowserSessionRepository } from './browser-runtime-port'

function fixture() {
  const records = new Map<string, BrowserSession>()
  const repository: BrowserSessionRepository = {
    list: () => [...records.values()].map((r) => ({ ...r })),
    get: (id) => records.has(id) ? { ...records.get(id)! } : undefined,
    insert: (record) => { records.set(record.id, { ...record }) },
    update: (record, expectedRevision) => {
      if (records.get(record.id)?.revision !== expectedRevision) throw new Error('conflict')
      records.set(record.id, { ...record })
    }
  }
  const driver: BrowserDriver = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({ text: 'ready' })
  }
  const service = new BrowserRuntimeService(repository, driver)
  const call = {
    ownerKey: 'conversation:a:workspace:one',
    executionId: 'execution-1',
    scopeRoots: [] as string[],
    signal: new AbortController().signal
  }
  return { service, repository, driver, call }
}

describe('BrowserRuntimeService lifecycle', () => {
  it('creates a Main-owned profile and durable active session', async () => {
    const { service, repository, driver, call } = fixture()
    const session = await service.createSession(call)
    expect(session).toMatchObject({ ownerKey: call.ownerKey, status: 'active', revision: 1 })
    expect(session.profileId).toMatch(/^browser-/)
    expect(repository.get(session.id)).toEqual(session)
    expect(driver.open).toHaveBeenCalledWith(session, call.signal)
  })

  it('closes the allocated browser when persistence fails', async () => {
    const { service, repository, driver, call } = fixture()
    repository.insert = () => { throw new Error('disk full') }
    await expect(service.createSession(call)).rejects.toThrow('disk full')
    expect(driver.close).toHaveBeenCalledOnce()
    expect(repository.list()).toEqual([])
  })

  it('rejects another owner before reading the page or attaching the profile', async () => {
    const { service, driver, call } = fixture()
    const session = await service.createSession(call)
    const stranger = { ...call, ownerKey: 'conversation:b:workspace:one' }
    await expect(service.execute(session.id, 'snapshot', {}, stranger)).rejects.toThrow('owner')
    await expect(service.attachSession(session.profileId, stranger)).rejects.toThrow('owner')
    expect(driver.execute).not.toHaveBeenCalled()
    expect(driver.open).toHaveBeenCalledTimes(1)
  })

  it('rejects duplicate live profile attachment and permits attach after close', async () => {
    const { service, repository, call } = fixture()
    const first = await service.createSession(call)
    await expect(service.attachSession(first.profileId, call)).rejects.toThrow('active')
    await service.closeSession(first.id, call)
    const attached = await service.attachSession(first.profileId, call)
    expect(attached.id).not.toBe(first.id)
    expect(attached.profileId).toBe(first.profileId)
    expect(repository.get(first.id)?.status).toBe('closed')
    await expect(service.execute(first.id, 'snapshot', {}, call)).rejects.toThrow('active')
  })

  it('recovers active records as interrupted without reopening websites', async () => {
    const { service, repository, driver, call } = fixture()
    const session = await service.createSession(call)
    vi.mocked(driver.open).mockClear()
    const restarted = new BrowserRuntimeService(repository, driver)
    restarted.recover()
    expect(repository.get(session.id)?.status).toBe('interrupted')
    expect(driver.open).not.toHaveBeenCalled()
    await expect(restarted.execute(session.id, 'click', { ref: 'n1' }, call)).rejects.toThrow('active')
  })

  it('serializes commands and refuses queued work after close', async () => {
    const { service, driver, call } = fixture()
    const session = await service.createSession(call)
    let release!: () => void
    vi.mocked(driver.execute).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return { text: 'done' }
    })
    const first = service.execute(session.id, 'snapshot', {}, call)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const close = service.closeSession(session.id, call)
    const queued = service.execute(session.id, 'snapshot', {}, call)
    const rejected = expect(queued).rejects.toThrow('active')
    release()
    await first
    await close
    await rejected
    expect(driver.execute).toHaveBeenCalledTimes(1)
  })

  it('cancellation stops the browser and marks the session interrupted', async () => {
    const { service, repository, driver, call } = fixture()
    const session = await service.createSession(call)
    const abort = new AbortController()
    vi.mocked(driver.execute).mockImplementationOnce(async (_session, _action, _args, signal) => {
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      return {}
    })
    const work = service.execute(session.id, 'wait_for', { ref: 'n1' }, { ...call, signal: abort.signal })
    const rejected = expect(work).rejects.toThrow()
    await vi.waitFor(() => expect(driver.execute).toHaveBeenCalledOnce())
    abort.abort()
    await rejected
    expect(driver.close).toHaveBeenCalledWith(session.id)
    expect(repository.get(session.id)?.status).toBe('interrupted')
  })

  it('refuses an already cancelled create without allocating a browser', async () => {
    const { service, driver, call } = fixture()
    await expect(service.createSession({ ...call, signal: AbortSignal.abort() })).rejects.toThrow()
    expect(driver.open).not.toHaveBeenCalled()
  })

  it('does not leave a profile live when cancellation happens during open', async () => {
    const { service, repository, driver, call } = fixture()
    const abort = new AbortController()
    vi.mocked(driver.open).mockImplementationOnce(async () => { abort.abort() })
    await expect(service.createSession({ ...call, signal: abort.signal })).rejects.toThrow()
    expect(repository.list()).toEqual([])
    expect(driver.close).toHaveBeenCalledOnce()
  })

  it('keeps uncertain browser failures interrupted and refuses replay', async () => {
    const { service, repository, driver, call } = fixture()
    const session = await service.createSession(call)
    vi.mocked(driver.execute).mockRejectedValueOnce(new Error('CDP disconnected'))
    await expect(service.execute(session.id, 'click', { ref: 'n1' }, call)).rejects.toThrow('CDP disconnected')
    expect(repository.get(session.id)?.status).toBe('interrupted')
    await expect(service.execute(session.id, 'click', { ref: 'n1' }, call)).rejects.toThrow('active')
    expect(driver.execute).toHaveBeenCalledOnce()
  })

  it('shuts down all owned windows and keeps resumable profile metadata', async () => {
    const { service, repository, driver, call } = fixture()
    await service.createSession(call)
    await service.createSession(call)
    await service.shutdown()
    expect(repository.list().map((s) => s.status)).toEqual(['interrupted', 'interrupted'])
    expect(driver.close).toHaveBeenCalledTimes(2)
  })

  it('does not report a closed session when its transition fails', async () => {
    const { service, repository, driver, call } = fixture()
    const session = await service.createSession(call)
    repository.update = () => { throw new Error('disk failure') }
    await expect(service.closeSession(session.id, call)).rejects.toThrow('disk failure')
    expect(repository.get(session.id)?.status).toBe('active')
    await expect(service.execute(session.id, 'snapshot', {}, call)).rejects.toThrow('active')
    expect(driver.execute).not.toHaveBeenCalled()
  })

  it('attributes each operation to its current execution rather than session creation', async () => {
    const { service, driver, call } = fixture()
    const session = await service.createSession(call)
    await service.execute(session.id, 'screenshot', { path: 'capture.png' }, { ...call, executionId: 'capture-execution' })
    expect(driver.execute).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: 'capture-execution' }), 'screenshot',
      { path: 'capture.png' }, call.signal, call.scopeRoots
    )
  })

  it('closes only sessions owned by a terminal run and remains idempotent', async () => {
    const { service, repository, driver, call } = fixture()
    const first = await service.createSession({ ...call, runId: 'run-1' })
    const second = await service.createSession({
      ...call,
      executionId: 'execution-2',
      runId: 'run-2'
    })

    await (service as unknown as {
      closeRunSessions(runId: string): Promise<void>
    }).closeRunSessions('run-1')
    await (service as unknown as {
      closeRunSessions(runId: string): Promise<void>
    }).closeRunSessions('run-1')

    expect(repository.get(first.id)?.status).toBe('closed')
    expect(repository.get(second.id)?.status).toBe('active')
    expect(driver.close).toHaveBeenCalledTimes(1)
    expect(driver.close).toHaveBeenCalledWith(first.id)
  })
})
