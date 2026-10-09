import {
  compareStableVersions,
  createUpdateCheckRecord,
  isSupportLinkTarget,
  parseStableVersion,
  type SupportLinkTarget,
  type UpdateCheckErrorCode,
  type UpdateCheckRecord
} from '../../../../domain/app-support'
import type {
  OutboundCallErrorCode,
  OutboundCallRecord,
  StartOutboundCallInput
} from '../../../../domain/outbound-call'
import type { UnitOfWork } from '../ports/business-repositories'

const UPDATE_ENDPOINT =
  'https://api.github.com/repos/Qbian61/realmflow/releases/latest'
const UPDATE_TIMEOUT_MS = 10_000
const UPDATE_RESPONSE_LIMIT = 64 * 1024
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

const SUPPORT_LINK_URLS: Record<SupportLinkTarget, string> = {
  website: 'https://realmflow.dev',
  online_help: 'https://github.com/Qbian61/realmflow#readme',
  feedback: 'https://github.com/Qbian61/realmflow/issues/new',
  releases: 'https://github.com/Qbian61/realmflow/releases/latest'
}

type AppSupportNetwork = {
  requestPublicJson(input: {
    url: string
    timeoutMs: number
    maxResponseBytes: number
  }): Promise<unknown>
}

type AppSupportAudit = {
  start(
    input: Omit<StartOutboundCallInput, 'id' | 'startedAt'>
  ): Promise<OutboundCallRecord>
  finish(
    id: string,
    input: {
      status: 'succeeded' | 'failed'
      retryCount: number
      errorCode?: OutboundCallErrorCode
    }
  ): Promise<OutboundCallRecord>
}

export type AppSupportStore = {
  getByRequestId(
    requestId: string
  ): Promise<UpdateCheckRecord | undefined>
  getLatest(): Promise<UpdateCheckRecord | undefined>
  save(record: UpdateCheckRecord): Promise<'saved' | 'unchanged'>
}

type AppSupportServiceDependencies = {
  currentVersion: () => string
  network: AppSupportNetwork
  audit: AppSupportAudit
  store: AppSupportStore
  unitOfWork: UnitOfWork
  openExternal: (url: string) => Promise<unknown>
  now?: () => number
}

export type AppSupportInfo = {
  currentVersion: string
  lastCheck?: UpdateCheckRecord
}

export type SupportLinkErrorCode =
  | 'audit_unavailable'
  | 'target_unavailable'

export type SupportLinkResult = {
  requestId: string
  target: SupportLinkTarget
  status: 'opened' | 'failed'
  errorCode?: SupportLinkErrorCode
}

export class AppSupportError extends Error {
  constructor(readonly code: 'storage_unavailable') {
    super(code)
  }
}

export class AppSupportService {
  private readonly now: () => number
  private readonly updateRequests =
    new Map<string, Promise<UpdateCheckRecord>>()
  private readonly linkRequests =
    new Map<string, Promise<SupportLinkResult>>()
  private readonly completedLinkRequests =
    new Map<string, SupportLinkResult>()

