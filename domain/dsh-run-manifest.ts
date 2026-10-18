import { createHash } from 'node:crypto'
import { DSH_RUN_MANIFEST_SCHEMA_VERSION } from '../shared/dsh-run-manifest-schema'
import type {
  ToolCapability,
  ToolDefinitionReference,
  ToolRisk
} from './tool-definition'
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

export const DSH_RUNTIME_PACKAGE = '@deepseek-ai/dsh'
export const DSH_RUNTIME_VERSION = '0.2.1-alpha.3'
export const ACP_SDK_VERSION = '1.4.0'

export type DshRunManifest = DshRunManifestDraft & {
  digest: string
}

export type DshRunManifestDraft = {
  schemaVersion: typeof DSH_RUN_MANIFEST_SCHEMA_VERSION
  manifestId: string
  runId: string
  sessionId: string
  owner: DshRunOwner
  model: ModelRuntimeManifest
  tools: ExecutableToolManifest[]
  skills: ExecutableSkillManifest[]
  agents: ExecutableAgentManifest[]
  mcpServers: ExecutableMcpManifest[]
  connectors: ExecutableConnectorManifest[]
  context: ContextAccessManifest
  knowledge: KnowledgeRuntimeManifest
  policy: RuntimePolicyManifest
  budget: RuntimeBudgetManifest
  productCommands: ProductCommandGrant[]
  credentialReferences: CredentialReference[]
}

export type DshRunOwner = {
  conversationId?: string
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  scheduleRunId?: string
}

export type ContentAddressedPackageRef = {
  packageId: string
  version: string
  digest: string
}

export type RuntimeScope =
  | { kind: 'global' }
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'requirement'; workspaceId: string; requirementId: string }
  | {
      kind: 'requirement-node'
      workspaceId: string
      requirementId: string
      nodeRunId: string
    }
  | { kind: 'schedule'; scheduleRunId: string }

export type ModelRuntimeManifest = {
  kind: 'model'
  providerId: string
  providerType:
    | 'openai_completions'
    | 'openai_responses'
    | 'anthropic_messages'
    | 'azure_openai_responses'
    | 'bedrock_converse_stream'
    | 'google_generative_ai'
    | 'openai_codex_responses'
    | 'local'
  profileId: string
  modelId: string
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high'
  credentialRef?: string
  options: JsonObject
}

export type ExecutableToolManifest = {
  kind: 'tool'
  id: string
  version: string
  definitionDigest: string
  package: ContentAddressedPackageRef
  entrypoint:
    | {
        kind: 'builtin'
        handler: string
        handlerVersion: string
      }
    | {
        kind: 'sandbox'
        runtime: 'node' | 'python' | 'process'
        entrypoint: string
        arguments?: string[]
      }
    | {
        kind: 'mcp'
        serverId: string
        toolName: string
      }
    | {
        kind: 'computer'
        actionSet: string
        actionSetVersion: string
      }
    | {
        kind: 'connector'
        connectorId: string
        actionId: string
      }
  capabilities: ToolCapability[]
  risk: ToolRisk
}

export type ExecutableSkillManifest = {
  kind: 'skill'
  id: string
  version: string
  definitionDigest: string
  package: ContentAddressedPackageRef
  entrypoint:
    | { kind: 'instruction'; instructionsPath: string }
    | { kind: 'workflow'; workflowDigest: string }
    | {
        kind: 'executable'
        runtime: 'node' | 'python'
        entrypoint: string
        capabilities: ToolCapability[]
        connectorServices: string[]
        resources: {
          maxMemoryMb: number
          maxOutputBytes: number
        }
      }
  requiredToolRefs: ToolDefinitionReference[]
}

export type ExecutableAgentManifest = {
  kind: 'agent'
  id: string
  version: string
  profileDigest: string
  promptDigest: string
  policyDigest: string
  maxDelegationDepth: number
}

export type ExecutableMcpManifest = {
  kind: 'mcp-server'
  id: string
  identityDigest: string
  transport:
    | {
        kind: 'stdio'
        command: string
        commandDigest: string
        arguments: string[]
      }
    | {
        kind: 'streamable_http'
        url: string
      }
  credentialRefs: string[]
}

export type ConnectorAdapterManifest = {
  adapterId: string
  version: string
  digest: string
  entrypoint: string
}

export type ConnectorAuthenticationManifest =
  | { kind: 'none' }
  | { kind: 'credential-reference'; ref: string }

export type ExecutableConnectorManifest =
  | {
      kind: 'connector'
      id: string
      type: 'http'
      baseUrl: string
      adapter: ConnectorAdapterManifest
      authentication: ConnectorAuthenticationManifest
    }
  | {
      kind: 'connector'
      id: string
      type: 'database' | 'cli'
      adapter: ConnectorAdapterManifest
      authentication: ConnectorAuthenticationManifest
    }

export type ContextAccessManifest = {
  kind: 'context-access'
  scope: RuntimeScope
  roots: Array<{
    rootId: string
    path: string
    access: 'read-only' | 'read-write'
  }>
  attachments: Array<{
    attachmentId: string
    kind: 'file' | 'image' | 'resource_link'
    path?: string
    uri?: string
    digest?: string
  }>
  customInstructionsDigest?: string
}

export type KnowledgeRuntimeManifest = {
  kind: 'knowledge-runtime'
  enabled: boolean
  scope:
    | { kind: 'none' }
    | { kind: 'all-spaces' }
    | { kind: 'workspace'; workspaceId: string }
  snapshotId: string
  workspaceIds: string[]
  generationIds: string[]
  sourceKinds?: string[]
  requirementId?: string
  embeddingProfile: {
    provider: 'local' | 'remote'
    model: string
    revision: string
    dimensions: number
    normalization: 'L2'
    distance: 'Cosine'
    profileDigest: string
  }
  indexLease: {
    leaseId: string
    collection: string
    expiresAt: number
  }
  limits: {
    maxQueries: number
    topKPerQuery: number
    maxReturnedChunks: number
    maxContextCharacters: number
  }
}

