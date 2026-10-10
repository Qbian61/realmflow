import { createHash } from 'node:crypto'
import type { UpdateCheckRecord } from '../../../../domain/app-support'
import {
  cloneJsonObject,
  type JsonObject
} from '../../../../domain/tool-protocol-validation'

type JsonValue = unknown

export class GatewayRuntimeService {
  constructor(private readonly dependencies: {
    health(): Promise<GatewayRuntimeHealth>
    configuration(): Promise<GatewaySafeConfiguration>
    checkForUpdates(input: { requestId: string }): Promise<UpdateCheckRecord>
    now?: () => number
  }) {}

  async execute(
    input: JsonObject,
    context: { runId: string; requestId: string }
  ): Promise<JsonObject> {
    const action = requireCommand(input)
    if (action === 'health') return this.health()
    if (action === 'config_get') {
      const configuration = await this.safeConfiguration()
      const path = requirePath(input.path)
      return {
        status: 'completed',
        path,
        value: cloneValue(readPointer(configuration, path)),
        configHash: digest(configuration)
      }
    }
    if (action === 'config_schema_lookup') {
      const path = requirePath(input.path)
      return {
        status: 'completed',
        path,
        schema: cloneValue(readSchemaPointer(path)),
        patchable: PATCHABLE_PATHS.has(path)
      }
    }
    if (action === 'config_patch_proposal') {
      const patches = normalizePatches(input.patches)
      const configuration = await this.safeConfiguration()
      const configHash = digest(configuration)
      const proposalInput = { context, patches, configHash }
      return {
        status: 'approval_required',
        action: 'config_patch',
        approvalSurface: 'settings',
        proposalId: `gateway-config-${digest(proposalInput).slice(0, 24)}`,
        configHash,
        patches,
        runId: context.runId,
        requestId: context.requestId,
        expiresAt: this.now() + PROPOSAL_TTL_MS
      }
    }
    if (action === 'restart_proposal') {
      const reason = requireReason(input.reason)
      return {
        status: 'approval_required',
        action: 'restart',
        approvalSurface: 'application',
        proposalId: `gateway-restart-${digest({ context, reason }).slice(0, 24)}`,
        reason,
        runId: context.runId,
        requestId: context.requestId,
        expiresAt: this.now() + PROPOSAL_TTL_MS
      }
    }
    const update = await this.dependencies.checkForUpdates({
      requestId: `gateway-update-${context.requestId}`
    })
    return {
      status: update.status,
      currentVersion: update.currentVersion,
      checkedAt: update.checkedAt,
      ...(update.latestVersion ? { latestVersion: update.latestVersion } : {}),
      ...(update.errorCode ? { errorCode: update.errorCode } : {})
    }
  }

  private now(): number {
    return (this.dependencies.now ?? Date.now)()
  }

  private async health(): Promise<JsonObject> {
    const health = await this.dependencies.health()
    const components = {
      sidecar: health.sidecar,
      builtin: health.adapters.builtin,
      sandbox: health.adapters.sandbox,
      mcp: health.adapters.mcp,
      computer: health.adapters.computer,
      connector: health.adapters.connector
    }
    const statuses = Object.values(components)
    return {
      status: statuses.every((status) => status === 'ready')
        ? 'ready'
        : statuses.every((status) => status === 'unavailable')
          ? 'unavailable'
          : 'degraded',
      components
    }
  }

  private async safeConfiguration(): Promise<GatewaySafeConfiguration> {
    const configuration = await this.dependencies.configuration()
    return cloneJsonObject(
      configuration as unknown as JsonObject,
      'Gateway safe configuration'
    ) as unknown as GatewaySafeConfiguration
  }
}

type GatewayComponentStatus = 'ready' | 'degraded' | 'unavailable'

export type GatewayRuntimeHealth = {
  sidecar: GatewayComponentStatus
  adapters: {
    builtin: GatewayComponentStatus
    sandbox: GatewayComponentStatus
    mcp: GatewayComponentStatus
    computer: GatewayComponentStatus
    connector: GatewayComponentStatus
  }
}

export type GatewaySafeConfiguration = {
  application: {
    version: string
    schemaVersion: number
  }
  workspace: {
    configured: boolean
    count: number
  }
  web: {
    searchProvider: 'disabled' | 'searxng' | 'brave'
    browserContinuation: boolean
    endpointConfigured: boolean
    credentialConfigured: boolean
  }
}

type GatewayAction =
  | 'health'
  | 'config_schema_lookup'
  | 'config_get'
  | 'config_patch_proposal'
  | 'restart_proposal'
  | 'update_check'

