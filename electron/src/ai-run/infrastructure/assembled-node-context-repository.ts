import type { AiGenerateExecutorConfig } from '../../../../domain/workflow'
import {
  CONTEXT_SNAPSHOT_POLICY_VERSION,
  type ContextSnapshot,
  type ContextAssembler
} from '../../application/context/context-assembler'
import type {
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository
} from '../../application/ports/business-repositories'
import type {
  NodeExecutionContext,
  StageContextRepository
} from '../application/ports'

type Dependencies = {
  legacy: Pick<StageContextRepository, 'load'>
  requirements: Pick<RequirementRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'get' | 'save'>
  assembler: Pick<ContextAssembler, 'assemble'>
  workspace: {
    getBinding: (requirementId: string) => Promise<{ rootName: string } | null>
    readRequirementBody: (requirementId: string) => Promise<string>
    listAttachmentPaths: (requirementId: string) => Promise<string[]>
  }
  maxCharacters?: number
  now?: () => number
}

export class AssembledNodeContextRepository implements StageContextRepository {
  constructor(private readonly dependencies: Dependencies) {}

  load: StageContextRepository['load'] = (requirementId, stageId) =>
    this.dependencies.legacy.load(requirementId, stageId)

  async loadNode(input: {
    requirementId: string
    nodeId: string
    nodeRunId: string
    executor: AiGenerateExecutorConfig
    modelProfileId?: string
  }): Promise<NodeExecutionContext> {
    const [requirement, workflow, nodeRun, binding] = await Promise.all([
      this.dependencies.requirements.get(input.requirementId),
      this.dependencies.workflows.get(input.requirementId),
      this.dependencies.nodeRuns.get(input.nodeRunId),
      this.dependencies.workspace.getBinding(input.requirementId)
    ])
    const node = workflow?.nodes.find(
      (candidate) => candidate.id === input.nodeId
    )
    if (!requirement || !workflow || !node || !nodeRun || !binding) {
      throw new Error('Node context dependencies are unavailable')
    }
    if (nodeRun.nodeId !== input.nodeId) {
      throw new Error('Node run does not match context node')
    }

    let snapshot = readSnapshot(nodeRun.checkpoint?.contextSnapshot)
    const assembledNow = !snapshot
    if (!snapshot) {
      const body = await this.dependencies.workspace.readRequirementBody(
        input.requirementId
      )
      const attachmentPaths = input.executor.context?.attachments ?? []
      snapshot = await this.dependencies.assembler.assemble({
        requirement: {
          id: requirement.id,
          version: requirement.revision,
          title: requirement.title,
          description: body,
          scope: '',
          acceptanceCriteria: []
        },
        node: {
          id: node.id,
          version: workflow.revision,
          name: node.name,
          description: node.description,
          prompt: input.executor.prompt,
          artifactSpecification: `${input.executor.artifact.kind}: ${input.executor.artifact.relativePath}`
        },
        nodeRunId: input.nodeRunId,
        knowledgeQuery: `${requirement.title} ${node.name} ${input.executor.prompt}`,
        attachmentPaths,
        maxCharacters: this.dependencies.maxCharacters ?? 100_000
      })
    }
    if (
      assembledNow ||
      (input.modelProfileId &&
        nodeRun.checkpoint?.modelProfileId !== input.modelProfileId)
    ) {
      const result = await this.dependencies.nodeRuns.save(
        {
          ...nodeRun,
          checkpoint: {
            ...nodeRun.checkpoint,
            ...(input.modelProfileId
              ? { modelProfileId: input.modelProfileId }
              : {}),
            contextSnapshot: snapshot
          },
          updatedAt: (this.dependencies.now ?? Date.now)()
        },
        nodeRun.revision
      )
      if (result.status === 'conflict') {
        throw new Error('Node run context snapshot revision conflict')
      }
    }

    return {
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      nodeId: node.id,
      workspaceName: binding.rootName,
      prompt: snapshot.content,
      artifactPath: input.executor.artifact.relativePath,
      existingArtifacts: []
    }
  }
}

function readSnapshot(value: unknown): ContextSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const snapshot = value as Partial<ContextSnapshot>
  if (
    snapshot.policyVersion !== CONTEXT_SNAPSHOT_POLICY_VERSION ||
    typeof snapshot.content !== 'string' ||
    !Array.isArray(snapshot.sources) ||
    typeof snapshot.characterCount !== 'number' ||
    typeof snapshot.estimatedTokens !== 'number' ||
    typeof snapshot.checksum !== 'string'
  ) {
    return undefined
  }
  return snapshot as ContextSnapshot
}
