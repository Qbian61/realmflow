import type {
  DeletionLifecycleRepository,
  ManagedWorkspaceDirectoryGateway,
  RequirementRepository,
  Revisioned,
  UnitOfWork,
  WorkRootRecord,
  WorkRootRepository,
  WorkspaceRecord,
  WorkspaceRepository,
  WorkflowExecutionRepository
} from '../ports/business-repositories'

export class SelectWorkRootUseCase {
  constructor(
    private readonly workRoots: WorkRootRepository,
    private readonly directories: ManagedWorkspaceDirectoryGateway,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    path: string
    expectedRevision: number
  }): Promise<Revisioned<WorkRootRecord>> {
    const path = await this.directories.initializeWorkRoot(input.path, input.id)
    const timestamp = this.now()
    const result = await this.workRoots.setCurrent(
      {
        id: input.id,
        path,
        isCurrent: true,
        createdAt: timestamp,
        lastUsedAt: timestamp
      },
      input.expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Work root revision conflict')
    }
    return result.entity
  }
}

export class CreateSpaceUseCase {
  constructor(
    private readonly workRoots: WorkRootRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    name: string
    description?: string
  }): Promise<Revisioned<WorkspaceRecord>> {
    const root = await this.workRoots.getCurrent()
    if (!root) throw new Error('Select a work root before creating a space')
    const pending = await this.directories.prepareManagedSpaceDirectory({
      rootPath: root.path,
      spaceId: input.id,
      name: input.name
    })

    try {
      return await this.unitOfWork.execute(async () => {
        const timestamp = this.now()
        const result = await this.workspaces.save(
          {
            id: input.id,
            path: pending.path,
            label: input.name,
            description: input.description ?? '',
            rootPath: pending.path,
            workRootId: root.id,
            directoryName: pending.directoryName,
            sortOrder: (await this.workspaces.list()).length,
            createdAt: timestamp,
            updatedAt: timestamp
          },
          0
        )
        if (result.status === 'conflict') {
          throw new Error('Space already exists')
        }
        await pending.commit()
        return result.entity
      })
    } catch (error) {
      await pending.rollback()
      throw error
    }
  }
}

export class DeleteSpaceUseCase {
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
    const workspace = await this.workspaces.get(input.id)
    if (!workspace) return false
    if (workspace.revision !== input.expectedRevision) return false
    const requirements = await this.requirements.listByWorkspace(input.id)
    for (const requirement of requirements) {
      if (
        isRunningExecution(
          await this.executions.getActiveByRequirement(requirement.id)
        )
      ) {
        throw new Error('Space has an active workflow execution')
      }
    }
    const root = workspace.workRootId
      ? (await this.workRoots.list()).find(
          (candidate) => candidate.id === workspace.workRootId
        )
      : undefined
    if (!root || !workspace.rootPath) {
      throw new Error('Space directory is unavailable')
    }
    const move = await this.directories.moveManagedDirectoryToTrash({
      workRootPath: root.path,
      entityType: 'space',
      entityId: workspace.id,
      path: workspace.rootPath
    })
    try {
      const deleted = await this.unitOfWork.execute(async () => {
        for (const requirement of requirements) {
          if (
            isRunningExecution(
              await this.executions.getActiveByRequirement(requirement.id)
            )
          ) {
            throw new Error('Space has an active workflow execution')
          }
        }
        return this.workspaces.delete(workspace.id, workspace.revision, {
          originalPath: move.originalPath,
          trashPath: move.movedPath,
          deletedAt: this.now()
        })
      })
      if (!deleted) throw new Error('Workspace revision conflict')
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

export class RestoreSpaceUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository &
      DeletionLifecycleRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway
  ) {}

  async execute(input: { id: string }): Promise<boolean> {
    const deletion = await this.workspaces.getDeletion(input.id)
    if (!deletion) return false
    const move = await this.directories.restoreManagedDirectory({
      originalPath: deletion.originalPath,
      trashPath: deletion.trashPath
    })
    try {
      const restored = await this.unitOfWork.execute(() =>
        this.workspaces.restore(input.id)
      )
      if (!restored) throw new Error('Workspace restore conflict')
      return true
    } catch (error) {
      await move.rollback()
      throw error
    }
  }
}
