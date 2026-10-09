import type {
  CompactionSection,
  CompactionSummary
} from '../../../../domain/agent-run-recovery'

export type AgentContextFact = {
  section: CompactionSection
  content: string
  sourceIds: string[]
}

export type AgentContextCompaction = {
  summary: CompactionSummary
  sourceMappings: Array<{
    section: CompactionSection
    itemIndex: number
    sourceId: string
  }>
  characterCount: number
}

const REQUIRED_SECTIONS = new Set<CompactionSection>([
  'objective',
  'constraints',
  'incompleteItems'
])

const SECTION_ORDER: CompactionSection[] = [
  'objective',
  'constraints',
  'incompleteItems',
  'decisions',
  'artifacts',
  'references'
]

export function compactAgentContext(input: {
  facts: AgentContextFact[]
  maxCharacters: number
}): AgentContextCompaction {
  assertBudget(input.maxCharacters)
  const normalized = input.facts.map(normalizeFact)
  const requiredCharacters = normalized
    .filter((fact) => REQUIRED_SECTIONS.has(fact.section))
    .reduce((total, fact) => total + fact.content.length, 0)
  if (
    requiredCharacters > input.maxCharacters ||
    !normalized.some((fact) => fact.section === 'objective')
  ) {
    throw new Error('Context budget cannot retain required facts')
  }

  let remaining = input.maxCharacters
  const selected: AgentContextFact[] = []
  for (const section of SECTION_ORDER) {
    for (const fact of normalized.filter((item) => item.section === section)) {
      if (fact.content.length > remaining) {
        if (REQUIRED_SECTIONS.has(section)) {
          throw new Error('Context budget cannot retain required facts')
        }
        continue
      }
      selected.push(fact)
      remaining -= fact.content.length
    }
  }

  const compaction = buildCompaction(selected)
  validateAgentContextCompaction({
    compaction,
    knownSourceIds: new Set(
      normalized.flatMap((fact) => fact.sourceIds)
    ),
    requiredFacts: normalized.filter((fact) =>
      REQUIRED_SECTIONS.has(fact.section)
    ),
    maxCharacters: input.maxCharacters
  })
  return compaction
}

export function validateAgentContextCompaction(input: {
  compaction: AgentContextCompaction
  knownSourceIds: ReadonlySet<string>
  requiredFacts: AgentContextFact[]
  maxCharacters: number
}): void {
  assertBudget(input.maxCharacters)
  if (
    input.compaction.characterCount > input.maxCharacters ||
    compactionCharacterCount(input.compaction.summary) >
      input.maxCharacters
  ) {
    throw new Error('Compaction exceeds its context budget')
  }
  for (const mapping of input.compaction.sourceMappings) {
    if (!input.knownSourceIds.has(mapping.sourceId)) {
      throw new Error('Compaction references an unknown source')
    }
  }
  for (const fact of input.requiredFacts.map(normalizeFact)) {
    const values = sectionValues(input.compaction.summary, fact.section)
    if (!values.includes(fact.content)) {
      throw new Error('Compaction omitted a required fact')
    }
  }
}

function buildCompaction(
  facts: AgentContextFact[]
): AgentContextCompaction {
  const summary: CompactionSummary = {
    objective: '',
    constraints: [],
    decisions: [],
    incompleteItems: [],
    artifacts: [],
    references: []
  }
  const sourceMappings: AgentContextCompaction['sourceMappings'] = []
  for (const fact of facts) {
    const values = sectionValues(summary, fact.section)
    const itemIndex = values.length
    if (fact.section === 'objective') {
      if (summary.objective) continue
      summary.objective = fact.content
    } else {
      values.push(fact.content)
    }
    for (const sourceId of fact.sourceIds) {
      sourceMappings.push({
        section: fact.section,
        itemIndex,
        sourceId
      })
    }
  }
  return {
    summary,
    sourceMappings,
    characterCount: compactionCharacterCount(summary)
  }
}

function sectionValues(
  summary: CompactionSummary,
  section: CompactionSection
): string[] {
  if (section === 'objective') {
    return summary.objective ? [summary.objective] : []
  }
  return summary[section]
}

function compactionCharacterCount(summary: CompactionSummary): number {
  return (
    summary.objective.length +
    summary.constraints.reduce(sumLength, 0) +
    summary.decisions.reduce(sumLength, 0) +
    summary.incompleteItems.reduce(sumLength, 0) +
    summary.artifacts.reduce(sumLength, 0) +
    summary.references.reduce(sumLength, 0)
  )
}

function sumLength(total: number, value: string): number {
  return total + value.length
}

function normalizeFact(fact: AgentContextFact): AgentContextFact {
  const content = fact.content.trim()
  const sourceIds = [...new Set(fact.sourceIds.map((id) => id.trim()))]
  if (!content || sourceIds.some((id) => !id) || sourceIds.length === 0) {
    throw new Error('Invalid context compaction fact')
  }
  return { ...fact, content, sourceIds }
}

function assertBudget(maxCharacters: number): void {
  if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
    throw new Error('Context compaction budget must be a positive integer')
  }
}
