import type { ToolCapability, ToolRisk } from './tool-definition'
import {
  requireDigest,
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireObject,
  requireText
} from './tool-protocol-validation'

export type ToolBusinessScope =
  | { kind: 'requirement'; requirementId: string }
  | { kind: 'workspace'; workspaceId: string }

export type ToolPermissionResource =
  | ToolBusinessScope
  | { kind: 'path'; canonicalPath: string; access: 'file' | 'directory' }
  | {
      kind: 'process'
      executableDigest: string
      executableDisplayName: string
      argsFingerprint: string
      workingDirectoryScope: ToolBusinessScope
    }
  | { kind: 'network'; service: string; connectorId?: string }
  | { kind: 'application'; bundleId: string; displayName: string }
  | { kind: 'clipboard' }

export type PermissionContext = {
  sessionId?: string
  requirementId?: string
  workspaceId?: string
}

export type BoundScopeAuthorization = {
  authorizationId: string
  source:
    | { kind: 'folder'; folderSessionId: string }
    | { kind: 'space'; workspaceId: string }
    | {
        kind: 'requirement'
        requirementId: string
        workspaceId: string
      }
  roots: Array<{
    canonicalPath: string
    access: 'read-write'
  }>
  bindingRevision: number
  status: 'active' | 'revoked'
  createdAt: number
  revokedAt?: number
}

export type PermissionRequest = {
  capability: ToolCapability
  resource: ToolPermissionResource
  context: PermissionContext
  risk: ToolRisk
}

export type PermissionMode =
  | 'session'
  | 'requirement'
  | 'space'
  | 'persistent'

export type PermissionGrant = {
  id: string
  grantKey: string
  capability: ToolCapability
  resource: ToolPermissionResource
  context: PermissionContext
  risk: ToolRisk
  mode: PermissionMode
  appSessionId?: string
  status: 'active' | 'revoked'
  revision: number
  createdAt: number
  updatedAt: number
  revokedAt?: number
}

export type PermissionDecision =
  | {
      outcome: 'authorized'
      grantId?: string
      mode: PermissionMode | 'once'
    }
  | { outcome: 'ask' }
  | { outcome: 'denied'; code: string; message: string }

const CAPABILITIES = new Set<ToolCapability>([
  'filesystem.read',
  'filesystem.write',
  'filesystem.delete',
  'process.discover',
  'process.execute',
  'process.manage',
  'repository.read',
  'repository.modify',
  'realmflow.read',
  'realmflow.write',
  'knowledge.read',
  'knowledge.write',
  'network.connect',
  'connector.use',
  'credential.use',
  'computer.observe',
  'computer.control',
  'clipboard.read',
  'clipboard.write'
])
const RISKS = new Set<ToolRisk>(['low', 'medium', 'high', 'critical'])
const PATH_ACCESS = new Set<ToolPermissionResource extends infer _T
  ? 'file' | 'directory'
  : never>(['file', 'directory'])
const WINDOWS_ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/
const RISK_RANK: Record<ToolRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

export function normalizePermissionRequest(
  value: unknown
): PermissionRequest {
  try {
    const request = requireObject(value, 'request')
    requireExactKeys(
      request,
      new Set(['capability', 'resource', 'context', 'risk']),
      'request'
    )
    const capability = requireEnum(
      request.capability,
      CAPABILITIES,
      'capability'
    )
    const resource = normalizeResource(request.resource)
    const context = normalizeContext(request.context)
    const risk = requireEnum(request.risk, RISKS, 'risk')
    assertCapabilityResource(capability, resource)
    assertResourceContext(resource, context)
    return { capability, resource, context, risk }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'is invalid'
    if (message.startsWith('Permission')) throw error
    throw new Error(`Permission ${message}`)
  }
}

