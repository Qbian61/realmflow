import { createHash } from 'node:crypto'
import type {
  CapabilityDefinition,
  CapabilityDependency,
  CapabilityInstallation,
  CapabilityPermissionDeclaration,
  CapabilityScope,
  ConnectorKind
} from './capability'

export type CapabilityGenerationStatus =
  | 'draft'
  | 'validating'
  | 'awaiting_approval'
  | 'installed'
  | 'cancelled'
  | 'failed'

export type CapabilityBuilderRuntime =
  | {
      kind: 'connector'
      connectorKind: 'http'
      baseUrl: string
      method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      path: string
      credentialRefs: string[]
      externalWrite: boolean
    }
  | {
      kind: 'skill'
      instructions: string
      executable: false
    }
  | {
      kind: 'agent'
      prompt: string
      modelCapabilities: string[]
      reasoningModes: Array<'off' | 'low' | 'medium' | 'high'>
      delegation: { allowed: false; maximumDepth: 0 }
    }

export type CapabilitySpec = {
  schemaVersion: 1
  specDigest: string
  id: string
  kind: 'connector' | 'skill' | 'agent'
  version: string
  name: string
  description: string
  scope: CapabilityScope
  runtime: CapabilityBuilderRuntime
  permissions: CapabilityPermissionDeclaration
  dependencies: CapabilityDependency[]
  compatibility: {
    realmflowVersionRange: string
    platforms: Array<'darwin' | 'win32' | 'linux'>
  }
}

export type CapabilitySpecSource = Omit<CapabilitySpec, 'specDigest' | 'runtime'> & {
  runtime:
    | (Omit<Extract<CapabilityBuilderRuntime, { kind: 'connector' }>, 'connectorKind'> & {
        connectorKind: ConnectorKind
      })
    | {
        kind: 'skill'
        instructions: string
        executable: boolean
      }
    | {
        kind: 'agent'
        prompt: string
        modelCapabilities: string[]
        reasoningModes: Array<'off' | 'low' | 'medium' | 'high'>
        delegation: { allowed: boolean; maximumDepth: number }
      }
}

export type CapabilityGenerationProposal = {
  id: string
  packageDigest: string
  definitionDigest: string
  scope: CapabilityScope
  draftRevision: number
  definition: CapabilityDefinition
  validationReport: {
    compatible: true
    dependencyStatus: 'resolved'
    tests: Array<{
      id: string
      status: 'passed'
      detail?: string
    }>
  }
  fileNames: string[]
  byteSize: number
  fileCount: number
  validatedAt: number
}

export type CapabilityInstalledResult = {
  definition: CapabilityDefinition
  installation: CapabilityInstallation
}

export type CapabilityGenerationSession = {
  id: string
  conversationId: string
  requestedBy: string
  request: string
  spec: CapabilitySpec
  status: CapabilityGenerationStatus
  revision: number
  proposal?: CapabilityGenerationProposal
  diagnostics?: string[]
  installedResult?: CapabilityInstalledResult
  installedApproval?: CapabilityApproval
  createdAt: number
  updatedAt: number
}

export type CapabilityApproval = {
  proposalId: string
  revision: number
  packageDigest: string
  scope: CapabilityScope
  enable: boolean
}

const GENERATION_TRANSITIONS: Record<
  CapabilityGenerationStatus,
  ReadonlySet<CapabilityGenerationStatus>
> = {
  draft: new Set(['validating', 'cancelled']),
  validating: new Set([
    'awaiting_approval',
    'draft',
    'failed',
    'cancelled'
  ]),
  awaiting_approval: new Set([
    'draft',
    'installed',
    'failed',
    'cancelled'
  ]),
  installed: new Set(),
  cancelled: new Set(),
  failed: new Set()
}

