import { vi } from 'vitest'
import {
  completeOutboundCallRecord,
  createOutboundCallRecord,
  type OutboundCallRecord
} from '../../../../domain/outbound-call'
import {
  createUpdateCheckRecord,
  type SupportLinkTarget,
  type UpdateCheckRecord
} from '../../../../domain/app-support'
import type { UnitOfWork } from '../ports/business-repositories'
import { AppSupportService } from './app-support-service'

describe('AppSupportService', () => {
  it('returns the Main version and latest persisted result without networking', async () => {
    const harness = createHarness({
      latest: createUpdateCheckRecord({
        requestId: 'request-old',
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        status: 'up_to_date',
        checkedAt: 50
      })
    })

    await expect(harness.service.getInfo()).resolves.toEqual({
      currentVersion: '1.0.0',
      lastCheck: harness.records[0]
    })
    expect(harness.network.requestPublicJson).not.toHaveBeenCalled()
    expect(harness.audit.start).not.toHaveBeenCalled()
  })

  it.each([
    ['v1.1.0', 'update_available'],
    ['1.0.0', 'up_to_date'],
    ['0.9.0', 'up_to_date']
  ] as const)(
    'persists latest version %s as %s with its successful audit',
    async (tagName, status) => {
      const harness = createHarness()
      harness.network.requestPublicJson.mockResolvedValue({ tag_name: tagName })

      await expect(
        harness.service.checkForUpdates({ requestId: 'request-1' })
      ).resolves.toEqual({
        requestId: 'request-1',
        currentVersion: '1.0.0',
        latestVersion: tagName.replace(/^v/, ''),
        status,
        checkedAt: 100
      })
      expect(harness.events).toEqual([
        'audit:start',
        'transaction:begin',
        'audit:finish:succeeded',
        'store:save',
        'transaction:commit'
      ])
      expect(
        harness.audit.start.mock.invocationCallOrder[0]
      ).toBeLessThan(
        harness.network.requestPublicJson.mock.invocationCallOrder[0]
      )
      expect(
        harness.network.requestPublicJson.mock.invocationCallOrder[0]
      ).toBeLessThan(harness.unitOfWork.execute.mock.invocationCallOrder[0])
      expect(harness.audit.start).toHaveBeenCalledWith({
        idempotencyKey: 'app-update:request-1',
        callType: 'app_update',
        target: { type: 'update_service', id: 'github-releases' },
        owner: { type: 'application', id: 'realmflow' }
      })
      expect(harness.network.requestPublicJson).toHaveBeenCalledWith({
        url: 'https://api.github.com/repos/Qbian61/realmflow/releases/latest',
        timeoutMs: 10_000,
        maxResponseBytes: 64 * 1024
      })
    }
  )

  it.each([
    [{ tag_name: 'v1.2.3-beta.1' }, 'invalid_response', 'protocol_error'],
    [{ name: 'missing tag' }, 'invalid_response', 'protocol_error'],
    [
      Object.assign(new Error('private transport failure'), {
        code: 'service_unavailable'
      }),
      'service_unavailable',
      'target_unavailable'
    ],
    [
      Object.assign(new Error('private timeout'), { code: 'request_timeout' }),
      'request_timeout',
      'request_timeout'
    ],
    [
      Object.assign(new Error('private response'), {
        code: 'response_too_large'
      }),
      'invalid_response',
      'response_too_large'
    ]
  ] as const)(
    'persists a stable failure for %#',
    async (responseOrError, errorCode, auditErrorCode) => {
      const harness = createHarness()
      if (responseOrError instanceof Error) {
        harness.network.requestPublicJson.mockRejectedValue(responseOrError)
      } else {
        harness.network.requestPublicJson.mockResolvedValue(responseOrError)
      }

      await expect(
        harness.service.checkForUpdates({ requestId: 'request-failed' })
      ).resolves.toMatchObject({
        requestId: 'request-failed',
        status: 'failed',
        errorCode
      })
      expect(harness.audit.finish).toHaveBeenCalledWith('audit-1', {
        status: 'failed',
        retryCount: 0,
        errorCode: auditErrorCode
      })
      expect(JSON.stringify(harness.records)).not.toMatch(
        /private|github\.com|response body/
      )
    }
  )

  it('does not network when the started audit cannot be persisted', async () => {
    const harness = createHarness()
    harness.audit.start.mockRejectedValue(new Error('database failed'))

    await expect(
      harness.service.checkForUpdates({ requestId: 'request-1' })
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'audit_unavailable'
    })
    expect(harness.network.requestPublicJson).not.toHaveBeenCalled()
    expect(harness.store.save).not.toHaveBeenCalled()
  })

  it('does not publish a result when the atomic commit fails', async () => {
    const harness = createHarness()
    harness.network.requestPublicJson.mockResolvedValue({
      tag_name: 'v1.1.0'
    })
    harness.unitOfWork.execute.mockImplementation(async (operation) => {
      await operation()
      throw new Error('sqlite commit failed')
    })

    await expect(
      harness.service.checkForUpdates({ requestId: 'request-1' })
    ).rejects.toMatchObject({
      code: 'storage_unavailable',
      message: 'storage_unavailable'
    })
    expect(harness.audit.finish).toHaveBeenCalledOnce()
    expect(harness.store.save).toHaveBeenCalledOnce()
  })

  it('shares a concurrent update request and replays a persisted result', async () => {
    const harness = createHarness()
    const pending = deferred<unknown>()
    harness.network.requestPublicJson.mockReturnValue(pending.promise)

    const first = harness.service.checkForUpdates({ requestId: 'request-1' })
    const duplicate = harness.service.checkForUpdates({
      requestId: 'request-1'
    })
    pending.resolve({ tag_name: 'v1.1.0' })

    const [firstResult, duplicateResult] = await Promise.all([first, duplicate])
    expect(duplicateResult).toEqual(firstResult)
    expect(harness.network.requestPublicJson).toHaveBeenCalledOnce()
    expect(harness.audit.start).toHaveBeenCalledOnce()

    await expect(
      harness.service.checkForUpdates({ requestId: 'request-1' })
    ).resolves.toEqual(firstResult)
    expect(harness.network.requestPublicJson).toHaveBeenCalledOnce()
  })

  it('does not repeat networking for an interrupted audit replay', async () => {
    const harness = createHarness()
    harness.audit.start.mockResolvedValue(
      terminalAudit('interrupted', 'interrupted')
    )

    await expect(
      harness.service.checkForUpdates({ requestId: 'request-1' })
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'service_unavailable'
    })
    expect(harness.network.requestPublicJson).not.toHaveBeenCalled()
    expect(harness.audit.finish).not.toHaveBeenCalled()
    expect(harness.store.save).toHaveBeenCalledOnce()
  })

  it.each([
    ['website', 'https://realmflow.dev'],
    ['online_help', 'https://github.com/Qbian61/realmflow#readme'],
    ['feedback', 'https://github.com/Qbian61/realmflow/issues/new'],
    ['releases', 'https://github.com/Qbian61/realmflow/releases/latest']
  ] as const)(
    'opens only the fixed %s link and audits it',
    async (target, url) => {
      const harness = createHarness()

      await expect(
        harness.service.openSupportLink({
          target,
          requestId: `link-${target}`
        })
      ).resolves.toEqual({
        requestId: `link-${target}`,
        target,
        status: 'opened'
      })
      expect(harness.openExternal).toHaveBeenCalledWith(url)
      expect(harness.audit.start).toHaveBeenCalledWith({
        idempotencyKey: `online-help:link-${target}`,
        callType: 'online_help',
        target: { type: 'help_service', id: target },
        owner: { type: 'application', id: 'realmflow' }
      })
      expect(harness.audit.finish).toHaveBeenCalledWith('audit-1', {
        status: 'succeeded',
        retryCount: 0
      })
    }
  )

  it('coalesces link opens and never reopens a terminal replay', async () => {
    const harness = createHarness()
    const pending = deferred<void>()
    harness.openExternal.mockReturnValue(pending.promise)

    const first = harness.service.openSupportLink({
      target: 'website',
      requestId: 'link-1'
    })
    const duplicate = harness.service.openSupportLink({
      target: 'website',
      requestId: 'link-1'
    })
    pending.resolve()
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      {
        requestId: 'link-1',
        target: 'website',
        status: 'opened'
      },
      {
        requestId: 'link-1',
        target: 'website',
        status: 'opened'
      }
    ])
    expect(harness.openExternal).toHaveBeenCalledOnce()

    harness.audit.start.mockResolvedValue(terminalAudit('succeeded'))
    await harness.service.openSupportLink({
      target: 'website',
      requestId: 'link-1'
    })
    expect(harness.openExternal).toHaveBeenCalledOnce()
  })

  it('returns stable link failures for unavailable audit and browser', async () => {
    const auditFailure = createHarness()
    auditFailure.audit.start.mockRejectedValue(new Error('database failed'))
    await expect(
      auditFailure.service.openSupportLink({
        target: 'feedback',
        requestId: 'link-audit'
      })
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'audit_unavailable'
    })
    expect(auditFailure.openExternal).not.toHaveBeenCalled()

    const browserFailure = createHarness()
    browserFailure.openExternal.mockRejectedValue(
      new Error('browser path is private')
    )
    await expect(
      browserFailure.service.openSupportLink({
        target: 'feedback',
        requestId: 'link-browser'
      })
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'target_unavailable'
    })
    expect(browserFailure.audit.finish).toHaveBeenCalledWith('audit-1', {
      status: 'failed',
      retryCount: 0,
      errorCode: 'target_unavailable'
    })
  })

  it('rejects invalid commands before any side effect', async () => {
    const harness = createHarness()

    expect(() =>
      harness.service.checkForUpdates({ requestId: 'bad request' })
    ).toThrow('App support request ID is invalid')
    expect(() =>
      harness.service.openSupportLink({
        requestId: 'link-1',
        target: 'https://example.com' as SupportLinkTarget
      })
    ).toThrow('Support link target is invalid')
    expect(harness.audit.start).not.toHaveBeenCalled()
    expect(harness.network.requestPublicJson).not.toHaveBeenCalled()
    expect(harness.openExternal).not.toHaveBeenCalled()
  })
})

