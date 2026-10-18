import type {
  CredentialReference,
  DshRunManifest,
  ExecutableAgentManifest,
  ExecutableConnectorManifest,
  ExecutableMcpManifest,
  ExecutableSkillManifest,
  ExecutableToolManifest,
  ModelRuntimeManifest,
  ProductCommandGrant,
  RuntimeBudgetManifest,
  RuntimePolicyManifest,
  RuntimeScope
} from '../../../../domain/dsh-run-manifest'
import {
  DshRuntimeAuthorityDeniedError,
  buildDshRuntimeAuthority,
  type DshRuntimeAuthority
} from '../runtime-authority'

export type DshSubagentRuntimePolicyOptions = {
  manifest: DshRunManifest
  authority?: DshRuntimeAuthority
  adapter: DshSubagentAdapter
  emitEvent?: (event: DshSubagentRuntimeEvent) => void
  now?: () => number
}

export type DshSubagentAdapter = {
  spawn(
    agent: ExecutableAgentManifest,
    request: DshSubagentAdapterRequest,
    context: DshSubagentContext
  ): Promise<DshSubagentResult>
}

export type DshSubagentAdapterRequest = {
  agentId: string
  callId: string
  objective: string
  childManifest: DshRunManifest
}

export type DshSubagentContext = {
  manifest: DshRunManifest
  childManifest: DshRunManifest
  signal: AbortSignal
  lineage: DshSubagentLineage
}

export type DshSubagentLineage = {
  parentRunId: string
  childRunId: string
  agentId: string
  depth: number
}

export type DshSubagentSpawnRequest = {
  agentId: string
  version?: string
  profileDigest?: string
  callId: string
  childManifest: DshRunManifest
  objective: string
  depth: number
  signal?: AbortSignal
}

export type DshSubagentResult = {
  status: 'completed' | 'failed' | 'cancelled'
  output: unknown
}

export type DshSubagentRuntimeEvent =
  | DshSubagentRuntimeBaseEvent & { kind: 'subagent.spawned' }
  | DshSubagentRuntimeBaseEvent & { kind: 'subagent.waiting' }
  | DshSubagentRuntimeBaseEvent & {
      kind: 'subagent.completed'
      status: DshSubagentResult['status']
    }
  | DshSubagentRuntimeBaseEvent & { kind: 'subagent.failed'; reason: string }
  | DshSubagentRuntimeBaseEvent & { kind: 'subagent.denied'; reason: string }

export type DshSubagentRuntimeBaseEvent = {
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  parentRunId: string
  childRunId: string
  agentId: string
  callId: string
  depth: number
}

export class DshSubagentRuntimePolicy {
  private readonly authority: DshRuntimeAuthority
  private readonly emitEvent: (event: DshSubagentRuntimeEvent) => void
  private readonly now: () => number

  constructor(private readonly options: DshSubagentRuntimePolicyOptions) {
    this.authority =
      options.authority ?? buildDshRuntimeAuthority(options.manifest)
    this.emitEvent = options.emitEvent ?? (() => {})
    this.now = options.now ?? Date.now
  }

