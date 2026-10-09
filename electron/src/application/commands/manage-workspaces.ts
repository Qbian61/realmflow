import { resolve } from 'node:path'
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
import { coordinateManagedCreation } from '../transactions/managed-creation-coordinator'

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
    const name = input.name.trim()
    if (!name) throw new Error('Space name is required')
    const description = input.description ?? ''
    const existing = await this.workspaces.get(input.id)
    if (existing) {
      if (existing.label === name && existing.description === description) {
        return existing
      }
      throw new Error('Space id already exists with different data')
    }

    const root = await this.workRoots.getCurrent()
    if (!root) throw new Error('Select a work root before creating a space')
    const pending = await this.directories.prepareManagedSpaceDirectory({
      rootPath: root.path,
      spaceId: input.id,
      name
    })

    return coordinateManagedCreation(
      this.unitOfWork,
      pending,
      async () => {
        const timestamp = this.now()
        const result = await this.workspaces.save(
          {
            id: input.id,
            path: pending.path,
            label: name,
            description,
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
        return result.entity
      }
    )
  }
}

export class UpdateSpaceUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    expectedRevision: number
    label?: string
    description?: string
    sortOrder?: number
  }): Promise<Revisioned<WorkspaceRecord>> {
    const current = await this.workspaces.get(input.id)
    if (!current) throw new Error(`Workspace not found: ${input.id}`)

    const label = input.label?.trim()
    if (input.label !== undefined && !label) {
      throw new Error('Space name is required')
    }
    const unchanged =
      (input.label === undefined || label === current.label) &&
      (input.description === undefined ||
        input.description === current.description) &&
      (input.sortOrder === undefined || input.sortOrder === current.sortOrder)
    if (unchanged) return current

    const result = await this.workspaces.save(
      {
        ...current,
        ...(label === undefined ? {} : { label }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
        updatedAt: this.now()
      },
      input.expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Workspace revision conflict')
    }
    return result.entity
  }
}

export class RelocateSpaceUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly requirements: RequirementRepository,
    private readonly executions: WorkflowExecutionRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    targetPath: string
    expectedRevision: number
  }): Promise<Revisioned<WorkspaceRecord>> {
    const current = await this.workspaces.get(input.id)
    if (!current) throw new Error(`Workspace not found: ${input.id}`)
    const target = await this.directories.inspectManagedSpaceDirectory({
      path: input.targetPath,
      spaceId: input.id
    })
    if (target.path === current.rootPath && target.path === current.path) {
      return current
    }
    if (current.revision !== input.expectedRevision) {
      throw new Error('Workspace revision conflict')
    }

    return this.unitOfWork.execute(async () => {
      const latest = await this.workspaces.get(input.id)
      if (!latest) throw new Error(`Workspace not found: ${input.id}`)
      if (target.path === latest.rootPath && target.path === latest.path) {
        return latest
      }
      if (latest.revision !== input.expectedRevision) {
        throw new Error('Workspace revision conflict')
      }
      const bound = await this.workspaces.getByPath(target.path)
      if (bound && bound.id !== input.id) {
        throw new Error('Space directory is already bound')
      }

      const requirements = await this.requirements.listByWorkspace(input.id)
      for (const requirement of requirements) {
        if (!requirement.directoryName) {
          throw new Error('Requirement directory binding is unavailable')
        }
        if (
          isRunningExecution(
            await this.executions.getActiveByRequirement(requirement.id)
          )
        ) {
          throw new Error('Space has an active workflow execution')
        }
      }

      const timestamp = this.now()
      const workspaceResult = await this.workspaces.save(
        {
          ...latest,
          path: target.path,
          rootPath: target.path,
          directoryName: target.directoryName,
          relocatedAt: timestamp,
          relocationSource: 'user',
          updatedAt: timestamp
        },
        latest.revision
      )
      if (workspaceResult.status === 'conflict') {
        throw new Error('Workspace revision conflict')
      }

      for (const requirement of requirements) {
        const requirementResult = await this.requirements.save(
          {
            ...requirement,
            workspaceRootPath: resolve(
              target.path,
              requirement.directoryName as string
            ),
            updatedAt: timestamp
          },
          requirement.revision
        )
        if (requirementResult.status === 'conflict') {
          throw new Error('Requirement revision conflict')
        }
      }
      return workspaceResult.entity
    })
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
        const deletedAt = this.now()
        return this.workspaces.delete(workspace.id, workspace.revision, {
          originalPath: move.originalPath,
          trashPath: move.movedPath,
          deletedAt,
          triggerSource: 'user'
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
    if (deletion.state === 'purging') {
      throw new Error('Workspace is being permanently deleted')
    }
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
