import type {
  ManagedWorkspaceDirectoryGateway,
  TrashEntityType,
  TrashLifecycleRepository,
  UnitOfWork
} from '../ports/business-repositories'

export type TrashItemView = {
  entityType: TrashEntityType
  entityId: string
  displayName: string
  workspaceId?: string
  deletedAt: number
  triggerSource: 'user'
  state: 'trashed' | 'purging'
}

export class ListTrashItemsUseCase {
  constructor(private readonly trash: TrashLifecycleRepository) {}

  async execute(): Promise<TrashItemView[]> {
    return (await this.trash.list()).map(
      ({
        entityType,
        entityId,
        displayName,
        workspaceId,
        deletedAt,
        triggerSource,
        state
      }) => ({
        entityType,
        entityId,
        displayName,
        ...(workspaceId ? { workspaceId } : {}),
        deletedAt,
        triggerSource,
        state
      })
    )
  }
}

type PurgeCommand = {
  id: string
  confirmation: string
}

type PurgeDependencies = {
  trash: TrashLifecycleRepository
  unitOfWork: UnitOfWork
  directories: Pick<
    ManagedWorkspaceDirectoryGateway,
    'purgeManagedTrashDirectory'
  >
}

abstract class PurgeEntityUseCase {
  protected abstract readonly entityType: TrashEntityType

  protected constructor(protected readonly dependencies: PurgeDependencies) {}

  async execute(input: PurgeCommand): Promise<{
    status: 'purged' | 'not_found'
  }> {
    if (input.confirmation !== 'PERMANENTLY_DELETE') {
      throw new Error('Permanent deletion confirmation is required')
    }
    const identity = {
      entityType: this.entityType,
      entityId: input.id
    } as const
    if (!(await this.dependencies.trash.get(identity))) {
      return { status: 'not_found' }
    }
    const purgeSet = await this.dependencies.trash.getPurgeSet(identity)
    await this.dependencies.unitOfWork.execute(async () => {
      if (
        !(await this.dependencies.trash.markPurging(
          purgeSet.map(({ entityType, entityId }) => ({
            entityType,
            entityId
          }))
        ))
      ) {
        throw new Error('Trash item purge conflict')
      }
    })
    for (const item of purgeSet) {
      await this.dependencies.directories.purgeManagedTrashDirectory({
        trashPath: item.trashPath
      })
    }
    const deleted = await this.dependencies.unitOfWork.execute(() =>
      this.dependencies.trash.hardPurge(identity)
    )
    if (!deleted) throw new Error('Trash item purge conflict')
    return { status: 'purged' }
  }
}

export class PurgeSpaceUseCase extends PurgeEntityUseCase {
  protected readonly entityType = 'space' as const

  constructor(
    trash: TrashLifecycleRepository,
    unitOfWork: UnitOfWork,
    directories: PurgeDependencies['directories']
  ) {
    super({ trash, unitOfWork, directories })
  }
}

export class PurgeRequirementUseCase extends PurgeEntityUseCase {
  protected readonly entityType = 'requirement' as const

  constructor(
    trash: TrashLifecycleRepository,
    unitOfWork: UnitOfWork,
    directories: PurgeDependencies['directories']
  ) {
    super({ trash, unitOfWork, directories })
  }
}
