import { createHash } from 'node:crypto'
import type {
  CredentialReference,
  DshRunOwner,
  KnowledgeRuntimeManifest,
  RuntimePolicyManifest
} from '../../../../domain/dsh-run-manifest'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { ReasoningLevel } from '../../../../domain/reasoning-router'
import type { ResponseLanguageSnapshot } from '../../../../domain/response-language'
import {
  normalizeToolDefinitionReference,
  type ToolDefinitionReference
} from '../../../../domain/tool-definition'
import {
  deepFreezeDshConversationInputEnvelope,
  normalizeDshConversationPromptBlocks,
  type DshConversationImageMediaType,
  type DshConversationInputEnvelope,
  type DshConversationProductContext,
  type DshConversationPromptBlock,
  type DshConversationPromptBlockInput,
  type DshConversationSkillVersionReference
} from '../../../../shared/dsh-conversation-input-contract'
import type { RunContext } from '../../ai-run/application/ports'
import type { ConnectorRecord } from '../connectors/connector-store'
import type { McpServerRecord } from '../tools/mcp-server-store'

export type DshConversationInputCompileInput = {
  owner: DshRunOwner
  context: RunContext
  model?: ModelExecutionConfig
  knowledge: KnowledgeRuntimeManifest
  promptBlocks?: readonly DshConversationPromptBlockInput[]
  resourceLinks?: readonly {
    uri: string
    name?: string
  }[]
  runtime?: DshConversationRuntimeInput
}

export type DshConversationRuntimeInput = {
  agentPresetId?: string
  skillVersionRefs?: readonly DshConversationSkillVersionReference[]
  connectorIds?: readonly string[]
  mcpServerIds?: readonly string[]
  mcpServerRecords?: readonly McpServerRecord[]
  connectorRecords?: readonly ConnectorRecord[]
  credentialReferences?: readonly CredentialReference[]
  enabledCapabilityIds?: readonly string[]
  cwd?: string
  contextRootIds?: readonly string[]
  approvalMode?: RuntimePolicyManifest['approvalMode']
  budgetProfileId?: string
  goalObjective?: string
  customInstructions?: string
  systemPrompt?: string
  productPolicy?: string
  responseLanguage?: ResponseLanguageSnapshot
  productContext?: DshConversationProductContext
  reasoningEffort?: ReasoningLevel
}

export class DshConversationInputService {
  compile(
    input: DshConversationInputCompileInput
  ): DshConversationInputEnvelope {
    const promptBlocks = compilePromptBlocks(input)
    const runtime = compileRuntime(input)
    const envelope: DshConversationInputEnvelope = {
      schemaVersion: 1,
      ...(conversationIdFromContext(input.context, input.owner)
        ? {
            conversationId: conversationIdFromContext(input.context, input.owner)
          }
        : {}),
      owner: cleanOwner(input.owner),
      prompt: {
        blocks: promptBlocks
      },
      route: compileRoute(input),
      runtime,
      knowledge: input.knowledge,
      attachments: compileAttachments(input, promptBlocks)
    }
    return deepFreezeDshConversationInputEnvelope(envelope)
  }
}

function compilePromptBlocks(
  input: DshConversationInputCompileInput
): DshConversationPromptBlock[] {
  if (input.promptBlocks !== undefined) {
    return normalizeDshConversationPromptBlocks(input.promptBlocks)
  }
  const text = promptTextWithKnowledgeContext(input)
  return normalizeDshConversationPromptBlocks([
    {
      type: 'text',
      text
    },
    ...(input.resourceLinks ?? []).map((link) => ({
      type: 'resource_link' as const,
      uri: link.uri,
      ...(link.name ? { name: link.name } : {})
    })),
    ...imagePromptBlocks(input.context)
  ])
}

function promptTextWithKnowledgeContext(
  input: DshConversationInputCompileInput
): string {
  const promptText = currentPromptText(input.context)
  const knowledgeContext = processedKnowledgeContext(input)
  const attachmentContext = localAttachmentContext(input.context)
  if (!knowledgeContext && !attachmentContext) return promptText
  return [
    ...(knowledgeContext
      ? ['## Space knowledge', knowledgeContext, '']
      : []),
    ...(attachmentContext
      ? ['## Local attachment context', attachmentContext, '']
      : []),
    '## User request',
    promptText
  ].join('\n')
}