export function createPermissionGrant(input: {
  id: string
  request: PermissionRequest
  mode: PermissionMode
  appSessionId: string
  at: number
}): PermissionGrant {
  const id = requirePermissionIdentifier(input.id, 'grant ID')
  const request = normalizePermissionRequest(input.request)
  requireTimestamp(input.at)
  requireModeContext(input.mode, request.context)
  if (input.mode === 'persistent' && request.risk === 'critical') {
    throw new Error('Permission critical risk cannot be persistent')
  }
  const appSessionId =
    input.mode === 'session'
      ? requirePermissionIdentifier(input.appSessionId, 'app session ID')
      : undefined
  const grantKey = [
    request.capability,
    permissionResourceKey(request.resource),
    request.risk,
    input.mode,
    modeContextKey(input.mode, request.context, appSessionId)
  ].join('|')
  return {
    id,
    grantKey,
    capability: request.capability,
    resource: cloneResource(request.resource),
    context: { ...request.context },
    risk: request.risk,
    mode: input.mode,
    ...(appSessionId ? { appSessionId } : {}),
    status: 'active',
    revision: 1,
    createdAt: input.at,
    updatedAt: input.at
  }
}

export function permissionResourceKey(
  resource: ToolPermissionResource
): string {
  switch (resource.kind) {
    case 'requirement':
      return `requirement:${resource.requirementId}`
    case 'workspace':
      return `workspace:${resource.workspaceId}`
    case 'path':
      return `path:${resource.access}:${resource.canonicalPath}`
    case 'process':
      return [
        'process',
        permissionResourceKey(resource.workingDirectoryScope),
        resource.executableDigest,
        resource.argsFingerprint
      ].join(':')
    case 'network':
      return `network:${resource.service}:${resource.connectorId ?? ''}`
    case 'application':
      return `application:${resource.bundleId}`
    case 'clipboard':
      return 'clipboard'
  }
}

export function grantCoversRequest(
  grant: PermissionGrant,
  request: PermissionRequest,
  appSessionId: string
): boolean {
  if (
    grant.status !== 'active' ||
    grant.capability !== request.capability ||
    RISK_RANK[grant.risk] < RISK_RANK[request.risk]
  ) {
    return false
  }
  if (
    grant.mode === 'session' &&
    (grant.appSessionId !== appSessionId ||
      grant.context.sessionId !== request.context.sessionId)
  ) {
    return false
  }
  if (
    grant.mode === 'requirement' &&
    grant.context.requirementId !== request.context.requirementId
  ) {
    return false
  }
  if (
    grant.mode === 'space' &&
    grant.context.workspaceId !== request.context.workspaceId
  ) {
    return false
  }
  if (grant.resource.kind === 'requirement') {
    return (
      request.context.requirementId === grant.resource.requirementId &&
      request.resource.kind !== 'workspace'
    )
  }
  if (grant.resource.kind === 'workspace') {
    return request.context.workspaceId === grant.resource.workspaceId
  }
  return (
    permissionResourceKey(grant.resource) ===
    permissionResourceKey(request.resource)
  )
}

export function selectCoveringGrant(
  request: PermissionRequest,
  grants: readonly PermissionGrant[],
  appSessionId: string
): PermissionGrant | undefined {
  return grants
    .filter((grant) => grantCoversRequest(grant, request, appSessionId))
    .sort(
      (left, right) =>
        resourceSpecificity(left.resource) -
          resourceSpecificity(right.resource) ||
        modeDuration(left.mode) - modeDuration(right.mode) ||
        RISK_RANK[left.risk] - RISK_RANK[right.risk] ||
        left.createdAt - right.createdAt ||
        left.id.localeCompare(right.id)
    )[0]
}

