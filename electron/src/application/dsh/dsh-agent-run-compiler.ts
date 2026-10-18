import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import {
  getBuiltinAgentProfile,
  resolveEffectiveAgentProfile
} from '../../../../domain/agent-profile'
import {
  resolveAgentRunScenario,
  resolveAgentRunScope
} from '../../../../domain/agent-runtime'
import type {
  ContextAccessManifest,
  CredentialReference,
  DshRunOwner,
  KnowledgeRuntimeManifest,
  ModelRuntimeManifest,
  RuntimeBudgetManifest,
  RuntimePolicyManifest,
  RuntimeScope
} from '../../../../domain/dsh-run-manifest'
import { modelProviderCredentialRef } from '../../../../domain/dsh-run-manifest'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { ToolDefinitionReference } from '../../../../domain/tool-definition'
import type {
  DshAgentRunAdmission,
  DshAgentRunCompiler
} from '../../ai-run/infrastructure/dsh-ai-run-gateway'
import type {
  DshAcpMcpServer,
  RunContext,
  RunToolConfiguration
} from '../../ai-run/application/ports'
import { resolveDshModelRoute } from '../../dsh-model-route'
import {
  DshConversationInputService,
  type DshConversationRuntimeInput
} from './dsh-conversation-input-service'
import { buildDshPromptBlocks } from './dsh-prompt-builder'

const DEFAULT_DSH_TOOL_REFS: ToolDefinitionReference[] = [
  {
    kind: 'tool',
    id: 'builtin.process.run',
    version: '1.0.4',
    digest: 'd1c24c0ca22034b1e63771ec94f8aa10a1033d36914593f0754d05cc8798b86b'
  }
]

export type DshAgentRunAdmissionCompilerDependencies = {
  conversationInput?: Pick<DshConversationInputService, 'compile'>
  knowledge?: {
    resolve(input: {
      runId: string
      owner: DshRunOwner
      context: RunContext
    }): Promise<KnowledgeRuntimeManifest> | KnowledgeRuntimeManifest
  }
  runtime?: {
    resolve(input: {
      runId: string
      owner: DshRunOwner
      context: RunContext
      model?: ModelExecutionConfig
      toolConfiguration?: RunToolConfiguration
    }): Promise<DshConversationRuntimeInput> | DshConversationRuntimeInput
  }
  defaultCwd?: string
  now?: () => number
}

export class DshAgentRunAdmissionCompiler implements DshAgentRunCompiler {
  private readonly conversationInput: Pick<DshConversationInputService, 'compile'>
  private readonly now: () => number

  constructor(
    private readonly dependencies: DshAgentRunAdmissionCompilerDependencies = {}
  ) {
    this.conversationInput =
      dependencies.conversationInput ?? new DshConversationInputService()
    this.now = dependencies.now ?? Date.now
  }

  async compile(input: {
    runId: string
    owner: DshRunOwner
    context: RunContext
    model?: ModelExecutionConfig
    toolConfiguration?: RunToolConfiguration
  }): Promise<DshAgentRunAdmission> {
    const [knowledge, runtime] = await Promise.all([
      this.dependencies.knowledge?.resolve({
        runId: input.runId,
        owner: input.owner,
        context: input.context
      }) ?? defaultKnowledgeManifest(this.now()),
      this.dependencies.runtime?.resolve(input) ?? {}
    ])
    const envelope = this.conversationInput.compile({
      owner: input.owner,
      context: input.context,
      ...(input.model ? { model: input.model } : {}),
      knowledge,
      runtime
    })
    const cwd =
      envelope.runtime.cwd ?? this.dependencies.defaultCwd ?? process.cwd()
    const model = compileModelManifest(envelope.route, input.model)
    const agentProfile = compileAgentProfile(input.context)
    const mcpServers = compileAcpMcpServers(runtime.mcpServerRecords ?? [])
    return {
      cwd,
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
      prompt: buildDshPromptBlocks(
        envelope,
        imagePartsFromContext(input.context)
      ),
      manifestInput: {
        model,
        selectedToolIds: DEFAULT_DSH_TOOL_REFS.map(({ id }) => id),
        selectedSkillIds: envelope.runtime.skillVersionRefs.map(({ id }) => id),
        authorizedToolRefs: DEFAULT_DSH_TOOL_REFS,
        authorizedSkillRefs: envelope.runtime.skillVersionRefs,
        authorizedAgentIds: [agentProfile.profileId],
        authorizedMcpServerIds: envelope.runtime.mcpServerIds,
        authorizedConnectorIds: envelope.runtime.connectorIds,
        agentProfiles: [agentProfile],
        ...(runtime.mcpServerRecords
          ? { mcpServerRecords: [...runtime.mcpServerRecords] }
          : {}),
        ...(runtime.connectorRecords
          ? { connectorRecords: [...runtime.connectorRecords] }
          : {}),
        context: compileContextManifest({
          owner: envelope.owner,
          cwd,
          context: input.context,
          rootIds: envelope.runtime.contextRootIds,
          attachments: envelope.attachments,
          promptBlocks: envelope.prompt.blocks,
          customInstructions: envelope.runtime.customInstructions
        }),
        knowledge: envelope.knowledge,
        policy: compilePolicyManifest(envelope.runtime.approvalMode),
        budget: defaultBudgetManifest(),
        productCommands: [],
        credentialReferences: uniqueCredentialReferences([
          ...credentialReferencesForModel(model),
          ...(runtime.credentialReferences ?? [])
        ])
      },
      configOptions: compileAcpConfigOptions(envelope.route, input.model)
    }
  }
}

