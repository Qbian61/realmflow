import { createHash } from 'node:crypto'
import {
  CONTEXT_SNAPSHOT_POLICY_VERSION,
  type ContextSnapshot,
  type ContextSource
} from './context-snapshot'

export {
  CONTEXT_SNAPSHOT_POLICY_VERSION,
  type ContextSnapshot,
  type ContextSource
} from './context-snapshot'

type VersionedContent = {
  id: string
  version: number
  content: string
}

export type ContextAssemblerDependencies = {
  artifacts: {
    listPredecessorArtifacts: (
      requirementId: string,
      nodeId: string,
      scope: 'direct' | 'all'
    ) => Promise<
      Array<
        VersionedContent & {
          name: string
          relationship: 'direct' | 'ancestor'
        }
      >
    >
  }
  knowledge: {
    search: (
      requirementId: string,
      query: string
    ) => Promise<
      Array<
        VersionedContent & {
          sourceId?: string
          documentKey?: string
          generationId?: string
          sourceVersion?: string
          chunkId?: string
          chunkOrdinal?: number
          startOffset?: number
          endOffset?: number
          checksum?: string
          denseScore?: number
          denseRank?: number
          bm25Score?: number
          bm25Rank?: number
          fusionScore: number
          fusionRank?: number
        }
      >
    >
  }
  questions: {
    listByNodeRun: (nodeRunId: string) => Promise<
      Array<{
        id: string
        version: number
        prompt: string
        answer?: string
        status: 'open' | 'answered' | 'dismissed'
      }>
    >
  }
  todos: {
    listByNodeRun: (nodeRunId: string) => Promise<
      Array<{
        id: string
        version: number
        title: string
        status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
      }>
    >
  }
  attachments: {
    read: (
      requirementId: string,
      path: string
    ) => Promise<{ version: number; content: string }>
  }
}

export type AssembleContextInput = {
  requirement: {
    id: string
    version: number
    title: string
    description: string
    scope: string
    acceptanceCriteria: string[]
  }
  node: {
    id: string
    version: number
    name: string
    description: string
    prompt: string
    artifactSpecification: string
  }
  nodeRunId: string
  knowledgeQuery: string
  attachmentPaths: string[]
  includeRequirementBody: boolean
  predecessorArtifacts: 'none' | 'direct' | 'all'
  includeSpaceKnowledge: boolean
  maxCharacters: number
}

type PendingSource = Omit<
  ContextSource,
  | 'characterCount'
  | 'includedCharacters'
  | 'estimatedTokens'
  | 'status'
  | 'truncated'
  | 'summarized'
  | 'redacted'
  | 'preview'
> & {
  content: string
  exclusionReason?: ContextSource['exclusionReason']
}

export class ContextAssembler {
  constructor(private readonly dependencies: ContextAssemblerDependencies) {}