  async spawn(request: DshSubagentSpawnRequest): Promise<DshSubagentResult> {
    let agentId = request.agentId
    let childRunId = request.childManifest.runId
    try {
      request.signal?.throwIfAborted()
      const agent = this.authority.requireAgent({
        id: request.agentId,
        version: request.version,
        profileDigest: request.profileDigest
      })
      agentId = agent.id
      assertDelegationDepth(agent, request.depth)
      assertChildManifestNarrower(this.options.manifest, request.childManifest)
      childRunId = request.childManifest.runId
      const lineage: DshSubagentLineage = {
        parentRunId: this.options.manifest.runId,
        childRunId,
        agentId: agent.id,
        depth: request.depth
      }
      const signal = request.signal ?? new AbortController().signal
      this.emit('subagent.spawned', request, agentId, childRunId)
      this.emit('subagent.waiting', request, agentId, childRunId)
      const result = await this.options.adapter.spawn(
        agent,
        {
          agentId: agent.id,
          callId: request.callId,
          objective: request.objective,
          childManifest: request.childManifest
        },
        {
          manifest: this.options.manifest,
          childManifest: request.childManifest,
          signal,
          lineage
        }
      )
      this.emit('subagent.completed', request, agentId, childRunId, {
        status: result.status
      })
      return result
    } catch (error) {
      if (isDenied(error)) {
        this.emit('subagent.denied', request, agentId, childRunId, {
          reason: deniedReason(error)
        })
      } else {
        this.emit('subagent.failed', request, agentId, childRunId, {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private emit(
    kind: DshSubagentRuntimeEvent['kind'],
    request: DshSubagentSpawnRequest,
    agentId: string,
    childRunId: string,
    extra: Partial<DshSubagentRuntimeEvent> = {}
  ): void {
    this.emitEvent({
      kind,
      at: this.now(),
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      parentRunId: this.options.manifest.runId,
      childRunId,
      agentId,
      callId: request.callId,
      depth: request.depth,
      ...extra
    } as DshSubagentRuntimeEvent)
  }
}

export class DshSubagentRuntimeDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshSubagentRuntimeDeniedError'
  }
}

function assertDelegationDepth(
  agent: ExecutableAgentManifest,
  depth: number
): void {
  if (!Number.isSafeInteger(depth) || depth < 1) {
    throw new DshSubagentRuntimeDeniedError('subagent depth is invalid')
  }
  if (depth > agent.maxDelegationDepth) {
    throw new DshSubagentRuntimeDeniedError(
      'subagent depth exceeds agent definition'
    )
  }
}

function assertChildManifestNarrower(
  parent: DshRunManifest,
  child: DshRunManifest
): void {
  assertChildModel(parent.model, child.model)
  assertChildList(
    parent.tools,
    child.tools,
    toolKey,
    'child Tool authority widens parent'
  )
  assertChildList(
    parent.skills,
    child.skills,
    skillKey,
    'child Skill authority widens parent'
  )
  assertChildList(
    parent.agents,
    child.agents,
    agentKey,
    'child Agent authority widens parent'
  )
  assertChildList(
    parent.mcpServers,
    child.mcpServers,
    mcpKey,
    'child MCP authority widens parent'
  )
  assertChildList(
    parent.connectors,
    child.connectors,
    connectorKey,
    'child Connector authority widens parent'
  )
  assertChildList(
    parent.productCommands,
    child.productCommands,
    productCommandKey,
    'child Product Command authority widens parent'
  )
  assertChildList(
    parent.credentialReferences,
    child.credentialReferences,
    credentialKey,
    'child credential authority widens parent'
  )
  assertScopeWithin(child.context.scope, parent.context.scope)
  assertRootsWithin(parent, child)
  assertBudgetWithin(parent.budget, child.budget)
  assertPolicyWithin(parent.policy, child.policy)
}

function assertChildModel(
  parent: ModelRuntimeManifest,
  child: ModelRuntimeManifest
): void {
  if (
    parent.providerId !== child.providerId ||
    parent.profileId !== child.profileId ||
    parent.modelId !== child.modelId
  ) {
    throw new DshSubagentRuntimeDeniedError(
      'child model authority widens parent'
    )
  }
}

function assertChildList<T>(
  parent: readonly T[],
  child: readonly T[],
  keyOf: (item: T) => string,
  message: string
): void {
  const parentKeys = new Set(parent.map(keyOf))
  for (const item of child) {
    if (!parentKeys.has(keyOf(item))) {
      throw new DshSubagentRuntimeDeniedError(message)
    }
  }
}

function assertScopeWithin(child: RuntimeScope, parent: RuntimeScope): void {
  if (parent.kind === 'global') return
  if (parent.kind === 'workspace') {
    if (
      (child.kind === 'workspace' ||
        child.kind === 'requirement' ||
        child.kind === 'requirement-node') &&
      child.workspaceId === parent.workspaceId
    ) {
      return
    }
  }
  if (parent.kind === 'requirement') {
    if (
      child.kind === 'requirement' &&
      child.workspaceId === parent.workspaceId &&
      child.requirementId === parent.requirementId
    ) {
      return
    }
    if (
      child.kind === 'requirement-node' &&
      child.workspaceId === parent.workspaceId &&
      child.requirementId === parent.requirementId
    ) {
      return
    }
  }
  if (
    parent.kind === 'requirement-node' &&
    child.kind === 'requirement-node' &&
    child.workspaceId === parent.workspaceId &&
    child.requirementId === parent.requirementId &&
    child.nodeRunId === parent.nodeRunId
  ) {
    return
  }
  if (
    parent.kind === 'schedule' &&
    child.kind === 'schedule' &&
    child.scheduleRunId === parent.scheduleRunId
  ) {
    return
  }
  throw new DshSubagentRuntimeDeniedError('child scope widens parent')
}

function assertRootsWithin(parent: DshRunManifest, child: DshRunManifest): void {
  for (const root of child.context.roots) {
    const parentRoot = parent.context.roots.find((candidate) =>
      isInsideRoot(root.path, candidate.path)
    )
    if (parentRoot === undefined) {
      throw new DshSubagentRuntimeDeniedError(
        'child filesystem authority widens parent'
      )
    }
    if (root.access === 'read-write' && parentRoot.access !== 'read-write') {
      throw new DshSubagentRuntimeDeniedError(
        'child filesystem authority widens parent'
      )
    }
  }
}

function assertBudgetWithin(
  parent: RuntimeBudgetManifest,
  child: RuntimeBudgetManifest
): void {
  for (const key of [
    'maxModelRequests',
    'maxToolCalls',
    'maxSubagents',
    'maxRuntimeMs',
    'maxRetries',
    'maxInputTokens',
    'maxOutputTokens',
    'maxCostUsd'
  ] as const) {
    if (child[key] > parent[key]) {
      throw new DshSubagentRuntimeDeniedError('child budget widens parent')
    }
  }
}

function assertPolicyWithin(
  parent: RuntimePolicyManifest,
  child: RuntimePolicyManifest
): void {
  if (riskRank(child.maximumRisk) > riskRank(parent.maximumRisk)) {
    throw new DshSubagentRuntimeDeniedError('child policy widens parent')
  }
  if (child.allowRuntimeWidening !== false || child.defaultDecision !== 'deny') {
    throw new DshSubagentRuntimeDeniedError('child policy widens parent')
  }
}

function toolKey(tool: ExecutableToolManifest): string {
  return `${tool.id}@${tool.version}:${tool.definitionDigest}`
}

function skillKey(skill: ExecutableSkillManifest): string {
  return `${skill.id}@${skill.version}:${skill.definitionDigest}`
}

function agentKey(agent: ExecutableAgentManifest): string {
  return `${agent.id}@${agent.version}:${agent.profileDigest}`
}

function mcpKey(server: ExecutableMcpManifest): string {
  return `${server.id}:${server.identityDigest}`
}

function connectorKey(connector: ExecutableConnectorManifest): string {
  return `${connector.id}:${connector.adapter.digest}`
}

function productCommandKey(grant: ProductCommandGrant): string {
  return `${grant.command}:${grant.grantId}`
}

function credentialKey(reference: CredentialReference): string {
  return `${reference.purpose}:${reference.ref}`
}

function riskRank(risk: RuntimePolicyManifest['maximumRisk']): number {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  }[risk]
}

function normalizePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function isInsideRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedRoot = normalizePath(root)
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  )
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DshRuntimeAuthorityDeniedError ||
    error instanceof DshSubagentRuntimeDeniedError
  )
}

function deniedReason(error: unknown): string {
  if (error instanceof DshRuntimeAuthorityDeniedError) {
    return error.event.reason
  }
  if (error instanceof Error) return error.message
  return String(error)
}