export function createCapabilitySpec(
  source: CapabilitySpecSource
): CapabilitySpec {
  if (source.schemaVersion !== 1) {
    throw new Error('Capability Builder schema version is unsupported')
  }
  assertIdentifier(source.id, 'Capability Spec ID')
  assertSemver(source.version)
  assertText(source.name, 'Capability Spec name')
  assertText(source.description, 'Capability Spec description')
  assertNoPlaintextCredential([
    source.name,
    source.description,
    source.runtime.kind === 'skill'
      ? source.runtime.instructions
      : source.runtime.kind === 'agent'
        ? source.runtime.prompt
        : `${source.runtime.baseUrl}\n${source.runtime.path}`
  ])
  if (source.kind !== source.runtime.kind) {
    throw new Error('Capability Spec runtime kind does not match kind')
  }
  const runtime = normalizeRuntime(source.runtime)
  assertBuilderPermissions(runtime, source.permissions)
  const normalized = {
    schemaVersion: 1 as const,
    id: source.id,
    kind: source.kind,
    version: source.version,
    name: source.name.trim(),
    description: source.description.trim(),
    scope: normalizeScope(source.scope),
    runtime,
    permissions: {
      capabilities: [...new Set(source.permissions.capabilities)].sort(),
      maximumRisk: source.permissions.maximumRisk,
      pathPrefixes: [...new Set(source.permissions.pathPrefixes)].sort(),
      networkTargets: [...new Set(source.permissions.networkTargets)].sort()
    },
    dependencies: [...source.dependencies]
      .map((dependency) => ({ ...dependency }))
      .sort((left, right) =>
        `${left.kind}:${left.capabilityId}`.localeCompare(
          `${right.kind}:${right.capabilityId}`
        )
      ),
    compatibility: {
      realmflowVersionRange: source.compatibility.realmflowVersionRange.trim(),
      platforms: [...new Set(source.compatibility.platforms)].sort()
    }
  }
  return deepFreeze({
    ...normalized,
    specDigest: digest(normalized)
  })
}

function assertBuilderPermissions(
  runtime: CapabilityBuilderRuntime,
  permissions: CapabilityPermissionDeclaration
): void {
  const capabilities = [...new Set(permissions.capabilities)].sort()
  const pathPrefixes = [...new Set(permissions.pathPrefixes)].sort()
  const networkTargets = [...new Set(permissions.networkTargets)].sort()
  if (runtime.kind !== 'connector') {
    if (
      permissions.maximumRisk !== 'low' ||
      capabilities.length > 0 ||
      pathPrefixes.length > 0 ||
      networkTargets.length > 0
    ) {
      throw new Error(
        'Capability Builder declarative permissions are invalid'
      )
    }
    return
  }
  const expectedCapabilities = [
    ...(runtime.credentialRefs.length > 0 ? ['credential.use'] : []),
    'network.connect'
  ]
  const expectedRisk = runtime.externalWrite ? 'high' : 'medium'
  const expectedTarget = new URL(runtime.baseUrl).hostname
  if (
    permissions.maximumRisk !== expectedRisk ||
    JSON.stringify(capabilities) !== JSON.stringify(expectedCapabilities) ||
    pathPrefixes.length > 0 ||
    JSON.stringify(networkTargets) !== JSON.stringify([expectedTarget])
  ) {
    throw new Error('Capability Builder HTTP permissions are invalid')
  }
}

export function createCapabilityGenerationSession(
  source: CapabilityGenerationSession
): CapabilityGenerationSession {
  assertIdentifier(source.id, 'Capability generation ID')
  assertIdentifier(source.conversationId, 'Capability conversation ID')
  assertIdentifier(source.requestedBy, 'Capability requester ID')
  assertText(source.request, 'Capability generation request')
  if (!Number.isSafeInteger(source.revision) || source.revision < 1) {
    throw new Error('Capability generation revision is invalid')
  }
  if (
    !Number.isSafeInteger(source.createdAt) ||
    !Number.isSafeInteger(source.updatedAt) ||
    source.createdAt < 0 ||
    source.updatedAt < source.createdAt
  ) {
    throw new Error('Capability generation timestamp is invalid')
  }
  if (
    source.status === 'awaiting_approval' !== Boolean(source.proposal)
  ) {
    throw new Error('Capability generation proposal state is invalid')
  }
  if (
    (source.status === 'installed') !==
    Boolean(source.installedResult && source.installedApproval)
  ) {
    throw new Error('Capability generation installation state is invalid')
  }
  if (source.proposal) {
    assertIdentifier(source.proposal.id, 'Capability proposal ID')
    assertDigest(source.proposal.packageDigest)
    assertDigest(source.proposal.definitionDigest)
    normalizeScope(source.proposal.scope)
    if (
      source.proposal.definition.definitionDigest !==
        source.proposal.definitionDigest ||
      !Number.isSafeInteger(source.proposal.draftRevision) ||
      source.proposal.draftRevision < 1
    ) {
      throw new Error('Capability generation proposal digest is invalid')
    }
  }
  return deepFreeze(structuredClone(source))
}