export type RuntimePolicyManifest = {
  kind: 'runtime-policy'
  approvalMode: 'cautious' | 'protected' | 'trusted' | 'manual'
  defaultDecision: 'deny'
  allowRuntimeWidening: false
  toolPolicyDigest: string
  maximumRisk: ToolRisk
}

export type RuntimeBudgetManifest = {
  kind: 'runtime-budget'
  maxModelRequests: number
  maxToolCalls: number
  maxSubagents: number
  maxRuntimeMs: number
  maxRetries: number
  maxInputTokens: number
  maxOutputTokens: number
  maxCostUsd: number
}

export type ProductCommandGrant = {
  kind: 'product-command'
  grantId: string
  command: string
  scope: RuntimeScope
  inputSchemaDigest: string
  maxInvocations: number
}

export type CredentialReference = {
  kind: 'credential-reference'
  ref: string
  purpose:
    | 'model'
    | 'mcp'
    | 'connector'
    | 'embedding'
    | 'product-command'
    | 'web'
    | 'product-service'
}

const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'manifestId',
  'runId',
  'sessionId',
  'owner',
  'model',
  'tools',
  'skills',
  'agents',
  'mcpServers',
  'connectors',
  'context',
  'knowledge',
  'policy',
  'budget',
  'productCommands',
  'credentialReferences'
])
const ACCEPTED_MANIFEST_KEYS = new Set([...MANIFEST_KEYS, 'digest'])
const OWNER_KEYS = new Set([
  'conversationId',
  'workspaceId',
  'requirementId',
  'nodeRunId',
  'scheduleRunId'
])
const PACKAGE_KEYS = new Set(['packageId', 'version', 'digest'])
const MODEL_KEYS = new Set([
  'kind',
  'providerId',
  'providerType',
  'profileId',
  'modelId',
  'reasoningEffort',
  'credentialRef',
  'options'
])
const MODEL_PROVIDER_TYPES = new Set<ModelRuntimeManifest['providerType']>([
  'openai_completions',
  'openai_responses',
  'anthropic_messages',
  'azure_openai_responses',
  'bedrock_converse_stream',
  'google_generative_ai',
  'openai_codex_responses',
  'local'
])
const REASONING_EFFORTS = new Set<
  NonNullable<ModelRuntimeManifest['reasoningEffort']>