function processedKnowledgeContext(
  input: DshConversationInputCompileInput
): string | undefined {
  if (!input.knowledge.enabled) return undefined
  const processing = 'processing' in input.context
    ? input.context.processing
    : undefined
  const content = processing?.knowledgeContext?.content.trim()
  return content ? content : undefined
}

function compileRoute(
  input: DshConversationInputCompileInput
): DshConversationInputEnvelope['route'] {
  const model = input.model
  if (!model) throw new Error('DSH model route is required')
  if (!model.modelProfileId) {
    throw new Error('DSH model route is missing model profile')
  }
  if (!model.providerId) {
    throw new Error('DSH model route is missing provider')
  }
  return {
    modelProfileId: model.modelProfileId,
    providerId: model.providerId,
    modelId: model.modelId,
    ...(resolveReasoningEffort(input)
      ? { reasoningEffort: resolveReasoningEffort(input) }
      : {})
  }
}

function compileRuntime(
  input: DshConversationInputCompileInput
): DshConversationInputEnvelope['runtime'] {
  const runtime = input.runtime ?? {}
  const cwd = runtime.cwd ?? cwdFromContext(input.context)
  const systemPrompt = runtime.systemPrompt ?? systemPromptFromContext(input.context)
  const responseLanguage =
    runtime.responseLanguage ?? responseLanguageFromContext(input.context)
  return {
    ...(runtime.agentPresetId ? { agentPresetId: runtime.agentPresetId } : {}),
    skillVersionRefs: uniqueSkillVersionReferences([
      ...(runtime.skillVersionRefs ?? []).map(normalizeSkillVersionReference),
      ...skillVersionReferencesFromContext(input.context)
    ]),
    connectorIds: unique([
      ...(runtime.connectorIds ?? []),
      ...connectorIdsFromContext(input.context)
    ]),
    mcpServerIds: unique([
      ...(runtime.mcpServerIds ?? []),
      ...mcpServerIdsFromContext(input.context)
    ]),
    enabledCapabilityIds: unique(runtime.enabledCapabilityIds ?? []),
    ...(cwd ? { cwd } : {}),
    contextRootIds: unique(
      runtime.contextRootIds ?? contextRootIdsFromContext(input.context)
    ),
    approvalMode:
      runtime.approvalMode ??
      approvalModeFromContext(input.context) ??
      'protected',
    ...(runtime.budgetProfileId
      ? { budgetProfileId: runtime.budgetProfileId }
      : {}),
    ...(runtime.goalObjective ? { goalObjective: runtime.goalObjective } : {}),
    ...(runtime.customInstructions
      ? { customInstructions: runtime.customInstructions }
      : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(runtime.productPolicy ? { productPolicy: runtime.productPolicy } : {}),
    ...(responseLanguage ? { responseLanguage } : {}),
    productContext: runtime.productContext ?? productContextFromContext(input.context)
  }
}

function compileAttachments(
  input: DshConversationInputCompileInput,
  promptBlocks: readonly DshConversationPromptBlock[]
): DshConversationInputEnvelope['attachments'] {
  const attachments = new Map<
    string,
    DshConversationInputEnvelope['attachments'][number]
  >()
  const attachmentContext =
    'attachmentContext' in input.context
      ? input.context.attachmentContext
      : undefined
  const imagePromptAttachmentIds = new Set(
    promptBlocks
      .filter((block) => block.type === 'image')
      .map((block) => block.attachmentId)
  )
  for (const attachment of attachmentContext?.attachments ?? []) {
    if (attachment.status !== 'ready') continue
    if (
      attachment.kind === 'image' &&
      !imagePromptAttachmentIds.has(attachment.attachmentId)
    ) {
      continue
    }
    const digest = attachment.digest ?? attachment.summary?.sourceDigest
    attachments.set(attachment.attachmentId, {
      attachmentId: attachment.attachmentId,
      kind: attachment.kind === 'image' ? 'image' : 'file',
      ...(attachment.kind === 'document' && attachment.path
        ? { path: attachment.path }
        : {}),
      ...(digest ? { digest } : {})
    })
  }
  for (const block of promptBlocks) {
    if (block.type === 'image' && !attachments.has(block.attachmentId)) {
      attachments.set(block.attachmentId, {
        attachmentId: block.attachmentId,
        kind: 'image'
      })
    }
    if (block.type === 'resource_link') {
      const attachmentId = resourceAttachmentId(block.uri)
      attachments.set(attachmentId, {
        attachmentId,
        kind: 'resource_link'
      })
    }
  }
  return [...attachments.values()]
}

function localAttachmentContext(context: RunContext): string | undefined {
  const attachmentContext =
    'attachmentContext' in context ? context.attachmentContext : undefined
  const sections: string[] = []
  for (const attachment of attachmentContext?.attachments ?? []) {
    if (
      attachment.kind === 'document' &&
      attachment.status === 'ready' &&
      (attachment.extraction === 'text' || attachment.extraction === 'parser')
    ) {
      const text = extractedAttachmentText(attachment)
      if (text) {
        sections.push(
          `[附件 ${attachment.attachmentId}: ${attachment.fileName}，已本地抽取]\n${text}`
        )
      }
      continue
    }
    if (
      attachment.kind === 'image' &&
      attachment.status === 'ready' &&
      attachment.extraction === 'ocr'
    ) {
      const text = extractedAttachmentText(attachment)
      if (text) {
        sections.push(
          `[附件 ${attachment.attachmentId}: ${attachment.fileName}，已本地 OCR]\n${text}`
        )
      }
      continue
    }
    if (attachment.status === 'failed') {
      sections.push(
        `[附件 ${attachment.attachmentId}: ${attachment.fileName} 处理失败]\n${
          attachment.errorMessage?.trim() || '附件内容无法在本地抽取'
        }`
      )
    }
  }
  return sections.length > 0 ? sections.join('\n\n') : undefined
}

function extractedAttachmentText(input: {
  content?: string
  summary?: {
    root: {
      summary: string
    }
  }
}): string | undefined {
  const content = input.content?.trim()
  if (content) return content
  const summary = input.summary?.root.summary.trim()
  return summary || undefined
}

function currentPromptText(context: RunContext): string {
  if ('messages' in context && context.messages.length > 0) {
    const userMessage = [...context.messages]
      .reverse()
      .find((message) => message.role === 'user')
    const content = (userMessage ?? context.messages.at(-1))?.content.trim()
    if (content) return content
  }
  if ('prompt' in context && context.prompt.trim()) {
    return context.prompt.trim()
  }
  throw new Error('DSH conversation prompt text is required')
}

function imagePromptBlocks(
  context: RunContext
): DshConversationPromptBlockInput[] {
  const attachmentContext =
    'attachmentContext' in context ? context.attachmentContext : undefined
  return (attachmentContext?.imageParts ?? []).map((part) => ({
    type: 'image',
    attachmentId: part.attachmentId,
    mediaType: part.mimeType as DshConversationImageMediaType
  }))
}

function resolveReasoningEffort(
  input: DshConversationInputCompileInput
): ReasoningLevel | undefined {
  if (input.runtime?.reasoningEffort) return input.runtime.reasoningEffort
  const context = input.context
  const candidates = [
    'reasoning' in context ? context.reasoning : undefined,
    'effectiveReasoning' in context ? context.effectiveReasoning : undefined,
    'requestedReasoning' in context ? context.requestedReasoning : undefined
  ]
  return candidates.find(isReasoningLevel)
}

function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return (
    value === 'off' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high'
  )
}

