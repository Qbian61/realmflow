import { createHash } from 'node:crypto'

export const CONTEXT_SNAPSHOT_POLICY_VERSION = 1

export type ContextSourceKind =
  | 'requirement'
  | 'node'
  | 'predecessor_artifact'
  | 'node_answer'
  | 'node_todo'
  | 'knowledge'
  | 'attachment'

export type ContextSource = {
  kind: ContextSourceKind
  id: string
  version: number
  characterCount: number
  includedCharacters: number
  truncated: boolean
  score?: number
}

export type ContextSnapshot = {
  policyVersion: typeof CONTEXT_SNAPSHOT_POLICY_VERSION
  content: string
  sources: ContextSource[]
  characterCount: number
  estimatedTokens: number
  checksum: string
}

type VersionedContent = {
  id: string
  version: number
  content: string
}

export type ContextAssemblerDependencies = {
  artifacts: {
    listPredecessorArtifacts: (
      requirementId: string,
      nodeId: string
    ) => Promise<Array<VersionedContent & { name: string }>>
  }
  knowledge: {
    search: (
      requirementId: string,
      query: string
    ) => Promise<Array<VersionedContent & { score: number }>>
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
  maxCharacters: number
}

type PendingSource = Omit<
  ContextSource,
  'characterCount' | 'includedCharacters' | 'truncated'
> & {
  content: string
}

export class ContextAssembler {
  constructor(private readonly dependencies: ContextAssemblerDependencies) {}

  async assemble(input: AssembleContextInput): Promise<ContextSnapshot> {
    if (!Number.isInteger(input.maxCharacters) || input.maxCharacters <= 0) {
      throw new Error('Context character budget must be a positive integer')
    }

    const [artifacts, questions, todos, knowledge, attachments] =
      await Promise.all([
        this.dependencies.artifacts.listPredecessorArtifacts(
          input.requirement.id,
          input.node.id
        ),
        this.dependencies.questions.listByNodeRun(input.nodeRunId),
        this.dependencies.todos.listByNodeRun(input.nodeRunId),
        this.dependencies.knowledge.search(
          input.requirement.id,
          input.knowledgeQuery
        ),
        Promise.all(
          input.attachmentPaths.map(async (path) => ({
            path,
            ...(await this.dependencies.attachments.read(
              input.requirement.id,
              path
            ))
          }))
        )
      ])

    const pending: PendingSource[] = [
      {
        kind: 'requirement',
        id: input.requirement.id,
        version: input.requirement.version,
        content: formatSection('Requirement', [
          input.requirement.title,
          input.requirement.description,
          `Scope: ${input.requirement.scope}`,
          `Acceptance criteria:\n${input.requirement.acceptanceCriteria
            .map((criterion) => `- ${criterion}`)
            .join('\n')}`
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
        kind: 'predecessor_artifact' as const,
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
        score: chunk.score,
        content: formatSection('Knowledge snippet', [chunk.content])
      })),
      ...attachments.map((attachment) => ({
        kind: 'attachment' as const,
        id: attachment.path,
        version: attachment.version,
        content: formatSection(`Attachment: ${attachment.path}`, [
          attachment.content
        ])
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
  let remaining = maxCharacters
  let content = ''
  const sources: ContextSource[] = []

  for (const source of pending) {
    if (remaining === 0) break
    const included = source.content.slice(0, remaining)
    content += included
    sources.push({
      kind: source.kind,
      id: source.id,
      version: source.version,
      characterCount: source.content.length,
      includedCharacters: included.length,
      truncated: included.length < source.content.length,
      ...(source.score === undefined ? {} : { score: source.score })
    })
    remaining -= included.length
  }

  return {
    policyVersion: CONTEXT_SNAPSHOT_POLICY_VERSION,
    content,
    sources,
    characterCount: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    checksum: `sha256:${createHash('sha256').update(content).digest('hex')}`
  }
}
