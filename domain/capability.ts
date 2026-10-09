import { createHash } from 'node:crypto'
import type {
  ToolCapability,
  ToolRisk
} from './tool-definition'
import {
  normalizeConnectorAction,
  type ConnectorAction
} from './connector-runtime'
import type { JsonObject } from './tool-protocol-validation'

export const CAPABILITY_KINDS = [
  'tool',
  'skill',
  'agent',
  'connector'
] as const

export const CAPABILITY_GOVERNANCE_METADATA_FIELDS = [
  'source',
  'version',
  'permissions',
  'dependencies',
  'testPlan'
] as const

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number]
export type ConnectorKind = 'mcp' | 'http' | 'database' | 'cli'
export type CapabilityLifecycleStatus =
  | 'draft'
  | 'validating'
  | 'awaiting_approval'
  | 'installed_disabled'
  | 'enabled'
  | 'superseded'
  | 'quarantined'

export type CapabilityScope =
  | { kind: 'global' }
  | { kind: 'work-root'; workRootId: string }
  | { kind: 'folder'; workRootId: string; canonicalPath: string }
  | { kind: 'workspace'; workspaceId: string }
  | {
      kind: 'requirement'
      workspaceId: string
      requirementId: string
    }

export type CapabilityPermissionDeclaration = {
  capabilities: ToolCapability[]
  maximumRisk: ToolRisk
  pathPrefixes: string[]
  networkTargets: string[]
}

export type CapabilityDependency = {
  kind: CapabilityKind
  capabilityId: string
  versionRange: string
  required: boolean
}

export type CapabilityRuntime =
  | { kind: 'tool'; definitionId: string }
  | {
      kind: 'skill'
      instructionsPath: string
      executable: boolean
    }
  | {
      kind: 'agent'
      promptPath: string
      modelCapabilities: string[]
      reasoningModes: Array<'off' | 'low' | 'medium' | 'high'>
      delegation: { allowed: boolean; maximumDepth: number }
    }
  | {
      kind: 'connector'
      connectorKind: ConnectorKind
      credentialRefs: string[]
      configurationSchema: JsonObject
      actions: ConnectorAction[]
    }

export type CapabilityDefinition = {
  schemaVersion: 1
  id: string
  kind: CapabilityKind
  version: string
  source: 'builtin' | 'local_upload' | 'manual' | 'generated' | 'mcp'
  manifestDigest: string
  definitionDigest: string
  name: string
  description: string
  runtime: CapabilityRuntime
  permissions: CapabilityPermissionDeclaration
  dependencies: CapabilityDependency[]
  compatibility: {
    realmflowVersionRange: string
    platforms: Array<'darwin' | 'win32' | 'linux'>
  }
  testPlan: Array<{ id: string; command: string }>
  publishedAt: number
}

export type CapabilityInstallation = {
  id: string
  capabilityId: string
  capabilityVersion: string
  capabilityDigest: string
  scope: CapabilityScope
  enabled: boolean
  permissionCeiling: CapabilityPermissionDeclaration
  status: CapabilityLifecycleStatus
  revision: number
  installedAt: number
  updatedAt: number
}

type CapabilityDefinitionDraft = Omit<
  CapabilityDefinition,
  'schemaVersion' | 'definitionDigest'
>

const KINDS = new Set<string>(CAPABILITY_KINDS)
const CONNECTOR_KINDS = new Set<ConnectorKind>([
  'mcp',
  'http',
  'database',
  'cli'
])
const RISK_RANK: Record<ToolRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}
const LIFECYCLE_TRANSITIONS: Record<
  CapabilityLifecycleStatus,
  ReadonlySet<CapabilityLifecycleStatus>
> = {
  draft: new Set(['validating', 'quarantined']),
  validating: new Set(['awaiting_approval', 'draft', 'quarantined']),
  awaiting_approval: new Set([
    'installed_disabled',
    'draft',
    'quarantined'
  ]),
  installed_disabled: new Set(['enabled', 'superseded', 'quarantined']),
  enabled: new Set(['installed_disabled', 'superseded', 'quarantined']),
  superseded: new Set(),
  quarantined: new Set()
}

