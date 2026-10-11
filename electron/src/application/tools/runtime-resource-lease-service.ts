import { randomUUID } from 'node:crypto'
import {
  assertRuntimeResourceLeaseCurrent,
  type RuntimeResourceLease,
  type RuntimeResourceLeaseStatus,
  type RuntimeResourceType
} from '../../../../domain/runtime-resource-lease'

export type RuntimeResourceLeaseRepository = {
  acquire(
    input: Omit<
      RuntimeResourceLease,
      'epoch' | 'status' | 'updatedAt'
    >
  ): RuntimeResourceLease
  getCurrent(
    ownerRunId: string,
    resourceType: RuntimeResourceType
  ): RuntimeResourceLease | undefined
  getById(id: string): RuntimeResourceLease | undefined
  listActive(): RuntimeResourceLease[]
  transition(input: {
    id: string
    epoch: number
    status: Exclude<RuntimeResourceLeaseStatus, 'active'>
    updatedAt: number
  }): RuntimeResourceLease
  interruptAllActive(updatedAt: number): number
}

export class RuntimeResourceLeaseService {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(
    private readonly repository: RuntimeResourceLeaseRepository,
    options: {
      now?: () => number
      createId?: () => string
    } = {}
  ) {
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
  }

  acquire(
    input: Omit<
      RuntimeResourceLease,
      'id' | 'epoch' | 'status' | 'createdAt' | 'updatedAt'
    >
  ): RuntimeResourceLease {
    const createdAt = this.now()
    return this.repository.acquire({
      ...input,
      id: this.createId(),
      createdAt
    })
  }

  async resolveCurrent(input: {
    resourceType: RuntimeResourceType
    ownerRunId: string
    authorityDigest: string
    isResourceActive: (resourceId: string) => boolean | Promise<boolean>
  }): Promise<RuntimeResourceLease> {
    const lease = this.repository.getCurrent(
      input.ownerRunId,
      input.resourceType
    )
    if (!lease) {
      const error = new Error('Current run has no active runtime resource')
      error.name = 'RuntimeResourceStaleError'
      throw Object.assign(error, {
        code: 'runtime_resource_stale',
        retryable: true
      })
    }
    assertRuntimeResourceLeaseCurrent(lease, {
      ownerRunId: input.ownerRunId,
      epoch: lease.epoch,
      authorityDigest: input.authorityDigest,
      resourceActive: await input.isResourceActive(lease.resourceId)
    })
    return lease
  }

  async releaseRun(
    ownerRunId: string,
    releaseResource: (
      lease: RuntimeResourceLease
    ) => void | Promise<void>
  ): Promise<void> {
    const leases = this.repository
      .listActive()
      .filter((lease) => lease.ownerRunId === ownerRunId)
    for (const lease of leases) {
      let status: 'released' | 'interrupted' = 'released'
      try {
        await releaseResource(lease)
      } catch {
        status = 'interrupted'
      }
      this.repository.transition({
        id: lease.id,
        epoch: lease.epoch,
        status,
        updatedAt: this.now()
      })
    }
  }

  expireCurrent(
    ownerRunId: string,
    resourceType: RuntimeResourceType
  ): RuntimeResourceLease | undefined {
    const lease = this.repository.getCurrent(ownerRunId, resourceType)
    if (!lease) return undefined
    return this.repository.transition({
      id: lease.id,
      epoch: lease.epoch,
      status: 'expired',
      updatedAt: this.now()
    })
  }

  async handleRunStatus(
    ownerRunId: string,
    status:
      | 'waiting_input'
      | 'waiting_permission'
      | 'completed'
      | 'failed'
      | 'cancelled',
    releaseResource: (
      lease: RuntimeResourceLease
    ) => void | Promise<void>
  ): Promise<void> {
    if (status === 'waiting_input' || status === 'waiting_permission') return
    await this.releaseRun(ownerRunId, releaseResource)
  }

  interruptActiveOnStartup(): number {
    return this.repository.interruptAllActive(this.now())
  }
}
