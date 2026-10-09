import {
  cloneJsonObject,
  normalizeIdentifiers,
  normalizeStringArray,
  requireBoolean,
  requireDigest,
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireInteger,
  requireObject,
  requireSafeRelativePath,
  requireSemver,
  requireText,
  type JsonObject
} from './tool-protocol-validation'

export type ToolOrigin = 'builtin' | 'local_upload' | 'mcp'
export type ToolRisk = 'low' | 'medium' | 'high' | 'critical'
export type ToolDefinitionReference = {
  kind: 'tool' | 'skill'
  id: string
  version: string
  digest: string
}
export type ToolCapability =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'filesystem.delete'
  | 'process.discover'
  | 'process.execute'
  | 'process.manage'
  | 'repository.read'
  | 'repository.modify'
  | 'realmflow.read'
  | 'realmflow.write'
  | 'knowledge.read'
  | 'knowledge.write'
  | 'network.connect'
  | 'connector.use'
  | 'credential.use'
  | 'computer.observe'
  | 'computer.control'
  | 'clipboard.read'
  | 'clipboard.write'

export type ToolExecutorDefinition =
  | {
      kind: 'builtin'
      handler: string
      handlerVersion: string
    }
  | {
      kind: 'sandbox'
      runtime: 'python' | 'process'
      entryPath: string
      argumentsTemplate?: string[]
    }
  | {
      kind: 'mcp'
      serverRef: string
      remoteToolName: string
      protocolVersion: string
    }
  | {
      kind: 'computer'
      actionSet: string
      actionSetVersion: string
    }
  | {
      kind: 'connector'
      capabilityId: string
      capabilityVersion: string
      capabilityDigest: string
      actionId: string
    }

export type ToolDefinition = {
  schemaVersion: 1
  id: string
  version: string
  definitionDigest: string
  package: {
    packageId: string
    packageVersion: string
    packageDigest: string
  }
  origin: ToolOrigin
  name: string
  description: string
  tags: string[]
  executor: ToolExecutorDefinition
  inputSchema: JsonObject
  outputSchema: JsonObject
  capabilities: ToolCapability[]
  effects: string[]
  risk: ToolRisk
  invocation: {
    mode: 'unary' | 'streaming'
    idempotency: 'required' | 'supported' | 'none'
    cancellable: boolean
    resumable: boolean
  }
  resources: {
    timeoutMs: number
    maxOutputBytes: number
    maxMemoryMb?: number
    maxAttempts: number
  }
  discovery: {
    intents: string[]
    contexts: Array<
      'general' | 'space' | 'requirement' | 'workflow' | 'schedule'
    >
    requiresExplicitSelection?: boolean
  }
}

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
const ORIGINS = new Set<ToolOrigin>(['builtin', 'local_upload', 'mcp'])
const RISKS = new Set<ToolRisk>(['low', 'medium', 'high', 'critical'])
const CONTEXTS = new Set<ToolDefinition['discovery']['contexts'][number]>([
  'general',
  'space',
  'requirement',
  'workflow',
  'schedule'
])
const DEFINITION_REFERENCE_KINDS = new Set<
  ToolDefinitionReference['kind']
>(['tool', 'skill'])
const DEFINITION_REFERENCE_KEYS = new Set([
  'kind',
  'id',
  'version',
  'digest'
])
const DEFINITION_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'definitionDigest',
  'package',
  'origin',
  'name',
  'description',
  'tags',
  'executor',
  'inputSchema',
  'outputSchema',
  'capabilities',
  'effects',
  'risk',
  'invocation',
  'resources',
  'discovery'
])