>(['off', 'low', 'medium', 'high'])
const TOOL_KEYS = new Set([
  'kind',
  'id',
  'version',
  'definitionDigest',
  'package',
  'entrypoint',
  'capabilities',
  'risk'
])
const SKILL_KEYS = new Set([
  'kind',
  'id',
  'version',
  'definitionDigest',
  'package',
  'entrypoint',
  'requiredToolRefs'
])
const AGENT_KEYS = new Set([
  'kind',
  'id',
  'version',
  'profileDigest',
  'promptDigest',
  'policyDigest',
  'maxDelegationDepth'
])
const MCP_KEYS = new Set([
  'kind',
  'id',
  'identityDigest',
  'transport',
  'credentialRefs'
])
const CONNECTOR_TYPES = new Set<ExecutableConnectorManifest['type']>([
  'http',
  'database',
  'cli'
])
const CONNECTOR_COMMON_KEYS = new Set([
  'kind',
  'id',
  'type',
  'adapter',
  'authentication'
])
const HTTP_CONNECTOR_KEYS = new Set([...CONNECTOR_COMMON_KEYS, 'baseUrl'])
const CONTEXT_KEYS = new Set([
  'kind',
  'scope',
  'roots',
  'attachments',
  'customInstructionsDigest'
])
const KNOWLEDGE_KEYS = new Set([
  'kind',
  'enabled',
  'scope',
  'snapshotId',
  'workspaceIds',
  'generationIds',
  'sourceKinds',
  'requirementId',
  'embeddingProfile',
  'indexLease',
  'limits'
])
const POLICY_KEYS = new Set([
  'kind',
  'approvalMode',
  'defaultDecision',
  'allowRuntimeWidening',
  'toolPolicyDigest',
  'maximumRisk'
])
const BUDGET_KEYS = new Set([
  'kind',
  'maxModelRequests',
  'maxToolCalls',
  'maxSubagents',
  'maxRuntimeMs',
  'maxRetries',
  'maxInputTokens',
  'maxOutputTokens',
  'maxCostUsd'
])
const PRODUCT_COMMAND_KEYS = new Set([
  'kind',
  'grantId',
  'command',
  'scope',
  'inputSchemaDigest',
  'maxInvocations'
])
const CREDENTIAL_REFERENCE_KEYS = new Set(['kind', 'ref', 'purpose'])
const TOOL_CAPABILITIES = new Set<ToolCapability>([
  'filesystem.read',
  'filesystem.write',
  'filesystem.delete',
  'process.inspect',
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
const APPROVAL_MODES = new Set<RuntimePolicyManifest['approvalMode']>([
  'cautious',
  'protected',
  'trusted',
  'manual'
])
const CREDENTIAL_PURPOSES = new Set<CredentialReference['purpose']>([
  'model',
  'mcp',
  'connector',
  'embedding',
  'product-command',
  'web',
  'product-service'
])
const CREDENTIAL_REF = /^credential-[A-Za-z0-9._:-]{1,190}$/
const MODEL_PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const ATTACHMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const MODEL_PROVIDER_CREDENTIAL_REF_PREFIX = 'credential-model-provider:'
const RAW_SECRET_VALUE = /^(?:sk-|Bearer\s+|AKIA|eyJ[A-Za-z0-9_-]*\.)/
const PRODUCT_COMMAND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

export function modelProviderCredentialRef(providerId: string): string {
  return `${MODEL_PROVIDER_CREDENTIAL_REF_PREFIX}${requireIdentifier(
    providerId,
    'model provider ID'
  )}`
}

export function modelProviderIdFromCredentialRef(
  credentialRef: string
): string | undefined {
  const normalized = requireCredentialRef(credentialRef, 'model credential ref')
  if (!normalized.startsWith(MODEL_PROVIDER_CREDENTIAL_REF_PREFIX)) {
    return undefined
  }
  return requireIdentifier(
    normalized.slice(MODEL_PROVIDER_CREDENTIAL_REF_PREFIX.length),
    'model provider ID'
  )
}

export function sealDshRunManifest(
  input: DshRunManifestDraft
): DshRunManifest {
  assertNoRawSecrets(input)
  const draft = normalizeManifestDraft(input)
  const digest = digestManifestDraft(draft)
  return deepFreeze({
    ...draft,
    digest
  })
}

export function validateDshRunManifest(value: unknown): DshRunManifest {
  assertNoRawSecrets(value)
  const manifest = requireObject(value, 'Run manifest')
  requireExactKeys(manifest, ACCEPTED_MANIFEST_KEYS, 'Run manifest')
  const digest = requireDigest(manifest.digest, 'manifest digest')
  const draft = normalizeManifestDraft(withoutDigest(manifest))
  const actualDigest = digestManifestDraft(draft)
  if (digest !== actualDigest) {
    throw new Error('Run manifest digest mismatch')
  }
  return deepFreeze({
    ...draft,
    digest
  })
}

export function canonicalizeDshRunManifest(
  value: DshRunManifest | DshRunManifestDraft
): string {
  const draft = 'digest' in value ? withoutDigest(value) : value
  return canonicalJson(normalizeManifestDraft(draft))
}

function normalizeManifestDraft(value: unknown): DshRunManifestDraft {
  const manifest = requireObject(value, 'Run manifest')
  requireExactKeys(manifest, MANIFEST_KEYS, 'Run manifest')
  if (manifest.schemaVersion !== DSH_RUN_MANIFEST_SCHEMA_VERSION) {
    throw new Error('Run manifest schemaVersion is invalid')
  }
  return {
    schemaVersion: DSH_RUN_MANIFEST_SCHEMA_VERSION,
    manifestId: requireIdentifier(manifest.manifestId, 'manifest ID'),
    runId: requireIdentifier(manifest.runId, 'run ID'),
    sessionId: requireIdentifier(manifest.sessionId, 'session ID'),
    owner: normalizeOwner(manifest.owner),
    model: normalizeModel(manifest.model),
    tools: normalizeArray(manifest.tools, 'tools', normalizeTool),
    skills: normalizeArray(manifest.skills, 'skills', normalizeSkill),
    agents: normalizeArray(manifest.agents, 'agents', normalizeAgent),
    mcpServers: normalizeArray(
      manifest.mcpServers,
      'MCP servers',
      normalizeMcpServer
    ),
    connectors: normalizeArray(
      manifest.connectors,
      'connectors',
      normalizeConnector
    ),
    context: normalizeContext(manifest.context),
    knowledge: normalizeKnowledge(manifest.knowledge),
    policy: normalizePolicy(manifest.policy),
    budget: normalizeBudget(manifest.budget),
    productCommands: normalizeArray(
      manifest.productCommands,
      'product commands',
      normalizeProductCommand
    ),
    credentialReferences: normalizeArray(
      manifest.credentialReferences,
      'credential references',
      normalizeCredentialReference
    )
  }
}

function normalizeOwner(value: unknown): DshRunOwner {
  const owner = requireObject(value, 'run owner')
  requireExactKeys(owner, OWNER_KEYS, 'run owner', OWNER_KEYS)
  const normalized: DshRunOwner = {}
  for (const key of OWNER_KEYS) {
    if (owner[key] !== undefined) {
      normalized[key as keyof DshRunOwner] = requireIdentifier(
        owner[key],
        `${key}`
      )
    }
  }
  if (Object.keys(normalized).length === 0) {
    throw new Error('Run manifest owner is required')
  }
  return normalized
}

function normalizeModel(value: unknown): ModelRuntimeManifest {
  const model = requireObject(value, 'model manifest')
  requireExactKeys(
    model,
    MODEL_KEYS,
    'model manifest',
    new Set(['reasoningEffort', 'credentialRef'])
  )
  if (model.kind !== 'model') throw new Error('model manifest kind is invalid')
  const reasoningEffort =
    model.reasoningEffort === undefined
      ? undefined
      : requireEnum(model.reasoningEffort, REASONING_EFFORTS, 'reasoning effort')
  const credentialRef =
    model.credentialRef === undefined
      ? undefined
      : requireCredentialRef(model.credentialRef, 'model credential ref')
  return {
    kind: 'model',
    providerId: requireIdentifier(model.providerId, 'provider ID'),
    providerType: requireEnum(
      model.providerType,
      MODEL_PROVIDER_TYPES,
      'provider type'
    ),
    profileId: requireModelProfileId(model.profileId),
    modelId: requireText(model.modelId, 'model ID'),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(credentialRef ? { credentialRef } : {}),
    options: cloneJsonObject(model.options, 'model options')
  }
}

function normalizeTool(value: unknown): ExecutableToolManifest {
  const tool = requireObject(value, 'Tool manifest')
  requireExactKeys(tool, TOOL_KEYS, 'Tool manifest')
  if (tool.kind !== 'tool') throw new Error('Tool manifest kind is invalid')
  return {
    kind: 'tool',
    id: requireIdentifier(tool.id, 'Tool ID'),
    version: requireSemver(tool.version, 'Tool version'),
    definitionDigest: requireDigest(
      tool.definitionDigest,
      'Tool definition digest'
    ),
    package: normalizePackage(tool.package),
    entrypoint: normalizeToolEntrypoint(tool.entrypoint),
    capabilities: normalizeCapabilities(tool.capabilities),
    risk: requireEnum(tool.risk, RISKS, 'Tool risk')
  }
}

function normalizeToolEntrypoint(
  value: unknown
): ExecutableToolManifest['entrypoint'] {
  const entrypoint = requireObject(value, 'Tool entrypoint')
  if (entrypoint.kind === 'builtin') {
    requireExactKeys(
      entrypoint,
      new Set(['kind', 'handler', 'handlerVersion']),
      'Tool builtin entrypoint'
    )
    return {
      kind: 'builtin',
      handler: requireIdentifier(entrypoint.handler, 'Tool handler'),
      handlerVersion: requireSemver(
        entrypoint.handlerVersion,
        'Tool handler version'
      )
    }
  }
  if (entrypoint.kind === 'sandbox') {
    requireExactKeys(
      entrypoint,
      new Set(['kind', 'runtime', 'entrypoint', 'arguments']),
      'Tool sandbox entrypoint',
      new Set(['arguments'])
    )
    const runtime = requireEnum(
      entrypoint.runtime,
      new Set(['node', 'python', 'process'] as const),
      'Tool sandbox runtime'
    )
    const args =
      entrypoint.arguments === undefined
        ? undefined
        : normalizeStringArray(entrypoint.arguments, 'Tool arguments', {
            sorted: false
          })
    return {
      kind: 'sandbox',
      runtime,
      entrypoint: requireSafeRelativePath(
        entrypoint.entrypoint,
        'Tool entrypoint'
      ),
      ...(args ? { arguments: args } : {})
    }
  }
  if (entrypoint.kind === 'mcp') {
    requireExactKeys(
      entrypoint,
      new Set(['kind', 'serverId', 'toolName']),
      'Tool MCP entrypoint'
    )
    return {
      kind: 'mcp',
      serverId: requireIdentifier(entrypoint.serverId, 'MCP server ID'),
      toolName: requireIdentifier(entrypoint.toolName, 'MCP Tool name')
    }
  }
  if (entrypoint.kind === 'computer') {
    requireExactKeys(
      entrypoint,
      new Set(['kind', 'actionSet', 'actionSetVersion']),
      'Tool computer entrypoint'
    )
    return {
      kind: 'computer',
      actionSet: requireIdentifier(entrypoint.actionSet, 'computer action set'),
      actionSetVersion: requireSemver(
        entrypoint.actionSetVersion,
        'computer action set version'
      )
    }
  }
  if (entrypoint.kind === 'connector') {
    requireExactKeys(
      entrypoint,
      new Set(['kind', 'connectorId', 'actionId']),
      'Tool connector entrypoint'
    )
    return {
      kind: 'connector',
      connectorId: requireIdentifier(entrypoint.connectorId, 'connector ID'),
      actionId: requireIdentifier(entrypoint.actionId, 'connector action ID')
    }
  }
  throw new Error('Tool entrypoint kind is invalid')
}

function normalizeSkill(value: unknown): ExecutableSkillManifest {
  const skill = requireObject(value, 'Skill manifest')
  requireExactKeys(skill, SKILL_KEYS, 'Skill manifest')
  if (skill.kind !== 'skill') throw new Error('Skill manifest kind is invalid')
  return {
    kind: 'skill',
    id: requireIdentifier(skill.id, 'Skill ID'),
    version: requireSemver(skill.version, 'Skill version'),
    definitionDigest: requireDigest(
      skill.definitionDigest,
      'Skill definition digest'
    ),
    package: normalizePackage(skill.package),
    entrypoint: normalizeSkillEntrypoint(skill.entrypoint),
    requiredToolRefs: normalizeToolReferences(skill.requiredToolRefs)
  }
}

function normalizeSkillEntrypoint(
  value: unknown
): ExecutableSkillManifest['entrypoint'] {
  const entrypoint = requireObject(value, 'Skill entrypoint')
  if (entrypoint.kind === 'instruction') {
    requireExactKeys(
      entrypoint,
      new Set(['kind', 'instructionsPath']),
      'Skill instruction entrypoint'
    )
    return {
      kind: 'instruction',
      instructionsPath: requireSafeRelativePath(
        entrypoint.instructionsPath,
        'Skill instructions path'
      )
    }
  }
  if (entrypoint.kind === 'workflow') {
    requireExactKeys(
      entrypoint,
      new Set(['kind', 'workflowDigest']),
      'Skill workflow entrypoint'
    )
    return {
      kind: 'workflow',
      workflowDigest: requireDigest(
        entrypoint.workflowDigest,
        'Skill workflow digest'
      )
    }
  }
  if (entrypoint.kind === 'executable') {
    requireExactKeys(
      entrypoint,
      new Set([
        'kind',
        'runtime',
        'entrypoint',
        'capabilities',
        'connectorServices',
        'resources'
      ]),
      'Skill executable entrypoint'
    )
    return {
      kind: 'executable',
      runtime: requireEnum(
        entrypoint.runtime,
        new Set(['node', 'python'] as const),
        'Skill runtime'
      ),
      entrypoint: requireSafeRelativePath(
        entrypoint.entrypoint,
        'Skill executable entrypoint'
      ),
      capabilities: normalizeCapabilities(entrypoint.capabilities),
      connectorServices: normalizeIdentifiers(
        entrypoint.connectorServices,
        'connector services'
      ),
      resources: normalizeSkillResources(entrypoint.resources)
    }
  }
  throw new Error('Skill entrypoint kind is invalid')
}

function normalizeSkillResources(
  value: unknown
): Extract<
  ExecutableSkillManifest['entrypoint'],
  { kind: 'executable' }
>['resources'] {
  const resources = requireObject(value, 'Skill resources')
  requireExactKeys(
    resources,
    new Set(['maxMemoryMb', 'maxOutputBytes']),
    'Skill resources'
  )
  return {
    maxMemoryMb: requireInteger(
      resources.maxMemoryMb,
      'Skill max memory',
      1,
      32_768
    ),
    maxOutputBytes: requireInteger(
      resources.maxOutputBytes,
      'Skill max output bytes',
      1,
      128 * 1024 * 1024
    )
  }
}

function normalizeAgent(value: unknown): ExecutableAgentManifest {
  const agent = requireObject(value, 'Agent manifest')
  requireExactKeys(agent, AGENT_KEYS, 'Agent manifest')
  if (agent.kind !== 'agent') throw new Error('Agent manifest kind is invalid')
  return {
    kind: 'agent',
    id: requireIdentifier(agent.id, 'Agent ID'),
    version: requireSemver(agent.version, 'Agent version'),
    profileDigest: requireDigest(agent.profileDigest, 'Agent profile digest'),
    promptDigest: requireDigest(agent.promptDigest, 'Agent prompt digest'),
    policyDigest: requireDigest(agent.policyDigest, 'Agent policy digest'),
    maxDelegationDepth: requireInteger(
      agent.maxDelegationDepth,
      'Agent max delegation depth',
      0,
      16
    )
  }
}

function normalizeMcpServer(value: unknown): ExecutableMcpManifest {
  const server = requireObject(value, 'MCP manifest')
  requireExactKeys(server, MCP_KEYS, 'MCP manifest')
  if (server.kind !== 'mcp-server') {
    throw new Error('MCP manifest kind is invalid')
  }
  return {
    kind: 'mcp-server',
    id: requireIdentifier(server.id, 'MCP server ID'),
    identityDigest: requireDigest(
      server.identityDigest,
      'MCP server identity digest'
    ),
    transport: normalizeMcpTransport(server.transport),
    credentialRefs: normalizeCredentialRefs(server.credentialRefs)
  }
}

function normalizeMcpTransport(
  value: unknown
): ExecutableMcpManifest['transport'] {
  const transport = requireObject(value, 'MCP transport')
  if (transport.kind === 'stdio') {
    requireExactKeys(
      transport,
      new Set(['kind', 'command', 'commandDigest', 'arguments']),
      'MCP stdio transport'
    )
    const command = requireText(transport.command, 'MCP command')
    if (!isAbsolutePath(command)) {
      throw new Error('MCP command must be absolute')
    }
    return {
      kind: 'stdio',
      command: normalizePath(command),
      commandDigest: requireDigest(
        transport.commandDigest,
        'MCP command digest'
      ),
      arguments: normalizeStringArray(transport.arguments, 'MCP arguments', {
        sorted: false
      })
    }
  }
  if (transport.kind === 'streamable_http') {
    requireExactKeys(
      transport,
      new Set(['kind', 'url']),
      'MCP HTTP transport'
    )
    return {
      kind: 'streamable_http',
      url: normalizeHttpsOrLoopbackUrl(transport.url, 'MCP URL')
    }
  }
  throw new Error('MCP transport kind is invalid')
}

function normalizeConnector(value: unknown): ExecutableConnectorManifest {
  const connector = requireObject(value, 'Connector manifest')
  if (connector.kind !== 'connector') {
    throw new Error('Connector manifest kind is invalid')
  }
  const connectorType = requireEnum(
    connector.type,
    CONNECTOR_TYPES,
    'Connector manifest type'
  )
  requireExactKeys(
    connector,
    connectorType === 'http' ? HTTP_CONNECTOR_KEYS : CONNECTOR_COMMON_KEYS,
    'Connector manifest'
  )
  const base = {
    kind: 'connector' as const,
    id: requireIdentifier(connector.id, 'Connector ID'),
    adapter: normalizeConnectorAdapter(connector.adapter),
    authentication: normalizeConnectorAuthentication(connector.authentication)
  }
  if (connectorType !== 'http') {
    return {
      ...base,
      type: connectorType
    }
  }
  return {
    ...base,
    type: 'http',
    baseUrl: normalizeHttpsOrLoopbackUrl(connector.baseUrl, 'Connector URL')
  }
}

function normalizeConnectorAdapter(
  value: unknown
): ConnectorAdapterManifest {
  const adapter = requireObject(value, 'Connector adapter')
  requireExactKeys(
    adapter,
    new Set(['adapterId', 'version', 'digest', 'entrypoint']),
    'Connector adapter'
  )
  return {
    adapterId: requireIdentifier(adapter.adapterId, 'Connector adapter ID'),
    version: requireSemver(adapter.version, 'Connector adapter version'),
    digest: requireDigest(adapter.digest, 'Connector adapter digest'),
    entrypoint: requireSafeRelativePath(
      adapter.entrypoint,
      'Connector adapter entrypoint'
    )
  }
}

function normalizeConnectorAuthentication(
  value: unknown
): ConnectorAuthenticationManifest {
  const authentication = requireObject(value, 'Connector authentication')
  if (authentication.kind === 'none') {
    requireExactKeys(authentication, new Set(['kind']), 'Connector auth')
    return { kind: 'none' }
  }
  if (authentication.kind === 'credential-reference') {
    requireExactKeys(
      authentication,
      new Set(['kind', 'ref']),
      'Connector auth'
    )
    return {
      kind: 'credential-reference',
      ref: requireCredentialRef(authentication.ref, 'Connector credential ref')
    }
  }
  throw new Error('Connector authentication kind is invalid')
}

function normalizeContext(value: unknown): ContextAccessManifest {
  const context = requireObject(value, 'context manifest')
  requireExactKeys(
    context,
    CONTEXT_KEYS,
    'context manifest',
    new Set(['customInstructionsDigest'])
  )
  if (context.kind !== 'context-access') {
    throw new Error('context manifest kind is invalid')
  }
  const roots = normalizeArray(context.roots, 'context roots', normalizeRoot)
  const attachments = normalizeArray(
    context.attachments,
    'context attachments',
    (attachment) => normalizeAttachment(attachment, roots)
  )
  const customInstructionsDigest =
    context.customInstructionsDigest === undefined
      ? undefined
      : requireDigest(
          context.customInstructionsDigest,
          'custom instructions digest'
        )
  return {
    kind: 'context-access',
    scope: normalizeScope(context.scope),
    roots,
    attachments,
    ...(customInstructionsDigest ? { customInstructionsDigest } : {})
  }
}

function normalizeRoot(
  value: unknown
): ContextAccessManifest['roots'][number] {
  const root = requireObject(value, 'context root')
  requireExactKeys(
    root,
    new Set(['rootId', 'path', 'access']),
    'context root'
  )
  const path = normalizePath(requireText(root.path, 'context root path'))
  if (!isAbsolutePath(path)) {
    throw new Error('context root path must be absolute')
  }
  return {
    rootId: requireIdentifier(root.rootId, 'context root ID'),
    path,
    access: requireEnum(
      root.access,
      new Set(['read-only', 'read-write'] as const),
      'context root access'
    )
  }
}

function normalizeAttachment(
  value: unknown,
  roots: ContextAccessManifest['roots']
): ContextAccessManifest['attachments'][number] {
  const attachment = requireObject(value, 'context attachment')
  requireExactKeys(
    attachment,
    new Set(['attachmentId', 'kind', 'path', 'uri', 'digest']),
    'context attachment',
    new Set(['path', 'uri', 'digest'])
  )
  const kind = requireEnum(
    attachment.kind,
    new Set(['file', 'image', 'resource_link'] as const),
    'attachment kind'
  )
  const path =
    attachment.path === undefined
      ? undefined
      : normalizeAttachmentPath(attachment.path, roots)
  const uri =
    attachment.uri === undefined
      ? undefined
      : requireText(attachment.uri, 'attachment URI')
  const digest =
    attachment.digest === undefined
      ? undefined
      : requireDigest(attachment.digest, 'attachment digest')
  if (kind === 'file' && !path) {
    throw new Error('context attachment path is required')
  }
  if (kind === 'image' && !path && !digest) {
    throw new Error('context image attachment digest is required')
  }
  if (kind === 'resource_link' && !uri) {
    throw new Error('context attachment URI is required')
  }
  return {
    attachmentId: requireAttachmentId(
      attachment.attachmentId,
      'attachment ID'
    ),
    kind,
    ...(path ? { path } : {}),
    ...(uri ? { uri } : {}),
    ...(digest ? { digest } : {})
  }
}

function normalizeAttachmentPath(
  value: unknown,
  roots: ContextAccessManifest['roots']
): string {
  const path = normalizePath(requireText(value, 'attachment path'))
  if (!isAbsolutePath(path)) {
    return requireSafeRelativePath(path, 'attachment path')
  }
  if (!roots.some((root) => isInsideRoot(path, root.path))) {
    throw new Error('context attachment path is outside granted roots')
  }
  return path
}

function normalizeKnowledge(value: unknown): KnowledgeRuntimeManifest {
  const knowledge = requireObject(value, 'knowledge manifest')
  requireExactKeys(
    knowledge,
    KNOWLEDGE_KEYS,
    'knowledge manifest',
    new Set(['sourceKinds', 'requirementId'])
  )
  if (knowledge.kind !== 'knowledge-runtime') {
    throw new Error('knowledge manifest kind is invalid')
  }
  const sourceKinds =
    knowledge.sourceKinds === undefined
      ? undefined
      : normalizeIdentifiers(knowledge.sourceKinds, 'knowledge source kinds')
  const requirementId =
    knowledge.requirementId === undefined
      ? undefined
      : requireIdentifier(knowledge.requirementId, 'knowledge requirement ID')
  return {
    kind: 'knowledge-runtime',
    enabled: requireBoolean(knowledge.enabled, 'knowledge enabled'),
    scope: normalizeKnowledgeScope(knowledge.scope),
    snapshotId: requireIdentifier(knowledge.snapshotId, 'knowledge snapshot ID'),
    workspaceIds: normalizeIdentifiers(
      knowledge.workspaceIds,
      'knowledge workspace IDs'
    ),
    generationIds: normalizeIdentifiers(
      knowledge.generationIds,
      'knowledge generation IDs'
    ),
    ...(sourceKinds ? { sourceKinds } : {}),
    ...(requirementId ? { requirementId } : {}),
    embeddingProfile: normalizeEmbeddingProfile(knowledge.embeddingProfile),
    indexLease: normalizeIndexLease(knowledge.indexLease),
    limits: normalizeKnowledgeLimits(knowledge.limits)
  }
}

function normalizeKnowledgeScope(
  value: unknown
): KnowledgeRuntimeManifest['scope'] {
  const scope = requireObject(value, 'knowledge scope')
  if (scope.kind === 'none' || scope.kind === 'all-spaces') {
    requireExactKeys(scope, new Set(['kind']), 'knowledge scope')
    return { kind: scope.kind }
  }
  if (scope.kind === 'workspace') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workspaceId']),
      'knowledge scope'
    )
    return {
      kind: 'workspace',
      workspaceId: requireIdentifier(scope.workspaceId, 'workspace ID')
    }
  }
  throw new Error('knowledge scope kind is invalid')
}