  constructor(private readonly dependencies: AppSupportServiceDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async getInfo(): Promise<AppSupportInfo> {
    const currentVersion = normalizeVersion(this.dependencies.currentVersion())
    const lastCheck = await this.dependencies.store.getLatest()
    return {
      currentVersion,
      ...(lastCheck ? { lastCheck } : {})
    }
  }

  checkForUpdates(input: { requestId: string }): Promise<UpdateCheckRecord> {
    requireRequestId(input.requestId)
    const inFlight = this.updateRequests.get(input.requestId)
    if (inFlight) return inFlight
    const request = this.performUpdateCheck(input.requestId).finally(() => {
      if (this.updateRequests.get(input.requestId) === request) {
        this.updateRequests.delete(input.requestId)
      }
    })
    this.updateRequests.set(input.requestId, request)
    return request
  }

  openSupportLink(input: {
    requestId: string
    target: SupportLinkTarget
  }): Promise<SupportLinkResult> {
    requireRequestId(input.requestId)
    if (!isSupportLinkTarget(input.target)) {
      throw new Error('Support link target is invalid')
    }
    const completed = this.completedLinkRequests.get(input.requestId)
    if (completed) {
      requireSameLinkTarget(completed, input.target)
      return Promise.resolve(completed)
    }
    const inFlight = this.linkRequests.get(input.requestId)
    if (inFlight) return inFlight
    const request = this.performOpenLink(input).then((result) => {
      this.completedLinkRequests.set(input.requestId, result)
      return result
    }).finally(() => {
      if (this.linkRequests.get(input.requestId) === request) {
        this.linkRequests.delete(input.requestId)
      }
    })
    this.linkRequests.set(input.requestId, request)
    return request
  }

  private async performUpdateCheck(
    requestId: string
  ): Promise<UpdateCheckRecord> {
    const existing = await this.dependencies.store.getByRequestId(requestId)
    if (existing) return existing
    const currentVersion = normalizeVersion(this.dependencies.currentVersion())
    let audit: OutboundCallRecord
    try {
      audit = await this.dependencies.audit.start({
        idempotencyKey: `app-update:${requestId}`,
        callType: 'app_update',
        target: { type: 'update_service', id: 'github-releases' },
        owner: { type: 'application', id: 'realmflow' }
      })
    } catch {
      return failedUpdate(
        requestId,
        currentVersion,
        'audit_unavailable',
        this.now()
      )
    }
    if (audit.status !== 'started') {
      const replay = failedUpdate(
        requestId,
        currentVersion,
        'service_unavailable',
        this.now()
      )
      await this.commitReplayedUpdate(replay)
      return replay
    }

    let record: UpdateCheckRecord
    let terminal: {
      status: 'succeeded' | 'failed'
      retryCount: number
      errorCode?: OutboundCallErrorCode
    }
    try {
      const response = await this.dependencies.network.requestPublicJson({
        url: UPDATE_ENDPOINT,
        timeoutMs: UPDATE_TIMEOUT_MS,
        maxResponseBytes: UPDATE_RESPONSE_LIMIT
      })
      const latestVersion = requireLatestVersion(response)
      const status =
        compareStableVersions(latestVersion, currentVersion) > 0
          ? 'update_available'
          : 'up_to_date'
      record = createUpdateCheckRecord({
        requestId,
        currentVersion,
        latestVersion,
        status,
        checkedAt: this.now()
      })
      terminal = { status: 'succeeded', retryCount: 0 }
    } catch (error) {
      const errorCode = updateErrorCode(error)
      record = failedUpdate(
        requestId,
        currentVersion,
        errorCode,
        this.now()
      )
      terminal = {
        status: 'failed',
        retryCount: 0,
        errorCode: outboundErrorCode(error)
      }
    }

    try {
      await this.dependencies.unitOfWork.execute(async () => {
        const completed = await this.dependencies.audit.finish(
          audit.id,
          terminal
        )
        if (completed.status !== terminal.status) {
          throw new Error('Outbound audit terminal status changed')
        }
        await this.dependencies.store.save(record)
      })
    } catch {
      throw new AppSupportError('storage_unavailable')
    }
    return record
  }

  private async commitReplayedUpdate(
    record: UpdateCheckRecord
  ): Promise<void> {
    try {
      await this.dependencies.unitOfWork.execute(() =>
        this.dependencies.store.save(record)
      )
    } catch {
      throw new AppSupportError('storage_unavailable')
    }
  }

  private async performOpenLink(input: {
    requestId: string
    target: SupportLinkTarget
  }): Promise<SupportLinkResult> {
    let audit: OutboundCallRecord
    try {
      audit = await this.dependencies.audit.start({
        idempotencyKey: `online-help:${input.requestId}`,
        callType: 'online_help',
        target: { type: 'help_service', id: input.target },
        owner: { type: 'application', id: 'realmflow' }
      })
    } catch {
      return failedLink(input, 'audit_unavailable')
    }
    if (audit.status !== 'started') {
      return audit.status === 'succeeded'
        ? openedLink(input)
        : failedLink(input, 'target_unavailable')
    }

    try {
      await this.dependencies.openExternal(SUPPORT_LINK_URLS[input.target])
    } catch {
      try {
        await this.dependencies.audit.finish(audit.id, {
          status: 'failed',
          retryCount: 0,
          errorCode: 'target_unavailable'
        })
      } catch {
        return failedLink(input, 'audit_unavailable')
      }
      return failedLink(input, 'target_unavailable')
    }

    try {
      const completed = await this.dependencies.audit.finish(audit.id, {
        status: 'succeeded',
        retryCount: 0
      })
      return completed.status === 'succeeded'
        ? openedLink(input)
        : failedLink(input, 'target_unavailable')
    } catch {
      return failedLink(input, 'audit_unavailable')
    }
  }
}

function requireLatestVersion(response: unknown): string {
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    typeof (response as { tag_name?: unknown }).tag_name !== 'string'
  ) {
    throw new Error('Latest release response is invalid')
  }
  return normalizeVersion((response as { tag_name: string }).tag_name)
}

function normalizeVersion(value: string): string {
  return parseStableVersion(value).join('.')
}

function requireRequestId(value: string): void {
  if (!REQUEST_ID_PATTERN.test(value)) {
    throw new Error('App support request ID is invalid')
  }
}

function updateErrorCode(error: unknown): UpdateCheckErrorCode {
  const code = errorCodeOf(error)
  if (
    code === 'service_unavailable' ||
    code === 'request_timeout' ||
    code === 'service_rejected'
  ) {
    return code
  }
  return 'invalid_response'
}

function outboundErrorCode(error: unknown): OutboundCallErrorCode {
  const code = errorCodeOf(error)
  if (code === 'request_timeout') return 'request_timeout'
  if (code === 'service_rejected') return 'provider_rejected'
  if (code === 'response_too_large') return 'response_too_large'
  if (code === 'request_cancelled') return 'request_cancelled'
  if (code === 'service_unavailable') return 'target_unavailable'
  return 'protocol_error'
}

function errorCodeOf(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

function failedUpdate(
  requestId: string,
  currentVersion: string,
  errorCode: UpdateCheckErrorCode,
  checkedAt: number
): UpdateCheckRecord {
  return createUpdateCheckRecord({
    requestId,
    currentVersion,
    status: 'failed',
    errorCode,
    checkedAt
  })
}

function openedLink(input: {
  requestId: string
  target: SupportLinkTarget
}): SupportLinkResult {
  return { ...input, status: 'opened' }
}

function failedLink(
  input: { requestId: string; target: SupportLinkTarget },
  errorCode: SupportLinkErrorCode
): SupportLinkResult {
  return { ...input, status: 'failed', errorCode }
}

function requireSameLinkTarget(
  result: SupportLinkResult,
  target: SupportLinkTarget
): void {
  if (result.target !== target) {
    throw new Error('App support request ID is already in use')
  }
}
