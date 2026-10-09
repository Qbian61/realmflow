import { describe, expect, it } from 'vitest'
import type {
  PendingManagedDirectory,
  UnitOfWork
} from '../ports/business-repositories'
import {
  coordinateManagedCreation,
  ManagedCreationRollbackError
} from './managed-creation-coordinator'

function createPendingDirectory(input?: {
  events?: string[]
  commitError?: Error
  rollbackError?: Error
}): PendingManagedDirectory {
  const events = input?.events ?? []
  return {
    path: '/work/.realmflow/tmp/entity',
    directoryName: 'entity--1',
    async commit() {
      events.push('directory:commit')
      if (input?.commitError) throw input.commitError
      return {
        path: '/work/entity--1',
        directoryName: 'entity--1'
      }
    },
    async rollback() {
      events.push('directory:rollback')
      if (input?.rollbackError) throw input.rollbackError
    }
  }
}

function createUnitOfWork(
  events: string[],
  commitError?: Error
): UnitOfWork {
  return {
    async execute<T>(operation: () => T | Promise<T>): Promise<T> {
      try {
        const result = await operation()
        events.push('sqlite:commit')
        if (commitError) throw commitError
        return result
      } catch (error) {
        events.push('sqlite:rollback')
        throw error
      }
    }
  }
}

describe('managed creation coordinator', () => {
  it('persists before committing the directory and SQLite transaction', async () => {
    const events: string[] = []

    const result = await coordinateManagedCreation(
      createUnitOfWork(events),
      createPendingDirectory({ events }),
      async () => {
        events.push('persist')
        return { id: 'entity-1' }
      }
    )

    expect(result).toEqual({ id: 'entity-1' })
    expect(events).toEqual([
      'persist',
      'directory:commit',
      'sqlite:commit'
    ])
  })

  it('rolls back the prepared directory when persistence fails', async () => {
    const events: string[] = []
    const persistenceError = new Error('database write failed')

    await expect(
      coordinateManagedCreation(
        createUnitOfWork(events),
        createPendingDirectory({ events }),
        async () => {
          events.push('persist')
          throw persistenceError
        }
      )
    ).rejects.toBe(persistenceError)

    expect(events).toEqual([
      'persist',
      'sqlite:rollback',
      'directory:rollback'
    ])
  })

  it('rolls back SQLite and directory state when directory commit fails', async () => {
    const events: string[] = []
    const commitError = new Error('directory rename failed')

    await expect(
      coordinateManagedCreation(
        createUnitOfWork(events),
        createPendingDirectory({ events, commitError }),
        async () => {
          events.push('persist')
          return 'saved'
        }
      )
    ).rejects.toBe(commitError)

    expect(events).toEqual([
      'persist',
      'directory:commit',
      'sqlite:rollback',
      'directory:rollback'
    ])
  })

  it('rolls back a committed directory when SQLite commit fails', async () => {
    const events: string[] = []
    const sqliteCommitError = new Error('sqlite commit failed')

    await expect(
      coordinateManagedCreation(
        createUnitOfWork(events, sqliteCommitError),
        createPendingDirectory({ events }),
        async () => {
          events.push('persist')
          return 'saved'
        }
      )
    ).rejects.toBe(sqliteCommitError)

    expect(events).toEqual([
      'persist',
      'directory:commit',
      'sqlite:commit',
      'sqlite:rollback',
      'directory:rollback'
    ])
  })

  it('retains the original and rollback errors when cleanup also fails', async () => {
    const events: string[] = []
    const persistenceError = new Error('database write failed')
    const rollbackError = new Error('directory cleanup failed')

    const promise = coordinateManagedCreation(
      createUnitOfWork(events),
      createPendingDirectory({ events, rollbackError }),
      async () => {
        throw persistenceError
      }
    )

    await expect(promise).rejects.toMatchObject({
      name: 'ManagedCreationRollbackError',
      cause: persistenceError,
      rollbackError
    })
    await expect(promise).rejects.toBeInstanceOf(ManagedCreationRollbackError)
  })
})
