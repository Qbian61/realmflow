import {
  validateDshRunManifest,
  type CredentialReference,
  type DshRunManifest,
  type ExecutableAgentManifest,
  type ExecutableConnectorManifest,
  type ExecutableMcpManifest,
  type ExecutableSkillManifest,
  type ExecutableToolManifest,
  type ModelRuntimeManifest,
  type ProductCommandGrant,
  type RuntimeScope
} from '../../../domain/dsh-run-manifest'

export type DshRuntimeAuthorityDeniedEvent = {
  kind: 'runtime-authority-denied'
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  capabilityKind: DshRuntimeAuthorityCapabilityKind
  capabilityId: string
  reason: string
}

export type DshRuntimeAuthorityCapabilityKind =
  | 'model'
  | 'tool'
  | 'skill'
  | 'agent'
  | 'mcp-server'
  | 'connector'
  | 'product-command'
  | 'credential'
  | 'scope'
  | 'filesystem'
  | 'network'

export type DshRuntimeAuthorityOptions = {
  now?: () => number
  onDenied?: (event: DshRuntimeAuthorityDeniedEvent) => void
}

export type DshRuntimeAuthority = {
  manifest: DshRunManifest
  requireModel(request: ModelAuthorityRequest): ModelRuntimeManifest
  requireTool(request: VersionedAuthorityRequest): ExecutableToolManifest
  requireSkill(request: VersionedAuthorityRequest): ExecutableSkillManifest
  requireAgent(request: AgentAuthorityRequest): ExecutableAgentManifest
  requireMcpServer(request: IdAuthorityRequest): ExecutableMcpManifest
  requireConnector(request: IdAuthorityRequest): ExecutableConnectorManifest
  requireProductCommand(
    request: ProductCommandAuthorityRequest
  ): ProductCommandGrant
  requireCredential(request: CredentialAuthorityRequest): CredentialReference
  requireScope(scope: RuntimeScope): RuntimeScope
  requireFilesystemPath(
    request: FilesystemAuthorityRequest
  ): DshFilesystemRootGrant
  requireNetworkDestination(destination: string | URL): DshNetworkGrant
}

export type ModelAuthorityRequest = {
  providerId?: string
  profileId?: string
  modelId?: string
}

export type IdAuthorityRequest = {
  id: string
}

export type VersionedAuthorityRequest = IdAuthorityRequest & {
  version?: string
  definitionDigest?: string
}

export type AgentAuthorityRequest = IdAuthorityRequest & {
  version?: string
  profileDigest?: string
}

export type ProductCommandAuthorityRequest = {
  command: string
  grantId?: string
}

export type CredentialAuthorityRequest = {
  ref: string
  purpose: CredentialReference['purpose']
}

export type FilesystemAuthorityRequest = {
  path: string
  access: 'read' | 'write'
}

export type DshFilesystemRootGrant = DshRunManifest['context']['roots'][number]

export type DshNetworkGrant = {
  kind: 'mcp-server' | 'connector'
  id: string
  baseUrl: string
}

export class DshRuntimeAuthorityDeniedError extends Error {
  constructor(readonly event: DshRuntimeAuthorityDeniedEvent) {
    super(`${event.capabilityKind} ${event.capabilityId} denied: ${event.reason}`)
    this.name = 'DshRuntimeAuthorityDeniedError'
  }
}

