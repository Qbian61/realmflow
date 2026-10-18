import { createHash, randomUUID } from 'node:crypto'
import {
  ACP_SDK_VERSION,
  DSH_RUNTIME_PACKAGE,
  DSH_RUNTIME_VERSION,
  sealDshRunManifest,
  type ContextAccessManifest,
  type CredentialReference,
  type DshRunManifest,
  type DshRunManifestDraft,
  type DshRunOwner,
  type ExecutableAgentManifest,
  type ExecutableConnectorManifest,
  type ExecutableMcpManifest,
  type ExecutableSkillManifest,
  type ExecutableToolManifest,
  type KnowledgeRuntimeManifest,
  type ModelRuntimeManifest,
  type ProductCommandGrant,
  type RuntimeBudgetManifest,
  type RuntimePolicyManifest
} from '../../../../domain/dsh-run-manifest'
import type { EffectiveAgentProfile } from '../../../../domain/agent-profile'
import type {
  RevisionedModelProfile,
  RevisionedModelProvider
} from '../../../../domain/model'
import { isToolVersionInRange } from '../../../../domain/skill-definition'
import type { SkillCatalogItem, ToolCatalogItem, ToolCatalogState } from '../../../../domain/tool-catalog'
import type {
  ToolDefinition,
  ToolDefinitionReference,
  ToolExecutorDefinition
} from '../../../../domain/tool-definition'
import type { ConnectorRecord } from '../connectors/connector-store'
import type { McpServerRecord } from '../tools/mcp-server-store'

export type DshRunManifestPublication = {
  manifestId: string
  digest: string
  runId: string
  sessionId: string
  owner: DshRunOwner
  runtime: {
    dshPackage: typeof DSH_RUNTIME_PACKAGE
    dshVersion: typeof DSH_RUNTIME_VERSION
    acpSdkVersion: typeof ACP_SDK_VERSION
  }
  publishedAt: number
  manifest: DshRunManifest
}

export type DshRunManifestPublisherInput = {
  manifestId?: string
  runId: string
  sessionId: string
  owner: DshRunOwner
  model?: ModelRuntimeManifest
  modelSelection?: DshModelSelection
  selectedToolIds: string[]
  selectedSkillIds: string[]
  authorizedToolRefs: ToolDefinitionReference[]
  authorizedSkillRefs: ToolDefinitionReference[]
  authorizedAgentIds?: string[]
  authorizedMcpServerIds?: string[]
  authorizedConnectorIds?: string[]
  agents?: ExecutableAgentManifest[]
  agentProfiles?: EffectiveAgentProfile[]
  mcpServers?: ExecutableMcpManifest[]
  mcpServerRecords?: McpServerRecord[]
  connectors?: ExecutableConnectorManifest[]
  connectorRecords?: ConnectorRecord[]
  context: ContextAccessManifest
  knowledge: KnowledgeRuntimeManifest
  policy: RuntimePolicyManifest
  budget: RuntimeBudgetManifest
  productCommands: ProductCommandGrant[]
  credentialReferences: CredentialReference[]
}

export type DshModelSelection = {
  provider: RevisionedModelProvider
  profile: RevisionedModelProfile
  credentialRef?: string
  reasoningEffort?: ModelRuntimeManifest['reasoningEffort']
}

export type DshRunManifestPublisherDependencies = {
  catalog: {
    getCatalog(): Promise<ToolCatalogState>
  }
  publications: {
    save(publication: DshRunManifestPublication): Promise<void>
  }
  now?: () => number
  createId?: () => string
}

