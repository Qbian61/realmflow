import { projectRequirementMemory } from '../../../../domain/requirement-memory'
import type { FrozenKnowledgeSourceSnapshot } from './knowledge-index-coordinator'

type Requirement = {
  id: string
  workspaceId: string
  title: string
  status: 'pending' | 'active' | 'completed'
  revision: number
}

type NodeRun = {
  id: string
  nodeId: string
}

type Question = {
  id: string
  nodeRunId: string
  prompt: string
  status: string
  answer?: string
  answeredAt?: number
}

type Artifact = {
  id: string
  stageId: string
  relativePath: string
  version: number
  checksum: string
  isPrimary: boolean
  isValid?: boolean
}

type StoredRequirementMemory = {
  requirementId: string
  workspaceId: string
  requirementRevision: number
  completionVersion: number
  title: string
  content: string
  checksum: string
  revision: number
  createdAt: number
}

type Dependencies = {
  requirements: {
    get(id: string): Promise<Requirement | undefined>
  }
  readRequirementBody(requirementId: string): Promise<string>
  executions: {
    getLatestByRequirement(
      requirementId: string
    ): Promise<{ id: string } | undefined>
  }
  nodeRuns: {
    listLatestByExecution(executionId: string): Promise<NodeRun[]>
  }
  questions: {
    listByNodeRun(nodeRunId: string): Promise<Question[]>
  }
  artifacts: {
    listByRequirement(requirementId: string): Promise<Artifact[]>
  }
  memories: {
    storeVersion(
      input: Omit<
        StoredRequirementMemory,
        'completionVersion' | 'revision'
      >
    ): Promise<StoredRequirementMemory>
    withdraw(input: {
      requirementId: string
      retiredAt: number
    }): Promise<boolean>
  }
  coordinator: {
    enqueueSnapshot(
      snapshot: FrozenKnowledgeSourceSnapshot,
      triggerSource: 'source_event'
    ): Promise<{ status: 'enqueued' | 'replayed' | 'coalesced' }>
  }
}

export class RequirementMemoryService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now
  ) {}

  async syncCompleted(
    requirementId: string
  ): Promise<
    | { status: 'skipped' }
    | {
        status: 'enqueued' | 'replayed' | 'coalesced'
        completionVersion: number
      }
  > {
    const requirement = await this.dependencies.requirements.get(requirementId)
    if (!requirement || requirement.status !== 'completed') {
      return { status: 'skipped' }
    }
    const [body, execution, artifacts] = await Promise.all([
      this.dependencies.readRequirementBody(requirement.id),
      this.dependencies.executions.getLatestByRequirement(requirement.id),
      this.dependencies.artifacts.listByRequirement(requirement.id)
    ])
    const nodeRuns = execution
      ? await this.dependencies.nodeRuns.listLatestByExecution(execution.id)
      : []
    const questions = (
      await Promise.all(
        nodeRuns.map((nodeRun) =>
          this.dependencies.questions.listByNodeRun(nodeRun.id)
        )
      )
    ).flat()
    const nodeIdByRunId = new Map(
      nodeRuns.map((nodeRun) => [nodeRun.id, nodeRun.nodeId])
    )
    const requirementBody = parseRequirementBody(body)
    const draft = projectRequirementMemory({
      requirement: {
        id: requirement.id,
        workspaceId: requirement.workspaceId,
        title: requirement.title,
        ...requirementBody
      },
      completionVersion: 1,
      confirmedAnswers: questions
        .filter(
          (question) =>
            question.status === 'answered' &&
            Boolean(question.answer?.trim()) &&
            nodeIdByRunId.has(question.nodeRunId)
        )
        .map((question) => ({
          nodeId: nodeIdByRunId.get(question.nodeRunId)!,
          questionId: question.id,
          prompt: question.prompt,
          answer: question.answer!,
          answeredAt: question.answeredAt ?? 0
        })),
      formalArtifacts: artifacts
        .filter(
          (artifact) => artifact.isPrimary && artifact.isValid !== false
        )
        .map((artifact) => ({
          id: artifact.id,
          stageId: artifact.stageId,
          relativePath: artifact.relativePath,
          version: artifact.version,
          checksum: artifact.checksum
        }))
    })
    const stored = await this.dependencies.memories.storeVersion({
      requirementId: requirement.id,
      workspaceId: requirement.workspaceId,
      requirementRevision: requirement.revision,
      title: draft.title,
      content: draft.content,
      checksum: draft.checksum,
      createdAt: this.now()
    })
    const result = await this.dependencies.coordinator.enqueueSnapshot(
      {
        scopeKind: 'workspace',
        scopeId: stored.workspaceId,
        sourceKind: 'requirement_memory',
        sourceId: stored.requirementId,
        sourceRevision: stored.completionVersion,
        sourceVersion: `requirement-memory:${stored.completionVersion}`,
        sourceChecksum: stored.checksum,
        documents: [
          {
            documentKey: 'requirement-memory.md',
            sourceEntityId: stored.requirementId,
            requirementId: stored.requirementId,
            title: stored.title,
            content: stored.content
          }
        ]
      },
      'source_event'
    )
    return {
      status: result.status,
      completionVersion: stored.completionVersion
    }
  }

  async withdraw(
    requirementId: string
  ): Promise<{ status: 'withdrawn' | 'unchanged' }> {
    const withdrawn = await this.dependencies.memories.withdraw({
      requirementId,
      retiredAt: this.now()
    })
    return { status: withdrawn ? 'withdrawn' : 'unchanged' }
  }
}

function parseRequirementBody(body: string): {
  description: string
  scope: string[]
  acceptanceCriteria: string[]
} {
  const normalized = body.trim().replace(/\r\n?/g, '\n')
  const sections = new Map<string, string[]>()
  let current = 'description'
  sections.set(current, [])
  for (const line of normalized.split('\n')) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (heading) {
      const name = heading[1].trim().toLowerCase()
      if (name === 'scope') current = 'scope'
      else if (
        name === 'acceptance criteria' ||
        name === 'acceptance criterion'
      ) {
        current = 'acceptance'
      } else if (current === 'description' && sections.get(current)!.length === 0) {
        continue
      } else {
        current = `ignored:${name}`
      }
      if (!sections.has(current)) sections.set(current, [])
      continue
    }
    sections.get(current)?.push(line)
  }
  return {
    description: trimBlock(sections.get('description') ?? []),
    scope: parseList(sections.get('scope') ?? []),
    acceptanceCriteria: parseList(sections.get('acceptance') ?? [])
  }
}

function parseList(lines: readonly string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
}

function trimBlock(lines: readonly string[]): string {
  return lines.join('\n').trim()
}