function normalizeEmbeddingProfile(
  value: unknown
): KnowledgeRuntimeManifest['embeddingProfile'] {
  const profile = requireObject(value, 'embedding profile')
  requireExactKeys(
    profile,
    new Set([
      'provider',
      'model',
      'revision',
      'dimensions',
      'normalization',
      'distance',
      'profileDigest'
    ]),
    'embedding profile'
  )
  return {
    provider: requireEnum(
      profile.provider,
      new Set(['local', 'remote'] as const),
      'embedding provider'
    ),
    model: requireText(profile.model, 'embedding model'),
    revision: requireText(profile.revision, 'embedding revision'),
    dimensions: requireInteger(
      profile.dimensions,
      'embedding dimensions',
      1,
      16_384
    ),
    normalization: requireEnum(
      profile.normalization,
      new Set(['L2'] as const),
      'embedding normalization'
    ),
    distance: requireEnum(
      profile.distance,
      new Set(['Cosine'] as const),
      'embedding distance'
    ),
    profileDigest: requireDigest(
      profile.profileDigest,
      'embedding profile digest'
    )
  }
}

function normalizeIndexLease(
  value: unknown
): KnowledgeRuntimeManifest['indexLease'] {
  const lease = requireObject(value, 'knowledge index lease')
  requireExactKeys(
    lease,
    new Set(['leaseId', 'collection', 'expiresAt']),
    'knowledge index lease'
  )
  return {
    leaseId: requireIdentifier(lease.leaseId, 'knowledge lease ID'),
    collection: requireIdentifier(
      lease.collection,
      'knowledge collection'
    ),
    expiresAt: requireInteger(lease.expiresAt, 'knowledge lease expiry', 0, Number.MAX_SAFE_INTEGER)
  }
}