  async assemble(input: AssembleContextInput): Promise<ContextSnapshot> {
    if (!Number.isInteger(input.maxCharacters) || input.maxCharacters <= 0) {
      throw new Error('Context character budget must be a positive integer')
    }

    const [artifacts, questions, todos, knowledge, attachments] =
      await Promise.all([
        input.predecessorArtifacts === 'none'
          ? Promise.resolve([])
          : this.dependencies.artifacts.listPredecessorArtifacts(
              input.requirement.id,
              input.node.id,
              input.predecessorArtifacts
            ),
        this.dependencies.questions.listByNodeRun(input.nodeRunId),
        this.dependencies.todos.listByNodeRun(input.nodeRunId),
        input.includeSpaceKnowledge
          ? this.dependencies.knowledge.search(
              input.requirement.id,
              input.knowledgeQuery
            )
          : Promise.resolve([]),
        Promise.all(
          input.attachmentPaths.map(async (path) =>
            isSensitiveAttachmentPath(path)
              ? {
                  path,
                  version: 0,
                  content: '',
                  exclusionReason: 'sensitive_file' as const
                }
              : {
                  path,
                  ...(await this.dependencies.attachments.read(
                    input.requirement.id,
                    path
                  ))
                }
          )
        )
      ])

    const pending: PendingSource[] = [
      {
        kind: 'requirement',
        id: input.requirement.id,
        version: input.requirement.version,
        content: formatSection('Requirement', [
          input.requirement.title,
          ...(input.includeRequirementBody
            ? [
                input.requirement.description,
                input.requirement.scope
                  ? `Scope: ${input.requirement.scope}`
                  : '',
                input.requirement.acceptanceCriteria.length > 0
                  ? `Acceptance criteria:\n${input.requirement.acceptanceCriteria
                      .map((criterion) => `- ${criterion}`)
                      .join('\n')}`
                  : ''
              ]
            : [])
        ])
      },
      {
        kind: 'node',
        id: input.node.id,
        version: input.node.version,
        content: formatSection('Current node', [
          input.node.name,
          input.node.description,
          `Prompt: ${input.node.prompt}`,
          `Artifact specification: ${input.node.artifactSpecification}`
        ])
      },
      ...artifacts.map((artifact) => ({
        kind:
          artifact.relationship === 'direct'
            ? ('predecessor_artifact' as const)
            : ('ancestor_artifact' as const),
        id: artifact.id,
        version: artifact.version,
        content: formatSection(`Predecessor artifact: ${artifact.name}`, [
          artifact.content
        ])
      })),
      ...questions
        .filter(
          (question): question is typeof question & { answer: string } =>
            question.status === 'answered' && Boolean(question.answer)
        )
        .map((question) => ({
          kind: 'node_answer' as const,
          id: question.id,
          version: question.version,
          content: formatSection('Node answer', [
            `${question.prompt}: ${question.answer}`
          ])
        })),
      ...todos
        .filter((todo) => !['completed', 'cancelled'].includes(todo.status))
        .map((todo) => ({
          kind: 'node_todo' as const,
          id: todo.id,
          version: todo.version,
          content: formatSection('Open node todo', [
            `[${todo.status}] ${todo.title}`
          ])
        })),
      ...knowledge.map((chunk) => ({
        kind: 'knowledge' as const,
        id: chunk.id,
        version: chunk.version,
        ...(chunk.sourceId === undefined ? {} : { sourceId: chunk.sourceId }),
        ...(chunk.documentKey === undefined
          ? {}
          : { documentKey: chunk.documentKey }),
        ...(chunk.generationId === undefined
          ? {}
          : { generationId: chunk.generationId }),
        ...(chunk.sourceVersion === undefined
          ? {}
          : { sourceVersion: chunk.sourceVersion }),
        ...(chunk.chunkId === undefined ? {} : { chunkId: chunk.chunkId }),
        ...(chunk.chunkOrdinal === undefined
          ? {}
          : { chunkOrdinal: chunk.chunkOrdinal }),
        ...(chunk.startOffset === undefined
          ? {}
          : { startOffset: chunk.startOffset }),
        ...(chunk.endOffset === undefined
          ? {}
          : { endOffset: chunk.endOffset }),
        ...(chunk.checksum === undefined ? {} : { checksum: chunk.checksum }),
        ...(chunk.denseScore === undefined
          ? {}
          : { denseScore: chunk.denseScore }),
        ...(chunk.denseRank === undefined
          ? {}
          : { denseRank: chunk.denseRank }),
        ...(chunk.bm25Score === undefined
          ? {}
          : { bm25Score: chunk.bm25Score }),
        ...(chunk.bm25Rank === undefined
          ? {}
          : { bm25Rank: chunk.bm25Rank }),
        fusionScore: chunk.fusionScore,
        ...(chunk.fusionRank === undefined
          ? {}
          : { fusionRank: chunk.fusionRank }),
        content: formatSection('Knowledge snippet', [chunk.content])
      })),
      ...attachments.map((attachment) => ({
        kind: 'attachment' as const,
        id: attachment.path,
        version: attachment.version,
        content: attachment.exclusionReason
          ? ''
          : formatSection(`Attachment: ${attachment.path}`, [
              attachment.content
            ]),
        ...(attachment.exclusionReason
          ? { exclusionReason: attachment.exclusionReason }
          : {})
      }))
    ]

    return createSnapshot(pending, input.maxCharacters)
  }
}

function formatSection(title: string, values: string[]): string {
  return `## ${title}\n${values.filter(Boolean).join('\n')}\n\n`
}

function createSnapshot(
  pending: PendingSource[],
  maxCharacters: number
): ContextSnapshot {
  const knowledgeRequested = pending.some(
    (source) => source.kind === 'knowledge'
  )
  const eligibleKnowledgeCharacters = pending
    .filter(
      (source) =>
        source.kind === 'knowledge' &&
        (source.fusionScore ?? 0) >= MIN_KNOWLEDGE_CONFIDENCE
    )
    .reduce((total, source) => total + source.content.length, 0)
  const knowledgeBudget = Math.min(
    eligibleKnowledgeCharacters,
    Math.floor(maxCharacters * KNOWLEDGE_BUDGET_RATIO)
  )
  let fixedRemaining = maxCharacters - knowledgeBudget
  let knowledgeRemaining = knowledgeBudget
  let content = ''
  const sources: ContextSource[] = []
  const seenKnowledge = new Set<string>()
  let includedKnowledge = 0

  for (const source of pending) {
    if (source.exclusionReason) {
      sources.push(excludedSource(source, source.exclusionReason, 0))
      continue
    }
    if (
      source.kind === 'knowledge' &&
      (source.fusionScore ?? 0) < MIN_KNOWLEDGE_CONFIDENCE
    ) {
      sources.push(excludedSource(source, 'low_confidence'))
      continue
    }
    if (source.kind === 'knowledge') {
      const key = [
        source.sourceId ?? '',
        source.documentKey ?? '',
        source.sourceVersion ?? '',
        source.content.trim()
      ].join('\0')
      if (seenKnowledge.has(key)) {
        sources.push(excludedSource(source, 'duplicate'))
        continue
      }
      seenKnowledge.add(key)
    }

    const isKnowledge = source.kind === 'knowledge'
    const remaining = isKnowledge ? knowledgeRemaining : fixedRemaining
    if (remaining === 0) {
      sources.push(excludedSource(source, 'budget_exhausted'))
      continue
    }
    if (
      knowledgeBudget > 0 &&
      !isKnowledge &&
      isOptionalSource(source.kind) &&
      source.content.length > remaining
    ) {
      sources.push(excludedSource(source, 'budget_exhausted'))
      continue
    }
    const included = source.content.slice(0, remaining)
    content += included
    sources.push({
      kind: source.kind,
      id: source.id,
      version: source.version,
      characterCount: source.content.length,
      includedCharacters: included.length,
      estimatedTokens: Math.ceil(included.length / 4),
      status: 'included',
      truncated: included.length < source.content.length,
      summarized: false,
      redacted: false,
      ...sourceTraceability(source),
      preview: included
    })
    if (isKnowledge) {
      knowledgeRemaining -= included.length
      if (included.length > 0) includedKnowledge += 1
    } else {
      fixedRemaining -= included.length
    }
  }

  const insufficientKnowledge = knowledgeRequested && includedKnowledge === 0
  if (insufficientKnowledge) {
    const remaining = Math.max(0, maxCharacters - content.length)
    content += INSUFFICIENT_KNOWLEDGE_SIGNAL.slice(0, remaining)
  }

  return {
    policyVersion: CONTEXT_SNAPSHOT_POLICY_VERSION,
    content,
    sources,
    plan: {
      totalTokenBudget: Math.ceil(maxCharacters / 4),
      allocations: {
        fixed: Math.ceil((maxCharacters - knowledgeBudget) / 4),
        knowledge: Math.ceil(knowledgeBudget / 4)
      }
    },
    insufficientKnowledge,
    characterCount: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    checksum: `sha256:${createHash('sha256').update(content).digest('hex')}`
  }
}