export function transitionCapabilityGeneration(
  current: CapabilityGenerationStatus,
  next: CapabilityGenerationStatus
): CapabilityGenerationStatus {
  if (current === next) return current
  if (!GENERATION_TRANSITIONS[current].has(next)) {
    throw new Error(
      `Invalid Capability generation transition: ${current} -> ${next}`
    )
  }
  return next
}

export function assertCapabilityApproval(
  session: CapabilityGenerationSession,
  approval: CapabilityApproval
): void {
  if (
    session.status !== 'awaiting_approval' ||
    !session.proposal ||
    session.proposal.id !== approval.proposalId
  ) {
    throw new Error('Capability approval is unavailable')
  }
  if (session.revision !== approval.revision) {
    throw new Error('Capability approval is stale')
  }
  if (session.proposal.packageDigest !== approval.packageDigest) {
    throw new Error('Capability approval digest changed')
  }
  if (
    stableJson(session.proposal.scope) !== stableJson(approval.scope)
  ) {
    throw new Error('Capability approval scope changed')
  }
  if (
    approval.enable &&
    (session.spec.permissions.maximumRisk === 'high' ||
      session.spec.permissions.maximumRisk === 'critical' ||
      (session.spec.runtime.kind === 'connector' &&
        session.spec.runtime.externalWrite))
  ) {
    throw new Error(
      'High-risk Capability cannot be enabled during installation'
    )
  }
}

function normalizeRuntime(
  runtime: CapabilitySpecSource['runtime']
): CapabilityBuilderRuntime {
  if (runtime.kind === 'connector') {
    if (runtime.connectorKind !== 'http') {
      throw new Error('Capability Builder only supports HTTP Connectors')
    }
    const baseUrl = new URL(runtime.baseUrl)
    if (
      baseUrl.protocol !== 'https:' ||
      baseUrl.origin !== runtime.baseUrl.replace(/\/$/, '')
    ) {
      throw new Error('Capability Builder HTTP base URL is invalid')
    }
    if (!runtime.path.startsWith('/') || runtime.path.startsWith('//')) {
      throw new Error('Capability Builder HTTP path is invalid')
    }
    return {
      ...runtime,
      connectorKind: 'http',
      baseUrl: baseUrl.origin,
      credentialRefs: [...new Set(runtime.credentialRefs)].sort()
    }
  }
  if (runtime.kind === 'skill') {
    if (runtime.executable) {
      throw new Error(
        'Capability Builder only supports instruction Skills'
      )
    }
    return {
      kind: 'skill',
      instructions: requireText(runtime.instructions, 'Skill instructions'),
      executable: false
    }
  }
  if (
    runtime.delegation.allowed ||
    runtime.delegation.maximumDepth !== 0
  ) {
    throw new Error('Capability Builder Agent delegation is unavailable')
  }
  return {
    kind: 'agent',
    prompt: requireText(runtime.prompt, 'Agent Prompt'),
    modelCapabilities: [...new Set(runtime.modelCapabilities)].sort(),
    reasoningModes: [...new Set(runtime.reasoningModes)].sort(),
    delegation: { allowed: false, maximumDepth: 0 }
  }
}

function normalizeScope(scope: CapabilityScope): CapabilityScope {
  if (scope.kind === 'global') return { kind: 'global' }
  if (scope.kind === 'work-root') {
    assertIdentifier(scope.workRootId, 'Work root ID')
    return { ...scope }
  }
  if (scope.kind === 'folder') {
    assertIdentifier(scope.workRootId, 'Work root ID')
    assertText(scope.canonicalPath, 'Folder path')
    return { ...scope }
  }
  if (scope.kind === 'workspace') {
    assertIdentifier(scope.workspaceId, 'Workspace ID')
    return { ...scope }
  }
  assertIdentifier(scope.workspaceId, 'Workspace ID')
  assertIdentifier(scope.requirementId, 'Requirement ID')
  return { ...scope }
}

function assertNoPlaintextCredential(values: readonly string[]): void {
  if (
    values.some((value) =>
      /\b(?:api[_-]?key|password|secret|token)\b\s*[:=]\s*['"][^'"]{8,}['"]/iu.test(
        value
      )
    )
  ) {
    throw new Error(
      'Capability Builder input cannot contain plaintext credentials'
    )
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error(`${label} is invalid`)
  }
}

function assertSemver(value: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error('Capability Spec version is invalid')
  }
}

function assertDigest(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Capability proposal digest is invalid')
  }
}

function assertText(value: string, label: string): void {
  requireText(value, label)
}

function requireText(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 20_000) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)])
    )
  }
  return value
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested)
    }
  }
  return value
}
