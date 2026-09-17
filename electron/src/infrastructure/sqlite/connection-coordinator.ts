import { AsyncLocalStorage } from 'node:async_hooks'
import type Database from 'better-sqlite3'

const coordinators = new WeakMap<
  Database.Database,
  SqliteConnectionCoordinator
>()

export class SqliteConnectionCoordinator {
  private readonly context = new AsyncLocalStorage<symbol>()
  private tail: Promise<void> = Promise.resolve()
  private activeOwner: symbol | undefined

  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    const currentOwner = this.context.getStore()
    if (currentOwner && currentOwner === this.activeOwner) return operation()
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    const owner = Symbol('sqlite-connection-owner')
    this.activeOwner = owner
    try {
      return await this.context.run(owner, operation)
    } finally {
      if (this.activeOwner === owner) this.activeOwner = undefined
      release()
    }
  }
}

export function getSqliteConnectionCoordinator(
  database: Database.Database
): SqliteConnectionCoordinator {
  const existing = coordinators.get(database)
  if (existing) return existing
  const coordinator = new SqliteConnectionCoordinator()
  coordinators.set(database, coordinator)
  return coordinator
}

export function coordinateRepository<T extends object>(
  repository: T,
  coordinator: SqliteConnectionCoordinator
): T {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) =>
        coordinator.run(() => Reflect.apply(value, target, args))
    }
  })
}