function normalizeKnowledgeLimits(
  value: unknown
): KnowledgeRuntimeManifest['limits'] {
  const limits = requireObject(value, 'knowledge limits')
  requireExactKeys(
    limits,
    new Set([
      'maxQueries',
      'topKPerQuery',
      'maxReturnedChunks',
      'maxContextCharacters'
    ]),
    'knowledge limits'
  )
  return {
    maxQueries: requireInteger(limits.maxQueries, 'knowledge max queries', 0, 10_000),
    topKPerQuery: requireInteger(limits.topKPerQuery, 'knowledge topK', 0, 1_000),
    maxReturnedChunks: requireInteger(
      limits.maxReturnedChunks,
      'knowledge returned chunks',
      0,
      10_000
    ),
    maxContextCharacters: requireInteger(
      limits.maxContextCharacters,
      'knowledge context characters',
      0,
      10_000_000
    )
  }
}

function normalizePolicy(value: unknown): RuntimePolicyManifest {
  const policy = requireObject(value, 'policy manifest')
  requireExactKeys(policy, POLICY_KEYS, 'policy manifest')
  if (policy.kind !== 'runtime-policy') {
    throw new Error('policy manifest kind is invalid')
  }
  if (policy.defaultDecision !== 'deny') {
    throw new Error('Run manifest policy must be deny-by-default')
  }
  if (policy.allowRuntimeWidening !== false) {
    throw new Error('Run manifest policy cannot allow runtime widening')
  }
  return {
    kind: 'runtime-policy',
    approvalMode: requireEnum(
      policy.approvalMode,
      APPROVAL_MODES,
      'approval mode'
    ),
    defaultDecision: 'deny',
    allowRuntimeWidening: false,
    toolPolicyDigest: requireDigest(
      policy.toolPolicyDigest,
      'Tool policy digest'
    ),
    maximumRisk: requireEnum(policy.maximumRisk, RISKS, 'maximum risk')
  }
}

