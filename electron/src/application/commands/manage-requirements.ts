import { instantiateRequirementWorkflow } from '../../../../domain/workflow'
import type {
  ManagedWorkspaceDirectoryGateway,
  DeletionLifecycleRepository,
  RequirementRecord,
  RequirementRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkRootRepository,
  WorkflowExecutionRepository,
  NodeRunRepository,
  WorkflowTemplateRepository,
  WorkspaceRepository
} from '../ports/business-repositories'

export class CreateRequirementUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly requirements: RequirementRepository,
    private readonly templates: WorkflowTemplateRepository,
    private readonly workflows: RequirementWorkflowRepository,
    private readonly executions: WorkflowExecutionRepository,
    private readonly nodeRuns: NodeRunRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    workspaceId: string
    title: string
    templateVersionId: string
    syncCompletedArtifactsToKnowledge?: boolean
  }): Promise<Revisioned<RequirementRecord>> {
    const workspace = await this.workspaces.get(input.workspaceId)
    if (!workspace?.rootPath) throw new Error('Workspace directory is unavailable')
    const template = await this.templates.getVersion(input.templateVersionId)
    if (!template || template.status !== 'published') {
      throw new Error('Published workflow template was not found')
    }

    const pending = await this.directories.prepareManagedRequirementDirectory({
      spacePath: workspace.rootPath,
      spaceId: workspace.id,
      requirementId: input.id,
      name: input.title
    })
    try {
      return await this.unitOfWork.execute(async () => {
        const timestamp = this.now()
        const requirementResult = await this.requirements.save(
          {
            id: input.id,
            workspaceId: input.workspaceId,
            title: input.title,
            stage: 'analysis',
            status: 'pending',
            workspaceRootPath: pending.path,
            workflowTemplateVersionId: template.id,
            directoryName: pending.directoryName,
            syncCompletedArtifactsToKnowledge:
              input.syncCompletedArtifactsToKnowledge ?? false,
            sortOrder: (
              await this.requirements.listByWorkspace(input.workspaceId)
            ).length,
            createdAt: timestamp,
            updatedAt: timestamp
          },
          0
        )
        if (requirementResult.status === 'conflict') {
          throw new Error('Requirement already exists')
        }

        const workflow = instantiateRequirementWorkflow(template, input.id)
        const workflowResult = await this.workflows.save(workflow, 0)
        if (workflowResult.status === 'conflict') {
          throw new Error('Requirement workflow already exists')
        }
        const currentNodeId = workflowResult.entity.nodes.find(
          (node) => node.status === 'ready'
        )?.id
        const executionId = `${input.id}:execution:1`
        const executionResult = await this.executions.save(
          {
            id: executionId,
            requirementId: input.id,
            status: 'created',
            ...(currentNodeId ? { currentNodeId } : {}),
            createdAt: timestamp,
            updatedAt: timestamp
          },
          0
        )
        if (executionResult.status === 'conflict') {
          throw new Error('Requirement workflow execution already exists')
        }
        for (const node of workflowResult.entity.nodes) {
          const stableNodeId = node.id.slice(node.id.lastIndexOf(':') + 1)
          const nodeRunResult = await this.nodeRuns.save(
            {
              id: `${input.id}:node-run:${stableNodeId}:1`,
              executionId,
              nodeId: node.id,
              status: node.status,
              attempt: 1,
              createdAt: timestamp,
              updatedAt: timestamp
            },
            0
          )
          if (nodeRunResult.status === 'conflict') {
            throw new Error(`Requirement node run already exists: ${node.id}`)
          }
        }

        await pending.commit()
        return requirementResult.entity
      })
    } catch (error) {
      await pending.rollback()
      throw error
    }
  }
}

export class DeleteRequirementUseCase {
  constructor(
    private readonly workRoots: WorkRootRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly requirements: RequirementRepository,
    private readonly executions: WorkflowExecutionRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    expectedRevision: number
  }): Promise<boolean> {
    const requirement = await this.requirements.get(input.id)
    if (!requirement) return false
    if (requirement.revision !== input.expectedRevision) return false
    if (
      isRunningExecution(
        await this.executions.getActiveByRequirement(input.id)
      )
    ) {
      throw new Error('Requirement has an active workflow execution')
    }
    const workspace = await this.workspaces.get(requirement.workspaceId)
    const root = workspace?.workRootId
      ? (await this.workRoots.list()).find(
          (candidate) => candidate.id === workspace.workRootId
        )
      : undefined
    if (!root || !requirement.workspaceRootPath) {
      throw new Error('Requirement directory is unavailable')
    }
    const move = await this.directories.moveManagedDirectoryToTrash({
      workRootPath: root.path,
      entityType: 'requirement',
      entityId: requirement.id,
      path: requirement.workspaceRootPath
    })
    try {
      const deleted = await this.unitOfWork.execute(async () => {
        if (
          isRunningExecution(
            await this.executions.getActiveByRequirement(input.id)
          )
        ) {
          throw new Error('Requirement has an active workflow execution')
        }
        return this.requirements.delete(requirement.id, requirement.revision, {
          originalPath: move.originalPath,
          trashPath: move.movedPath,
          deletedAt: this.now()
        })
      })
      if (!deleted) throw new Error('Requirement revision conflict')
      return true
    } catch (error) {
      await move.rollback()
      throw error
    }
  }
}

function isRunningExecution(
  execution:
    | Awaited<ReturnType<WorkflowExecutionRepository['getActiveByRequirement']>>
    | undefined
): boolean {
  return (
    execution?.status === 'running' ||
    execution?.status === 'waiting_user'
  )
}

export class RestoreRequirementUseCase {
  constructor(
    private readonly requirements: RequirementRepository &
      DeletionLifecycleRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway
  ) {}

  async execute(input: { id: string }): Promise<boolean> {
    const deletion = await this.requirements.getDeletion(input.id)
    if (!deletion) return false
    const move = await this.directories.restoreManagedDirectory({
      originalPath: deletion.originalPath,
      trashPath: deletion.trashPath
    })
    try {
      const restored = await this.unitOfWork.execute(() =>
        this.requirements.restore(input.id)
      )
      if (!restored) throw new Error('Requirement restore conflict')
      return true
    } catch (error) {
      await move.rollback()
      throw error
    }
  }
}