export function createCapabilityDefinition(
  draft: CapabilityDefinitionDraft
): CapabilityDefinition {
  if (!KINDS.has(draft.kind)) {
    throw new Error('Capability kind is invalid')
  }
  assertIdentifier(draft.id, 'ID')
  assertSemver(draft.version)
  assertDigest(draft.manifestDigest, 'manifest digest')
  if (draft.runtime.kind !== draft.kind) {
    throw new Error('Capability runtime kind does not match definition kind')
  }
  assertRuntime(draft.runtime)
  assertNoInlineCredentials(draft)
  assertTimestamp(draft.publishedAt)
  const normalized: Omit<CapabilityDefinition, 'definitionDigest'> = {
    schemaVersion: 1,
    id: draft.id,
    kind: draft.kind,
    version: draft.version,
    source: draft.source,
    manifestDigest: draft.manifestDigest,
    name: requireText(draft.name, 'name'),
    description: requireText(draft.description, 'description', true),
    runtime: cloneRuntime(draft.runtime),
    permissions: normalizePermissions(draft.permissions),
    dependencies: normalizeDependencies(draft.dependencies),
    compatibility: {
      realmflowVersionRange: requireText(
        draft.compatibility.realmflowVersionRange,
        'compatibility range'
      ),
      platforms: uniqueSorted(draft.compatibility.platforms)
    },
    testPlan: draft.testPlan
      .map((item) => ({
        id: requireIdentifier(item.id, 'test ID'),
        command: requireText(item.command, 'test command')
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    publishedAt: draft.publishedAt
  }
  return deepFreeze({
    ...normalized,
    definitionDigest: digest(normalized)
  })
}

export function assertCapabilityVersionImmutable(
  current: CapabilityDefinition,
  candidate: CapabilityDefinition
): void {
  if (
    current.id === candidate.id &&
    current.version === candidate.version &&
    current.definitionDigest !== candidate.definitionDigest
  ) {
    throw new Error('Capability immutable version digest conflicts')
  }
}

export function assertCapabilityDependencyGraph(
  definitions: readonly CapabilityDefinition[]
): void {
  const byId = new Map(definitions.map((item) => [item.id, item]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new Error('Capability dependency graph contains a cycle')
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      if (byId.has(dependency.capabilityId)) {
        visit(dependency.capabilityId)
      }
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of byId.keys()) visit(id)
}

export function createCapabilityInstallation(
  draft: CapabilityInstallation,
  parent?: CapabilityInstallation
): CapabilityInstallation {
  assertIdentifier(draft.id, 'installation ID')
  assertIdentifier(draft.capabilityId, 'capability ID')
  assertSemver(draft.capabilityVersion)
  assertDigest(draft.capabilityDigest, 'capability digest')
  assertScope(draft.scope)
  const permissionCeiling = normalizePermissions(draft.permissionCeiling)
  if (parent) {
    if (
      parent.capabilityId !== draft.capabilityId ||
      !isDescendantScope(parent.scope, draft.scope) ||
      (draft.enabled && !parent.enabled) ||
      !permissionsWithin(permissionCeiling, parent.permissionCeiling)
    ) {
      throw new Error(
        'Capability installation cannot expand parent permissions'
      )
    }
  }
  if (
    draft.status === 'enabled' !== draft.enabled ||
    !Number.isInteger(draft.revision) ||
    draft.revision < 1
  ) {
    throw new Error('Capability installation state is invalid')
  }
  assertTimestamp(draft.installedAt)
  assertTimestamp(draft.updatedAt)
  if (draft.updatedAt < draft.installedAt) {
    throw new Error('Capability installation timestamp is invalid')
  }
  return deepFreeze({
    ...draft,
    scope: { ...draft.scope },
    permissionCeiling
  })
}

export function resolveInstalledCapabilities(input: {
  definitions: readonly CapabilityDefinition[]
  installations: readonly CapabilityInstallation[]
  scopeChain: readonly CapabilityScope[]
}): Array<{
  definition: CapabilityDefinition
  installation: CapabilityInstallation
}> {
  const scopeOrder = new Map(
    input.scopeChain.map((scope, index) => [scopeKey(scope), index])
  )
  const effective = new Map<string, CapabilityInstallation>()
  for (const installation of [...input.installations].sort(
    (left, right) =>
      (scopeOrder.get(scopeKey(left.scope)) ?? Number.MAX_SAFE_INTEGER) -
        (scopeOrder.get(scopeKey(right.scope)) ?? Number.MAX_SAFE_INTEGER) ||
      left.updatedAt - right.updatedAt
  )) {
    if (!scopeOrder.has(scopeKey(installation.scope))) continue
    effective.set(installation.capabilityId, installation)
  }
  return [...effective.values()]
    .filter(
      (installation) =>
        installation.enabled && installation.status === 'enabled'
    )
    .flatMap((installation) => {
      const definition = input.definitions.find(
        (item) =>
          item.id === installation.capabilityId &&
          item.version === installation.capabilityVersion &&
          item.definitionDigest === installation.capabilityDigest
      )
      return definition ? [{ definition, installation }] : []
    })
    .sort((left, right) =>
      left.definition.id.localeCompare(right.definition.id)
    )
}

export function transitionCapabilityLifecycle(
  current: CapabilityLifecycleStatus,
  next: CapabilityLifecycleStatus
): CapabilityLifecycleStatus {
  if (current === next) return current
  if (!LIFECYCLE_TRANSITIONS[current].has(next)) {
    throw new Error(
      `Invalid Capability lifecycle transition: ${current} -> ${next}`
    )
  }
  return next
}

function assertRuntime(runtime: CapabilityRuntime): void {
  if (runtime.kind === 'tool') {
    assertIdentifier(runtime.definitionId, 'Tool definition ID')
    return
  }
  if (runtime.kind === 'skill') {
    assertRelativePath(runtime.instructionsPath, 'Skill instructions path')
    return
  }
  if (runtime.kind === 'agent') {
    assertRelativePath(runtime.promptPath, 'Agent Prompt path')
    if (
      !Number.isInteger(runtime.delegation.maximumDepth) ||
      runtime.delegation.maximumDepth < 0 ||
      (!runtime.delegation.allowed &&
        runtime.delegation.maximumDepth !== 0)
    ) {
      throw new Error('Capability Agent delegation policy is invalid')
    }
    return
  }
  if (!CONNECTOR_KINDS.has(runtime.connectorKind)) {
    throw new Error('Capability Connector kind is invalid')
  }
  for (const reference of runtime.credentialRefs) {
    assertIdentifier(reference, 'credential reference')
  }
  const actionIds = new Set<string>()
  for (const action of runtime.actions) {
    const normalized = normalizeConnectorAction(action)
    for (const reference of connectorActionCredentialRefs(normalized)) {
      if (!runtime.credentialRefs.includes(reference)) {
        throw new Error(
          'Capability Connector action credential reference is undeclared'
        )
      }
    }
    if (actionIds.has(normalized.id)) {
      throw new Error('Capability Connector action is duplicated')
    }
    actionIds.add(normalized.id)
  }
}

function connectorActionCredentialRefs(
  action: ConnectorAction
): string[] {
  const protocol = action.protocol
  if (protocol.kind === 'http') {
    return protocol.authentication.type === 'none'
      ? []
      : [protocol.authentication.credentialRef]
  }
  if (protocol.kind === 'database') return [protocol.connectionRef]
  if (protocol.kind === 'cli') {
    return Object.values(protocol.environmentCredentialRefs)
  }
  return []
}

function assertNoInlineCredentials(value: unknown): void {
  const visit = (item: unknown, key = ''): void => {
    if (Array.isArray(item)) {
      for (const child of item) visit(child, key)
      return
    }
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const sensitiveKey = /(?:credential|password|secret|token|api.?key)/i.test(
      key
    )
    if (
      sensitiveKey &&
      ['default', 'const', 'example', 'value'].some(
        (field) => typeof record[field] === 'string' && record[field] !== ''
      )
    ) {
      throw new Error('Capability package cannot contain inline credentials')
    }
    for (const [childKey, child] of Object.entries(record)) {
      visit(child, childKey)
    }
  }
  visit(value)
}

function normalizePermissions(
  permissions: CapabilityPermissionDeclaration
): CapabilityPermissionDeclaration {
  return {
    capabilities: uniqueSorted(permissions.capabilities),
    maximumRisk: permissions.maximumRisk,
    pathPrefixes: uniqueSorted(
      permissions.pathPrefixes.map((path) => normalizeAbsolutePath(path))
    ),
    networkTargets: uniqueSorted(
      permissions.networkTargets.map((target) =>
        requireText(target, 'network target')
      )
    )
  }
}

function normalizeDependencies(
  dependencies: readonly CapabilityDependency[]
): CapabilityDependency[] {
  const normalized = dependencies.map((dependency) => {
    if (!KINDS.has(dependency.kind)) {
      throw new Error('Capability dependency kind is invalid')
    }
    return {
      kind: dependency.kind,
      capabilityId: requireIdentifier(
        dependency.capabilityId,
        'dependency ID'
      ),
      versionRange: requireText(
        dependency.versionRange,
        'dependency version range'
      ),
      required: dependency.required
    }
  })
  const keys = normalized.map(
    ({ kind, capabilityId }) => `${kind}:${capabilityId}`
  )
  if (new Set(keys).size !== keys.length) {
    throw new Error('Capability dependency is duplicated')
  }
  return normalized.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.capabilityId.localeCompare(right.capabilityId)
  )
}

function permissionsWithin(
  child: CapabilityPermissionDeclaration,
  parent: CapabilityPermissionDeclaration
): boolean {
  return (
    child.capabilities.every((item) =>
      parent.capabilities.includes(item)
    ) &&
    RISK_RANK[child.maximumRisk] <= RISK_RANK[parent.maximumRisk] &&
    child.pathPrefixes.every((path) =>
      parent.pathPrefixes.some((prefix) => pathWithin(path, prefix))
    ) &&
    child.networkTargets.every((target) =>
      parent.networkTargets.includes(target)
    )
  )
}

function isDescendantScope(
  parent: CapabilityScope,
  child: CapabilityScope
): boolean {
  if (parent.kind === 'global') return child.kind !== 'global'
  if (parent.kind === 'work-root') {
    return (
      (child.kind === 'folder' && child.workRootId === parent.workRootId) ||
      child.kind === 'workspace'
    )
  }
  if (parent.kind === 'folder') {
    return (
      child.kind === 'folder' &&
      child.workRootId === parent.workRootId &&
      pathWithin(child.canonicalPath, parent.canonicalPath)
    )
  }
  if (parent.kind === 'workspace') {
    return (
      child.kind === 'requirement' &&
      child.workspaceId === parent.workspaceId
    )
  }
  return false
}

function assertScope(scope: CapabilityScope): void {
  if (scope.kind === 'global') return
  if ('workRootId' in scope) assertIdentifier(scope.workRootId, 'work root ID')
  if ('workspaceId' in scope) {
    assertIdentifier(scope.workspaceId, 'workspace ID')
  }
  if ('requirementId' in scope) {
    assertIdentifier(scope.requirementId, 'requirement ID')
  }
  if (scope.kind === 'folder') normalizeAbsolutePath(scope.canonicalPath)
}

function scopeKey(scope: CapabilityScope): string {
  switch (scope.kind) {
    case 'global':
      return 'global'
    case 'work-root':
      return `work-root:${scope.workRootId}`
    case 'folder':
      return `folder:${scope.workRootId}:${scope.canonicalPath}`
    case 'workspace':
      return `workspace:${scope.workspaceId}`
    case 'requirement':
      return `requirement:${scope.workspaceId}:${scope.requirementId}`
  }
}

function cloneRuntime(runtime: CapabilityRuntime): CapabilityRuntime {
  if (runtime.kind === 'connector') {
    return {
      ...runtime,
      credentialRefs: [...runtime.credentialRefs],
      configurationSchema: structuredClone(runtime.configurationSchema),
      actions: runtime.actions.map((action) =>
        structuredClone(normalizeConnectorAction(action))
      )
    }
  }
  if (runtime.kind === 'agent') {
    return {
      ...runtime,
      modelCapabilities: [...runtime.modelCapabilities],
      reasoningModes: [...runtime.reasoningModes],
      delegation: { ...runtime.delegation }
    }
  }
  return { ...runtime }
}

function normalizeAbsolutePath(value: string): string {
  const path = requireText(value, 'path')
  if (!path.startsWith('/') || path.includes('\0')) {
    throw new Error('Capability path is invalid')
  }
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

function pathWithin(value: string, prefix: string): boolean {
  return value === prefix || prefix === '/' || value.startsWith(`${prefix}/`)
}

function assertRelativePath(value: string, field: string): void {
  const parts = value.replaceAll('\\', '/').split('/')
  if (
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    parts.some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Capability ${field} is invalid`)
  }
}

function assertIdentifier(value: string, field: string): void {
  requireIdentifier(value, field)
}

function requireIdentifier(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error(`Capability ${field} is invalid`)
  }
  return value
}

function assertSemver(value: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error('Capability version is invalid')
  }
}

function assertDigest(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Capability ${field} is invalid`)
  }
}

function assertTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Capability timestamp is invalid')
  }
}

function requireText(
  value: string,
  field: string,
  allowEmpty = false
): string {
  const normalized = value.trim()
  if ((!allowEmpty && !normalized) || normalized.includes('\0')) {
    throw new Error(`Capability ${field} is invalid`)
  }
  return normalized
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort()
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