function normalizeBudget(value: unknown): RuntimeBudgetManifest {
  const budget = requireObject(value, 'budget manifest')
  requireExactKeys(budget, BUDGET_KEYS, 'budget manifest')
  if (budget.kind !== 'runtime-budget') {
    throw new Error('Run manifest budget kind is invalid')
  }
  return {
    kind: 'runtime-budget',
    maxModelRequests: requireBudgetInteger(
      budget.maxModelRequests,
      'maxModelRequests',
      1,
      10_000
    ),
    maxToolCalls: requireBudgetInteger(
      budget.maxToolCalls,
      'maxToolCalls',
      0,
      100_000
    ),
    maxSubagents: requireBudgetInteger(
      budget.maxSubagents,
      'maxSubagents',
      0,
      1_000
    ),
    maxRuntimeMs: requireBudgetInteger(
      budget.maxRuntimeMs,
      'maxRuntimeMs',
      1,
      24 * 60 * 60_000
    ),
    maxRetries: requireBudgetInteger(budget.maxRetries, 'maxRetries', 0, 100),
    maxInputTokens: requireBudgetInteger(
      budget.maxInputTokens,
      'maxInputTokens',
      1,
      10_000_000
    ),
    maxOutputTokens: requireBudgetInteger(
      budget.maxOutputTokens,
      'maxOutputTokens',
      1,
      1_000_000
    ),
    maxCostUsd: requireBudgetNumber(budget.maxCostUsd, 'maxCostUsd', 0, 1_000)
  }
}

