export const FOLLOW_UP_SUGGESTION_INTENTS = [
  'continue',
  'refine',
  'verify',
  'explain',
  'open_artifact'
] as const

export type FollowUpSuggestionIntent =
  (typeof FOLLOW_UP_SUGGESTION_INTENTS)[number]

export type FollowUpSuggestionDraft = {
  label: string
  prompt: string
  intent: FollowUpSuggestionIntent
}

export type FollowUpSuggestion = FollowUpSuggestionDraft & {
  id: string
  sortOrder: number
}

export type FollowUpSuggestionSetStatus =
  | 'generating'
  | 'ready'
  | 'failed'
  | 'superseded'

export type FollowUpSuggestionSet = {
  id: string
  conversationId: string
  assistantMessageId: string
  sourceRunId: string
  sourceDigest: string
  responseLocale: string
  status: FollowUpSuggestionSetStatus
  suggestions: FollowUpSuggestion[]
  revision: number
  createdAt: number
  updatedAt: number
}

export type AssistantMessageFollowUp = {
  suggestionSetId: string
  revision: number
  suggestions: Array<Omit<FollowUpSuggestion, 'sortOrder'>>
}

export type SuggestedMessageSource = {
  kind: 'follow_up_suggestion'
  suggestionSetId: string
  suggestionId: string
  sourceAssistantMessageId: string
}

export type ConversationGeneratedArtifact = {
  path: string
  name: string
  mediaType: string
  sizeBytes: number
  kind: string
}

export type ConversationGeneratedArtifactSource = {
  schemaVersion: 1
  generatedArtifacts: ConversationGeneratedArtifact[]
}

export type ConversationMessageSource =
  | { kind: 'manual' }
  | SuggestedMessageSource
  | ConversationGeneratedArtifactSource

export function createReadyFollowUpSuggestionSet(
  input: Omit<
    FollowUpSuggestionSet,
    'status' | 'suggestions' | 'revision' | 'updatedAt'
  >,
  drafts: ReadonlyArray<FollowUpSuggestionDraft & { id: string }>
): FollowUpSuggestionSet {
  if (drafts.length < 1 || drafts.length > 3) {
    throw new Error('Follow-up suggestions require between 1 and 3 items')
  }
  const ids = new Set<string>()
  const suggestions = drafts.map((draft, sortOrder) => {
    if (!draft.id.trim() || ids.has(draft.id)) {
      throw new Error('Follow-up suggestion ids must be unique')
    }
    if (!draft.label.trim() || !draft.prompt.trim()) {
      throw new Error('Follow-up suggestion text is required')
    }
    ids.add(draft.id)
    return {
      id: draft.id,
      label: draft.label.trim(),
      prompt: draft.prompt.trim(),
      intent: draft.intent,
      sortOrder
    }
  })
  return {
    ...input,
    status: 'ready',
    suggestions,
    revision: 1,
    updatedAt: input.createdAt
  }
}

export function supersedeFollowUpSuggestionSet(
  set: FollowUpSuggestionSet,
  updatedAt: number
): FollowUpSuggestionSet {
  if (set.status === 'superseded') {
    throw new Error('Follow-up suggestion set is already superseded')
  }
  return {
    ...set,
    status: 'superseded',
    revision: set.revision + 1,
    updatedAt
  }
}
