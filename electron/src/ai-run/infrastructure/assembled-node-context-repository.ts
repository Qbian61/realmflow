import { randomUUID } from 'node:crypto'
import type { AiGenerateExecutorConfig } from '../../../../domain/workflow'
import type {
  ContextSnapshot,
  ContextAssembler
} from '../../application/context/context-assembler'
import type { PersistedContextSnapshot } from '../../application/context/context-snapshot'
import type {
  ContextSnapshotRepository,
  ModelPoolRepository,
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository,
  UnitOfWork
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
  snapshots: ContextSnapshotRepository
  models: Pick<ModelPoolRepository, 'getProfile' | 'getProvider'>
  unitOfWork: UnitOfWork
  assembler: Pick<ContextAssembler, 'assemble'>
  workspace: {
    getBinding: (requirementId: string) => Promise<{ rootName: string } | null>
    readRequirementBody: (requirementId: string) => Promise<string>
  }
  maxCharacters?: number
  createId?: () => string
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
    if (!input.modelProfileId) {
      throw new Error('Model profile ID is required for node context snapshot')
    }
    const [requirement, workflow, nodeRun, binding, existingSnapshot] =
      await Promise.all([
        this.dependencies.requirements.get(input.requirementId),
        this.dependencies.workflows.get(input.requirementId),
        this.dependencies.nodeRuns.get(input.nodeRunId),
        this.dependencies.workspace.getBinding(input.requirementId),
        this.dependencies.snapshots.getByNodeRun(input.nodeRunId)
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
    if (existingSnapshot) {
      return this.toExecutionContext(
        existingSnapshot,
        requirement.title,
        requirement.workspaceId,
        binding.rootName,
        input.executor.artifact.relativePath,
        input.modelProfileId
      )
    }

    const [profile, assembled] = await Promise.all([
      this.dependencies.models.getProfile(input.modelProfileId),
      this.assemble(input, requirement, workflow.revision, node)
    ])
    if (!profile) {
      throw new Error(`Model profile not found: ${input.modelProfileId}`)
    }
    const provider = await this.dependencies.models.getProvider(
      profile.providerId
    )
    if (!provider) {
      throw new Error(`Model provider not found: ${profile.providerId}`)
    }
    const createdAt = (this.dependencies.now ?? Date.now)()
    const persisted: PersistedContextSnapshot = {
      ...assembled,
      id: (this.dependencies.createId ?? randomUUID)(),
      requirementId: requirement.id,
      nodeId: node.id,
      nodeRunId: nodeRun.id,
      providerId: provider.id,
      modelProfileId: profile.id,
      modelId: profile.modelId,
      modelParameters: {
        timeoutMs: profile.timeoutMs,
        maxRetries: profile.maxRetries,
        maxConcurrency: profile.maxConcurrency,
        ...(node.configuration?.reasoning
          ? { reasoningPolicy: node.configuration.reasoning }
          : {})
      },
      createdAt
    }

    try {
      await this.dependencies.unitOfWork.execute(async () => {
        await this.dependencies.snapshots.append(persisted)
        const saved = await this.dependencies.nodeRuns.save(
          {
            ...nodeRun,
            checkpoint: {
              ...nodeRun.checkpoint,
              modelProfileId: profile.id,
              contextSnapshotId: persisted.id
            },
            updatedAt: createdAt
          },
          nodeRun.revision
        )
        if (saved.status === 'conflict') {
          throw new Error('Node run context snapshot revision conflict')
        }
      })
    } catch (error) {
      const winner = await this.dependencies.snapshots.getByNodeRun(nodeRun.id)
      if (!winner) throw error
      return this.toExecutionContext(
        winner,
        requirement.title,
        requirement.workspaceId,
        binding.rootName,
        input.executor.artifact.relativePath,
        input.modelProfileId
      )
    }

    return this.toExecutionContext(
      persisted,
      requirement.title,
      requirement.workspaceId,
      binding.rootName,
      input.executor.artifact.relativePath,
      input.modelProfileId
    )
  }

  private async assemble(
    input: {
      requirementId: string
      nodeRunId: string
      executor: AiGenerateExecutorConfig
    },
    requirement: {
      id: string
      revision: number
      title: string
    },
    workflowRevision: number,
    node: {
      id: string
      name: string
      description: string
      configuration?: {
        input: {
          includeRequirementBody: boolean
          predecessorArtifacts: 'none' | 'direct' | 'all'
          includeSpaceKnowledge: boolean
          attachments: string[]
        }
        prompt: string
        artifact: { relativePath: string; kind: string }
      }
    }
  ): Promise<ContextSnapshot> {
    const sourcePolicy = node.configuration?.input
    const includeRequirementBody = sourcePolicy?.includeRequirementBody ?? true
    const body = includeRequirementBody
      ? await this.dependencies.workspace.readRequirementBody(
          input.requirementId
        )
      : ''
    const prompt = node.configuration?.prompt ?? input.executor.prompt
    const artifact = node.configuration?.artifact ?? input.executor.artifact
    return this.dependencies.assembler.assemble({
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
        version: workflowRevision,
        name: node.name,
        description: node.description,
        prompt,
        artifactSpecification: `${artifact.kind}: ${artifact.relativePath}`
      },
      nodeRunId: input.nodeRunId,
      knowledgeQuery: `${requirement.title} ${node.name} ${prompt}`,
      attachmentPaths:
        sourcePolicy?.attachments ?? input.executor.context?.attachments ?? [],
      includeRequirementBody,
      predecessorArtifacts: sourcePolicy?.predecessorArtifacts ?? 'direct',
      includeSpaceKnowledge: sourcePolicy?.includeSpaceKnowledge ?? true,
      maxCharacters: this.dependencies.maxCharacters ?? 100_000
    })
  }

  private toExecutionContext(
    snapshot: PersistedContextSnapshot,
    requirementTitle: string,
    workspaceId: string,
    workspaceName: string,
    artifactPath: string,
    requestedModelProfileId: string
  ): NodeExecutionContext {
    if (snapshot.modelProfileId !== requestedModelProfileId) {
      throw new Error('Node context snapshot model conflict')
    }
    const requestedReasoning =
      snapshot.modelParameters.reasoningPolicy ?? 'inherit'
    const effectiveReasoning =
      requestedReasoning === 'inherit' ? undefined : requestedReasoning
    return {
      requirementId: snapshot.requirementId,
      requirementTitle,
      nodeId: snapshot.nodeId,
      nodeRunId: snapshot.nodeRunId,
      workspaceId,
      workspaceName,
      prompt: snapshot.content,
      ...(effectiveReasoning
        ? {
            reasoning: effectiveReasoning,
            effectiveReasoning
          }
        : {}),
      requestedReasoning,
      contextSnapshotId: snapshot.id,
      artifactPath,
      existingArtifacts: []
    }
  }
}