function imagePartsFromContext(context: RunContext) {
  return 'attachmentContext' in context
    ? context.attachmentContext?.imageParts ?? []
    : []
}

function compileAgentProfile(context: RunContext) {
  const scenario = resolveAgentRunScenario(context)
  return resolveEffectiveAgentProfile({
    layers: [getBuiltinAgentProfile(scenario.id)],
    scope: resolveAgentRunScope(context, scenario.id),
    capabilities: []
  })
}

function compileModelManifest(
  route: {
    modelProfileId: string
    providerId: string
    modelId: string
    reasoningEffort?: ModelRuntimeManifest['reasoningEffort']
  },
  model: ModelExecutionConfig | undefined
): ModelRuntimeManifest {
  if (!model) throw new Error('DSH model execution config is required')
  const credentialRef =
    model.providerType === 'local'
      ? undefined
      : modelProviderCredentialRef(route.providerId)
  return {
    kind: 'model',
    providerId: route.providerId,
    providerType: model.providerType,
    profileId: route.modelProfileId,
    modelId: route.modelId,
    ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
    ...(credentialRef ? { credentialRef } : {}),
    options: cleanJsonObject({
      catalogProviderId: model.catalogProviderId,
      timeoutMs: model.timeoutMs,
      maxRetries: model.maxRetries,
      maxConcurrency: model.maxConcurrency,
      reasoningSupported: model.reasoningSupported,
      capabilities: model.capabilities
    })
  }
}

function compileAcpConfigOptions(route: {
  modelProfileId: string
  providerId: string
  modelId: string
  reasoningEffort?: ModelRuntimeManifest['reasoningEffort']
}, model: ModelExecutionConfig | undefined): DshAgentRunAdmission['configOptions'] {
  if (model === undefined) {
    throw new Error('DSH model execution config is required')
  }
  const dshRoute = resolveDshModelRoute(model)
  return [
    {
      configId: 'model',
      value: JSON.stringify([dshRoute.providerId, route.modelId])
    }
  ]
}

function compileContextManifest(input: {
  owner: DshRunOwner
  cwd: string
  context: RunContext
  rootIds: readonly string[]
  attachments: ReadonlyArray<{
    attachmentId: string
    kind: 'file' | 'image' | 'resource_link'
    path?: string
    digest?: string
  }>
  promptBlocks: ReadonlyArray<{ type: string; [key: string]: unknown }>
  customInstructions?: string
}): ContextAccessManifest {
  const resourceLinks = new Map<string, string>()
  for (const block of input.promptBlocks) {
    if (block.type !== 'resource_link' || typeof block.uri !== 'string') {
      continue
    }
    resourceLinks.set(resourceAttachmentId(block.uri), block.uri)
  }
  const roots: ContextAccessManifest['roots'] = input.rootIds.map(
    (rootId) => ({
      rootId,
      path: rootPathForContext(input.context, input.cwd),
      access: 'read-write' as const
    })
  )
  const rootPaths = new Set(roots.map(({ path }) => path))
  for (const attachment of input.attachments) {
    if (
      attachment.kind !== 'file' ||
      !attachment.path ||
      !isAbsolute(attachment.path) ||
      rootPaths.has(attachment.path)
    ) {
      continue
    }
    roots.push({
      rootId: `attachment-root-${digestJson(attachment.path).slice(0, 16)}`,
      path: attachment.path,
      access: 'read-only'
    })
    rootPaths.add(attachment.path)
  }
  return {
    kind: 'context-access',
    scope: scopeFromOwner(input.owner),
    roots,
    attachments: input.attachments.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      kind: attachment.kind,
      ...(attachment.path ? { path: attachment.path } : {}),
      ...(attachment.kind === 'resource_link'
        ? { uri: resourceLinks.get(attachment.attachmentId) ?? attachment.attachmentId }
        : {}),
      ...(attachment.digest ? { digest: attachment.digest } : {})
    })),
    ...(input.customInstructions
      ? { customInstructionsDigest: digestJson(input.customInstructions) }
      : {})
  }
}

