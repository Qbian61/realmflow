export type ConversationMemoryScope =
  | 'conversation'
  | 'workspace'
  | 'requirement'
  | 'global_user'

export type ConversationMemoryEntry = Readonly<{
  id: string
  scope: ConversationMemoryScope
  scopeId: string
  kind: 'fact' | 'preference' | 'decision' | 'constraint' | 'outcome'
  content: string
  sourceMessageIds: readonly string[]
  sourceDigest: string
  importance: number
  validFrom: number
  expiresAt?: number
  supersededBy?: string
  trust: 'user_confirmed' | 'system_observed' | 'model_summary'
}>

export type RankedConversationMemory = Readonly<{
  entry: ConversationMemoryEntry
  score: number
}>

export function rankConversationMemories(input: {
  query: string
  scope: { kind: ConversationMemoryScope; id: string }
  entries: readonly ConversationMemoryEntry[]
  semanticScores?: ReadonlyMap<string, number>
  now: number
  limit?: number
}): RankedConversationMemory[] {
  const queryTerms = terms(input.query)
  const candidates = input.entries
    .filter(
      (entry) =>
        entry.scope === input.scope.kind &&
        entry.scopeId === input.scope.id &&
        entry.validFrom <= input.now &&
        (entry.expiresAt === undefined || entry.expiresAt > input.now) &&
        !entry.supersededBy &&
        (entry.trust === 'user_confirmed' ||
          entry.trust === 'system_observed')
    )
    .map((entry) => {
      const entryTerms = terms(entry.content)
      const lexical = overlap(queryTerms, entryTerms)
      const semantic = clamp(
        input.semanticScores?.get(entry.id) ?? 0
      )
      const ageDays = Math.max(
        0,
        (input.now - entry.validFrom) / 86_400_000
      )
      const recency = 1 / (1 + ageDays / 30)
      const trust =
        entry.trust === 'user_confirmed' ? 1 : 0.9
      return {
        entry,
        terms: entryTerms,
        score:
          (lexical * 0.45 +
            semantic * 0.3 +
            clamp(entry.importance) * 0.15 +
            recency * 0.1) *
          trust
      }
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.entry.validFrom - left.entry.validFrom ||
        left.entry.id.localeCompare(right.entry.id)
    )

  const selected: typeof candidates = []
  const remaining = [...candidates]
  const limit = Math.max(0, Math.min(8, input.limit ?? 8))
  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0
    let bestMmr = -Infinity
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]
      const duplicatePenalty = selected.reduce(
        (maximum, prior) =>
          Math.max(maximum, overlap(candidate.terms, prior.terms)),
        0
      )
      const mmr = candidate.score * 0.8 - duplicatePenalty * 0.2
      if (mmr > bestMmr) {
        bestMmr = mmr
        bestIndex = index
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0])
  }
  return selected.map(({ entry, score }) => ({ entry, score }))
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFC')
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}_-]+/u)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
  )
}

function overlap(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const term of left) if (right.has(term)) intersection += 1
  return intersection / new Set([...left, ...right]).size
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