export class DshRunManifestPublisher {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: DshRunManifestPublisherDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async publish(
    input: DshRunManifestPublisherInput
  ): Promise<DshRunManifestPublication> {
    const catalog = await this.dependencies.catalog.getCatalog()
    const authorizedSkills = referenceSet(input.authorizedSkillRefs, 'skill')
    const inheritedToolRefs = requiredToolReferencesForSelectedSkills({
      catalog,
      selectedSkillIds: input.selectedSkillIds,
      authorizedSkills
    })
    const authorizedTools = referenceSet(
      [...input.authorizedToolRefs, ...inheritedToolRefs],
      'tool'
    )
    const tools = compileSelectedTools({
      catalog,
      selectedToolIds: [
        ...input.selectedToolIds,
        ...inheritedToolRefs.map(({ id }) => id)
      ],
      authorizedTools
    })
    const skills = compileSelectedSkills({
      authorizedSkills,
      authorizedTools,
      catalog,
      selectedSkillIds: input.selectedSkillIds,
      selectedTools: tools
    })
    const model = input.model ?? compileModelSelection(input.modelSelection)
    const agents =
      input.agents ?? compileAgentProfiles(input.agentProfiles ?? [])
    const mcpServers =
      input.mcpServers ?? compileMcpServers(input.mcpServerRecords ?? [])
    const connectors =
      input.connectors ?? compileConnectors(input.connectorRecords ?? [])
    assertAuthorizedIds('Agent', agents.map(({ id }) => id), input.authorizedAgentIds)
    assertAuthorizedIds(
      'MCP server',
      mcpServers.map(({ id }) => id),
      input.authorizedMcpServerIds
    )
    assertAuthorizedIds(
      'Connector',
      connectors.map(({ id }) => id),
      input.authorizedConnectorIds
    )
    const manifest = sealDshRunManifest({
      schemaVersion: 1,
      manifestId: input.manifestId ?? this.createId(),
      runId: input.runId,
      sessionId: input.sessionId,
      owner: input.owner,
      model,
      tools,
      skills,
      agents,
      mcpServers,
      connectors,
      context: input.context,
      knowledge: input.knowledge,
      policy: input.policy,
      budget: input.budget,
      productCommands: input.productCommands,
      credentialReferences: input.credentialReferences
    } satisfies DshRunManifestDraft)
    const publication: DshRunManifestPublication = {
      manifestId: manifest.manifestId,
      digest: manifest.digest,
      runId: manifest.runId,
      sessionId: manifest.sessionId,
      owner: manifest.owner,
      runtime: {
        dshPackage: DSH_RUNTIME_PACKAGE,
        dshVersion: DSH_RUNTIME_VERSION,
        acpSdkVersion: ACP_SDK_VERSION
      },
      publishedAt: this.now(),
      manifest
    }
    await this.dependencies.publications.save(publication)
    return publication
  }
}

function compileModelSelection(
  selection: DshModelSelection | undefined
): ModelRuntimeManifest {
  if (!selection) {
    throw new Error('Run manifest model selection is required')
  }
  if (!selection.provider.enabled) {
    throw new Error(`Selected model provider is disabled: ${selection.provider.id}`)
  }
  if (!selection.profile.enabled) {
    throw new Error(`Selected model profile is disabled: ${selection.profile.id}`)
  }
  if (selection.profile.providerId !== selection.provider.id) {
    throw new Error('Selected model profile provider does not match provider')
  }
  if (selection.provider.type !== 'local' && !selection.credentialRef) {
    throw new Error('Selected model credential reference is required')
  }
  return {
    kind: 'model',
    providerId: selection.provider.id,
    providerType: selection.provider.type,
    profileId: selection.profile.id,
    modelId: selection.profile.modelId,
    ...(selection.reasoningEffort ? {
      reasoningEffort: selection.reasoningEffort
    } : {}),
    ...(selection.credentialRef ? {
      credentialRef: selection.credentialRef
    } : {}),
    options: {
      providerRevision: selection.provider.revision,
      profileRevision: selection.profile.revision,
      timeoutMs: selection.profile.timeoutMs,
      maxRetries: selection.profile.maxRetries,
      maxConcurrency: selection.profile.maxConcurrency,
      contextWindow: selection.profile.contextWindow,
      ...(selection.profile.maxOutputTokens === undefined ? {} : {
        maxOutputTokens: selection.profile.maxOutputTokens
      })
    }
  }
}

function compileAgentProfiles(
  profiles: readonly EffectiveAgentProfile[]
): ExecutableAgentManifest[] {
  return profiles.map((profile) => ({
    kind: 'agent',
    id: profile.profileId,
    version: profile.profileVersion,
    profileDigest: profile.profileDigest,
    promptDigest: profile.promptDigest,
    policyDigest: profile.policyDigest,
    maxDelegationDepth: profile.policy.perRunLimits.agent
  }))
}

function compileMcpServers(
  records: readonly McpServerRecord[]
): ExecutableMcpManifest[] {
  return records.map((record) => {
    const configuration = record.configuration
    if (!configuration.enabled) {
      throw new Error(`Selected MCP server is disabled: ${configuration.id}`)
    }
    const credentialRefs =
      configuration.transport.kind === 'stdio'
        ? credentialRefsFromBindings(
            configuration.transport.environmentCredentialIds,
            record.hasCredentials,
            configuration.id
          )
        : credentialRefsFromBindings(
            configuration.transport.headerCredentialIds,
            record.hasCredentials,
            configuration.id
          )
    return {
      kind: 'mcp-server',
      id: configuration.id,
      identityDigest: configuration.identity,
      transport:
        configuration.transport.kind === 'stdio'
          ? {
              kind: 'stdio',
              command: configuration.transport.command,
              commandDigest: digestJson({
                command: configuration.transport.command,
                arguments: configuration.transport.arguments
              }),
              arguments: [...configuration.transport.arguments]
            }
          : {
              kind: 'streamable_http',
              url: configuration.transport.url
            },
      credentialRefs
    }
  })
}

