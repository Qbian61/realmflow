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
  NodeTodoRepository,
  WorkflowTemplateRepository,
  WorkspaceRepository
} from '../ports/business-repositories'
import { coordinateManagedCreation } from '../transactions/managed-creation-coordinator'
import { initializeConfiguredNodeTodos } from '../workflow/manage-node-todos'

export class CreateRequirementUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly requirements: RequirementRepository,
    private readonly templates: WorkflowTemplateRepository,
    private readonly workflows: RequirementWorkflowRepository,
    private readonly executions: WorkflowExecutionRepository,
    private readonly nodeRuns: NodeRunRepository,
    private readonly nodeTodos: NodeTodoRepository,
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
    const title = input.title.trim()
    if (!title) throw new Error('Requirement title is required')
    const syncCompletedArtifactsToKnowledge =
      input.syncCompletedArtifactsToKnowledge ?? false
    const existing = await this.requirements.get(input.id)
    if (existing) {
      if (
        existing.workspaceId === input.workspaceId &&
        existing.title === title &&
        existing.workflowTemplateVersionId === input.templateVersionId &&
        (existing.syncCompletedArtifactsToKnowledge ?? false) ===
          syncCompletedArtifactsToKnowledge
      ) {
        return existing
      }
      throw new Error('Requirement id already exists with different data')
    }

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
      name: title
    })
    return coordinateManagedCreation(
      this.unitOfWork,
      pending,
      async () => {
        const timestamp = this.now()
        const requirementResult = await this.requirements.save(
          {
            id: input.id,
            workspaceId: input.workspaceId,
            title,
            stage: 'analysis',
            status: 'pending',
            workspaceRootPath: pending.path,
            workflowTemplateVersionId: template.id,
            directoryName: pending.directoryName,
            ...(syncCompletedArtifactsToKnowledge
              ? { syncCompletedArtifactsToKnowledge: true }
              : {}),
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
        const workflowResult = await this.workflows.save(workflow, 0, {
          reason: 'workflow_created',
          triggerSource: 'user'
        })
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
          await initializeConfiguredNodeTodos(this.nodeTodos, {
            nodeRunId: nodeRunResult.entity.id,
            configuredTodos: node.configuration?.todos,
            timestamp
          })
        }

        return requirementResult.entity
      }
    )
  }
}

export class UpdateRequirementUseCase {
  constructor(
    private readonly requirements: RequirementRepository,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    expectedRevision: number
    title?: string
    status?: RequirementRecord['status']
    sortOrder?: number
    syncCompletedArtifactsToKnowledge?: boolean
  }): Promise<Revisioned<RequirementRecord>> {
    const current = await this.requirements.get(input.id)
    if (!current) throw new Error(`Requirement not found: ${input.id}`)

    const title = input.title?.trim()
    if (input.title !== undefined && !title) {
      throw new Error('Requirement title is required')
    }
    const unchanged =
      (input.title === undefined || title === current.title) &&
      (input.status === undefined || input.status === current.status) &&
      (input.sortOrder === undefined || input.sortOrder === current.sortOrder) &&
      (input.syncCompletedArtifactsToKnowledge === undefined ||
        input.syncCompletedArtifactsToKnowledge ===
          (current.syncCompletedArtifactsToKnowledge ?? false))
    if (unchanged) return current

    const result = await this.requirements.save(
      {
        ...current,
        ...(title === undefined ? {} : { title }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
        ...(input.syncCompletedArtifactsToKnowledge === undefined
          ? {}
          : {
              syncCompletedArtifactsToKnowledge:
                input.syncCompletedArtifactsToKnowledge
            }),
        updatedAt: this.now()
      },
      input.expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Requirement revision conflict')
    }
    return result.entity
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
          deletedAt: this.now(),
          triggerSource: 'user'
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
    if (deletion.state === 'purging') {
      throw new Error('Requirement is being permanently deleted')
    }
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
