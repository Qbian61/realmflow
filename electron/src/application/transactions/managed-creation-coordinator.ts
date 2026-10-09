import type {
  PendingManagedDirectory,
  UnitOfWork
} from '../ports/business-repositories'

export class ManagedCreationRollbackError extends Error {
  readonly rollbackError: unknown

  constructor(cause: unknown, rollbackError: unknown) {
    super('Managed creation failed and directory rollback also failed', {
      cause
    })
    this.name = 'ManagedCreationRollbackError'
    this.rollbackError = rollbackError
  }
}

export async function coordinateManagedCreation<T>(
  unitOfWork: UnitOfWork,
  pending: PendingManagedDirectory,
  persist: () => T | Promise<T>
): Promise<T> {
  try {
    return await unitOfWork.execute(async () => {
      const result = await persist()
      await pending.commit()
      return result
    })
  } catch (error) {
    try {
      await pending.rollback()
    } catch (rollbackError) {
      throw new ManagedCreationRollbackError(error, rollbackError)
    }
    throw error
  }
}