function compileConnectors(
  records: readonly ConnectorRecord[]
): ExecutableConnectorManifest[] {
  return records.map((record) => {
    const connector = record.connector
    if (!connector.enabled) {
      throw new Error(`Selected Connector is disabled: ${connector.id}`)
    }
    const credentialRef = `credential-${connector.id}`
    if (connector.authentication.type !== 'none' && !record.hasCredential) {
      throw new Error(`Selected Connector credential is missing: ${connector.id}`)
    }
    return {
      kind: 'connector',
      id: connector.id,
      type: connector.type,
      baseUrl: connector.baseUrl,
      adapter: {
        adapterId: 'realmflow.connector.http',
        version: '1.0.0',
        digest: digestJson({
          adapterId: 'realmflow.connector.http',
          version: '1.0.0'
        }),
        entrypoint: 'connectors/http.js'
      },
      authentication:
        connector.authentication.type === 'none'
          ? { kind: 'none' }
          : {
              kind: 'credential-reference',
              ref: credentialRef
            }
    }
  })
}

function compileSelectedTools(input: {
  catalog: ToolCatalogState
  selectedToolIds: readonly string[]
  authorizedTools: ReadonlySet<string>
}): ExecutableToolManifest[] {
  const toolsById = enabledToolsById(input.catalog.tools)
  return unique(input.selectedToolIds).map((toolId) => {
    const item = toolsById.get(toolId)
    if (!item) {
      throw new Error(`Selected Tool is not enabled: ${toolId}`)
    }
    const reference = toolReference(item.definition)
    if (!input.authorizedTools.has(referenceKey(reference))) {
      throw new Error(`Selected Tool is not authorized for this run scope: ${toolId}`)
    }
    return {
      kind: 'tool',
      id: item.definition.id,
      version: item.definition.version,
      definitionDigest: item.definition.definitionDigest,
      package: {
        packageId: item.definition.package.packageId,
        version: item.definition.package.packageVersion,
        digest: item.definition.package.packageDigest
      },
      entrypoint: toolEntrypoint(item.definition.executor),
      capabilities: [...item.definition.capabilities],
      risk: item.definition.risk
    }
  })
}

function compileSelectedSkills(input: {
  catalog: ToolCatalogState
  selectedSkillIds: readonly string[]
  authorizedSkills: ReadonlySet<string>
  authorizedTools: ReadonlySet<string>
  selectedTools: readonly ExecutableToolManifest[]
}): ExecutableSkillManifest[] {
  const skillsById = enabledSkillsById(input.catalog.skills)
  const availableTools = input.catalog.tools
    .filter((item) => item.status === 'enabled')
    .map((item) => item.definition)
  const selectedToolKeys = new Set(
    input.selectedTools.map((tool) =>
      referenceKey({
        kind: 'tool',
        id: tool.id,
        version: tool.version,
        digest: tool.definitionDigest
      })
    )
  )

  return unique(input.selectedSkillIds).map((skillId) => {
    const item = skillsById.get(skillId)
    if (!item) {
      throw new Error(`Selected Skill is not enabled: ${skillId}`)
    }
    const reference = skillReference(item)
    if (!input.authorizedSkills.has(referenceKey(reference))) {
      throw new Error(`Selected Skill is not authorized for this run scope: ${skillId}`)
    }
    const requiredToolRefs = item.definition.requiredTools
      .filter((dependency) => dependency.required)
      .map((dependency) => {
        const tool = availableTools.find(
          (definition) =>
            definition.id === dependency.toolId &&
            isToolVersionInRange(definition.version, dependency.versionRange)
        )
        if (!tool) {
          throw new Error(`Selected Skill required Tool is unavailable: ${dependency.toolId}`)
        }
        const toolRef = toolReference(tool)
        const key = referenceKey(toolRef)
        if (!input.authorizedTools.has(key)) {
          throw new Error(`Selected Skill required Tool is not authorized: ${dependency.toolId}`)
        }
        if (!selectedToolKeys.has(key)) {
          throw new Error(`Selected Skill required Tool is not selected: ${dependency.toolId}`)
        }
        return toolRef
      })
    return {
      kind: 'skill',
      id: item.definition.id,
      version: item.definition.version,
      definitionDigest: item.definition.definitionDigest,
      package: {
        packageId: item.definition.package.packageId,
        version: item.definition.package.packageVersion,
        digest: item.definition.package.packageDigest
      },
      entrypoint:
        item.definition.runtime.kind === 'instruction'
          ? {
              kind: 'instruction',
              instructionsPath: item.definition.instructionsPath
            }
          : item.definition.runtime.kind === 'workflow'
            ? {
                kind: 'workflow',
                workflowDigest: digestJson(item.definition.runtime)
              }
            : {
                kind: 'executable',
                runtime: item.definition.runtime.runtime,
                entrypoint: item.definition.runtime.entryPath,
                capabilities: [...item.definition.runtime.capabilities],
                connectorServices: [
                  ...item.definition.runtime.connectorServices
                ],
                resources: {
                  ...item.definition.runtime.resources
                }
              },
      requiredToolRefs
    }
  })
}