function scopeFromOwner(owner: DshRunOwner): RuntimeScope {
  if (owner.workspaceId && owner.requirementId && owner.nodeRunId) {
    return {
      kind: 'requirement-node',
      workspaceId: owner.workspaceId,
      requirementId: owner.requirementId,
      nodeRunId: owner.nodeRunId
    }
  }
  if (owner.workspaceId && owner.requirementId) {
    return {
      kind: 'requirement',
      workspaceId: owner.workspaceId,
      requirementId: owner.requirementId
    }
  }
  if (owner.workspaceId) {
    return {
      kind: 'workspace',
      workspaceId: owner.workspaceId
    }
  }
  if (owner.scheduleRunId) {
    return {
      kind: 'schedule',
      scheduleRunId: owner.scheduleRunId
    }
  }
  return { kind: 'global' }
}

function rootPathForContext(context: RunContext, cwd: string): string {
  if ('folderPath' in context && context.folderPath) return context.folderPath
  return cwd
}

function compilePolicyManifest(
  approvalMode: RuntimePolicyManifest['approvalMode']
): RuntimePolicyManifest {
  return {
    kind: 'runtime-policy',
    approvalMode,
    defaultDecision: 'deny',
    allowRuntimeWidening: false,
    toolPolicyDigest: digestJson({
      approvalMode,
      defaultDecision: 'deny',
      allowRuntimeWidening: false
    }),
    maximumRisk: 'critical'
  }
}

function defaultBudgetManifest(): RuntimeBudgetManifest {
  return {
    kind: 'runtime-budget',
    maxModelRequests: 32,
    maxToolCalls: 64,
    maxSubagents: 4,
    maxRuntimeMs: 900_000,
    maxRetries: 2,
    maxInputTokens: 256_000,
    maxOutputTokens: 32_000,
    maxCostUsd: 0
  }
}

function credentialReferencesForModel(
  model: ModelRuntimeManifest
): CredentialReference[] {
  return model.credentialRef
    ? [
        {
          kind: 'credential-reference',
          ref: model.credentialRef,
          purpose: 'model'
        }
      ]
    : []
}

function compileAcpMcpServers(
  records: NonNullable<DshConversationRuntimeInput['mcpServerRecords']>
): DshAcpMcpServer[] {
  return records.map(({ configuration }) => {
    if (!configuration.enabled) {
      throw new Error(
        `Selected MCP server is disabled: ${configuration.id}`
      )
    }
    return configuration.transport.kind === 'stdio'
      ? {
          name: configuration.name,
          command: configuration.transport.command,
          args: [...configuration.transport.arguments],
          env: []
        }
      : {
          name: configuration.name,
          type: 'http',
          url: configuration.transport.url,
          headers: []
        }
  })
}

function uniqueCredentialReferences(
  references: readonly CredentialReference[]
): CredentialReference[] {
  const unique = new Map(
    references.map((reference) => [
      `${reference.purpose}:${reference.ref}`,
      reference
    ])
  )
  return [...unique.values()]
}

function defaultKnowledgeManifest(now: number): KnowledgeRuntimeManifest {
  return {
    kind: 'knowledge-runtime',
    enabled: false,
    scope: {
      kind: 'none'
    },
    snapshotId: 'knowledge-empty',
    workspaceIds: [],
    generationIds: [],
    embeddingProfile: {
      provider: 'local',
      model: 'Alibaba-NLP/gte-multilingual-base',
      revision: '2024-08-01',
      dimensions: 768,
      normalization: 'L2',
      distance: 'Cosine',
      profileDigest: '6'.repeat(64)
    },
    indexLease: {
      leaseId: 'lease-empty',
      collection: 'realmflow-empty',
      expiresAt: now + 15 * 60 * 1000
    },
    limits: {
      maxQueries: 0,
      topKPerQuery: 0,
      maxReturnedChunks: 0,
      maxContextCharacters: 0
    }
  }
}

function cleanJsonObject(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined)
  )
}

function resourceAttachmentId(value: string): string {
  return `resource-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}

function digestJson(value: unknown): string {
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