export function normalizeToolDefinitionReference(
  value: unknown
): ToolDefinitionReference {
  try {
    const reference = requireObject(value, 'reference')
    requireExactKeys(
      reference,
      DEFINITION_REFERENCE_KEYS,
      'reference'
    )
    return {
      kind: requireEnum(
        reference.kind,
        DEFINITION_REFERENCE_KINDS,
        'kind'
      ),
      id: requireIdentifier(reference.id, 'ID'),
      version: requireSemver(reference.version, 'version'),
      digest: requireDigest(reference.digest, 'digest')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'is invalid'
    throw new Error(`Definition reference ${message}`)
  }
}

export function normalizeToolDefinition(value: unknown): ToolDefinition {
  try {
    const definition = requireObject(value, 'definition')
    requireExactKeys(definition, DEFINITION_KEYS, 'definition')
    if (definition.schemaVersion !== 1) {
      throw new Error('schema version is invalid')
    }
    const origin = requireEnum(definition.origin, ORIGINS, 'origin')
    const risk = requireEnum(definition.risk, RISKS, 'risk')
    const tags = normalizeStringArray(definition.tags, 'tags', {
      deduplicate: true
    }).map((tag) => requireIdentifier(tag, 'tag'))
    return {
      schemaVersion: 1,
      id: requireIdentifier(definition.id, 'ID'),
      version: requireSemver(definition.version, 'version'),
      definitionDigest: requireDigest(
        definition.definitionDigest,
        'definition digest'
      ),
      package: normalizePackage(definition.package),
      origin,
      name: requireText(definition.name, 'name'),
      description: requireText(definition.description, 'description', true),
      tags,
      executor: normalizeExecutor(definition.executor),
      inputSchema: cloneJsonObject(definition.inputSchema, 'input schema'),
      outputSchema: cloneJsonObject(definition.outputSchema, 'output schema'),
      capabilities: normalizeCapabilities(definition.capabilities),
      effects: normalizeIdentifiers(definition.effects, 'effects'),
      risk,
      invocation: normalizeInvocation(definition.invocation),
      resources: normalizeResources(definition.resources),
      discovery: normalizeDiscovery(definition.discovery)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'is invalid'
    if (message.startsWith('Tool definition')) throw error
    throw new Error(`Tool definition ${message}`)
  }
}

function normalizePackage(value: unknown): ToolDefinition['package'] {
  const packageReference = requireObject(value, 'package')
  requireExactKeys(
    packageReference,
    new Set(['packageId', 'packageVersion', 'packageDigest']),
    'package'
  )
  return {
    packageId: requireIdentifier(packageReference.packageId, 'package ID'),
    packageVersion: requireSemver(
      packageReference.packageVersion,
      'package version'
    ),
    packageDigest: requireDigest(
      packageReference.packageDigest,
      'package digest'
    )
  }
}

function normalizeExecutor(value: unknown): ToolExecutorDefinition {
  const executor = requireObject(value, 'executor')
  if (executor.kind === 'builtin') {
    requireExactKeys(
      executor,
      new Set(['kind', 'handler', 'handlerVersion']),
      'builtin executor'
    )
    return {
      kind: 'builtin',
      handler: requireIdentifier(executor.handler, 'builtin handler'),
      handlerVersion: requireSemver(
        executor.handlerVersion,
        'handler version'
      )
    }
  }
  if (executor.kind === 'sandbox') {
    requireExactKeys(
      executor,
      new Set(['kind', 'runtime', 'entryPath', 'argumentsTemplate']),
      'sandbox executor',
      new Set(['argumentsTemplate'])
    )
    if (executor.runtime !== 'python' && executor.runtime !== 'process') {
      throw new Error('Tool definition sandbox runtime is invalid')
    }
    const argumentsTemplate =
      executor.argumentsTemplate === undefined
        ? undefined
        : normalizeStringArray(executor.argumentsTemplate, 'arguments template', {
            sorted: false
          })
    return {
      kind: 'sandbox',
      runtime: executor.runtime,
      entryPath: requireSafeRelativePath(
        executor.entryPath,
        'sandbox entry path'
      ),
      ...(argumentsTemplate ? { argumentsTemplate } : {})
    }
  }
  if (executor.kind === 'mcp') {
    requireExactKeys(
      executor,
      new Set(['kind', 'serverRef', 'remoteToolName', 'protocolVersion']),
      'MCP executor'
    )
    return {
      kind: 'mcp',
      serverRef: requireIdentifier(executor.serverRef, 'MCP server'),
      remoteToolName: requireIdentifier(
        executor.remoteToolName,
        'MCP Tool name'
      ),
      protocolVersion: requireText(
        executor.protocolVersion,
        'MCP protocol version'
      )
    }
  }
  if (executor.kind === 'computer') {
    requireExactKeys(
      executor,
      new Set(['kind', 'actionSet', 'actionSetVersion']),
      'computer executor'
    )
    return {
      kind: 'computer',
      actionSet: requireIdentifier(executor.actionSet, 'action set'),
      actionSetVersion: requireSemver(
        executor.actionSetVersion,
        'action set version'
      )
    }
  }
  if (executor.kind === 'connector') {
    requireExactKeys(
      executor,
      new Set([
        'kind',
        'capabilityId',
        'capabilityVersion',
        'capabilityDigest',
        'actionId'
      ]),
      'Connector executor'
    )
    return {
      kind: 'connector',
      capabilityId: requireIdentifier(
        executor.capabilityId,
        'Connector capability ID'
      ),
      capabilityVersion: requireSemver(
        executor.capabilityVersion,
        'Connector capability version'
      ),
      capabilityDigest: requireDigest(
        executor.capabilityDigest,
        'Connector capability digest'
      ),
      actionId: requireIdentifier(
        executor.actionId,
        'Connector action ID'
      )
    }
  }
  throw new Error('Tool definition executor kind is invalid')
}

function normalizeCapabilities(value: unknown): ToolCapability[] {
  if (!Array.isArray(value)) {
    throw new Error('Tool definition capabilities are invalid')
  }
  const capabilities = value.map((capability) => {
    if (
      typeof capability !== 'string' ||
      !CAPABILITIES.has(capability as ToolCapability)
    ) {
      throw new Error('Tool definition capability is invalid')
    }
    return capability as ToolCapability
  })
  if (new Set(capabilities).size !== capabilities.length) {
    throw new Error('Tool definition capabilities are duplicated')
  }
  return [...capabilities].sort()
}

function normalizeInvocation(value: unknown): ToolDefinition['invocation'] {
  const invocation = requireObject(value, 'invocation')
  requireExactKeys(
    invocation,
    new Set(['mode', 'idempotency', 'cancellable', 'resumable']),
    'invocation'
  )
  if (invocation.mode !== 'unary' && invocation.mode !== 'streaming') {
    throw new Error('Tool definition invocation mode is invalid')
  }
  if (
    invocation.idempotency !== 'required' &&
    invocation.idempotency !== 'supported' &&
    invocation.idempotency !== 'none'
  ) {
    throw new Error('Tool definition idempotency mode is invalid')
  }
  return {
    mode: invocation.mode,
    idempotency: invocation.idempotency,
    cancellable: requireBoolean(invocation.cancellable, 'cancellable'),
    resumable: requireBoolean(invocation.resumable, 'resumable')
  }
}

function normalizeResources(value: unknown): ToolDefinition['resources'] {
  const resources = requireObject(value, 'resources')
  requireExactKeys(
    resources,
    new Set([
      'timeoutMs',
      'maxOutputBytes',
      'maxMemoryMb',
      'maxAttempts'
    ]),
    'resources',
    new Set(['maxMemoryMb'])
  )
  const maxMemoryMb =
    resources.maxMemoryMb === undefined
      ? undefined
      : requireInteger(resources.maxMemoryMb, 'memory limit', 16, 16_384)
  return {
    timeoutMs: requireInteger(
      resources.timeoutMs,
      'timeout',
      1,
      3_600_000
    ),
    maxOutputBytes: requireInteger(
      resources.maxOutputBytes,
      'output limit',
      1,
      16_777_216
    ),
    ...(maxMemoryMb === undefined ? {} : { maxMemoryMb }),
    maxAttempts: requireInteger(resources.maxAttempts, 'attempt count', 1, 3)
  }
}

function normalizeDiscovery(value: unknown): ToolDefinition['discovery'] {
  const discovery = requireObject(value, 'discovery')
  requireExactKeys(
    discovery,
    new Set(['intents', 'contexts', 'requiresExplicitSelection']),
    'discovery',
    new Set(['requiresExplicitSelection'])
  )
  const intents = normalizeStringArray(discovery.intents, 'intents')
  if (!Array.isArray(discovery.contexts)) {
    throw new Error('Tool definition discovery contexts are invalid')
  }
  const contexts = discovery.contexts.map((context) => {
    if (
      typeof context !== 'string' ||
      !CONTEXTS.has(context as ToolDefinition['discovery']['contexts'][number])
    ) {
      throw new Error('Tool definition discovery context is invalid')
    }
    return context as ToolDefinition['discovery']['contexts'][number]
  })
  if (
    contexts.length === 0 ||
    new Set(contexts).size !== contexts.length
  ) {
    throw new Error('Tool definition discovery contexts are invalid')
  }
  const requiresExplicitSelection =
    discovery.requiresExplicitSelection === undefined
      ? undefined
      : requireBoolean(
          discovery.requiresExplicitSelection,
          'explicit selection'
        )
  return {
    intents,
    contexts: [...contexts].sort(),
    ...(requiresExplicitSelection === undefined
      ? {}
      : { requiresExplicitSelection })
  }
}
