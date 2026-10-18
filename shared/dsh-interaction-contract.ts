import type { ApprovalProfileId } from '../domain/approval-profile'
import {
  cloneJsonObject,
  normalizeStringArray,
  requireBoolean,
  requireDigest,
  requireEnum,
  requireExactKeys,
  requireInteger,
  requireObject,
  requireText,
  type JsonObject
} from '../domain/tool-protocol-validation'

export const DSH_INTERACTION_SCHEMA_VERSION = 1 as const

export const DSH_INTERACTION_KINDS = [
  'permission_approval',
  'ask_user',
  'elicitation',
  'choice',
  'confirmation',
  'credential_consent'
] as const

export type DshInteractionKind = (typeof DSH_INTERACTION_KINDS)[number]

export type DshPermissionApprovalDecision =
  | 'deny'
  | 'allow_once'
  | 'allow_session'
  | 'allow_requirement'
  | 'allow_space'
  | 'allow_always'

export type DshCredentialConsentDecision = 'deny' | 'allow_once'

export type DshInteractionBinding = {
  runtimeInstanceId: string
  sessionId: string
  runId: string
  requestId: string
  activityId: string
  capabilityId: string
  scopeDigest: string
  effectDigest: string
}

export type DshPermissionApprovalPayload = {
  title: string
  message: string
  approvalProfileId: ApprovalProfileId | 'manual'
  maxGrant: 'once' | 'session' | 'space' | 'persistent'
  options: DshPermissionApprovalDecision[]
}

export type DshAskUserPayload = {
  prompt: string
  required: boolean
}

export type DshElicitationPayload = {
  prompt: string
  schema: JsonObject
}

export type DshChoicePayload = {
  prompt: string
  options: Array<{ id: string; label: string }>
  multiSelect: boolean
}

export type DshConfirmationPayload = {
  prompt: string
  destructive: boolean
}

export type DshCredentialConsentPayload = {
  credentialRef: string
  providerLabel: string
  operation: string
  reason: string
}

type DshInteractionRequestOf<
  Kind extends DshInteractionKind,
  Payload
> = DshInteractionBinding & {
  schemaVersion: typeof DSH_INTERACTION_SCHEMA_VERSION
  kind: Kind
  expiresAt: number
  payload: Payload
}

export type DshInteractionRequest =
  | DshInteractionRequestOf<
      'permission_approval',
      DshPermissionApprovalPayload
    >
  | DshInteractionRequestOf<'ask_user', DshAskUserPayload>
  | DshInteractionRequestOf<'elicitation', DshElicitationPayload>
  | DshInteractionRequestOf<'choice', DshChoicePayload>
  | DshInteractionRequestOf<'confirmation', DshConfirmationPayload>
  | DshInteractionRequestOf<
      'credential_consent',
      DshCredentialConsentPayload
    >

export type DshInteractionStatus =
  | 'pending'
  | 'resolved'
  | 'expired'
  | 'cancelled'

export type DshInteractionResponse =
  | {
      kind: 'permission_approval'
      decision: DshPermissionApprovalDecision
    }
  | { kind: 'ask_user'; answer: string }
  | { kind: 'elicitation'; values: JsonObject }
  | { kind: 'choice'; selectedOptionIds: string[] }
  | { kind: 'confirmation'; accepted: boolean }
  | {
      kind: 'credential_consent'
      decision: DshCredentialConsentDecision
    }

export type DshInteractionRequestRecord = DshInteractionRequest & {
  status: DshInteractionStatus
  nonce: string
  requestedAt: number
  requestRevision: number
  resolvedAt?: number
  response?: DshInteractionResponse
  decisionDigest?: string
  decisionSignature?: string
}

export type DshInteractionResponseCommand = DshInteractionBinding & {
  expectedRevision: number
  nonce: string
  response: DshInteractionResponse
}

export type DshInteractionDecision = DshInteractionBinding & {
  schemaVersion: typeof DSH_INTERACTION_SCHEMA_VERSION
  kind: DshInteractionKind
  nonce: string
  response: DshInteractionResponse
  resolvedAt: number
  decisionDigest: string
  decisionSignature: string
}

const INTERACTION_KIND_SET = new Set<DshInteractionKind>(
  DSH_INTERACTION_KINDS
)
const APPROVAL_PROFILE_IDS = new Set<ApprovalProfileId | 'manual'>([
  'cautious',
  'protected',
  'trusted',
  'manual'
])
const GRANT_CEILINGS = new Set([
  'once',
  'session',
  'space',
  'persistent'
] as const)
const PERMISSION_APPROVAL_DECISIONS =
  new Set<DshPermissionApprovalDecision>([
    'deny',
    'allow_once',
    'allow_session',
    'allow_requirement',
    'allow_space',
    'allow_always'
  ])