function normalizeProductCommand(value: unknown): ProductCommandGrant {
  const command = requireObject(value, 'product command grant')
  requireExactKeys(command, PRODUCT_COMMAND_KEYS, 'product command grant')
  if (command.kind !== 'product-command') {
    throw new Error('product command grant kind is invalid')
  }
  const commandName = requireText(command.command, 'product command')
  if (commandName.includes('*')) {
    throw new Error('Run manifest product command wildcard is forbidden')
  }
  if (!PRODUCT_COMMAND_PATTERN.test(commandName)) {
    throw new Error('Run manifest product command is invalid')
  }
  return {
    kind: 'product-command',
    grantId: requireIdentifier(command.grantId, 'product command grant ID'),
    command: commandName,
    scope: normalizeScope(command.scope),
    inputSchemaDigest: requireDigest(
      command.inputSchemaDigest,
      'product command input schema digest'
    ),
    maxInvocations: requireInteger(
      command.maxInvocations,
      'product command max invocations',
      1,
      100_000
    )
  }
}

function normalizeCredentialReference(value: unknown): CredentialReference {
  const reference = requireObject(value, 'credential reference')
  requireExactKeys(
    reference,
    CREDENTIAL_REFERENCE_KEYS,
    'credential reference'
  )
  if (reference.kind !== 'credential-reference') {
    throw new Error('credential reference kind is invalid')
  }
  return {
    kind: 'credential-reference',
    ref: requireCredentialRef(reference.ref, 'credential ref'),
    purpose: requireEnum(
      reference.purpose,
      CREDENTIAL_PURPOSES,
      'credential purpose'
    )
  }
}

function normalizeScope(value: unknown): RuntimeScope {
  const scope = requireObject(value, 'runtime scope')
  if (scope.kind === 'global') {
    requireExactKeys(scope, new Set(['kind']), 'runtime scope')
    return { kind: 'global' }
  }
  if (scope.kind === 'workspace') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workspaceId']),
      'runtime scope'
    )
    return {
      kind: 'workspace',
      workspaceId: requireIdentifier(scope.workspaceId, 'workspace ID')
    }
  }
  if (scope.kind === 'requirement') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workspaceId', 'requirementId']),
      'runtime scope'
    )
    return {
      kind: 'requirement',
      workspaceId: requireIdentifier(scope.workspaceId, 'workspace ID'),
      requirementId: requireIdentifier(
        scope.requirementId,
        'requirement ID'
      )
    }
  }
  if (scope.kind === 'requirement-node') {
    requireExactKeys(
      scope,
      new Set(['kind', 'workspaceId', 'requirementId', 'nodeRunId']),
      'runtime scope'
    )
    return {
      kind: 'requirement-node',
      workspaceId: requireIdentifier(scope.workspaceId, 'workspace ID'),
      requirementId: requireIdentifier(
        scope.requirementId,
        'requirement ID'
      ),
      nodeRunId: requireIdentifier(scope.nodeRunId, 'node run ID')
    }
  }
  if (scope.kind === 'schedule') {
    requireExactKeys(
      scope,
      new Set(['kind', 'scheduleRunId']),
      'runtime scope'
    )
    return {
      kind: 'schedule',
      scheduleRunId: requireIdentifier(scope.scheduleRunId, 'schedule run ID')
    }
  }
  throw new Error('runtime scope kind is invalid')
}

