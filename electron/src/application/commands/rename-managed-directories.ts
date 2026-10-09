import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  ManagedDirectoryRenamePolicy,
  ManagedWorkspaceDirectoryGateway,
  RequirementRecord,
  RequirementRepository,
  Revisioned,
  UnitOfWork,
  WorkspaceRecord,
  WorkspaceRepository,
  WorkflowExecutionRepository
} from '../ports/business-repositories'

function hasActiveExecution(
  execution:
    | Awaited<ReturnType<WorkflowExecutionRepository['getActiveByRequirement']>>
    | undefined
): boolean {
  return (
    execution?.status === 'running' ||
    execution?.status === 'waiting_user'
  )
}

function childRelativePath(parentPath: string, childPath: string): string {
  const child = relative(parentPath, childPath)
  if (
    !child ||
    child === '..' ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    throw new Error('Managed requirement path is outside its space')
  }
  return child
}

async function assertRequirementsIdle(
  requirements: Array<Revisioned<RequirementRecord>>,
  executions: WorkflowExecutionRepository,
  message: string
): Promise<void> {
  for (const requirement of requirements) {
    if (
      hasActiveExecution(
        await executions.getActiveByRequirement(requirement.id)
      )
    ) {
      throw new Error(message)
    }
  }
}

export class RenameSpaceDirectoryUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly requirements: RequirementRepository,
    private readonly executions: WorkflowExecutionRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway,
    private readonly policy: ManagedDirectoryRenamePolicy,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    name: string
    expectedRevision: number
  }): Promise<Revisioned<WorkspaceRecord>> {
    const name = input.name.trim()
    if (!name) throw new Error('Physical directory name is required')
    const current = await this.workspaces.get(input.id)
    if (!current) throw new Error(`Workspace not found: ${input.id}`)
    const currentPath = current.rootPath ?? current.path
    const directoryName = this.directories.getManagedDirectoryName({
      entityId: current.id,
      name
    })
    if (directoryName === current.directoryName) return current
    if (current.revision !== input.expectedRevision) {
      throw new Error('Workspace revision conflict')
    }

    const requirements = await this.requirements.listByWorkspace(current.id)
    for (const requirement of requirements) {
      if (!requirement.workspaceRootPath) {
        throw new Error(`Requirement directory is unavailable: ${requirement.id}`)
      }
      childRelativePath(currentPath, requirement.workspaceRootPath)
    }
    await assertRequirementsIdle(
      requirements,
      this.executions,
      'Workspace has an active workflow execution'
    )
    await this.policy.assertAllowed({
      path: currentPath,
      entityType: 'space',
      entityId: current.id
    })

    const move = await this.directories.renameManagedDirectory({
      parentPath: resolve(currentPath, '..'),
      currentPath,
      entityType: 'space',
      entityId: current.id,
      name
    })
    try {
      return await this.unitOfWork.execute(async () => {
        const latest = await this.workspaces.get(input.id)
        if (!latest || latest.revision !== input.expectedRevision) {
          throw new Error('Workspace revision conflict')
        }
        const latestRequirements = await this.requirements.listByWorkspace(
          latest.id
        )
        await assertRequirementsIdle(
          latestRequirements,
          this.executions,
          'Workspace has an active workflow execution'
        )
        const timestamp = this.now()
        const workspaceResult = await this.workspaces.save(
          {
            ...latest,
            path: move.path,
            rootPath: move.path,
            directoryName: move.directoryName,
            updatedAt: timestamp
          },
          latest.revision
        )
        if (workspaceResult.status === 'conflict') {
          throw new Error('Workspace revision conflict')
        }

        for (const requirement of latestRequirements) {
          if (!requirement.workspaceRootPath) {
            throw new Error(
              `Requirement directory is unavailable: ${requirement.id}`
            )
          }
          const requirementResult = await this.requirements.save(
            {
              ...requirement,
              workspaceRootPath: resolve(
                move.path,
                childRelativePath(currentPath, requirement.workspaceRootPath)
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
    } catch (error) {
      await move.rollback()
      throw error
    }
  }
}

export class RenameRequirementDirectoryUseCase {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly requirements: RequirementRepository,
    private readonly executions: WorkflowExecutionRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly directories: ManagedWorkspaceDirectoryGateway,
    private readonly policy: ManagedDirectoryRenamePolicy,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: {
    id: string
    name: string
    expectedRevision: number
  }): Promise<Revisioned<RequirementRecord>> {
    const name = input.name.trim()
    if (!name) throw new Error('Physical directory name is required')
    const current = await this.requirements.get(input.id)
    if (!current) throw new Error(`Requirement not found: ${input.id}`)
    if (!current.workspaceRootPath) {
      throw new Error('Requirement directory is unavailable')
    }
    const directoryName = this.directories.getManagedDirectoryName({
      entityId: current.id,
      name
    })
    if (directoryName === current.directoryName) return current
    if (current.revision !== input.expectedRevision) {
      throw new Error('Requirement revision conflict')
    }
    const workspace = await this.workspaces.get(current.workspaceId)
    const spacePath = workspace?.rootPath ?? workspace?.path
    if (!workspace || !spacePath) {
      throw new Error(`Workspace not found: ${current.workspaceId}`)
    }
    childRelativePath(spacePath, current.workspaceRootPath)
    if (
      hasActiveExecution(
        await this.executions.getActiveByRequirement(current.id)
      )
    ) {
      throw new Error('Requirement has an active workflow execution')
    }
    await this.policy.assertAllowed({
      path: current.workspaceRootPath,
      entityType: 'requirement',
      entityId: current.id
    })

    const move = await this.directories.renameManagedDirectory({
      parentPath: spacePath,
      currentPath: current.workspaceRootPath,
      entityType: 'requirement',
      entityId: current.id,
      name
    })
    try {
      return await this.unitOfWork.execute(async () => {
        const latest = await this.requirements.get(input.id)
        if (!latest || latest.revision !== input.expectedRevision) {
          throw new Error('Requirement revision conflict')
        }
        if (
          hasActiveExecution(
            await this.executions.getActiveByRequirement(latest.id)
          )
        ) {
          throw new Error('Requirement has an active workflow execution')
        }
        const result = await this.requirements.save(
          {
            ...latest,
            workspaceRootPath: move.path,
            directoryName: move.directoryName,
            updatedAt: this.now()
          },
          latest.revision
        )
        if (result.status === 'conflict') {
          throw new Error('Requirement revision conflict')
        }
        return result.entity
      })
    } catch (error) {
      await move.rollback()
      throw error
    }
  }
}