function skillVersionReferencesFromContext(
  context: RunContext
): DshConversationSkillVersionReference[] {
  const skill = 'skill' in context ? context.skill : undefined
  return isSkillDefinitionReference(skill)
    ? [normalizeSkillVersionReference(skill)]
    : []
}

function connectorIdsFromContext(context: RunContext): string[] {
  const bindings =
    'connectorBindings' in context && Array.isArray(context.connectorBindings)
      ? context.connectorBindings
      : []
  return bindings.flatMap((binding) => {
    if (!binding || typeof binding !== 'object') return []
    const record = binding as Record<string, unknown>
    const id = record.connectorId ?? record.id
    return typeof id === 'string' && id.trim() ? [id.trim()] : []
  })
}

function mcpServerIdsFromContext(context: RunContext): string[] {
  return 'mcpServerIds' in context && Array.isArray(context.mcpServerIds)
    ? context.mcpServerIds
    : []
}

function cwdFromContext(context: RunContext): string | undefined {
  return 'folderPath' in context && context.folderPath
    ? context.folderPath
    : undefined
}

function contextRootIdsFromContext(context: RunContext): string[] {
  if ('workspaceId' in context && context.workspaceId) return [context.workspaceId]
  if ('folderPath' in context && context.folderPath) {
    return [resourceAttachmentId(context.folderPath)]
  }
  return []
}