const MIN_KNOWLEDGE_CONFIDENCE = 0.01
const KNOWLEDGE_BUDGET_RATIO = 0.3
const INSUFFICIENT_KNOWLEDGE_SIGNAL =
  '\n## Knowledge status\nLocal knowledge is insufficient for a grounded answer.\n'

function isOptionalSource(kind: ContextSource['kind']): boolean {
  return (
    kind === 'predecessor_artifact' ||
    kind === 'ancestor_artifact' ||
    kind === 'attachment'
  )
}

function excludedSource(
  source: PendingSource,
  exclusionReason: NonNullable<ContextSource['exclusionReason']>,
  characterCount = source.content.length
): ContextSource {
  return {
    kind: source.kind,
    id: source.id,
    version: source.version,
    characterCount,
    includedCharacters: 0,
    estimatedTokens: 0,
    status: 'excluded',
    truncated: false,
    summarized: false,
    redacted: false,
    exclusionReason,
    ...sourceTraceability(source),
    preview: ''
  }
}

function sourceTraceability(source: PendingSource): Pick<
  ContextSource,
  | 'sourceId'
  | 'documentKey'
  | 'generationId'
  | 'sourceVersion'
  | 'chunkId'
  | 'chunkOrdinal'
  | 'startOffset'
  | 'endOffset'
  | 'checksum'
  | 'denseScore'
  | 'denseRank'
  | 'bm25Score'
  | 'bm25Rank'
  | 'fusionScore'
  | 'fusionRank'
> {
  return {
    ...(source.sourceId === undefined ? {} : { sourceId: source.sourceId }),
    ...(source.documentKey === undefined
      ? {}
      : { documentKey: source.documentKey }),
    ...(source.generationId === undefined
      ? {}
      : { generationId: source.generationId }),
    ...(source.sourceVersion === undefined
      ? {}
      : { sourceVersion: source.sourceVersion }),
    ...(source.chunkId === undefined ? {} : { chunkId: source.chunkId }),
    ...(source.chunkOrdinal === undefined
      ? {}
      : { chunkOrdinal: source.chunkOrdinal }),
    ...(source.startOffset === undefined
      ? {}
      : { startOffset: source.startOffset }),
    ...(source.endOffset === undefined
      ? {}
      : { endOffset: source.endOffset }),
    ...(source.checksum === undefined ? {} : { checksum: source.checksum }),
    ...(source.denseScore === undefined
      ? {}
      : { denseScore: source.denseScore }),
    ...(source.denseRank === undefined
      ? {}
      : { denseRank: source.denseRank }),
    ...(source.bm25Score === undefined
      ? {}
      : { bm25Score: source.bm25Score }),
    ...(source.bm25Rank === undefined
      ? {}
      : { bm25Rank: source.bm25Rank }),
    ...(source.fusionScore === undefined
      ? {}
      : { fusionScore: source.fusionScore }),
    ...(source.fusionRank === undefined
      ? {}
      : { fusionRank: source.fusionRank })
  }
}

function isSensitiveAttachmentPath(path: string): boolean {
  const segments = path.toLowerCase().split(/[\\/]/)
  const sensitiveNames = new Set([
    '.env',
    'credential',
    'credentials',
    'secret',
    'secrets',
    'private-key',
    'private_key'
  ])
  return (
    segments.some((segment) => sensitiveNames.has(segment)) ||
    /\.(pem|key|p12|pfx)$/i.test(path)
  )
}
