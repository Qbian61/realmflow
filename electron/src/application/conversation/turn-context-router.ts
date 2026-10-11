import type {
  SemanticUnderstanding
} from '../../../../domain/conversation-processor'
import {
  isConversationClarificationResponse
} from '../../../../domain/conversation-processor'
import type {
  TurnContextReason,
  TurnContextRoute,
  TurnRelation
} from '../../../../domain/conversation-context-route'

const POLICY_VERSION = '1.0.0'
const CONTINUATION_PATTERN =
  /(?:继续|接着|刚才|上一个|前面|之前|按.+方案|continue|previous|earlier)/iu
const RUNTIME_HANDLE_PATTERN =
  /\b(?:browser|run|tool(?:-?call)?|process|terminal)-[a-z0-9-]{4,}\b/giu

export type TurnContextHistoryEntry = Readonly<{
  userMessageId: string
  assistantMessageId?: string
  userContent: string
  assistantContent?: string
  semanticUnderstanding?: SemanticUnderstanding
}>

export type TurnContextRoutingInput = Readonly<{
  sourceMessageId: string
  content: string
  semanticUnderstanding: SemanticUnderstanding
  override?: 'fresh' | 'continuation'
  referencedMessageIds?: readonly string[]
  history: readonly TurnContextHistoryEntry[]
  createdAt: number
}>

export class TurnContextRouter {
  route(input: TurnContextRoutingInput): TurnContextRoute {
    if (input.override === 'fresh') {
      return buildRoute(input, {
        relation: 'fresh',
        selected: [],
        reasons: ['manual_fresh'],
        confidence: 1
      })
    }
    if (input.override === 'continuation') {
      const previous = input.history.at(-1)
      if (previous) {
        return buildRoute(input, {
          relation: 'continuation',
          selected: messageIds(previous),
          predecessorMessageId: previous.userMessageId,
          reasons: ['manual_continuation'],
          confidence: 1
        })
      }
    }
    const explicit = this.explicitSelection(input)
    if (explicit.length > 0) {
      return buildRoute(input, {
        relation: 'reference',
        selected: explicit,
        reasons: ['explicit_reference'],
        confidence: 1
      })
    }

    const previous = input.history.at(-1)
    if (
      previous?.semanticUnderstanding &&
      isConversationClarificationResponse(
        previous.semanticUnderstanding,
        input.content
      )
    ) {
      return buildRoute(input, {
        relation: 'continuation',
        selected: messageIds(previous),
        predecessorMessageId: previous.userMessageId,
        reasons: ['clarification_response'],
        confidence: 1
      })
    }

    if (
      previous &&
      CONTINUATION_PATTERN.test(input.content) &&
      hasStableOverlap(input.semanticUnderstanding, previous)
    ) {
      return buildRoute(input, {
        relation: 'continuation',
        selected: messageIds(previous),
        predecessorMessageId: previous.userMessageId,
        reasons: ['continuation_phrase', 'entity_overlap'],
        confidence: 0.9
      })
    }

    const semanticReference = [...input.history]
      .reverse()
      .find((entry) =>
        hasEntityOverlap(input.semanticUnderstanding, entry)
      )
    if (semanticReference) {
      return buildRoute(input, {
        relation: 'reference',
        selected: messageIds(semanticReference),
        predecessorMessageId: semanticReference.userMessageId,
        reasons: ['entity_overlap', 'semantic_match'],
        confidence: 0.85
      })
    }

    const runtimeOnly = containsRuntimeHandle(input.content)
    return buildRoute(input, {
      relation: 'fresh',
      selected: [],
      reasons: [runtimeOnly ? 'runtime_only' : 'topic_changed'],
      confidence: runtimeOnly ? 0.95 : 0.8
    })
  }

  private explicitSelection(
    input: TurnContextRoutingInput
  ): TurnContextHistoryEntry[] {
    const referenced = new Set(input.referencedMessageIds ?? [])
    if (referenced.size === 0) return []
    return input.history.filter(
      (entry) =>
        referenced.has(entry.userMessageId) ||
        (entry.assistantMessageId
          ? referenced.has(entry.assistantMessageId)
          : false)
    )
  }
}

function buildRoute(
  input: TurnContextRoutingInput,
  decision: {
    relation: TurnRelation
    selected: readonly (TurnContextHistoryEntry | string)[]
    predecessorMessageId?: string
    reasons: readonly TurnContextReason[]
    confidence: number
  }
): TurnContextRoute {
  const selectedMessageIds = decision.selected.flatMap((entry) =>
    typeof entry === 'string' ? [entry] : messageIds(entry)
  )
  const selected = new Set(selectedMessageIds)
  const excludedMessageIds = input.history
    .flatMap(messageIds)
    .filter((id) => !selected.has(id))
  return {
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    sourceMessageId: input.sourceMessageId,
    sourceDigest: input.semanticUnderstanding.sourceDigest,
    relation: decision.relation,
    ...(decision.predecessorMessageId
      ? { predecessorMessageId: decision.predecessorMessageId }
      : {}),
    selectedMessageIds,
    excludedMessageIds,
    reasons: decision.reasons,
    confidence: decision.confidence,
    createdAt: input.createdAt
  }
}

function messageIds(entry: TurnContextHistoryEntry): string[] {
  return [
    entry.userMessageId,
    ...(entry.assistantMessageId ? [entry.assistantMessageId] : [])
  ]
}

function containsRuntimeHandle(content: string): boolean {
  RUNTIME_HANDLE_PATTERN.lastIndex = 0
  return RUNTIME_HANDLE_PATTERN.test(content)
}

function hasStableOverlap(
  current: SemanticUnderstanding,
  previous: TurnContextHistoryEntry
): boolean {
  const prior = previous.semanticUnderstanding
  if (!prior) return false
  if (hasEntityOverlap(current, previous)) return true
  const currentTerms = stableTerms(current.objective)
  return [...stableTerms(prior.objective)].some((term) =>
    currentTerms.has(term)
  )
}

function hasEntityOverlap(
  current: SemanticUnderstanding,
  previous: TurnContextHistoryEntry
): boolean {
  const prior = previous.semanticUnderstanding
  if (!prior || current.entities.length === 0) return false
  const currentEntities = new Set(
    current.entities.map(({ kind, id }) => `${kind}:${id}`)
  )
  return prior.entities.some(({ kind, id }) =>
    currentEntities.has(`${kind}:${id}`)
  )
}

function stableTerms(value: string): Set<string> {
  const withoutHandles = value.replace(RUNTIME_HANDLE_PATTERN, ' ')
  return new Set(
    withoutHandles
      .normalize('NFC')
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}_-]+/u)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
  )
}