const PROPOSAL_TTL_MS = 15 * 60 * 1000
const ACTIONS = new Set<GatewayAction>([
  'health',
  'config_schema_lookup',
  'config_get',
  'config_patch_proposal',
  'restart_proposal',
  'update_check'
])
const ACTION_KEYS: Record<GatewayAction, ReadonlySet<string>> = {
  health: new Set(['action']),
  config_schema_lookup: new Set(['action', 'path']),
  config_get: new Set(['action', 'path']),
  config_patch_proposal: new Set(['action', 'patches']),
  restart_proposal: new Set(['action', 'reason']),
  update_check: new Set(['action'])
}
const SAFE_PATHS = new Set([
  '',
  '/application',
  '/application/version',
  '/application/schemaVersion',
  '/workspace',
  '/workspace/configured',
  '/workspace/count',
  '/web',
  '/web/searchProvider',
  '/web/browserContinuation',
  '/web/endpointConfigured',
  '/web/credentialConfigured'
])
const PATCHABLE_PATHS = new Set([
  '/web/searchProvider',
  '/web/browserContinuation'
])

export const GATEWAY_CONFIGURATION_SCHEMA: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['application', 'workspace', 'web'],
  properties: {
    application: {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'schemaVersion'],
      properties: {
        version: { type: 'string' },
        schemaVersion: { type: 'integer', minimum: 1 }
      }
    },
    workspace: {
      type: 'object',
      additionalProperties: false,
      required: ['configured', 'count'],
      properties: {
        configured: { type: 'boolean' },
        count: { type: 'integer', minimum: 0 }
      }
    },
    web: {
      type: 'object',
      additionalProperties: false,
      required: [
        'searchProvider',
        'browserContinuation',
        'endpointConfigured',
        'credentialConfigured'
      ],
      properties: {
        searchProvider: {
          type: 'string',
          enum: ['disabled', 'searxng', 'brave']
        },
        browserContinuation: { type: 'boolean' },
        endpointConfigured: { type: 'boolean' },
        credentialConfigured: { type: 'boolean' }
      }
    }
  }
}

function requireCommand(input: JsonObject): GatewayAction {
  const action = input.action
  if (typeof action !== 'string' || !ACTIONS.has(action as GatewayAction)) {
    throw new Error('gateway_command_invalid')
  }
  const normalized = action as GatewayAction
  if (
    Object.keys(input).some((key) => !ACTION_KEYS[normalized].has(key)) ||
    Object.keys(input).some((key) => input[key] === undefined)
  ) {
    throw new Error('gateway_command_invalid')
  }
  return normalized
}

function requirePath(value: JsonValue | undefined): string {
  if (typeof value !== 'string' || !SAFE_PATHS.has(value)) {
    throw new Error('gateway_path_denied')
  }
  return value
}

function readPointer(value: JsonObject, path: string): JsonValue {
  if (!SAFE_PATHS.has(path)) throw new Error('gateway_path_denied')
  let current: JsonValue = value
  for (const segment of path.split('/').slice(1)) {
    if (
      !current ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.hasOwn(current, segment)
    ) {
      throw new Error('gateway_path_denied')
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function readSchemaPointer(path: string): JsonValue {
  if (!SAFE_PATHS.has(path)) throw new Error('gateway_path_denied')
  let current: JsonValue = GATEWAY_CONFIGURATION_SCHEMA
  for (const segment of path.split('/').slice(1)) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error('gateway_path_denied')
    }
    const properties = (current as Record<string, unknown>).properties
    if (
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties) ||
      !Object.hasOwn(properties, segment)
    ) {
      throw new Error('gateway_path_denied')
    }
    current = (properties as Record<string, unknown>)[segment]
  }
  return current
}

function normalizePatches(value: JsonValue | undefined): JsonObject[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error('gateway_patch_denied')
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('gateway_patch_denied')
    }
    if (
      Object.keys(candidate).length !== 3 ||
      !Object.hasOwn(candidate, 'op') ||
      !Object.hasOwn(candidate, 'path') ||
      !Object.hasOwn(candidate, 'value') ||
      !['add', 'replace', 'remove'].includes(String(candidate.op)) ||
      typeof candidate.path !== 'string' ||
      !PATCHABLE_PATHS.has(candidate.path)
    ) {
      throw new Error('gateway_patch_denied')
    }
    validatePatchValue(candidate.path, candidate.value)
    return {
      op: candidate.op as string,
      path: candidate.path,
      value: cloneValue(candidate.value)
    }
  })
}

function validatePatchValue(path: string, value: JsonValue): void {
  if (
    path === '/web/searchProvider' &&
    !['disabled', 'searxng', 'brave'].includes(String(value))
  ) {
    throw new Error('gateway_patch_denied')
  }
  if (path === '/web/browserContinuation' && typeof value !== 'boolean') {
    throw new Error('gateway_patch_denied')
  }
}

function requireReason(value: JsonValue | undefined): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  ) {
    throw new Error('gateway_command_invalid')
  }
  return value.trim()
}

function cloneValue(value: JsonValue): JsonValue {
  return structuredClone(value)
}

function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value, sortedJson))
    .digest('hex')
}

function sortedJson(_key: string, value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      )
    : value
}