const CREDENTIAL_CONSENT_DECISIONS =
  new Set<DshCredentialConsentDecision>(['deny', 'allow_once'])

export function normalizeDshInteractionRequest(
  value: unknown
): DshInteractionRequest {
  const request = requireObject(value, 'DSH interaction request')
  requireExactKeys(
    request,
    new Set([
      'schemaVersion',
      'kind',
      'runtimeInstanceId',
      'sessionId',
      'runId',
      'requestId',
      'activityId',
      'capabilityId',
      'scopeDigest',
      'effectDigest',
      'expiresAt',
      'payload'
    ]),
    'DSH interaction request'
  )
  requireInteger(
    request.schemaVersion,
    'DSH interaction schema version',
    DSH_INTERACTION_SCHEMA_VERSION,
    DSH_INTERACTION_SCHEMA_VERSION
  )
  const kind = requireEnum(
    request.kind,
    INTERACTION_KIND_SET,
    'DSH interaction kind'
  )
  return {
    schemaVersion: DSH_INTERACTION_SCHEMA_VERSION,
    kind,
    ...normalizeBinding(request),
    expiresAt: requireInteger(
      request.expiresAt,
      'DSH interaction expiration',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    payload: normalizePayload(kind, request.payload)
  } as DshInteractionRequest
}

export function normalizeDshInteractionResponseCommand(
  value: unknown
): DshInteractionResponseCommand {
  const command = requireObject(value, 'DSH interaction response')
  requireExactKeys(
    command,
    new Set([
      'runtimeInstanceId',
      'sessionId',
      'runId',
      'requestId',
      'activityId',
      'capabilityId',
      'scopeDigest',
      'effectDigest',
      'expectedRevision',
      'nonce',
      'response'
    ]),
    'DSH interaction response'
  )
  return {
    ...normalizeBinding(command),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'DSH interaction expected revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    nonce: requireText(command.nonce, 'DSH interaction nonce'),
    response: normalizeDshInteractionResponse(command.response)
  }
}

export function normalizeDshInteractionResponse(
  value: unknown,
  expectedKind?: DshInteractionKind
): DshInteractionResponse {
  const response = requireObject(value, 'DSH interaction decision')
  const kind = requireEnum(
    response.kind,
    INTERACTION_KIND_SET,
    'DSH interaction decision kind'
  )
  if (expectedKind !== undefined && kind !== expectedKind) {
    throw new Error('DSH interaction decision kind does not match request')
  }
  switch (kind) {
    case 'permission_approval':
      requireExactKeys(
        response,
        new Set(['kind', 'decision']),
        'DSH permission approval decision'
      )
      return {
        kind,
        decision: requireEnum(
          response.decision,
          PERMISSION_APPROVAL_DECISIONS,
          'DSH permission approval decision'
        )
      }
    case 'ask_user':
      requireExactKeys(
        response,
        new Set(['kind', 'answer']),
        'DSH ask-user response'
      )
      return {
        kind,
        answer: requireText(
          response.answer,
          'DSH ask-user answer',
          true
        )
      }
    case 'elicitation':
      requireExactKeys(
        response,
        new Set(['kind', 'values']),
        'DSH elicitation response'
      )
      return {
        kind,
        values: cloneJsonObject(response.values, 'DSH elicitation values')
      }
    case 'choice':
      requireExactKeys(
        response,
        new Set(['kind', 'selectedOptionIds']),
        'DSH choice response'
      )
      return {
        kind,
        selectedOptionIds: normalizeStringArray(
          response.selectedOptionIds,
          'DSH choice selected option IDs'
        )
      }
    case 'confirmation':
      requireExactKeys(
        response,
        new Set(['kind', 'accepted']),
        'DSH confirmation response'
      )
      return {
        kind,
        accepted: requireBoolean(
          response.accepted,
          'DSH confirmation accepted'
        )
      }
    case 'credential_consent':
      requireExactKeys(
        response,
        new Set(['kind', 'decision']),
        'DSH credential consent decision'
      )
      return {
        kind,
        decision: requireEnum(
          response.decision,
          CREDENTIAL_CONSENT_DECISIONS,
          'DSH credential consent decision'
        )
      }
  }
}

export function isDeniedDshInteractionResponse(
  response: DshInteractionResponse
): boolean {
  return (
    (response.kind === 'permission_approval' &&
      response.decision === 'deny') ||
    (response.kind === 'credential_consent' && response.decision === 'deny') ||
    (response.kind === 'confirmation' && !response.accepted)
  )
}

function normalizeBinding(
  value: Record<string, unknown>
): DshInteractionBinding {
  return {
    runtimeInstanceId: requireText(
      value.runtimeInstanceId,
      'DSH runtime instance ID'
    ),
    sessionId: requireText(value.sessionId, 'DSH session ID'),
    runId: requireText(value.runId, 'DSH run ID'),
    requestId: requireText(value.requestId, 'DSH interaction request ID'),
    activityId: requireText(value.activityId, 'DSH activity ID'),
    capabilityId: requireText(value.capabilityId, 'DSH capability ID'),
    scopeDigest: requireDigest(value.scopeDigest, 'DSH scope digest'),
    effectDigest: requireDigest(value.effectDigest, 'DSH effect digest')
  }
}

function normalizePayload(
  kind: DshInteractionKind,
  value: unknown
): DshInteractionRequest['payload'] {
  const payload = requireObject(value, `DSH ${kind} payload`)
  switch (kind) {
    case 'permission_approval':
      requireExactKeys(
        payload,
        new Set([
          'title',
          'message',
          'approvalProfileId',
          'maxGrant',
          'options'
        ]),
        'DSH permission approval payload'
      )
      return {
        title: requireText(payload.title, 'DSH permission title'),
        message: requireText(payload.message, 'DSH permission message'),
        approvalProfileId: requireEnum(
          payload.approvalProfileId,
          APPROVAL_PROFILE_IDS,
          'DSH permission approval profile'
        ),
        maxGrant: requireEnum(
          payload.maxGrant,
          GRANT_CEILINGS,
          'DSH permission grant ceiling'
        ),
        options: normalizePermissionOptions(payload.options)
      }
    case 'ask_user':
      requireExactKeys(
        payload,
        new Set(['prompt', 'required']),
        'DSH ask-user payload'
      )
      return {
        prompt: requireText(payload.prompt, 'DSH ask-user prompt'),
        required: requireBoolean(payload.required, 'DSH ask-user required')
      }
    case 'elicitation':
      requireExactKeys(
        payload,
        new Set(['prompt', 'schema']),
        'DSH elicitation payload'
      )
      return {
        prompt: requireText(payload.prompt, 'DSH elicitation prompt'),
        schema: cloneJsonObject(payload.schema, 'DSH elicitation schema')
      }
    case 'choice':
      requireExactKeys(
        payload,
        new Set(['prompt', 'options', 'multiSelect']),
        'DSH choice payload'
      )
      return {
        prompt: requireText(payload.prompt, 'DSH choice prompt'),
        options: normalizeChoiceOptions(payload.options),
        multiSelect: requireBoolean(
          payload.multiSelect,
          'DSH choice multi-select'
        )
      }
    case 'confirmation':
      requireExactKeys(
        payload,
        new Set(['prompt', 'destructive']),
        'DSH confirmation payload'
      )
      return {
        prompt: requireText(payload.prompt, 'DSH confirmation prompt'),
        destructive: requireBoolean(
          payload.destructive,
          'DSH confirmation destructive'
        )
      }
    case 'credential_consent':
      requireExactKeys(
        payload,
        new Set(['credentialRef', 'providerLabel', 'operation', 'reason']),
        'DSH credential consent payload'
      )
      return {
        credentialRef: requireText(
          payload.credentialRef,
          'DSH credential reference'
        ),
        providerLabel: requireText(
          payload.providerLabel,
          'DSH credential provider label'
        ),
        operation: requireText(
          payload.operation,
          'DSH credential operation'
        ),
        reason: requireText(payload.reason, 'DSH credential consent reason')
      }
  }
}

function normalizePermissionOptions(
  value: unknown
): DshPermissionApprovalDecision[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('DSH permission approval options are invalid')
  }
  return value.map((option) =>
    requireEnum(
      option,
      PERMISSION_APPROVAL_DECISIONS,
      'DSH permission approval option'
    )
  )
}

function normalizeChoiceOptions(
  value: unknown
): DshChoicePayload['options'] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('DSH choice options are invalid')
  }
  const seen = new Set<string>()
  return value.map((option, index) => {
    const item = requireObject(option, `DSH choice option ${index}`)
    requireExactKeys(
      item,
      new Set(['id', 'label']),
      `DSH choice option ${index}`
    )
    const id = requireText(item.id, `DSH choice option ${index} ID`)
    if (seen.has(id)) {
      throw new Error('DSH choice option IDs are duplicated')
    }
    seen.add(id)
    return {
      id,
      label: requireText(item.label, `DSH choice option ${index} label`)
    }
  })
}
