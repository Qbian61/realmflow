export type OutboundCallType =
  | 'model_completion'
  | 'model_availability'
  | 'connector'
  | 'online_document'
  | 'remote_repository'
  | 'app_update'
  | 'online_help'
  | 'mcp'

export type OutboundCallTargetType =
  | 'model_provider'
  | 'connector'
  | 'document_service'
  | 'repository_host'
  | 'update_service'
  | 'help_service'
  | 'mcp_server'

export type OutboundCallOwnerType =
  | 'ai_run'
  | 'model_profile'
  | 'workspace'
  | 'requirement'
  | 'node_run'
  | 'conversation'
  | 'connector'
  | 'knowledge_source'
  | 'application'

export type OutboundCallStatus =
  | 'started'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type OutboundCallErrorCode =
  | 'provider_rejected'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'authentication_error'
  | 'target_unavailable'
  | 'request_timeout'
  | 'request_cancelled'
  | 'protocol_error'
  | 'response_too_large'
  | 'audit_unavailable'
  | 'interrupted'

export type OutboundCallAttribution = {
  providerId?: string
  modelProfileId?: string
  workspaceId?: string
  requirementId?: string
  nodeId?: string
  nodeRunId?: string
  conversationId?: string
  aiRunId?: string
}

export type OutboundCallRecord = OutboundCallAttribution & {
  id: string
  idempotencyKey: string
  callType: OutboundCallType
  target: { type: OutboundCallTargetType; id: string }
  owner: { type: OutboundCallOwnerType; id: string }
  status: OutboundCallStatus
  startedAt: number
  completedAt?: number
  durationMs?: number
  retryCount: number
  errorCode?: OutboundCallErrorCode
  errorSummary?: string
}

export type StartOutboundCallInput = Omit<
  OutboundCallRecord,
  | 'status'
  | 'completedAt'
  | 'durationMs'
  | 'retryCount'
  | 'errorCode'
  | 'errorSummary'
>

export type CompleteOutboundCallInput = {
  status: Exclude<OutboundCallStatus, 'started'>
  completedAt: number
  retryCount: number
  errorCode?: OutboundCallErrorCode
}

export type OutboundCallQuery = Partial<OutboundCallAttribution> & {
  callType?: OutboundCallType
  status?: OutboundCallStatus
  ownerType?: OutboundCallOwnerType
  ownerId?: string
  from?: number
  to?: number
  limit?: number
}

const ERROR_SUMMARIES: Record<OutboundCallErrorCode, string> = {
  provider_rejected: 'Target service rejected the request',
  provider_unavailable: 'Target service is temporarily unavailable',
  provider_timeout: 'Target service response timed out',
  authentication_error: 'Target service authentication failed',
  target_unavailable: 'Target service is temporarily unavailable',
  request_timeout: 'Target service response timed out',
  request_cancelled: 'Request was cancelled',
  protocol_error: 'Target service returned an invalid response',
  response_too_large: 'Target response exceeded the size limit',
  audit_unavailable: 'Outbound call audit is temporarily unavailable',
  interrupted: 'Call ended because the application was interrupted'
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

export function createOutboundCallRecord(
  input: StartOutboundCallInput
): OutboundCallRecord {
  requireIdentifier(input.id, 'ID')
  requireIdentifier(input.idempotencyKey, 'idempotency key')
  requireIdentifier(input.target.id, 'target ID')
  requireIdentifier(input.owner.id, 'owner ID')
  for (const [name, value] of Object.entries(attributionOf(input))) {
    if (value !== undefined) requireIdentifier(value, name)
  }
  requireTimestamp(input.startedAt, 'start time')
  return {
    ...input,
    status: 'started',
    retryCount: 0
  }
}

export function completeOutboundCallRecord(
  record: OutboundCallRecord,
  input: CompleteOutboundCallInput
): OutboundCallRecord {
  if (record.status !== 'started') {
    throw new Error('Outbound call is already terminal')
  }
  requireTimestamp(input.completedAt, 'completion time')
  if (input.completedAt < record.startedAt) {
    throw new Error('Outbound call completion time precedes its start')
  }
  if (!Number.isSafeInteger(input.retryCount) || input.retryCount < 0) {
    throw new Error('Outbound call retry count is invalid')
  }
  if (input.status === 'succeeded' && input.errorCode) {
    throw new Error('Successful outbound call cannot have an error')
  }
  const errorCode =
    input.errorCode ??
    (input.status === 'cancelled'
      ? 'request_cancelled'
      : input.status === 'interrupted'
        ? 'interrupted'
        : undefined)
  if (input.status === 'failed' && !errorCode) {
    throw new Error('Failed outbound call requires an error code')
  }
  return {
    ...record,
    status: input.status,
    completedAt: input.completedAt,
    durationMs: input.completedAt - record.startedAt,
    retryCount: input.retryCount,
    ...(errorCode
      ? {
          errorCode,
          errorSummary: outboundCallErrorSummary(errorCode)
        }
      : {})
  }
}

export function outboundCallErrorSummary(
  code: OutboundCallErrorCode
): string {
  return ERROR_SUMMARIES[code]
}

function attributionOf(
  input: OutboundCallAttribution
): OutboundCallAttribution {
  return {
    providerId: input.providerId,
    modelProfileId: input.modelProfileId,
    workspaceId: input.workspaceId,
    requirementId: input.requirementId,
    nodeId: input.nodeId,
    nodeRunId: input.nodeRunId,
    conversationId: input.conversationId,
    aiRunId: input.aiRunId
  }
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Outbound call ${name} is invalid`)
  }
}

function requireTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Outbound call ${name} is invalid`)
  }
}