function approvalModeFromContext(
  context: RunContext
): RuntimePolicyManifest['approvalMode'] | undefined {
  return 'approvalProfileId' in context ? context.approvalProfileId : undefined
}

function systemPromptFromContext(context: RunContext): string | undefined {
  return 'systemPrompt' in context && context.systemPrompt
    ? context.systemPrompt
    : undefined
}

function responseLanguageFromContext(
  context: RunContext
): ResponseLanguageSnapshot | undefined {
  return 'responseLanguage' in context && context.responseLanguage
    ? context.responseLanguage
    : undefined
}

function productContextFromContext(
  context: RunContext
): DshConversationProductContext {
  return cleanObject({
    conversationId:
      'conversationId' in context ? context.conversationId : undefined,
    workspaceId: 'workspaceId' in context ? context.workspaceId : undefined,
    requirementId:
      'requirementId' in context ? context.requirementId : undefined,
    nodeId: 'nodeId' in context ? context.nodeId : undefined,
    nodeRunId: 'nodeRunId' in context ? context.nodeRunId : undefined,
    scheduleRunId:
      'scheduleRunId' in context ? context.scheduleRunId : undefined,
    contextSnapshotId:
      'contextSnapshotId' in context ? context.contextSnapshotId : undefined,
    triggerBindingId:
      'triggerBindingId' in context ? context.triggerBindingId : undefined,
    triggerEventId:
      'triggerEventId' in context ? context.triggerEventId : undefined,
    pipelineVersion:
      'pipelineVersion' in context ? context.pipelineVersion : undefined
  })
}

function conversationIdFromContext(
  context: RunContext,
  owner: DshRunOwner
): string | undefined {
  return (
    ('conversationId' in context ? context.conversationId : undefined) ??
    owner.conversationId
  )
}

function cleanOwner(owner: DshRunOwner): DshRunOwner {
  return cleanObject({
    conversationId: owner.conversationId,
    workspaceId: owner.workspaceId,
    requirementId: owner.requirementId,
    nodeRunId: owner.nodeRunId,
    scheduleRunId: owner.scheduleRunId
  })
}

function cleanObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, nested]) => nested !== undefined && nested !== ''
    )
  ) as T
}

function isSkillDefinitionReference(
  value: unknown
): value is ToolDefinitionReference {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as ToolDefinitionReference).kind === 'skill' &&
    typeof (value as ToolDefinitionReference).id === 'string' &&
    typeof (value as ToolDefinitionReference).version === 'string' &&
    typeof (value as ToolDefinitionReference).digest === 'string'
  )
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeSkillVersionReference(
  value: ToolDefinitionReference
): DshConversationSkillVersionReference {
  const reference = normalizeToolDefinitionReference(value)
  if (reference.kind !== 'skill') {
    throw new Error('DSH Skill version reference must have kind "skill"')
  }
  return reference as DshConversationSkillVersionReference
}

function uniqueSkillVersionReferences(
  values: readonly DshConversationSkillVersionReference[]
): DshConversationSkillVersionReference[] {
  const references = new Map<string, DshConversationSkillVersionReference>()
  for (const value of values) {
    references.set(
      `${value.id}@${value.version}:${value.digest}`,
      value
    )
  }
  return [...references.values()]
}

function resourceAttachmentId(value: string): string {
  return `resource-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}
