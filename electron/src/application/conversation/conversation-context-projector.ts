import { createHash } from 'node:crypto'
import type {
  CompactedConversationFact,
  ContextExclusionReason,
  ConversationContextProjection,
  ProjectedConversationMessage,
  RecalledMemoryReference
} from '../../../../domain/conversation-context-projection'
import type {
  TurnContextRoute
} from '../../../../domain/conversation-context-route'

const POLICY_VERSION = '1.0.0'
const DEFAULT_MAX_CHARACTERS = 24_000
const RECENT_MESSAGE_LIMIT = 6
const RUNTIME_HANDLE_PATTERN =
  /\b(?:browser|run|tool(?:-?call)?|process|terminal)-[a-z0-9-]{4,}\b/iu

export type ContextProjectionMessage = Readonly<{
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  sortOrder: number
}>

export class ConversationContextProjector {
  private readonly maxCharacters: number

  constructor(options: { maxCharacters?: number } = {}) {
    this.maxCharacters =
      options.maxCharacters ?? DEFAULT_MAX_CHARACTERS
  }

  project(input: {
    conversationId: string
    sourceMessage: ContextProjectionMessage
    route: TurnContextRoute
    history: readonly ContextProjectionMessage[]
    recalledMemory?: readonly RecalledMemoryReference[]
    createdAt: number
  }): ConversationContextProjection {
    const selected = new Set(input.route.selectedMessageIds)
    const selectedHistory = input.history
      .filter((message) => selected.has(message.id))
      .sort((left, right) => left.sortOrder - right.sortOrder)
    const compactedSource = selectedHistory.slice(
      0,
      Math.max(0, selectedHistory.length - RECENT_MESSAGE_LIMIT)
    )
    const compactedFacts = compactMessages(compactedSource)
    const representedByCompaction = new Set(
      compactedFacts.flatMap(({ sourceMessageIds }) => sourceMessageIds)
    )
    const recentCandidates = selectedHistory.slice(-RECENT_MESSAGE_LIMIT)
    const exclusions = new Map<string, ContextExclusionReason>()
    const eligibleRecent = recentCandidates.filter((message) => {
      if (!mustExclude(message)) return true
      exclusions.set(message.id, exclusionReason(message, selected))
      return false
    })
    const current = projectMessage(input.sourceMessage)
    const recentMessages: ProjectedConversationMessage[] = [current]
    let characterCount = current.content.length
    for (let index = eligibleRecent.length - 1; index >= 0; index -= 1) {
      const message = eligibleRecent[index]
      if (
        characterCount + message.content.length >
        this.maxCharacters
      ) {
        exclusions.set(message.id, 'budget')
        continue
      }
      recentMessages.unshift(projectMessage(message))
      characterCount += message.content.length
    }
    for (const message of input.history) {
      if (
        recentMessages.some(({ messageId }) => messageId === message.id) ||
        representedByCompaction.has(message.id) ||
        exclusions.has(message.id)
      ) {
        continue
      }
      exclusions.set(message.id, exclusionReason(message, selected))
    }
    const recalledMemory: RecalledMemoryReference[] = []
    for (const memory of [...(input.recalledMemory ?? [])].sort(
      (left, right) => right.score - left.score
    )) {
      if (
        characterCount + memory.content.length >
        this.maxCharacters
      ) {
        continue
      }
      recalledMemory.push(memory)
      characterCount += memory.content.length
    }
    const excluded = input.history
      .filter((message) => exclusions.has(message.id))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((message) => ({
        messageId: message.id,
        reason: exclusions.get(message.id)!
      }))
    const stable = {
      schemaVersion: 1 as const,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessage.id,
      routePolicyVersion: input.route.policyVersion,
      projectionPolicyVersion: POLICY_VERSION,
      recentMessages,
      compactedFacts,
      recalledMemory,
      excluded,
      characterCount,
      estimatedTokens: Math.ceil(characterCount / 4),
      createdAt: input.createdAt
    }
    const digest = createHash('sha256')
      .update(JSON.stringify(stable))
      .digest('hex')
    return {
      ...stable,
      id: `projection-${input.sourceMessage.id}`,
      digest
    }
  }
}

function projectMessage(
  message: ContextProjectionMessage
): ProjectedConversationMessage {
  return {
    messageId: message.id,
    role: message.role,
    content: message.content
  }
}

function mustExclude(message: ContextProjectionMessage): boolean {
  return message.role === 'tool' || RUNTIME_HANDLE_PATTERN.test(message.content)
}

function exclusionReason(
  message: ContextProjectionMessage,
  selected: ReadonlySet<string>
): ContextExclusionReason {
  if (RUNTIME_HANDLE_PATTERN.test(message.content)) return 'runtime_handle'
  if (message.role === 'tool') return 'tool_result_pruned'
  return selected.has(message.id) ? 'sensitive' : 'unrelated'
}

function compactMessages(
  messages: readonly ContextProjectionMessage[]
): CompactedConversationFact[] {
  const facts: CompactedConversationFact[] = []
  let current: ContextProjectionMessage[] = []
  const flush = () => {
    if (current.length === 0) return
    const user = current.find(({ role }) => role === 'user')
    const assistants = current.filter(({ role }) => role === 'assistant')
    facts.push({
      objective: sanitizeRuntimeHandles(
        user?.content ?? current[0].content
      ),
      decisions: assistants
        .map(({ content }) => sanitizeRuntimeHandles(content))
        .filter(Boolean),
      constraints: [],
      openItems: [],
      artifacts: [],
      stableReferences: [],
      sourceMessageIds: current.map(({ id }) => id)
    })
    current = []
  }
  for (const message of messages) {
    if (message.role === 'tool') continue
    if (message.role === 'user' && current.length > 0) flush()
    current.push(message)
  }
  flush()
  return facts
}

function sanitizeRuntimeHandles(content: string): string {
  return content.replace(
    new RegExp(RUNTIME_HANDLE_PATTERN.source, 'giu'),
    '[runtime resource omitted]'
  )
}
