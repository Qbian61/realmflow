import type {
  DshRunOwner,
  KnowledgeRuntimeManifest,
  RuntimePolicyManifest
} from '../domain/dsh-run-manifest'
import type { ResponseLanguageSnapshot } from '../domain/response-language'
import type { ToolDefinitionReference } from '../domain/tool-definition'
import {
  requireEnum,
  requireObject,
  requireText
} from '../domain/tool-protocol-validation'

export const DSH_CONVERSATION_INPUT_SCHEMA_VERSION = 1 as const

export const DSH_CONVERSATION_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
] as const

export type DshConversationImageMediaType =
  (typeof DSH_CONVERSATION_IMAGE_MEDIA_TYPES)[number]

export type DshConversationTextPromptBlock = Readonly<{
  type: 'text'
  text: string
}>

export type DshConversationResourceLinkPromptBlock = Readonly<{
  type: 'resource_link'
  uri: string
  name?: string
}>

export type DshConversationImagePromptBlock = Readonly<{
  type: 'image'
  attachmentId: string
  mediaType: DshConversationImageMediaType
}>

export type DshConversationPromptBlock =
  | DshConversationTextPromptBlock
  | DshConversationResourceLinkPromptBlock
  | DshConversationImagePromptBlock

export type DshConversationSkillVersionReference = Readonly<
  Omit<ToolDefinitionReference, 'kind'> & {
    kind: 'skill'
  }
>

export type DshConversationPromptBlockInput =
  | DshConversationPromptBlock
  | Readonly<{
      type: string
      [key: string]: unknown
    }>

export type DshConversationInputEnvelope = Readonly<{
  schemaVersion: typeof DSH_CONVERSATION_INPUT_SCHEMA_VERSION
  conversationId?: string
  owner: DshRunOwner
  prompt: Readonly<{
    blocks: DshConversationPromptBlock[]
  }>
  route: Readonly<{
    modelProfileId: string
    providerId: string
    modelId: string
    reasoningEffort?: 'off' | 'low' | 'medium' | 'high'
  }>
  runtime: Readonly<{
    agentPresetId?: string
    skillVersionRefs: DshConversationSkillVersionReference[]
    connectorIds: string[]
    mcpServerIds: string[]
    enabledCapabilityIds: string[]
    cwd?: string
    contextRootIds: string[]
    approvalMode: RuntimePolicyManifest['approvalMode']
    budgetProfileId?: string
    goalObjective?: string
    customInstructions?: string
    systemPrompt?: string
    productPolicy?: string
    responseLanguage?: ResponseLanguageSnapshot
    productContext?: DshConversationProductContext
  }>
  knowledge: KnowledgeRuntimeManifest
  attachments: Array<
    Readonly<{
      attachmentId: string
      kind: 'file' | 'image' | 'resource_link'
      path?: string
      digest?: string
    }>
  >
}>

export type DshConversationProductContext = Readonly<{
  conversationId?: string
  workspaceId?: string
  requirementId?: string
  nodeId?: string
  nodeRunId?: string
  workflowExecutionId?: string
  scheduleRunId?: string
  contextSnapshotId?: string
  triggerBindingId?: string
  triggerEventId?: string
  pipelineVersion?: string
}>

const IMAGE_MEDIA_TYPE_SET = new Set<string>(
  DSH_CONVERSATION_IMAGE_MEDIA_TYPES
)

export function normalizeDshConversationPromptBlocks(
  blocks: readonly DshConversationPromptBlockInput[]
): DshConversationPromptBlock[] {
  return blocks.map((block, index) =>
    normalizeDshConversationPromptBlock(block, index)
  )
}

export function normalizeDshConversationPromptBlock(
  value: DshConversationPromptBlockInput,
  index = 0
): DshConversationPromptBlock {
  const block = requireObject(value, `DSH prompt block ${index}`)
  const type = requireText(block.type, `DSH prompt block ${index} type`)
  if (type === 'resource' || type === 'embedded_resource') {
    throw new Error('Embedded resource prompt blocks are unsupported')
  }
  if (type === 'text') {
    return deepFreeze({
      type,
      text: requireText(block.text, `DSH text prompt block ${index}`)
    })
  }
  if (type === 'resource_link') {
    const name =
      block.name === undefined
        ? undefined
        : requireText(block.name, `DSH resource link prompt block ${index} name`)
    return deepFreeze({
      type,
      uri: requireText(block.uri, `DSH resource link prompt block ${index} URI`),
      ...(name === undefined ? {} : { name })
    })
  }
  if (type === 'image') {
    return deepFreeze({
      type,
      attachmentId: requireText(
        block.attachmentId,
        `DSH image prompt block ${index} attachment ID`
      ),
      mediaType: requireEnum(
        block.mediaType,
        IMAGE_MEDIA_TYPE_SET,
        `DSH image prompt block ${index} media type`
      ) as DshConversationImageMediaType
    })
  }
  throw new Error(`Unsupported prompt input type: ${type}`)
}

export function deepFreezeDshConversationInputEnvelope(
  envelope: DshConversationInputEnvelope
): DshConversationInputEnvelope {
  return deepFreeze(envelope)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }
  return value
}