function requiredToolReferencesForSelectedSkills(input: {
  catalog: ToolCatalogState
  selectedSkillIds: readonly string[]
  authorizedSkills: ReadonlySet<string>
}): ToolDefinitionReference[] {
  const skillsById = enabledSkillsById(input.catalog.skills)
  const availableTools = input.catalog.tools
    .filter((item) => item.status === 'enabled')
    .map((item) => item.definition)
  const references: ToolDefinitionReference[] = []

  for (const skillId of unique(input.selectedSkillIds)) {
    const item = skillsById.get(skillId)
    if (!item) {
      throw new Error(`Selected Skill is not enabled: ${skillId}`)
    }
    if (!input.authorizedSkills.has(referenceKey(skillReference(item)))) {
      throw new Error(
        `Selected Skill is not authorized for this run scope: ${skillId}`
      )
    }
    for (const dependency of item.definition.requiredTools) {
      if (!dependency.required) continue
      const tool = availableTools.find(
        (definition) =>
          definition.id === dependency.toolId &&
          isToolVersionInRange(definition.version, dependency.versionRange)
      )
      if (!tool) {
        throw new Error(
          `Selected Skill required Tool is unavailable: ${dependency.toolId}`
        )
      }
      references.push(toolReference(tool))
    }
  }
  return references
}

function enabledToolsById(
  tools: readonly ToolCatalogItem[]
): Map<string, ToolCatalogItem> {
  return new Map(
    tools
      .filter((item) => item.status === 'enabled')
      .map((item) => [item.id, item])
  )
}

function enabledSkillsById(
  skills: readonly SkillCatalogItem[]
): Map<string, SkillCatalogItem> {
  return new Map(
    skills
      .filter((item) => item.status === 'enabled')
      .map((item) => [item.id, item])
  )
}

function toolEntrypoint(
  executor: ToolExecutorDefinition
): ExecutableToolManifest['entrypoint'] {
  switch (executor.kind) {
    case 'builtin':
      return {
        kind: 'builtin',
        handler: executor.handler,
        handlerVersion: executor.handlerVersion
      }
    case 'sandbox':
      return {
        kind: 'sandbox',
        runtime: executor.runtime,
        entrypoint: executor.entryPath,
        ...(executor.argumentsTemplate
          ? { arguments: [...executor.argumentsTemplate] }
          : {})
      }
    case 'mcp':
      return {
        kind: 'mcp',
        serverId: executor.serverRef,
        toolName: executor.remoteToolName
      }
    case 'computer':
      return {
        kind: 'computer',
        actionSet: executor.actionSet,
        actionSetVersion: executor.actionSetVersion
      }
    case 'connector':
      return {
        kind: 'connector',
        connectorId: executor.capabilityId,
        actionId: executor.actionId
      }
  }
}

function referenceSet(
  references: readonly ToolDefinitionReference[],
  kind: ToolDefinitionReference['kind']
): Set<string> {
  return new Set(
    references
      .filter((reference) => reference.kind === kind)
      .map(referenceKey)
  )
}

function assertAuthorizedIds(
  label: 'Agent' | 'MCP server' | 'Connector',
  selectedIds: readonly string[],
  authorizedIds: readonly string[] | undefined
): void {
  if (selectedIds.length === 0) return
  const authorized = new Set(authorizedIds ?? [])
  for (const id of selectedIds) {
    if (!authorized.has(id)) {
      throw new Error(`${label} is not authorized for this run scope: ${id}`)
    }
  }
}

function credentialRefsFromBindings(
  bindings: Readonly<Record<string, string>>,
  hasCredentials: Readonly<Record<string, boolean>>,
  capabilityId: string
): string[] {
  for (const name of Object.keys(bindings)) {
    if (!hasCredentials[name]) {
      throw new Error(`Selected MCP credential is missing: ${capabilityId}`)
    }
  }
  return [...new Set(Object.values(bindings))].sort()
}

function toolReference(tool: ToolDefinition): ToolDefinitionReference {
  return {
    kind: 'tool',
    id: tool.id,
    version: tool.version,
    digest: tool.definitionDigest
  }
}

function skillReference(item: SkillCatalogItem): ToolDefinitionReference {
  return {
    kind: 'skill',
    id: item.id,
    version: item.version,
    digest: item.definitionDigest
  }
}

function referenceKey(reference: ToolDefinitionReference): string {
  return `${reference.kind}:${reference.id}@${reference.version}:${reference.digest}`
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