function normalizeResource(value: unknown): ToolPermissionResource {
  const resource = requireObject(value, 'resource')
  switch (resource.kind) {
    case 'requirement':
      requireExactKeys(
        resource,
        new Set(['kind', 'requirementId']),
        'requirement resource'
      )
      return {
        kind: 'requirement',
        requirementId: requirePermissionIdentifier(
          resource.requirementId,
          'requirement ID'
        )
      }
    case 'workspace':
      requireExactKeys(
        resource,
        new Set(['kind', 'workspaceId']),
        'workspace resource'
      )
      return {
        kind: 'workspace',
        workspaceId: requirePermissionIdentifier(
          resource.workspaceId,
          'workspace ID'
        )
      }
    case 'path':
      requireExactKeys(
        resource,
        new Set(['kind', 'canonicalPath', 'access']),
        'path resource'
      )
      return {
        kind: 'path',
        canonicalPath: requireAbsolutePath(resource.canonicalPath),
        access: requireEnum(resource.access, PATH_ACCESS, 'path access')
      }
    case 'process':
      requireExactKeys(
        resource,
        new Set([
          'kind',
          'executableDigest',
          'executableDisplayName',
          'argsFingerprint',
          'workingDirectoryScope'
        ]),
        'process resource'
      )
      return {
        kind: 'process',
        executableDigest: requirePermissionDigest(
          resource.executableDigest,
          'executable digest'
        ),
        executableDisplayName: requirePermissionText(
          resource.executableDisplayName,
          'executable display name'
        ),
        argsFingerprint: requirePermissionDigest(
          resource.argsFingerprint,
          'arguments fingerprint'
        ),
        workingDirectoryScope: normalizeBusinessScope(
          resource.workingDirectoryScope
        )
      }
    case 'network': {
      requireExactKeys(
        resource,
        new Set(['kind', 'service', 'connectorId']),
        'network resource',
        new Set(['connectorId'])
      )
      const connectorId =
        resource.connectorId === undefined
          ? undefined
          : requirePermissionIdentifier(
              resource.connectorId,
              'connector ID'
            )
      return {
        kind: 'network',
        service: requirePermissionText(resource.service, 'network service'),
        ...(connectorId ? { connectorId } : {})
      }
    }
    case 'application':
      requireExactKeys(
        resource,
        new Set(['kind', 'bundleId', 'displayName']),
        'application resource'
      )
      return {
        kind: 'application',
        bundleId: requirePermissionIdentifier(
          resource.bundleId,
          'application bundle ID'
        ),
        displayName: requirePermissionText(
          resource.displayName,
          'application display name'
        )
      }
    case 'clipboard':
      requireExactKeys(resource, new Set(['kind']), 'clipboard resource')
      return { kind: 'clipboard' }
    default:
      throw new Error('Permission resource kind is invalid')
  }
}

function normalizeBusinessScope(value: unknown): ToolBusinessScope {
  const scope = requireObject(value, 'business scope')
  if (scope.kind === 'requirement') {
    requireExactKeys(
      scope,
      new Set(['kind', 'requirementId']),
      'business scope'
    )
    return {
      kind: 'requirement',
      requirementId: requirePermissionIdentifier(
        scope.requirementId,
        'requirement ID'
      )
    }
  }
  if (scope.kind === 'workspace') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workspaceId']),
      'business scope'
    )
    return {
      kind: 'workspace',
      workspaceId: requirePermissionIdentifier(
        scope.workspaceId,
        'workspace ID'
      )
    }
  }
  throw new Error('Permission business scope is invalid')
}

function normalizeContext(value: unknown): PermissionContext {
  const context = requireObject(value, 'context')
  requireExactKeys(
    context,
    new Set(['sessionId', 'requirementId', 'workspaceId']),
    'context',
    new Set(['sessionId', 'requirementId', 'workspaceId'])
  )
  return {
    ...(context.sessionId === undefined
      ? {}
      : {
          sessionId: requirePermissionIdentifier(
            context.sessionId,
            'session ID'
          )
        }),
    ...(context.requirementId === undefined
      ? {}
      : {
          requirementId: requirePermissionIdentifier(
            context.requirementId,
            'requirement ID'
          )
        }),
    ...(context.workspaceId === undefined
      ? {}
      : {
          workspaceId: requirePermissionIdentifier(
            context.workspaceId,
            'workspace ID'
          )
        })
  }
}