export function buildDshRuntimeAuthority(
  manifest: DshRunManifest,
  options: DshRuntimeAuthorityOptions = {}
): DshRuntimeAuthority {
  validateDshRunManifest(manifest)
  const now = options.now ?? Date.now
  const tools = byId(manifest.tools)
  const skills = byId(manifest.skills)
  const agents = byId(manifest.agents)
  const mcpServers = byId(manifest.mcpServers)
  const connectors = byId(manifest.connectors)
  const productCommands = new Map(
    manifest.productCommands.map((grant) => [grant.command, grant])
  )
  const credentials = new Map(
    manifest.credentialReferences.map((reference) => [
      credentialKey(reference.ref, reference.purpose),
      reference
    ])
  )
  const declaredScopes = new Set<string>([
    scopeKey(manifest.context.scope),
    ...manifest.productCommands.map((grant) => scopeKey(grant.scope)),
    ...knowledgeScopeKeys(manifest)
  ])
  const networkGrants = collectNetworkGrants(manifest)

  function deny(
    capabilityKind: DshRuntimeAuthorityCapabilityKind,
    capabilityId: string,
    reason: string
  ): never {
    const event: DshRuntimeAuthorityDeniedEvent = {
      kind: 'runtime-authority-denied',
      at: now(),
      manifestDigest: manifest.digest,
      runId: manifest.runId,
      sessionId: manifest.sessionId,
      capabilityKind,
      capabilityId,
      reason
    }
    options.onDenied?.(event)
    throw new DshRuntimeAuthorityDeniedError(event)
  }

  return {
    manifest,
    requireModel(request) {
      if (
        request.providerId !== undefined
        && request.providerId !== manifest.model.providerId
      ) {
        return deny('model', modelId(request), 'model provider is not declared')
      }
      if (
        request.profileId !== undefined
        && request.profileId !== manifest.model.profileId
      ) {
        return deny('model', modelId(request), 'model profile is not declared')
      }
      if (
        request.modelId !== undefined
        && request.modelId !== manifest.model.modelId
      ) {
        return deny('model', modelId(request), 'model is not declared')
      }
      return manifest.model
    },
    requireTool(request) {
      const tool = tools.get(request.id)
      if (tool === undefined) {
        return deny('tool', request.id, 'tool is not declared')
      }
      if (request.version !== undefined && request.version !== tool.version) {
        return deny('tool', request.id, 'tool version is not declared')
      }
      if (
        request.definitionDigest !== undefined
        && request.definitionDigest !== tool.definitionDigest
      ) {
        return deny('tool', request.id, 'tool definition digest is not declared')
      }
      return tool
    },
    requireSkill(request) {
      const skill = skills.get(request.id)
      if (skill === undefined) {
        return deny('skill', request.id, 'skill is not declared')
      }
      if (request.version !== undefined && request.version !== skill.version) {
        return deny('skill', request.id, 'skill version is not declared')
      }
      if (
        request.definitionDigest !== undefined
        && request.definitionDigest !== skill.definitionDigest
      ) {
        return deny(
          'skill',
          request.id,
          'skill definition digest is not declared'
        )
      }
      return skill
    },
    requireAgent(request) {
      const agent = agents.get(request.id)
      if (agent === undefined) {
        return deny('agent', request.id, 'agent is not declared')
      }
      if (request.version !== undefined && request.version !== agent.version) {
        return deny('agent', request.id, 'agent version is not declared')
      }
      if (
        request.profileDigest !== undefined
        && request.profileDigest !== agent.profileDigest
      ) {
        return deny('agent', request.id, 'agent profile digest is not declared')
      }
      return agent
    },
    requireMcpServer(request) {
      const server = mcpServers.get(request.id)
      if (server === undefined) {
        return deny('mcp-server', request.id, 'MCP server is not declared')
      }
      return server
    },
    requireConnector(request) {
      const connector = connectors.get(request.id)
      if (connector === undefined) {
        return deny('connector', request.id, 'connector is not declared')
      }
      return connector
    },
    requireProductCommand(request) {
      const grant = productCommands.get(request.command)
      if (grant === undefined) {
        return deny(
          'product-command',
          request.command,
          'product command is not declared'
        )
      }
      if (request.grantId !== undefined && request.grantId !== grant.grantId) {
        return deny(
          'product-command',
          request.command,
          'product command grant is not declared'
        )
      }
      return grant
    },
    requireCredential(request) {
      const credential = credentials.get(credentialKey(request.ref, request.purpose))
      if (credential === undefined) {
        return deny(
          'credential',
          request.ref,
          'credential reference is not declared'
        )
      }
      return credential
    },
    requireScope(scope) {
      if (!declaredScopes.has(scopeKey(scope))) {
        return deny('scope', scopeKey(scope), 'scope is not declared')
      }
      return scope
    },
    requireFilesystemPath(request) {
      const target = normalizePath(request.path)
      const root = manifest.context.roots.find((candidate) =>
        isInsideRoot(target, candidate.path)
      )
      if (root === undefined) {
        return deny(
          'filesystem',
          target,
          'filesystem path is outside declared roots'
        )
      }
      if (request.access === 'write' && root.access !== 'read-write') {
        return deny(
          'filesystem',
          target,
          'filesystem write access is not declared'
        )
      }
      return root
    },
    requireNetworkDestination(destination) {
      const requested =
        typeof destination === 'string' ? destination : destination.toString()
      const target = parseUrl(requested)
      const grant = networkGrants.find((candidate) =>
        isUrlInsideBase(target, candidate.base)
      )
      if (grant === undefined) {
        return deny(
          'network',
          requested,
          'network destination is not declared'
        )
      }
      return {
        kind: grant.kind,
        id: grant.id,
        baseUrl: formatBaseUrl(grant.base)
      }
    }
  }
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

function credentialKey(ref: string, purpose: CredentialReference['purpose']): string {
  return `${purpose}:${ref}`
}

function modelId(request: ModelAuthorityRequest): string {
  return [
    request.providerId ?? '*',
    request.profileId ?? '*',
    request.modelId ?? '*'
  ].join('/')
}

function knowledgeScopeKeys(manifest: DshRunManifest): string[] {
  if (manifest.knowledge.scope.kind !== 'workspace') return []
  return [
    scopeKey({
      kind: 'workspace',
      workspaceId: manifest.knowledge.scope.workspaceId
    })
  ]
}

function scopeKey(scope: RuntimeScope): string {
  if (scope.kind === 'global') return 'global'
  if (scope.kind === 'workspace') return `workspace:${scope.workspaceId}`
  if (scope.kind === 'requirement') {
    return `requirement:${scope.workspaceId}:${scope.requirementId}`
  }
  if (scope.kind === 'requirement-node') {
    return [
      'requirement-node',
      scope.workspaceId,
      scope.requirementId,
      scope.nodeRunId
    ].join(':')
  }
  return `schedule:${scope.scheduleRunId}`
}

function collectNetworkGrants(manifest: DshRunManifest): Array<{
  kind: 'mcp-server' | 'connector'
  id: string
  base: URL
}> {
  const mcpGrants: Array<{
    kind: 'mcp-server'
    id: string
    base: URL
  }> = []
  for (const server of manifest.mcpServers) {
    if (server.transport.kind === 'streamable_http') {
      mcpGrants.push({
        kind: 'mcp-server' as const,
        id: server.id,
        base: parseUrl(server.transport.url)
      })
    }
  }
  return [
    ...mcpGrants,
    ...manifest.connectors
      .filter(isHttpConnector)
      .map((connector) => ({
        kind: 'connector' as const,
        id: connector.id,
        base: parseUrl(connector.baseUrl)
      }))
  ]
}

function isHttpConnector(
  connector: ExecutableConnectorManifest
): connector is Extract<ExecutableConnectorManifest, { type: 'http' }> {
  return connector.type === 'http'
}

function parseUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new Error('network destination is invalid')
  }
}

function isUrlInsideBase(target: URL, base: URL): boolean {
  if (target.origin !== base.origin) return false
  const basePath = stripTrailingSlash(base.pathname)
  if (basePath === '' || basePath === '/') return true
  const targetPath = stripTrailingSlash(target.pathname)
  return targetPath === basePath || targetPath.startsWith(`${basePath}/`)
}

function formatBaseUrl(value: URL): string {
  const pathname = stripTrailingSlash(value.pathname)
  return `${value.origin}${pathname === '/' ? '' : pathname}`
}

function stripTrailingSlash(value: string): string {
  const stripped = value.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

function normalizePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function isInsideRoot(path: string, root: string): boolean {
  const normalizedRoot = normalizePath(root)
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`)
}