function normalizePackage(value: unknown): ContentAddressedPackageRef {
  const packageRef = requireObject(value, 'package reference')
  if (packageRef.digest === undefined) {
    throw new Error('package digest is required')
  }
  requireExactKeys(packageRef, PACKAGE_KEYS, 'package reference')
  return {
    packageId: requireIdentifier(packageRef.packageId, 'package ID'),
    version: requireSemver(packageRef.version, 'package version'),
    digest: requireDigest(packageRef.digest, 'package digest')
  }
}

function normalizeCapabilities(value: unknown): ToolCapability[] {
  if (!Array.isArray(value)) {
    throw new Error('capabilities are invalid')
  }
  return [...new Set(
    value.map((capability) =>
      requireEnum(capability, TOOL_CAPABILITIES, 'capability')
    )
  )].sort()
}

function normalizeToolReferences(value: unknown): ToolDefinitionReference[] {
  if (!Array.isArray(value)) {
    throw new Error('Tool references are invalid')
  }
  return value
    .map((item) => {
      const reference = requireObject(item, 'Tool reference')
      requireExactKeys(
        reference,
        new Set(['kind', 'id', 'version', 'digest']),
        'Tool reference'
      )
      if (reference.kind !== 'tool') {
        throw new Error('Tool reference kind is invalid')
      }
      return {
        kind: 'tool' as const,
        id: requireIdentifier(reference.id, 'Tool reference ID'),
        version: requireSemver(reference.version, 'Tool reference version'),
        digest: requireDigest(reference.digest, 'Tool reference digest')
      }
    })
    .sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)))
}

function normalizeArray<T>(
  value: unknown,
  field: string,
  normalize: (value: unknown) => T
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Run manifest ${field} are invalid`)
  }
  return value.map(normalize)
}

function normalizeCredentialRefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('credential refs are invalid')
  }
  return [...new Set(
    value.map((ref) => requireCredentialRef(ref, 'credential ref'))
  )].sort()
}

function requireCredentialRef(value: unknown, field: string): string {
  const ref = requireText(value, field)
  if (!CREDENTIAL_REF.test(ref)) {
    throw new Error(`${field} is invalid`)
  }
  return ref
}

function requireModelProfileId(value: unknown): string {
  const profileId = requireText(value, 'model profile ID')
  if (!MODEL_PROFILE_ID.test(profileId)) {
    throw new Error('model profile ID is invalid')
  }
  return profileId
}

function requireAttachmentId(value: unknown, field: string): string {
  const attachmentId = requireText(value, field)
  if (!ATTACHMENT_ID.test(attachmentId)) {
    throw new Error(`${field} is invalid`)
  }
  return attachmentId
}

function requireBudgetInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): number {
  try {
    return requireInteger(value, field, minimum, maximum)
  } catch {
    throw new Error(`Run manifest budget ${field} is invalid`)
  }
}

function requireBudgetNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`Run manifest budget ${field} is invalid`)
  }
  return value
}

function normalizeHttpsOrLoopbackUrl(value: unknown, field: string): string {
  const source = requireText(value, field)
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error(`${field} is invalid`)
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(`${field} is invalid`)
  }
  const loopback = new Set(['127.0.0.1', '[::1]', 'localhost']).has(
    url.hostname
  )
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`${field} must use HTTPS`)
  }
  return url.toString().replace(/\/+$/, '')
}

function normalizePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//.test(value)
}

function isInsideRoot(path: string, root: string): boolean {
  const normalizedRoot = normalizePath(root)
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`)
}

function withoutDigest(
  value: DshRunManifest | Record<string, unknown>
): DshRunManifestDraft {
  const { digest: _digest, ...draft } = value as Record<string, unknown>
  return draft as DshRunManifestDraft
}

function digestManifestDraft(draft: DshRunManifestDraft): string {
  return createHash('sha256')
    .update(canonicalJson(draft))
    .digest('hex')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Run manifest number is invalid')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`
}

function assertNoRawSecrets(value: unknown, path: string[] = []): void {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    if (RAW_SECRET_VALUE.test(value.trim())) {
      throw new Error(`Run manifest must not contain raw secrets at ${path.join('.')}`)
    }
    return
  }
  if (typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoRawSecrets(item, [...path, String(index)])
    )
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const lowerPath = path.map((part) => part.toLowerCase())
    const rawCredentialValue =
      lowerPath.includes('credentialreferences') && key === 'value'
    if (isRawSecretKey(key) || rawCredentialValue) {
      throw new Error(`Run manifest must not contain raw secrets at ${[...path, key].join('.')}`)
    }
    assertNoRawSecrets(nested, [...path, key])
  }
}

function isRawSecretKey(key: string): boolean {
  const normalized = key.replaceAll(/[-_]/g, '').toLowerCase()
  return (
    normalized === 'apikey' ||
    normalized === 'token' ||
    normalized === 'accesstoken' ||
    normalized === 'refreshtoken' ||
    normalized === 'secret' ||
    normalized === 'password' ||
    normalized === 'authorization' ||
    normalized === 'credentialvalue' ||
    normalized === 'credentialvalues' ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password') ||
    normalized.endsWith('authorization') ||
    (normalized.endsWith('token') && !normalized.endsWith('tokens'))
  )
}

function referenceKey(value: ToolDefinitionReference): string {
  return `${value.kind}:${value.id}@${value.version}:${value.digest}`
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value)) {
    deepFreeze(child)
  }
  return value
}