function createHarness(options: { latest?: UpdateCheckRecord } = {}) {
  const events: string[] = []
  const records = options.latest ? [options.latest] : []
  const store = {
    getByRequestId: vi.fn(async (requestId: string) =>
      records.find((record) => record.requestId === requestId)
    ),
    getLatest: vi.fn(async () => records.at(-1)),
    save: vi.fn(async (record: UpdateCheckRecord) => {
      events.push('store:save')
      const existing = records.find(
        (candidate) => candidate.requestId === record.requestId
      )
      if (existing) return 'unchanged' as const
      records.push(record)
      return 'saved' as const
    })
  }
  const audit = {
    start: vi.fn(async () => {
      events.push('audit:start')
      return startedAudit()
    }),
    finish: vi.fn(
      async (
        _id: string,
        input: {
          status: 'succeeded' | 'failed'
          errorCode?: string
          retryCount: number
        }
      ) => {
        events.push(`audit:finish:${input.status}`)
        return terminalAudit(input.status, input.errorCode)
      }
    )
  }
  const network = {
    requestPublicJson: vi.fn(async () => {
      events.push('network')
      return { tag_name: 'v1.0.0' } as unknown
    })
  }
  const unitOfWork = {
    execute: vi.fn(async <T>(operation: () => T | Promise<T>) => {
      events.push('transaction:begin')
      const result = await operation()
      events.push('transaction:commit')
      return result
    })
  }
  const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {})
  return {
    events,
    records,
    store,
    audit,
    network,
    unitOfWork,
    openExternal,
    service: new AppSupportService({
      currentVersion: () => '1.0.0',
      network,
      audit,
      store,
      unitOfWork: unitOfWork as unknown as UnitOfWork,
      openExternal,
      now: () => 100
    })
  }
}

function startedAudit(): OutboundCallRecord {
  return createOutboundCallRecord({
    id: 'audit-1',
    idempotencyKey: 'app-update:request-1',
    callType: 'app_update',
    target: { type: 'update_service', id: 'github-releases' },
    owner: { type: 'application', id: 'realmflow' },
    startedAt: 90
  })
}

function terminalAudit(
  status: 'succeeded' | 'failed' | 'interrupted',
  errorCode?: string
): OutboundCallRecord {
  return completeOutboundCallRecord(startedAudit(), {
    status,
    completedAt: 100,
    retryCount: 0,
    ...(errorCode
      ? {
          errorCode:
            errorCode as Parameters<
              typeof completeOutboundCallRecord
            >[1]['errorCode']
        }
      : {})
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
