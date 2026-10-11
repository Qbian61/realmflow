import type Database from 'better-sqlite3'
import type {
  RuntimeResourceLease,
  RuntimeResourceLeaseStatus,
  RuntimeResourceType
} from '../../../../domain/runtime-resource-lease'
import { RuntimeResourceStaleError } from '../../../../domain/runtime-resource-lease'

type RuntimeResourceLeaseRow = {
  id: string
  resource_type: RuntimeResourceType
  resource_id: string
  conversation_id: string | null
  owner_scope_digest: string | null
  owner_run_id: string
  epoch: number
  authority_digest: string
  status: RuntimeResourceLeaseStatus
  created_at: number
  updated_at: number
}

export type AcquireRuntimeResourceLeaseInput = Omit<
  RuntimeResourceLease,
  'epoch' | 'status' | 'updatedAt'
> & {
  createdAt: number
}

export class SqliteRuntimeResourceLeaseRepository {
  constructor(private readonly database: Database.Database) {}

  acquire(input: AcquireRuntimeResourceLeaseInput): RuntimeResourceLease {
    return this.database.transaction(() => {
      const prior = this.database
        .prepare(
          `SELECT COALESCE(MAX(epoch), 0) AS epoch
           FROM runtime_resource_leases
           WHERE owner_run_id = ? AND resource_type = ?`
        )
        .get(input.ownerRunId, input.resourceType) as { epoch: number }
      const lease: RuntimeResourceLease = {
        ...input,
        epoch: prior.epoch + 1,
        status: 'active',
        updatedAt: input.createdAt
      }
      this.database
        .prepare(
          `INSERT INTO runtime_resource_leases (
            id, resource_type, resource_id, conversation_id,
            owner_scope_digest, owner_run_id, epoch, authority_digest,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          lease.id,
          lease.resourceType,
          lease.resourceId,
          lease.conversationId ?? null,
          lease.ownerScopeDigest ?? null,
          lease.ownerRunId,
          lease.epoch,
          lease.authorityDigest,
          lease.status,
          lease.createdAt,
          lease.updatedAt
        )
      return lease
    })()
  }

  getCurrent(
    ownerRunId: string,
    resourceType: RuntimeResourceType
  ): RuntimeResourceLease | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM runtime_resource_leases
         WHERE owner_run_id = ? AND resource_type = ? AND status = 'active'
         ORDER BY epoch DESC LIMIT 1`
      )
      .get(ownerRunId, resourceType) as RuntimeResourceLeaseRow | undefined
    return row ? mapLease(row) : undefined
  }

  getById(id: string): RuntimeResourceLease | undefined {
    const row = this.database
      .prepare('SELECT * FROM runtime_resource_leases WHERE id = ?')
      .get(id) as RuntimeResourceLeaseRow | undefined
    return row ? mapLease(row) : undefined
  }

  transition(input: {
    id: string
    epoch: number
    status: Exclude<RuntimeResourceLeaseStatus, 'active'>
    updatedAt: number
  }): RuntimeResourceLease {
    const result = this.database
      .prepare(
        `UPDATE runtime_resource_leases
         SET status = ?, updated_at = ?
         WHERE id = ? AND epoch = ? AND status = 'active'`
      )
      .run(input.status, input.updatedAt, input.id, input.epoch)
    if (result.changes !== 1) throw new RuntimeResourceStaleError()
    const lease = this.getById(input.id)
    if (!lease) throw new RuntimeResourceStaleError()
    return lease
  }

  listActive(): RuntimeResourceLease[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM runtime_resource_leases
           WHERE status = 'active'
           ORDER BY created_at, id`
        )
        .all() as RuntimeResourceLeaseRow[]
    ).map(mapLease)
  }

  interruptAllActive(updatedAt: number): number {
    return this.database
      .prepare(
        `UPDATE runtime_resource_leases
         SET status = 'interrupted', updated_at = ?
         WHERE status = 'active'`
      )
      .run(updatedAt).changes
  }
}

function mapLease(row: RuntimeResourceLeaseRow): RuntimeResourceLease {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    ...(row.conversation_id
      ? { conversationId: row.conversation_id }
      : {}),
    ...(row.owner_scope_digest
      ? { ownerScopeDigest: row.owner_scope_digest }
      : {}),
    ownerRunId: row.owner_run_id,
    epoch: row.epoch,
    authorityDigest: row.authority_digest,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