function assertCapabilityResource(
  capability: ToolCapability,
  resource: ToolPermissionResource
): void {
  const supported =
    capability.startsWith('filesystem.')
      ? ['path', 'requirement', 'workspace'].includes(resource.kind)
      : capability.startsWith('process.')
        ? resource.kind === 'process'
        : capability.startsWith('repository.')
          ? ['path', 'requirement', 'workspace'].includes(resource.kind)
          : capability.startsWith('realmflow.') ||
              capability.startsWith('knowledge.')
            ? ['requirement', 'workspace'].includes(resource.kind)
            : capability === 'network.connect' ||
                capability === 'connector.use' ||
                capability === 'credential.use'
              ? resource.kind === 'network'
              : capability.startsWith('computer.')
                ? resource.kind === 'application'
                : capability.startsWith('clipboard.')
                  ? resource.kind === 'clipboard'
                  : false
  if (!supported) {
    throw new Error('Permission capability does not support this resource')
  }
}

function assertResourceContext(
  resource: ToolPermissionResource,
  context: PermissionContext
): void {
  const scope =
    resource.kind === 'process' ? resource.workingDirectoryScope : resource
  if (
    scope.kind === 'requirement' &&
    context.requirementId !== undefined &&
    context.requirementId !== scope.requirementId
  ) {
    throw new Error('Permission requirement context does not match resource')
  }
  if (
    scope.kind === 'workspace' &&
    context.workspaceId !== undefined &&
    context.workspaceId !== scope.workspaceId
  ) {
    throw new Error('Permission workspace context does not match resource')
  }
}

function requireModeContext(
  mode: PermissionMode,
  context: PermissionContext
): void {
  if (mode === 'session' && !context.sessionId) {
    throw new Error('Permission session mode requires a session context')
  }
  if (mode === 'requirement' && !context.requirementId) {
    throw new Error(
      'Permission requirement mode requires a requirement context'
    )
  }
  if (mode === 'space' && !context.workspaceId) {
    throw new Error('Permission space mode requires a workspace context')
  }
  if (
    mode !== 'session' &&
    mode !== 'requirement' &&
    mode !== 'space' &&
    mode !== 'persistent'
  ) {
    throw new Error('Permission mode is invalid')
  }
}

function modeContextKey(
  mode: PermissionMode,
  context: PermissionContext,
  appSessionId: string | undefined
): string {
  switch (mode) {
    case 'session':
      return `${appSessionId}:${context.sessionId}`
    case 'requirement':
      return context.requirementId!
    case 'space':
      return context.workspaceId!
    case 'persistent':
      return 'persistent'
  }
}

function resourceSpecificity(resource: ToolPermissionResource): number {
  if (resource.kind === 'requirement') return 1
  if (resource.kind === 'workspace') return 2
  return 0
}

function modeDuration(mode: PermissionMode): number {
  if (mode === 'session') return 0
  if (mode === 'requirement') return 1
  if (mode === 'space') return 2
  return 3
}

function cloneResource(
  resource: ToolPermissionResource
): ToolPermissionResource {
  if (resource.kind !== 'process') return { ...resource }
  return {
    ...resource,
    workingDirectoryScope: { ...resource.workingDirectoryScope }
  }
}

function requireAbsolutePath(value: unknown): string {
  const normalized = requirePermissionText(value, 'path')
  if (
    (!normalized.startsWith('/') &&
      !WINDOWS_ABSOLUTE_PATH.test(normalized)) ||
    normalized.includes('\0')
  ) {
    throw new Error('Permission path must be canonical and absolute')
  }
  return normalized
}

function requirePermissionIdentifier(value: unknown, field: string): string {
  try {
    return requireIdentifier(value, field)
  } catch {
    throw new Error(`Permission ${field} is invalid`)
  }
}

function requirePermissionDigest(value: unknown, field: string): string {
  try {
    return requireDigest(value, field)
  } catch {
    throw new Error(`Permission ${field} is invalid`)
  }
}

function requirePermissionText(value: unknown, field: string): string {
  try {
    return requireText(value, field)
  } catch {
    throw new Error(`Permission ${field} is invalid`)
  }
}

function requireTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Permission timestamp is invalid')
  }
}
